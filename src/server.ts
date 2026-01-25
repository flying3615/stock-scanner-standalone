
import express from 'express';
import cors from 'cors';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { scanSymbolOptions } from './worker/options/options.js';
import { saveScanResult, getHistory } from './db/persistence.js';
import { initScheduler } from './scheduler.js';
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

// Start Scheduler
initScheduler();

app.use(cors());
app.use(express.json());

// Market Movers Endpoint
app.get('/api/movers', async (req, res) => {
    const type = (req.query.type as MoverType) || 'active';
    const limit = Number(req.query.limit) || 12; // Fetch slight more for grid
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
            const val = await analyzeStockValue(m.symbol);
            return {
                ...m,
                valueScore: val ? val.score : null,
                valueMetrics: val ? val.metrics : null,
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
