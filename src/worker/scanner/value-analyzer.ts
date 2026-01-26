
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface ValueScore {
    symbol: string;
    price: number;
    score: number;
    metrics: {
        pb: number;
        pe: number;
        roe: number;
        profitMargin: number;
        debtToEquity: number;
    };
    sector?: string;
    industry?: string;
    thresholds?: SectorConfig;
    reasons: string[];
    // Search Enrichment
    name?: string;
    changePercent?: number;
    volume?: number;
}

interface SectorConfig {
    peMax: number;    // "Cheap" if below this
    peOver: number;   // "Overvalued" if above this
    pbMax: number;    // "Good value" if below this
    roeMin: number;   // "Good quality" if above this
    debtMax: number;  // "Risky" if above this (Financials handle differently)
}

const DEFAULT_CONFIG: SectorConfig = {
    peMax: 20, peOver: 50,
    pbMax: 3.0,
    roeMin: 12,
    debtMax: 200 // 200%
};

const SECTOR_CONFIGS: Record<string, SectorConfig> = {
    'Technology': { peMax: 35, peOver: 70, pbMax: 8.0, roeMin: 15, debtMax: 150 },
    'Communication Services': { peMax: 30, peOver: 60, pbMax: 5.0, roeMin: 12, debtMax: 150 },
    'Consumer Cyclical': { peMax: 25, peOver: 50, pbMax: 4.0, roeMin: 15, debtMax: 200 },
    'Financial Services': { peMax: 14, peOver: 25, pbMax: 1.5, roeMin: 8, debtMax: 500 }, // Banks leverage high debt/deposits
    'Energy': { peMax: 12, peOver: 25, pbMax: 2.0, roeMin: 10, debtMax: 100 },
    'Utilities': { peMax: 18, peOver: 30, pbMax: 2.0, roeMin: 8, debtMax: 300 }, // Capital intensive
    'Real Estate': { peMax: 40, peOver: 80, pbMax: 3.0, roeMin: 5, debtMax: 400 }, // High debt is normal for REITs
    'Healthcare': { peMax: 25, peOver: 50, pbMax: 5.0, roeMin: 10, debtMax: 150 }
};

export async function analyzeStockValue(symbol: string): Promise<ValueScore | null> {
    try {
        const quote = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'defaultKeyStatistics', 'price', 'summaryDetail', 'summaryProfile']
        });

        const financialData = quote.financialData;
        const keyStats = quote.defaultKeyStatistics;
        const priceData = quote.price;
        const summaryDetail = quote.summaryDetail;
        const summaryProfile = quote.summaryProfile;

        if (!financialData || !keyStats || !priceData) {
            console.warn(`Insufficient data for ${symbol}`);
            return null;
        }

        const price = priceData.regularMarketPrice || 0;
        const pb = keyStats.priceToBook || 0;
        const sector = summaryProfile?.sector || 'Unknown';

        // Get config for sector or default
        const cfg = SECTOR_CONFIGS[sector] || DEFAULT_CONFIG;

        // Use trailing PE from summaryDetail, fallback to forward PE or defaults
        const pe = summaryDetail?.trailingPE || summaryDetail?.forwardPE || 999;

        // Yahoo often returns 0.15 for 15%
        const roe = (financialData.returnOnEquity || 0) * 100;
        const profitMargin = (financialData.profitMargins || 0) * 100;
        const debtToEquity = (financialData.debtToEquity || 999);

        let score = 0;
        const reasons: string[] = [];

        // 1. Valuation (P/B)
        // Stricter check for really cheap P/B (half of sector max)
        if (pb > 0 && pb < cfg.pbMax * 0.5) {
            score += 2;
            reasons.push(`P/B Very Low (<${(cfg.pbMax * 0.5).toFixed(1)})`);
        } else if (pb > 0 && pb < cfg.pbMax) {
            score += 1;
        }

        // 2. Valuation (P/E)
        if (pe > 0 && pe < cfg.peMax) {
            score += 1;
            reasons.push(`P/E Cheap (<${cfg.peMax})`);
        } else if (pe > cfg.peOver) {
            score -= 1;
            reasons.push(`Overvalued (PE >${cfg.peOver})`);
        }

        // 3. Quality (ROE)
        if (roe > cfg.roeMin) {
            score += 2;
            reasons.push(`High ROE (>${cfg.roeMin}%)`);
        } else if (roe > 0 && roe < 2) {
            score -= 1;
            reasons.push("Low ROE (<2%)");
        }

        // 4. Quality (Margin)
        // Margin thresholds are generally sector agnostic (higher is better), but could be refined
        if (profitMargin > 20) {
            score += 1;
            reasons.push("High Margin (>20%)");
        } else if (profitMargin < 0) {
            score -= 1;
        }

        // 5. Risk (Debt)
        if (debtToEquity > cfg.debtMax) {
            score -= 1;
            reasons.push(`High Debt (>${cfg.debtMax}%)`);
        } else if (debtToEquity < 50 && sector !== 'Financial Services') {
            // Low debt bonus (except Financials where it's complex)
            score += 1;
            reasons.push("Low Debt");
        }

        // 6. Sector Bonus (Context)
        // Just acknowledging we used sector specific logic
        if (sector !== 'Unknown' && reasons.length > 0) {
            // Only add sector tag if analyzed, not as a reason point
        }

        return {
            symbol,
            price,
            score,
            metrics: {
                pb,
                pe,
                roe,
                profitMargin,
                debtToEquity
            },
            sector,
            industry: summaryProfile?.industry || undefined,
            thresholds: cfg, // Return the config used
            reasons,
            // Search Enrichment Fields
            name: quote.price?.longName || symbol,
            changePercent: quote.price?.regularMarketChangePercent ? (quote.price.regularMarketChangePercent * 100) : 0,
            volume: quote.price?.regularMarketVolume || 0
        };

    } catch (error) {
        console.error(`Error analyzing value for ${symbol}:`, error);
        return null;
    }
}
