
import express from 'express';
import cors from 'cors';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { scanSymbolOptions } from './worker/options/options.js';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Market Movers Endpoint
app.get('/api/movers', async (req, res) => {
    const type = (req.query.type as MoverType) || 'active';
    const limit = Number(req.query.limit) || 12; // Fetch slight more for grid
    try {
        console.log(`[API] Fetching ${type} movers...`);
        const movers = await fetchMarketMovers(type, limit);

        // Lightweight enrichment (optional, might slow down if we do full value analysis on all)
        // For dashboard list, we might just want to return movers, and let frontend fetch value on demand or in background.
        // But the user wants "Value Scanner", so let's try to fetch score for them in parallel or batch.

        // Let's do a quick concurrent batch for value scores
        const enriched = await Promise.all(movers.map(async (m) => {
            const val = await analyzeStockValue(m.symbol);
            return {
                ...m,
                valueScore: val ? val.score : null,
                valueMetrics: val ? val.metrics : null,
                reasons: val ? val.reasons : []
            };
        }));

        res.json(enriched);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch movers' });
    }
});

// Value Analysis Endpoint
app.get('/api/value/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        console.log(`[API] Analyzing value for ${symbol}...`);
        const result = await analyzeStockValue(symbol);
        if (!result) {
            return res.status(404).json({ error: 'Data not found' });
        }
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Options Scan Endpoint
app.get('/api/options/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
        console.log(`[API] Scanning options for ${symbol}...`);
        const result = await scanSymbolOptions(symbol, true, {
            regularFreshWindowMins: 60,
            nonRegularFreshWindowMins: 1440,
            polygonApiKey: process.env.POLYGON_API_KEY
        });

        res.json({
            moneyFlowStrength: result.moneyFlowStrength,
            signals: result.signals,
            sentiment: result.sentiment,
            marketState: result.marketState,
            rmp: result.rmp
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Options scan failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
