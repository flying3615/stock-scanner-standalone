import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCloseLocationValue,
  calculateUpperWickRatio,
  estimateCallDelta,
  scoreBreakdownState,
  selectCallCreditTemplate,
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

test('selectCallCreditTemplate picks a liquid 10-20 delta short call above resistance', () => {
  const template = selectCallCreditTemplate({
    spotPrice: 212,
    structureResistance: 226,
    options: [
      { strike: 220, delta: 0.28, bid: 2.8, ask: 3.2, openInterest: 1800, volume: 900 },
      { strike: 230, delta: 0.16, bid: 1.2, ask: 1.6, openInterest: 2600, volume: 1400 },
      { strike: 235, delta: 0.1, bid: 0.55, ask: 0.7, openInterest: 2100, volume: 1200 },
    ],
    widthCandidates: [5],
    dte: 5,
  });

  assert.equal(template?.shortStrike, 230);
  assert.equal(template?.longStrike, 235);
  assert.ok((template?.creditPctWidth ?? 0) >= 0.25);
});

test('estimateCallDelta falls as calls move further out of the money', () => {
  const nearer = estimateCallDelta({
    spotPrice: 212,
    strike: 225,
    dte: 5,
  });
  const further = estimateCallDelta({
    spotPrice: 212,
    strike: 235,
    dte: 5,
  });

  assert.ok(nearer > further);
  assert.ok(nearer <= 0.5);
  assert.ok(further >= 0.01);
});
