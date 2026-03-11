import test from 'node:test';
import assert from 'node:assert/strict';

import type { CreditSpreadCandidate } from '../types';
import {
  formatCreditSpreadTemplateHorizon,
  getDefaultSelectedCreditSpreadSymbol,
  getVisibleCreditSpreadCandidates,
  hasActionableCreditSpreadCandidates,
} from './callCredit';

const baseCandidate: CreditSpreadCandidate = {
  strategyType: 'BEAR_CALL_CREDIT',
  direction: 'BEARISH',
  symbol: 'TSLA',
  name: 'Tesla',
  price: 210,
  changePercent: -7.2,
  volume: 120_000_000,
  score: 22,
  setupState: 'ACTIONABLE',
  structureScore: 18,
  macroScore: 4,
  valueBias: 0,
  anchorType: 'RESISTANCE',
  anchorLevel: 225,
  invalidationPrice: 227.25,
  volumeRatio20: 2.1,
  closeLocationValue: 0.11,
  upperWickRatio: 0.08,
  lowerWickRatio: 0.05,
  eventTags: [],
  thesis: [],
  blockers: [],
  watchlistReasons: [],
  spreadTemplate: null,
  dte: 5,
};

test('getVisibleCreditSpreadCandidates defaults to actionable setups when any exist', () => {
  const candidates: CreditSpreadCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      setupState: 'WATCHLIST',
      score: 9,
      blockers: ['BREAKDOWN_TOO_WEAK'],
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
    baseCandidate,
  ];

  const visible = getVisibleCreditSpreadCandidates(candidates, false);

  assert.deepEqual(visible.map((candidate) => candidate.symbol), ['TSLA']);
  assert.equal(hasActionableCreditSpreadCandidates(candidates), true);
});

test('getVisibleCreditSpreadCandidates falls back to the watchlist when no actionable setups exist', () => {
  const candidates: CreditSpreadCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      strategyType: 'BULL_PUT_CREDIT',
      direction: 'BULLISH',
      anchorType: 'SUPPORT',
      anchorLevel: 182,
      setupState: 'WATCHLIST',
      score: 9,
      blockers: ['BOUNCE_NOT_CONFIRMED'],
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
  ];

  const visible = getVisibleCreditSpreadCandidates(candidates, false);

  assert.deepEqual(visible.map((candidate) => candidate.symbol), ['AAPL']);
  assert.equal(hasActionableCreditSpreadCandidates(candidates), false);
});

test('getDefaultSelectedCreditSpreadSymbol prefers the first visible candidate', () => {
  const candidates: CreditSpreadCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      setupState: 'WATCHLIST',
      score: 9,
      blockers: ['BREAKDOWN_TOO_WEAK'],
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
    baseCandidate,
  ];

  assert.equal(getDefaultSelectedCreditSpreadSymbol(candidates, false), 'TSLA');
  assert.equal(getDefaultSelectedCreditSpreadSymbol(candidates, true), 'AAPL');
});

test('formatCreditSpreadTemplateHorizon includes the explicit expiry date', () => {
  assert.equal(
    formatCreditSpreadTemplateHorizon('2026-03-20', 5),
    'Mar 20, 2026 · 5 DTE',
  );
});
