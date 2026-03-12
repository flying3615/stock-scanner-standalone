import type { Express } from 'express';
import type NodeCache from 'node-cache';

import { DEFAULT_CHART_D1_LOOKBACK, DEFAULT_DTE_MAX, DEFAULT_DTE_MIN, DEFAULT_STRIKES_EACH_SIDE } from './contracts.js';
import { getDailyChartSnapshot, type GetDailyChartSnapshotOptions } from './chart-d1.js';
import { getNearbyOptionsChainSnapshot, type GetNearbyOptionsChainSnapshotOptions } from './options-chain-nearby.js';

const OPTIONS_CHAIN_CACHE_TTL_SECONDS = 60;
const DAILY_CHART_CACHE_TTL_SECONDS = 300;

type MinimalCache = Pick<NodeCache, 'get' | 'set'>;

export interface MarketDataRouteDependencies {
  cache: MinimalCache;
  polygonApiKey?: string;
  getNearbyOptionsChainSnapshot?: (
    symbol: string,
    options: GetNearbyOptionsChainSnapshotOptions,
  ) => Promise<unknown>;
  getDailyChartSnapshot?: (
    symbol: string,
    options: GetDailyChartSnapshotOptions,
  ) => Promise<unknown>;
}

export function attachMarketDataRoutes(app: Express, dependencies: MarketDataRouteDependencies): void {
  app.get('/api/options-chain/nearby/:symbol', async (req, res) => {
    const symbol = req.params.symbol.trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const dteMin = parsePositiveIntegerQuery(req.query.dteMin, DEFAULT_DTE_MIN, { min: 1, max: 60 });
    if ('error' in dteMin) {
      return res.status(400).json({ error: dteMin.error });
    }

    const dteMax = parsePositiveIntegerQuery(req.query.dteMax, DEFAULT_DTE_MAX, { min: 1, max: 60 });
    if ('error' in dteMax) {
      return res.status(400).json({ error: dteMax.error });
    }

    if (dteMin.value > dteMax.value) {
      return res.status(400).json({ error: 'dteMin must be less than or equal to dteMax' });
    }

    const strikesEachSide = parsePositiveIntegerQuery(req.query.strikesEachSide, DEFAULT_STRIKES_EACH_SIDE, { min: 1, max: 25 });
    if ('error' in strikesEachSide) {
      return res.status(400).json({ error: strikesEachSide.error });
    }

    const cacheKey = `market_data_nearby_chain_${symbol}_${dteMin.value}_${dteMax.value}_${strikesEachSide.value}`;
    const cached = dependencies.cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    try {
      const snapshot = await (dependencies.getNearbyOptionsChainSnapshot ?? getNearbyOptionsChainSnapshot)(symbol, {
        dteMin: dteMin.value,
        dteMax: dteMax.value,
        strikesEachSide: strikesEachSide.value,
        polygonApiKey: dependencies.polygonApiKey,
      });

      if (isEmptyNearbySnapshot(snapshot)) {
        return res.status(404).json({ error: 'No nearby options chain data found' });
      }

      dependencies.cache.set(cacheKey, snapshot, OPTIONS_CHAIN_CACHE_TTL_SECONDS);
      res.json(snapshot);
    } catch (error) {
      console.error('[API] Failed to build nearby options chain snapshot', error);
      res.status(500).json({ error: 'Failed to load nearby options chain snapshot' });
    }
  });

  app.get('/api/charts/:symbol/d1', async (req, res) => {
    const symbol = req.params.symbol.trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const lookback = parsePositiveIntegerQuery(req.query.lookback, DEFAULT_CHART_D1_LOOKBACK, { min: 1, max: 365 });
    if ('error' in lookback) {
      return res.status(400).json({ error: lookback.error });
    }

    const cacheKey = `market_data_chart_d1_${symbol}_${lookback.value}`;
    const cached = dependencies.cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    try {
      const snapshot = await (dependencies.getDailyChartSnapshot ?? getDailyChartSnapshot)(symbol, {
        lookback: lookback.value,
      });

      if (isEmptyChartSnapshot(snapshot)) {
        return res.status(404).json({ error: 'No daily chart data found' });
      }

      dependencies.cache.set(cacheKey, snapshot, DAILY_CHART_CACHE_TTL_SECONDS);
      res.json(snapshot);
    } catch (error) {
      console.error('[API] Failed to build daily chart snapshot', error);
      res.status(500).json({ error: 'Failed to load daily chart snapshot' });
    }
  });
}

function parsePositiveIntegerQuery(
  raw: unknown,
  fallback: number,
  options: { min: number; max: number },
): { value: number } | { error: string } {
  if (raw === undefined) {
    return { value: fallback };
  }

  const value = typeof raw === 'string'
    ? Number(raw)
    : typeof raw === 'number'
      ? raw
      : Number.NaN;
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    return { error: `Query parameter must be an integer between ${options.min} and ${options.max}` };
  }

  return { value };
}

function isEmptyNearbySnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') {
    return true;
  }

  const expiries = (snapshot as { expiries?: unknown[] }).expiries;
  return !Array.isArray(expiries) || expiries.length === 0;
}

function isEmptyChartSnapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object') {
    return true;
  }

  const bars = (snapshot as { bars?: unknown[] }).bars;
  return !Array.isArray(bars) || bars.length === 0;
}
