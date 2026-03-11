import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCloseLocationValue,
  calculateUpperWickRatio,
  scoreBreakdownState,
} from './call-credit-helpers.js';

test('scoreBreakdownState rewards hard breakdown candles', () => {
  const score = scoreBreakdownState({
    changePercent: -8.2,
    volumeRatio20: 2.1,
    closeLocationValue: calculateCloseLocationValue({
      open: 230,
      high: 232,
      low: 210,
      close: 212,
    }),
    upperWickRatio: calculateUpperWickRatio({
      open: 230,
      high: 232,
      low: 210,
      close: 212,
    }),
    brokeEma20: true,
    brokeEma50: true,
    brokePrior20Low: true,
  });

  assert.ok(score >= 24);
});
