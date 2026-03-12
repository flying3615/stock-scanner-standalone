import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { attachMarketDataRoutes } from './routes.js';
import type { DailyChartSnapshot, NearbyOptionsChainSnapshot } from './contracts.js';

async function startTestServer() {
  let nearbyCalls = 0;
  let chartCalls = 0;

  const app = express();
  attachMarketDataRoutes(app, {
    getNearbyOptionsChainSnapshot: async (symbol, options) => {
      nearbyCalls += 1;
      assert.equal(symbol, 'NVDA');
      assert.equal(options.dteMin, 3);
      assert.equal(options.dteMax, 7);
      assert.equal(options.strikesEachSide, 10);

      return {
        symbol,
        spot: 186.03,
        asOf: '2026-03-12T19:00:00.000Z',
        requested: {
          dteMin: options.dteMin ?? 3,
          dteMax: options.dteMax ?? 7,
          strikesEachSide: options.strikesEachSide ?? 10,
        },
        summary: {
          selectedExpiryCount: 1,
          availableExpiries: ['2026-03-16'],
          atmStrike: 185,
          strikeWindow: {
            belowSpot: 10,
            aboveSpot: 10,
          },
        },
        expiries: [
          {
            expiryISO: '2026-03-16',
            dte: 4,
            atmStrike: 185,
            calls: [],
            puts: [],
          },
        ],
      } satisfies NearbyOptionsChainSnapshot;
    },
    getDailyChartSnapshot: async (symbol, options) => {
      chartCalls += 1;
      assert.equal(symbol, 'NVDA');
      assert.equal(options.lookback, 120);

      return {
        symbol,
        interval: '1d',
        asOf: '2026-03-12T19:00:00.000Z',
        requested: {
          lookback: options.lookback ?? 120,
        },
        summary: {
          latestClose: 186.03,
          periodHigh: 195.22,
          periodLow: 160.1,
          percentChange: 5.8,
          averageVolume20: 114_000_000,
        },
        indicators: {
          ema20: 182.2,
          ema50: 176.4,
          ema200: 149.6,
          volumeRatio20: 1.42,
          closeLocationValue: 0.34,
          upperWickRatio: 0.28,
          lowerWickRatio: 0.16,
          support: 176.4,
          resistance: 191.8,
        },
        bars: [
          {
            date: '2026-03-12T00:00:00.000Z',
            open: 184.1,
            high: 188.4,
            low: 183.2,
            close: 186.03,
            volume: 138_700_000,
          },
        ],
      } satisfies DailyChartSnapshot;
    },
    cache: {
      get: () => undefined,
      set: () => true,
    },
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    getCounts: () => ({ nearbyCalls, chartCalls }),
  };
}

test('GET /api/options-chain/nearby/:symbol returns a normalized nearby chain snapshot', async () => {
  const harness = await startTestServer();

  try {
    const response = await fetch(`${harness.baseUrl}/api/options-chain/nearby/NVDA?dteMin=3&dteMax=7&strikesEachSide=10`);
    assert.equal(response.status, 200);

    const payload = await response.json() as NearbyOptionsChainSnapshot;
    assert.equal(payload.symbol, 'NVDA');
    assert.equal(payload.asOf, '2026-03-12T19:00:00.000Z');
    assert.equal(payload.requested.dteMin, 3);
    assert.equal(payload.requested.dteMax, 7);
    assert.equal(payload.requested.strikesEachSide, 10);
    assert.equal(harness.getCounts().nearbyCalls, 1);
  } finally {
    await new Promise<void>((resolve, reject) => harness.server.close((error) => error ? reject(error) : resolve()));
  }
});

test('GET /api/charts/:symbol/d1 returns a normalized daily snapshot', async () => {
  const harness = await startTestServer();

  try {
    const response = await fetch(`${harness.baseUrl}/api/charts/NVDA/d1?lookback=120`);
    assert.equal(response.status, 200);

    const payload = await response.json() as DailyChartSnapshot;
    assert.equal(payload.symbol, 'NVDA');
    assert.equal(payload.interval, '1d');
    assert.equal(payload.asOf, '2026-03-12T19:00:00.000Z');
    assert.equal(payload.requested.lookback, 120);
    assert.equal(harness.getCounts().chartCalls, 1);
  } finally {
    await new Promise<void>((resolve, reject) => harness.server.close((error) => error ? reject(error) : resolve()));
  }
});

test('market-data routes reject invalid query parameters with 400', async () => {
  const harness = await startTestServer();

  try {
    const invalidChain = await fetch(`${harness.baseUrl}/api/options-chain/nearby/NVDA?dteMin=0`);
    assert.equal(invalidChain.status, 400);

    const invalidChart = await fetch(`${harness.baseUrl}/api/charts/NVDA/d1?lookback=0`);
    assert.equal(invalidChart.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => harness.server.close((error) => error ? reject(error) : resolve()));
  }
});
