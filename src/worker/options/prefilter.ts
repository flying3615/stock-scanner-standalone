import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { timeout } from '../util.ts';
import { getDaysToEarnings } from './earnings.ts';

const QUOTE_TIMEOUT_MS = 30000; // Increased to 30s
const QUOTE_BATCH_SIZE = 20; // Reduced from 50

/**
 * Configuration for prefiltering symbols before deep options analysis
 */
export interface PrefilterConfig {
    /** Minimum daily trading volume (default: 5,000,000) */
    minVolume?: number;
    /** Minimum absolute price change percent (default: 3) */
    minChangePercent?: number;
    /** Include stocks with earnings within N days (default: 7) */
    earningsWithinDays?: number;
    /** Always include these symbols regardless of filter (e.g., ['SPY', 'QQQ']) */
    alwaysInclude?: string[];
    /** Maximum number of symbols to return (default: 80) */
    maxSymbols?: number;
    /** Enable debug logging */
    debug?: boolean;
}

interface FilterResult {
    symbol: string;
    reason: string;
    volume?: number;
    changePercent?: number;
    daysToEarnings?: number | null;
}

/**
 * Prefilter symbols to reduce API calls for options analysis.
 * Uses batch quote requests to quickly identify "hot" stocks.
 * 
 * Selection criteria (OR logic):
 * - High volume (> minVolume)
 * - High volatility (change > minChangePercent)
 * - Near earnings (within earningsWithinDays)
 * - In alwaysInclude list
 */
export async function prefilterSymbols(
    symbols: string[],
    config: PrefilterConfig = {}
): Promise<{ filtered: string[]; details: FilterResult[] }> {
    const {
        minVolume = 5_000_000,
        minChangePercent = 3,
        earningsWithinDays = 7,
        alwaysInclude = ['SPY', 'QQQ', 'IWM'],
        maxSymbols = 80,
        debug = false,
    } = config;

    const results: FilterResult[] = [];
    const alwaysSet = new Set(alwaysInclude.map(s => s.toUpperCase()));

    // Add always-include symbols first
    // Add always-include symbols first (force include even if not in universe subset)
    for (const sym of alwaysInclude) {
        results.push({ symbol: sym.toUpperCase(), reason: 'alwaysInclude' });
    }

    // Batch fetch quotes
    const remainingSymbols = symbols.filter(s => !alwaysSet.has(s.toUpperCase()));

    if (debug) {
        console.log(`[prefilter] Processing ${remainingSymbols.length} symbols for prefilter...`);
    }

    let successfulBatches = 0;
    let failedBatches = 0;

    // Process in batches with better error handling
    for (let i = 0; i < remainingSymbols.length; i += QUOTE_BATCH_SIZE) {
        const batch = remainingSymbols.slice(i, i + QUOTE_BATCH_SIZE);

        try {
            const quotes = await timeout(
                QUOTE_TIMEOUT_MS,
                yahooFinance.quote(batch)
            );

            const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
            successfulBatches++;

            for (const q of quotesArray) {
                if (!q || !q.symbol) continue;

                const symbol = q.symbol.toUpperCase();
                const volume = q.regularMarketVolume ?? 0;
                const changePercent = Math.abs(q.regularMarketChangePercent ?? 0);

                // Check volume criterion
                if (volume >= minVolume) {
                    results.push({
                        symbol,
                        reason: 'highVolume',
                        volume,
                        changePercent,
                    });
                    continue;
                }

                // Check volatility criterion
                if (changePercent >= minChangePercent) {
                    results.push({
                        symbol,
                        reason: 'highVolatility',
                        volume,
                        changePercent,
                    });
                    continue;
                }
            }
        } catch (error) {
            failedBatches++;
            if (debug) {
                console.log(`[prefilter] Batch quote failed for symbols ${i}-${i + batch.length}:`, error);
            }
            // Continue with next batch instead of failing entirely
        }

        // If we already have enough results, stop early
        if (results.length >= maxSymbols) {
            if (debug) {
                console.log(`[prefilter] Early exit: already have ${results.length} candidates`);
            }
            break;
        }
    }

    if (debug) {
        console.log(`[prefilter] Batch results: ${successfulBatches} success, ${failedBatches} failed`);
    }

    // Check earnings for remaining candidates (optional, more expensive)
    if (earningsWithinDays > 0 && results.length < maxSymbols) {
        const candidatesWithoutEarnings = results.map(r => r.symbol);
        const symbolsToCheck = remainingSymbols
            .filter(s => !candidatesWithoutEarnings.includes(s))
            .slice(0, maxSymbols - results.length);

        if (debug) {
            console.log(`[prefilter] Checking earnings for ${symbolsToCheck.length} additional symbols...`);
        }

        // Check earnings in parallel (limited concurrency)
        const earningsPromises = symbolsToCheck.slice(0, 20).map(async (sym) => {
            try {
                const days = await getDaysToEarnings(sym);
                if (days !== null && days <= earningsWithinDays) {
                    return { symbol: sym, reason: 'nearEarnings', daysToEarnings: days };
                }
            } catch {
                // Ignore earnings check failures
            }
            return null;
        });

        const earningsResults = await Promise.all(earningsPromises);
        for (const r of earningsResults) {
            if (r) results.push(r);
        }
    }

    // Deduplicate and limit
    const seen = new Set<string>();
    const deduped = results.filter(r => {
        if (seen.has(r.symbol)) return false;
        seen.add(r.symbol);
        return true;
    });

    const filtered = deduped.slice(0, maxSymbols).map(r => r.symbol);

    if (debug) {
        console.log(`[prefilter] Filtered ${symbols.length} -> ${filtered.length} symbols`);
        console.log(`[prefilter] Breakdown:`, {
            alwaysInclude: deduped.filter(r => r.reason === 'alwaysInclude').length,
            highVolume: deduped.filter(r => r.reason === 'highVolume').length,
            highVolatility: deduped.filter(r => r.reason === 'highVolatility').length,
            nearEarnings: deduped.filter(r => r.reason === 'nearEarnings').length,
        });
    }

    return { filtered, details: deduped.slice(0, maxSymbols) };
}

/**
 * Quick check if prefilter is recommended for the given symbol count
 */
export function shouldPrefilter(symbolCount: number, threshold: number = 50): boolean {
    return symbolCount > threshold;
}
