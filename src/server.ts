
import express from 'express';
import cors from 'cors';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { calculateMoneyFlowStrength } from './worker/util.js';
import { getSectorTrends, getEnhancedSectorTrends } from './worker/analytics/sector-trend.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { scanSymbolOptions } from './worker/options/options.js';
import { saveScanResult, getHistory } from './db/persistence.js';
import { initScheduler } from './scheduler.js';
import { getMacroSnapshot } from './worker/macro/macro-monitor.js';
import { setupOpenAPI } from './api/openapi-setup.js';
import {
    buildTokenStatus,
    createFinancialJuiceRuntime,
    parseBooleanFlag,
    parseFinancialJuiceCategory,
    parsePositiveInteger,
    parsePositiveLimit,
} from './modules/news/index.js';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 300 }); // Default 5 min TTL
const NEWS_CACHE_TTL_SECONDS = parsePositiveInteger(process.env.FJ_NEWS_CACHE_TTL_SECONDS, 120);
const { client: financialJuiceClient, refreshMode: financialJuiceRefreshMode } = createFinancialJuiceRuntime();
console.log(`[News] FinancialJuice client initialized (refresh mode: ${financialJuiceRefreshMode})`);

// Start Scheduler
initScheduler();

app.use(cors());
app.use(express.json());

// Setup OpenAPI documentation
setupOpenAPI(app);

// Market Movers Endpoint
app.get('/api/movers', async (req, res) => {
    const type = (req.query.type as MoverType) || 'active';
    const limit = Number(req.query.limit) || 20; // Fetch slight more for grid
    const cacheKey = `movers_${type}_${limit}`;

    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`[API] Serving cached ${type} movers`);
        return res.json(cached);
    }

    try {
        console.log(`[API] Fetching ${type} movers...`);
        const movers = await fetchMarketMovers(type, limit);

        // Lightweight enrichment
        const enriched = await Promise.all(movers.map(async (m) => {
            const [val, mfi] = await Promise.all([
                analyzeStockValue(m.symbol),
                calculateMoneyFlowStrength(m.symbol, 7)
            ]);

            return {
                ...m,
                valueScore: val ? val.score : null,
                valueMetrics: val ? val.metrics : null,
                moneyFlowStrength: mfi,
                sector: val ? val.sector : undefined,
                industry: val ? val.industry : undefined,
                reasons: val ? val.reasons : []
            };
        }));

        cache.set(cacheKey, enriched, 300); // Cache for 5 mins
        res.json(enriched);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch movers' });
    }
});

// Value Analysis Endpoint
app.get('/api/value/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `value_${symbol}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        console.log(`[API] Analyzing value for ${symbol}...`);
        const result = await analyzeStockValue(symbol);
        if (!result) {
            return res.status(404).json({ error: 'Data not found' });
        }
        cache.set(cacheKey, result, 1800); // Cache value analysis for 30 mins
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Options Scan Endpoint
app.get('/api/options/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const cacheKey = `options_${symbol}`;

    // Check cache first (short TTL for options as they move fast)
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`[API] Serving cached options for ${symbol}`);
        return res.json(cached);
    }

    try {
        console.log(`[API] Scanning options for ${symbol}...`);
        const result = await scanSymbolOptions(symbol, true, {
            regularFreshWindowMins: 60,
            nonRegularFreshWindowMins: 4320, // 72 hours to cover weekends
            polygonApiKey: process.env.POLYGON_API_KEY,
            minVolume: 10,
            minNotional: 5000,
            minRatio: 0.01,
            callOTMMin: 0.85,
            putOTMMax: 1.15
        });

        // Save snapshot to history synchronously
        try {
            await saveScanResult(symbol, result);
        } catch (err) {
            console.error(`[Server] Failed to save history for ${symbol}`, err);
        }

        const responseData = {
            moneyFlowStrength: result.moneyFlowStrength,
            signals: result.signals,
            sentiment: result.sentiment,
            marketState: result.marketState,
            rmp: result.rmp
        };

        cache.set(cacheKey, responseData, 60); // Cache for 1 min only (real-time sensitive)
        res.json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Options scan failed' });
    }
});

// History Endpoint
app.get('/api/history/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        const history = await getHistory(symbol);
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Analytics Endpoint (raw)
app.get('/api/trends/sectors', async (req, res) => {
    try {
        const trends = await getSectorTrends(14);
        res.json(trends);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch sector trends' });
    }
});

// Enhanced Sector Radar with prediction signals
app.get('/api/trends/sectors/enhanced', async (req, res) => {
    try {
        const cacheKey = 'enhanced_sector_trends';
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const data = await getEnhancedSectorTrends(14);
        cache.set(cacheKey, data, 600); // Cache 10 min
        res.json(data);
    } catch (error) {
        console.error('[API] Failed to fetch enhanced sector trends', error);
        res.status(500).json({ error: 'Failed to fetch enhanced sector trends' });
    }
});

// Macro Dashboard Endpoint
app.get('/api/macro', async (_req, res) => {
    try {
        const snapshot = await getMacroSnapshot();
        res.json(snapshot);
    } catch (error) {
        console.error('[API] Failed to fetch macro snapshot', error);
        res.status(500).json({ error: 'Failed to fetch macro snapshot' });
    }
});

// FinancialJuice News Endpoint
app.get('/api/news', async (req, res) => {
    const category = parseFinancialJuiceCategory(req.query.category as string | undefined);
    const limit = parsePositiveLimit(req.query.limit as string | undefined, 20, 200);
    const forceFresh = parseBooleanFlag(req.query.fresh as string | undefined);
    const cacheKey = `news_financialjuice_${category}`;
    const cached = cache.get<{ fetchedAt: number; items: unknown[] }>(cacheKey);

    try {
        if (!forceFresh && cached && cached.items.length > 0) {
            return res.json({
                category,
                cached: true,
                fetchedAt: cached.fetchedAt,
                count: Math.min(cached.items.length, limit),
                items: cached.items.slice(0, limit),
            });
        }

        const items = await financialJuiceClient.fetchNews({ category, limit });
        cache.set(cacheKey, { fetchedAt: Date.now(), items }, NEWS_CACHE_TTL_SECONDS);

        res.json({
            category,
            cached: false,
            count: items.length,
            items,
        });
    } catch (error) {
        if (cached && cached.items.length > 0) {
            return res.json({
                category,
                cached: true,
                stale: true,
                fetchedAt: cached.fetchedAt,
                count: Math.min(cached.items.length, limit),
                items: cached.items.slice(0, limit),
            });
        }

        const message = error instanceof Error ? error.message : String(error);
        console.error('[API] Failed to load FinancialJuice news', message);
        res.status(500).json({ error: 'Failed to load news', detail: message });
    }
});

// FinancialJuice Ticker News Search
app.get('/api/news/search/:symbol', async (req, res) => {
    const symbol = req.params.symbol.trim().toUpperCase();
    const limit = parsePositiveLimit(req.query.limit as string | undefined, 20, 200);

    if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
    }

    try {
        const items = await financialJuiceClient.searchTickerNews(symbol, { limit });
        res.json({
            symbol,
            count: items.length,
            items,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[API] Failed to search FinancialJuice news', message);
        res.status(500).json({ error: 'Failed to search news', detail: message });
    }
});

// FinancialJuice Token Status
app.get('/api/news/token/status', async (_req, res) => {
    try {
        const state = await financialJuiceClient.getTokenState();
        res.json(buildTokenStatus(state));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[API] Failed to read FinancialJuice token status', message);
        res.status(500).json({ error: 'Failed to read token status', detail: message });
    }
});

// FinancialJuice Manual Token Set
app.post('/api/news/token', async (req, res) => {
    try {
        const body = req.body as {
            token?: string;
            softTtlMinutes?: number | string;
            hardTtlMinutes?: number | string;
        };
        const token = body.token?.trim() || '';
        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }

        const softMinutes = parsePositiveNumber(body.softTtlMinutes, 8640);
        const hardMinutes = parsePositiveNumber(body.hardTtlMinutes, 10080);
        const softTtlMs = Math.floor(softMinutes * 60 * 1000);
        const hardTtlMs = Math.max(Math.floor(hardMinutes * 60 * 1000), softTtlMs + 60_000);

        const state = await financialJuiceClient.setManualToken(token, {
            softTtlMs,
            hardTtlMs,
            source: 'manual-api',
        });

        res.json(buildTokenStatus(state));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[API] Failed to set FinancialJuice token', message);
        res.status(500).json({ error: 'Failed to set token', detail: message });
    }
});

// FinancialJuice Manual Token Clear
app.delete('/api/news/token', async (_req, res) => {
    try {
        await financialJuiceClient.clearToken();
        res.json({ cleared: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[API] Failed to clear FinancialJuice token', message);
        res.status(500).json({ error: 'Failed to clear token', detail: message });
    }
});

function parsePositiveNumber(raw: unknown, fallback: number): number {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return raw;
    }
    if (typeof raw === 'string') {
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return fallback;
}

// Serve Frontend Static Files (Production/Docker)
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Handle React Routing (SPA) - Return index.html for all non-API routes
// Note: Express 5 requires parameter name for capture groups or explicit regex. 
// Using regex /.*/ or (.*) pattern.
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
