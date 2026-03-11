import test from 'node:test';
import assert from 'node:assert/strict';

import { rankCallCreditCandidates } from './call-credit.js';

function createChartSeries(values: Array<{ open: number; high: number; low: number; close: number; volume: number }>) {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    ...value,
  }));
}

test('rankCallCreditCandidates returns actionable setups ahead of watchlist names', async () => {
  const tslaBase = Array.from({ length: 55 }, (_, index) => {
    const close = 280 - index * 1.1;
    return {
      open: close + 1.5,
      high: close + 2.5,
      low: close - 2,
      close,
      volume: 52_000_000,
    };
  });

  const aaplBase = Array.from({ length: 55 }, (_, index) => {
    const close = 188 - index * 0.12;
    return {
      open: close + 0.6,
      high: close + 1.1,
      low: close - 0.9,
      close,
      volume: 35_000_000,
    };
  });

  const result = await rankCallCreditCandidates({
    movers: [
      { symbol: 'TSLA', name: 'Tesla', price: 212, changePercent: -8.1, volume: 120_000_000 },
      { symbol: 'AAPL', name: 'Apple', price: 180, changePercent: -2.2, volume: 40_000_000 },
    ],
    macro: {
      overallRegime: 'RISK_OFF',
      indices: [],
      dxy: { symbol: 'DX-Y.NYB', price: 104, changePercent: 0.5, trend: 'UP' },
      vix: { symbol: '^VIX', price: 20, changePercent: 6, status: 'RISING' },
    },
    symbolInputs: {
      TSLA: {
        chart: createChartSeries([
          ...tslaBase,
          { open: 230, high: 232, low: 210, close: 212, volume: 120_000_000 },
        ]),
        options: [
          { strike: 220, delta: 0.28, bid: 2.8, ask: 3.2, openInterest: 1800, volume: 900 },
          { strike: 230, delta: 0.16, bid: 1.2, ask: 1.6, openInterest: 2600, volume: 1400 },
          { strike: 235, delta: 0.1, bid: 0.55, ask: 0.7, openInterest: 2100, volume: 1200 },
        ],
        dte: 5,
        structureResistance: 226,
        valueScore: 1.5,
        sector: 'Consumer Cyclical',
        earningsDays: 12,
      },
      AAPL: {
        chart: createChartSeries([
          ...aaplBase,
          { open: 182.2, high: 183, low: 179.4, close: 180, volume: 40_000_000 },
        ]),
        options: [
          { strike: 185, delta: 0.29, bid: 1.8, ask: 2.1, openInterest: 500, volume: 120 },
          { strike: 190, delta: 0.22, bid: 0.9, ask: 1.15, openInterest: 450, volume: 90 },
        ],
        dte: 5,
        structureResistance: 184,
        valueScore: 4.8,
        sector: 'Technology',
        earningsDays: 9,
      },
    },
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0]?.symbol, 'TSLA');
  assert.equal(result.candidates[0]?.setupState, 'ACTIONABLE');
  assert.equal(result.candidates[0]?.spreadTemplate?.shortStrike, 230);
  assert.equal(result.candidates[1]?.symbol, 'AAPL');
  assert.equal(result.candidates[1]?.setupState, 'WATCHLIST');
});
