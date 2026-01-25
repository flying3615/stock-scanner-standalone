
import cron from 'node-cron';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { scanSymbolOptions } from './worker/options/options.js';
import { saveScanResult } from './db/persistence.js';
import { captureDailySectorStats } from './worker/analytics/sector-trend.js';
import { setTimeout } from 'timers/promises';

const CRON_SCHEDULE = '30 16 * * 1-5'; // 4:30 PM on weekdays (adjust logic for server timezone if needed)
// Note: node-cron uses system time. If server is UTC, this needs adjustment. 
// Assuming user's local machine or server configured to ET or we just want "End of Day". 
// Safe bet is to run it a bit later or check timezone. 
// For now we'll log the schedule.

export function initScheduler() {
    // Schedule task
    cron.schedule(CRON_SCHEDULE, async () => {
        console.log(`[Scheduler] ⏰ Starting daily market scan job at ${new Date().toISOString()}...`);
        await runDailyBatchScan();
    });

    console.log(`[Scheduler] Initialized. Job scheduled for ${CRON_SCHEDULE} (System Time)`);
}

async function runDailyBatchScan() {
    try {
        // 1. Fetch Movers
        const categories: MoverType[] = ['active', 'gainers', 'losers'];
        const allSymbols = new Set<string>();

        console.log('[Scheduler] Fetching market movers...');
        for (const cat of categories) {
            const movers = await fetchMarketMovers(cat, 20); // Top 20 of each
            movers.forEach(m => allSymbols.add(m.symbol));
            await setTimeout(1000); // Politeness delay
        }

        const symbols = Array.from(allSymbols);
        console.log(`[Scheduler] Found ${symbols.length} unique symbols to scan.`);

        // 2. Scan each symbol
        let processed = 0;
        for (const symbol of symbols) {
            processed++;
            console.log(`[Scheduler] [${processed}/${symbols.length}] Scanning ${symbol}...`);
            try {
                // Parallel fetching of value and options for speed, but sequential saving
                const valuePromise = analyzeStockValue(symbol);
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

                // Small delay to prevent rate limits
                await setTimeout(2000);

            } catch (err) {
                console.error(`[Scheduler] Error collecting data for ${symbol}:`, err);
            }
        }

        console.log(`[Scheduler] ✅ Daily batch scan completed at ${new Date().toISOString()}`);

        // 3. Capture Sector Stats
        await captureDailySectorStats();

    } catch (error) {
        console.error('[Scheduler] Critical error in daily batch scan:', error);
    }
}
