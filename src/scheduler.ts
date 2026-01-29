import cron from 'node-cron';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { fetchChinaMovers } from './worker/scanner/china-movers.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { scanSymbolOptions } from './worker/options/options.js';
import { saveScanResult } from './db/persistence.js';
import { captureDailySectorStats } from './worker/analytics/sector-trend.js';
import { calculateMoneyFlowStrength } from './worker/util.js';
import { MarketRegion } from './worker/markets.js';
import { setTimeout } from 'timers/promises';

const CRON_SCHEDULE = '30 16 * * 1-5'; // 4:30 PM on weekdays (adjust logic for server timezone if needed)
const CRON_TIMEZONE = process.env.CRON_TZ || 'America/New_York';
const CHINA_CRON_SCHEDULE = '0 20 * * 1-5'; // 8:00 PM NZDT (post market close)
const CHINA_CRON_TIMEZONE = process.env.CN_CRON_TZ || 'Pacific/Auckland';

export function initScheduler() {
    // US schedule
    cron.schedule(CRON_SCHEDULE, async () => {
        console.log(`[Scheduler][US] ⏰ Starting daily market scan job at ${new Date().toISOString()}...`);
        await runDailyBatchScan('US');
    }, { timezone: CRON_TIMEZONE });

    // China schedule
    cron.schedule(CHINA_CRON_SCHEDULE, async () => {
        console.log(`[Scheduler][CN] ⏰ Starting daily market scan job at ${new Date().toISOString()}...`);
        await runDailyBatchScan('CN');
    }, { timezone: CHINA_CRON_TIMEZONE });

    console.log(`[Scheduler] Initialized. Jobs scheduled for ${CRON_SCHEDULE} (${CRON_TIMEZONE}) and ${CHINA_CRON_SCHEDULE} (${CHINA_CRON_TIMEZONE})`);
}

async function runDailyBatchScan(market: MarketRegion = 'US') {
    try {
        const marketLabel = market === 'CN' ? 'CN' : 'US';
        let symbols: string[] = [];

        if (market === 'CN') {
            const movers = await fetchChinaMovers(30);
            symbols = movers.map((m) => m.symbol);
        } else {
            const categories: MoverType[] = ['active', 'gainers', 'losers'];
            const allSymbols = new Set<string>();

            console.log('[Scheduler][US] Fetching market movers...');
            for (const cat of categories) {
                const movers = await fetchMarketMovers(cat, 20);
                movers.forEach(m => allSymbols.add(m.symbol));
                await setTimeout(1000);
            }
            symbols = Array.from(allSymbols);
        }

        console.log(`[Scheduler][${marketLabel}] Found ${symbols.length} unique symbols to scan.`);

        let processed = 0;
        for (const symbol of symbols) {
            processed++;
            console.log(`[Scheduler][${marketLabel}] [${processed}/${symbols.length}] Scanning ${symbol}...`);
            try {
                const valuePromise = analyzeStockValue(symbol);

                if (market === 'CN') {
                    const valueResult = await valuePromise;
                    if (!valueResult) {
                        continue;
                    }
                    const placeholderResult = {
                        moneyFlowStrength: await calculateMoneyFlowStrength(symbol, 7),
                        signals: [],
                        sentiment: {
                            symbol,
                            sentiment: valueResult.score ?? 0
                        },
                        rmp: valueResult.price
                    };

                    await saveScanResult(symbol, placeholderResult, valueResult);
                    await setTimeout(1000);
                    continue;
                }

                const optionsPromise = scanSymbolOptions(symbol, true, {
                    regularFreshWindowMins: 60,
                    nonRegularFreshWindowMins: 4320,
                    minVolume: 10,
                    minNotional: 5000,
                    minRatio: 0.01,
                    callOTMMin: 0.85,
                    putOTMMax: 1.15
                });

                const [valueResult, optionsResult] = await Promise.all([valuePromise, optionsPromise]);

                await saveScanResult(symbol, optionsResult, valueResult);
                await setTimeout(2000);

            } catch (err) {
                console.error(`[Scheduler][${marketLabel}] Error collecting data for ${symbol}:`, err);
            }
        }

        console.log(`[Scheduler][${marketLabel}] ✅ Daily batch scan completed at ${new Date().toISOString()}`);

        if (market === 'US') {
            await captureDailySectorStats();
        }

    } catch (error) {
        console.error(`[Scheduler][${market}] Critical error in daily batch scan:`, error);
    }
}
