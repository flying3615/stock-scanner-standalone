import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCreditSpreadStrategySnapshot,
  rankCreditSpreadCandidates,
} from './call-credit.js';
import type { CreditSpreadSymbolInput } from './call-credit-types.js';

function createChartSeries(values: Array<{ open: number; high: number; low: number; close: number; volume: number }>) {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    ...value,
  }));
}

test('BEAR_CALL_CREDIT uses resistance anchors and bearish semantics', async () => {
  const base = Array.from({ length: 55 }, (_, index) => {
    const close = 280 - index * 1.1;
    return {
      open: close + 1.5,
      high: close + 2.5,
      low: close - 2,
      close,
      volume: 52_000_000,
    };
  });

  const result = await rankCreditSpreadCandidates({
    strategyType: 'BEAR_CALL_CREDIT',
    movers: [
      { symbol: 'TSLA', name: 'Tesla', price: 212, changePercent: -8.1, volume: 120_000_000 },
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
          ...base,
          { open: 230, high: 232, low: 210, close: 212, volume: 120_000_000 },
        ]),
        callOptions: [
          { optionType: 'CALL', strike: 220, delta: 0.28, bid: 2.8, ask: 3.2, openInterest: 1800, volume: 900 },
          { optionType: 'CALL', strike: 230, delta: 0.16, bid: 1.9, ask: 2.2, openInterest: 2600, volume: 1400 },
          { optionType: 'CALL', strike: 235, delta: 0.1, bid: 0.45, ask: 0.65, openInterest: 2100, volume: 1200 },
        ],
        putOptions: [],
        dte: 5,
        structureResistance: 226,
        valueScore: 1.5,
        sector: 'Consumer Cyclical',
        earningsDays: 12,
      },
    },
  });

  const candidate = result.candidates[0];
  assert.equal(candidate?.strategyType, 'BEAR_CALL_CREDIT');
  assert.equal(candidate?.direction, 'BEARISH');
  assert.equal(candidate?.anchorType, 'RESISTANCE');
  assert.equal(candidate?.setupState, 'ACTIONABLE');
  assert.equal(candidate?.spreadTemplate?.shortLegType, 'CALL');
  assert.equal(candidate?.spreadTemplate?.shortStrike, 230);
  assert.deepEqual(candidate?.blockers, []);
});

test('same recovery symbol can qualify for bull put but not bear call', async () => {
  const base = Array.from({ length: 55 }, (_, index) => {
    const close = 158 - index * 0.35;
    return {
      open: close + 0.7,
      high: close + 1.2,
      low: close - 1.4,
      close,
      volume: 34_000_000,
    };
  });

  const sharedInput = {
    SHOP: {
      chart: createChartSeries([
        ...base,
        { open: 131.5, high: 136.4, low: 127.8, close: 135.7, volume: 58_000_000 },
      ]),
      callOptions: [
        { optionType: 'CALL', strike: 145, delta: 0.17, bid: 1.1, ask: 1.35, openInterest: 1600, volume: 850 },
        { optionType: 'CALL', strike: 150, delta: 0.11, bid: 0.46, ask: 0.6, openInterest: 1700, volume: 930 },
      ],
      putOptions: [
        { optionType: 'PUT', strike: 128, delta: -0.27, bid: 2.4, ask: 2.75, openInterest: 1800, volume: 900 },
        { optionType: 'PUT', strike: 125, delta: -0.16, bid: 1.75, ask: 2.05, openInterest: 2200, volume: 1200 },
        { optionType: 'PUT', strike: 120, delta: -0.1, bid: 0.45, ask: 0.65, openInterest: 2100, volume: 1150 },
      ],
      dte: 5,
      structureSupport: 129.5,
      structureResistance: 140.2,
      valueScore: 4.4,
      sector: 'Technology',
      earningsDays: 18,
    },
  } satisfies Record<string, CreditSpreadSymbolInput>;

  const bear = await rankCreditSpreadCandidates({
    strategyType: 'BEAR_CALL_CREDIT',
    movers: [{ symbol: 'SHOP', name: 'Shopify', price: 135.7, changePercent: 1.8, volume: 58_000_000 }],
    macro: {
      overallRegime: 'CHOPPY',
      indices: [],
      dxy: { symbol: 'DX-Y.NYB', price: 102.6, changePercent: -0.2, trend: 'DOWN' },
      vix: { symbol: '^VIX', price: 16.3, changePercent: -1.2, status: 'FALLING' },
    },
    symbolInputs: sharedInput,
  });

  const bull = await rankCreditSpreadCandidates({
    strategyType: 'BULL_PUT_CREDIT',
    movers: [{ symbol: 'SHOP', name: 'Shopify', price: 135.7, changePercent: 1.8, volume: 58_000_000 }],
    macro: {
      overallRegime: 'RISK_ON',
      indices: [],
      dxy: { symbol: 'DX-Y.NYB', price: 102.1, changePercent: -0.4, trend: 'DOWN' },
      vix: { symbol: '^VIX', price: 14.7, changePercent: -2.1, status: 'FALLING' },
    },
    symbolInputs: sharedInput,
  });

  assert.equal(bear.candidates[0]?.anchorType, 'RESISTANCE');
  assert.equal(bear.candidates[0]?.setupState, 'WATCHLIST');
  assert.ok(bear.candidates[0]?.blockers.includes('MOVE_DIRECTION_CONFLICT'));

  assert.equal(bull.candidates[0]?.strategyType, 'BULL_PUT_CREDIT');
  assert.equal(bull.candidates[0]?.direction, 'BULLISH');
  assert.equal(bull.candidates[0]?.anchorType, 'SUPPORT');
  assert.equal(bull.candidates[0]?.setupState, 'ACTIONABLE');
  assert.equal(bull.candidates[0]?.spreadTemplate?.shortLegType, 'PUT');
  assert.equal(bull.candidates[0]?.spreadTemplate?.shortStrike, 125);
  assert.ok((bull.candidates[0]?.score ?? 0) > (bear.candidates[0]?.score ?? 0));
});

test('getCreditSpreadStrategySnapshot falls back to null macro and keeps missing spreads on the watchlist', async () => {
  const base = Array.from({ length: 55 }, (_, index) => {
    const close = 88 - index * 0.25;
    return {
      open: close + 0.6,
      high: close + 1,
      low: close - 0.8,
      close,
      volume: 28_000_000,
    };
  });

  const snapshot = await getCreditSpreadStrategySnapshot({
    strategyType: 'BEAR_CALL_CREDIT',
    activeLimit: 1,
    loserLimit: 0,
    loaders: {
      fetchMovers: async () => [
        { symbol: 'XYZ', name: 'Example Co', price: 72, changePercent: -3.4, volume: 28_000_000 },
      ],
      fetchMacro: async () => {
        throw new Error('macro unavailable');
      },
      buildSymbolInput: async () => ({
        chart: createChartSeries([
          ...base,
          { open: 75, high: 75.8, low: 71.8, close: 72, volume: 28_000_000 },
        ]),
        callOptions: [],
        putOptions: [],
        dte: 5,
        structureResistance: 76,
        valueScore: 3.2,
        sector: 'Industrials',
        earningsDays: 14,
      }),
    },
  });

  assert.equal(snapshot.strategyType, 'BEAR_CALL_CREDIT');
  assert.equal(snapshot.macro, null);
  assert.equal(snapshot.candidates[0]?.setupState, 'WATCHLIST');
  assert.ok(snapshot.candidates[0]?.blockers.includes('NO_LIQUID_TEMPLATE'));
});
