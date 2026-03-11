import test from 'node:test';
import assert from 'node:assert/strict';

import type { CallCreditCandidate } from '../types';
import {
  formatCallCreditTemplateHorizon,
  getDefaultSelectedCallCreditSymbol,
  getVisibleCallCreditCandidates,
  hasActionableCallCreditCandidates,
} from './callCredit';

const baseCandidate: CallCreditCandidate = {
  symbol: 'TSLA',
  name: 'Tesla',
  price: 210,
  changePercent: -7.2,
  volume: 120_000_000,
  score: 22,
  setupState: 'ACTIONABLE',
  breakdownScore: 18,
  macroScore: 4,
  valueBias: 0,
  structureResistance: 225,
  invalidationPrice: 227.25,
  volumeRatio20: 2.1,
  closeLocationValue: 0.11,
  upperWickRatio: 0.08,
  eventTags: [],
  thesis: [],
  watchlistReasons: [],
  spreadTemplate: null,
  dte: 5,
};

test('getVisibleCallCreditCandidates defaults to actionable setups when any exist', () => {
  const candidates: CallCreditCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      setupState: 'WATCHLIST',
      score: 9,
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
    baseCandidate,
  ];

  const visible = getVisibleCallCreditCandidates(candidates, false);

  assert.deepEqual(visible.map((candidate) => candidate.symbol), ['TSLA']);
  assert.equal(hasActionableCallCreditCandidates(candidates), true);
});

test('getVisibleCallCreditCandidates falls back to the watchlist when no actionable setups exist', () => {
  const candidates: CallCreditCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      setupState: 'WATCHLIST',
      score: 9,
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
  ];

  const visible = getVisibleCallCreditCandidates(candidates, false);

  assert.deepEqual(visible.map((candidate) => candidate.symbol), ['AAPL']);
  assert.equal(hasActionableCallCreditCandidates(candidates), false);
});

test('getDefaultSelectedCallCreditSymbol prefers the first visible candidate', () => {
  const candidates: CallCreditCandidate[] = [
    {
      ...baseCandidate,
      symbol: 'AAPL',
      setupState: 'WATCHLIST',
      score: 9,
      watchlistReasons: ['watchlist-only: Breakdown score is below the actionable threshold'],
    },
    baseCandidate,
  ];

  assert.equal(getDefaultSelectedCallCreditSymbol(candidates, false), 'TSLA');
  assert.equal(getDefaultSelectedCallCreditSymbol(candidates, true), 'AAPL');
});

test('formatCallCreditTemplateHorizon includes the explicit expiry date', () => {
  assert.equal(
    formatCallCreditTemplateHorizon('2026-03-20', 5),
    'Mar 20, 2026 · 5 DTE',
  );
});
