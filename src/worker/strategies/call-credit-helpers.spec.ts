import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCloseLocationValue,
  calculateUpperWickRatio,
  estimateOptionDelta,
  scoreBreakdownState,
  selectBearCallCreditTemplate,
  selectBullPutCreditTemplate,
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

test('selectBearCallCreditTemplate picks a liquid 10-20 delta short call above resistance', () => {
  const template = selectBearCallCreditTemplate({
    spotPrice: 212,
    anchorLevel: 226,
    expiryISO: '2026-03-20',
    options: [
      { optionType: 'CALL', strike: 220, delta: 0.28, bid: 2.8, ask: 3.2, openInterest: 1800, volume: 900 },
      { optionType: 'CALL', strike: 230, delta: 0.16, bid: 1.2, ask: 1.6, openInterest: 2600, volume: 1400 },
      { optionType: 'CALL', strike: 235, delta: 0.1, bid: 0.55, ask: 0.7, openInterest: 2100, volume: 1200 },
    ],
    widthCandidates: [5],
    dte: 5,
  });

  assert.equal(template?.strategyType, 'BEAR_CALL_CREDIT');
  assert.equal(template?.shortLegType, 'CALL');
  assert.equal(template?.longLegType, 'CALL');
  assert.equal(template?.shortStrike, 230);
  assert.equal(template?.longStrike, 235);
  assert.equal(template?.expiryISO, '2026-03-20');
  assert.equal(template?.creditMid.toFixed(3), '0.775');
  assert.equal(template?.creditPctWidth.toFixed(3), '0.155');
});

test('selectBullPutCreditTemplate picks a liquid 10-20 delta short put below support', () => {
  const template = selectBullPutCreditTemplate({
    spotPrice: 212,
    anchorLevel: 205,
    expiryISO: '2026-03-20',
    options: [
      { optionType: 'PUT', strike: 205, delta: -0.29, bid: 2.4, ask: 2.8, openInterest: 1800, volume: 800 },
      { optionType: 'PUT', strike: 200, delta: -0.17, bid: 1.25, ask: 1.55, openInterest: 2200, volume: 1200 },
      { optionType: 'PUT', strike: 195, delta: -0.11, bid: 0.55, ask: 0.8, openInterest: 2100, volume: 1150 },
    ],
    widthCandidates: [5],
    dte: 5,
  });

  assert.equal(template?.strategyType, 'BULL_PUT_CREDIT');
  assert.equal(template?.shortLegType, 'PUT');
  assert.equal(template?.longLegType, 'PUT');
  assert.equal(template?.shortStrike, 200);
  assert.equal(template?.longStrike, 195);
  assert.equal(template?.expiryISO, '2026-03-20');
  assert.equal(template?.creditMid.toFixed(3), '0.725');
  assert.equal(template?.creditPctWidth.toFixed(3), '0.145');
});

test('estimateOptionDelta falls as options move further out of the money', () => {
  const nearer = estimateOptionDelta({
    spotPrice: 212,
    strike: 225,
    dte: 5,
    optionType: 'CALL',
  });
  const further = estimateOptionDelta({
    spotPrice: 212,
    strike: 235,
    dte: 5,
    optionType: 'CALL',
  });

  assert.ok(nearer > further);
  assert.ok(nearer <= 0.5);
  assert.ok(further >= 0.01);
});
