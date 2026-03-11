import test from 'node:test';
import assert from 'node:assert/strict';

import { getCallCreditStrategySnapshot, rankCallCreditCandidates } from './call-credit.js';

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

test('getCallCreditStrategySnapshot falls back to null macro and keeps missing spreads on the watchlist', async () => {
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

  const snapshot = await getCallCreditStrategySnapshot({
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
        options: [],
        dte: 5,
        structureResistance: 76,
        valueScore: 3.2,
        sector: 'Industrials',
        earningsDays: 14,
      }),
    },
  });

  assert.equal(snapshot.macro, null);
  assert.equal(snapshot.candidates[0]?.setupState, 'WATCHLIST');
  assert.ok(snapshot.candidates[0]?.watchlistReasons.some((reason) => reason.includes('No liquid 3-7 DTE call spread')));
});

test('RISK_ON macro penalizes weaker bearish setups', async () => {
  const base = Array.from({ length: 55 }, (_, index) => {
    const close = 145 - index * 0.32;
    return {
      open: close + 0.8,
      high: close + 1.4,
      low: close - 1.1,
      close,
      volume: 32_000_000,
    };
  });

  const symbolInputs = {
    NFLX: {
      chart: createChartSeries([
        ...base,
        { open: 130.8, high: 131.2, low: 126.4, close: 127.1, volume: 36_000_000 },
      ]),
      options: [],
      dte: 5,
      structureResistance: 132,
      valueScore: 3.3,
      sector: 'Communication Services',
      earningsDays: 21,
    },
  };

  const riskOff = await rankCallCreditCandidates({
    movers: [{ symbol: 'NFLX', name: 'Netflix', price: 127.1, changePercent: -3.8, volume: 36_000_000 }],
    macro: {
      overallRegime: 'RISK_OFF',
      indices: [],
      dxy: { symbol: 'DX-Y.NYB', price: 104, changePercent: 0.4, trend: 'UP' },
      vix: { symbol: '^VIX', price: 18, changePercent: 2.1, status: 'RISING' },
    },
    symbolInputs,
  });

  const riskOn = await rankCallCreditCandidates({
    movers: [{ symbol: 'NFLX', name: 'Netflix', price: 127.1, changePercent: -3.8, volume: 36_000_000 }],
    macro: {
      overallRegime: 'RISK_ON',
      indices: [],
      dxy: { symbol: 'DX-Y.NYB', price: 102, changePercent: -0.4, trend: 'DOWN' },
      vix: { symbol: '^VIX', price: 14, changePercent: -3.1, status: 'FALLING' },
    },
    symbolInputs,
  });

  assert.ok((riskOff.candidates[0]?.score ?? 0) > (riskOn.candidates[0]?.score ?? 0));
  assert.equal(riskOn.candidates[0]?.setupState, 'WATCHLIST');
  assert.ok(riskOn.candidates[0]?.watchlistReasons.some((reason) => reason.includes('Macro regime')));
});

test('green-session names rank below real breakdown names even if a spread exists', async () => {
  const base = Array.from({ length: 55 }, (_, index) => {
    const close = 205 - index * 0.55;
    return {
      open: close + 0.8,
      high: close + 1.5,
      low: close - 1.2,
      close,
      volume: 48_000_000,
    };
  });

  const result = await rankCallCreditCandidates({
    movers: [
      { symbol: 'TSLA', name: 'Tesla', price: 407.82, changePercent: 2.15, volume: 62_100_000 },
      { symbol: 'CPB', name: 'Campbell Soup', price: 22.94, changePercent: -7.05, volume: 29_000_000 },
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
          { open: 404, high: 410, low: 401, close: 407.82, volume: 62_100_000 },
        ]),
        options: [
          { strike: 450, delta: 0.14, bid: 0.05, ask: 0.07, openInterest: 1400, volume: 900 },
          { strike: 455, delta: 0.1, bid: 0.01, ask: 0.03, openInterest: 1100, volume: 600 },
        ],
        dte: 5,
        structureResistance: 420.34,
        valueScore: 4.5,
        sector: 'Consumer Cyclical',
        earningsDays: 18,
      },
      CPB: {
        chart: createChartSeries([
          ...base.map((bar, index) => ({
            ...bar,
            open: 31 - index * 0.08,
            high: 31.3 - index * 0.08,
            low: 30.2 - index * 0.08,
            close: 30.6 - index * 0.08,
            volume: 14_000_000,
          })),
          { open: 24.6, high: 24.9, low: 22.7, close: 22.94, volume: 29_000_000 },
        ]),
        options: [],
        dte: 5,
        structureResistance: 27.71,
        valueScore: 2.2,
        sector: 'Consumer Defensive',
        earningsDays: 25,
      },
    },
  });

  assert.equal(result.candidates[0]?.symbol, 'CPB');
  assert.equal(result.candidates[1]?.symbol, 'TSLA');
  assert.ok((result.candidates[0]?.score ?? 0) > (result.candidates[1]?.score ?? 0));
  assert.ok(result.candidates[1]?.watchlistReasons.some((reason) => reason.includes('green')));
});
