import test from 'node:test';
import assert from 'node:assert/strict';
import { isCreditSpreadCandidate } from './types.js';
import type { CreditSpreadCandidate } from './types.js';

test('credit spread candidate captures both legs and execution fields', () => {
  const candidate: CreditSpreadCandidate = {
    strategyType: 'BULL_PUT_CREDIT',
    symbol: 'AAPL',
    expiryISO: '2026-03-27',
    quantity: 1,
    width: 2,
    targetNetCredit: 0.55,
    minAcceptableNetCredit: 0.4,
    maxLoss: 145,
    shortLeg: {
      putCall: 'PUT',
      action: 'SELL',
      strike: 190,
      expiry: '20260327',
      multiplier: 100,
      symbol: 'AAPL',
    },
    longLeg: {
      putCall: 'PUT',
      action: 'BUY',
      strike: 188,
      expiry: '20260327',
      multiplier: 100,
      symbol: 'AAPL',
    },
    idempotencyKey: 'AAPL:BULL_PUT_CREDIT:2026-03-27:190:188',
  };

  assert.equal(candidate.longLeg.action, 'BUY');
  assert.equal(candidate.shortLeg.putCall, 'PUT');
  assert.equal(isCreditSpreadCandidate(candidate), true);
});
