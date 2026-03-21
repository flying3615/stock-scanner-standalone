import test from 'node:test';
import assert from 'node:assert/strict';

import type { CreditSpreadCandidate } from './types.js';
import {
  evaluateCreditSpreadCandidateRisk,
  type CreditSpreadRiskConfig,
} from './risk.js';

function makeCandidate(overrides?: Partial<CreditSpreadCandidate>): CreditSpreadCandidate {
  return {
    strategyType: 'BEAR_CALL_CREDIT',
    symbol: 'AAPL',
    expiryISO: '2026-03-27',
    quantity: 1,
    width: 5,
    targetNetCredit: 1.25,
    minAcceptableNetCredit: 1.0,
    maxLoss: 125,
    shortLeg: {
      symbol: 'AAPL',
      expiry: '20260327',
      strike: 105,
      putCall: 'CALL',
      action: 'SELL',
      multiplier: 100,
    },
    longLeg: {
      symbol: 'AAPL',
      expiry: '20260327',
      strike: 110,
      putCall: 'CALL',
      action: 'BUY',
      multiplier: 100,
    },
    idempotencyKey: 'AAPL:BEAR_CALL_CREDIT:2026-03-27:105.0000:110.0000',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<CreditSpreadRiskConfig>): CreditSpreadRiskConfig {
  return {
    maxRiskPctPerTrade: 0.02,
    maxPortfolioRiskPct: 0.1,
    cooldownMinutes: 60,
    ...overrides,
  };
}

test('sizes quantity from account net value and risk budget', () => {
  const result = evaluateCreditSpreadCandidateRisk(
    makeCandidate(),
    {
      accountNetValue: 100000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
      nowMs: 1_000_000,
    },
    makeConfig()
  );

  assert.equal(result.accepted, true);
  assert.equal(result.quantity, 16);
  assert.equal(result.sizedCandidate.quantity, 16);
  assert.equal(result.riskCheck.passed, true);
});

test('rejects when quantity rounds to zero', () => {
  const result = evaluateCreditSpreadCandidateRisk(
    makeCandidate({ maxLoss: 2500 }),
    {
      accountNetValue: 100000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
      nowMs: 1_000_000,
    },
    makeConfig({ maxRiskPctPerTrade: 0.01 })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.quantity, 0);
  assert.deepEqual(result.riskCheck.reasonCodes, ['TRADE_SIZE_TOO_SMALL']);
});

test('downsizes when remaining portfolio budget is tighter than per-trade budget', () => {
  const result = evaluateCreditSpreadCandidateRisk(
    makeCandidate(),
    {
      accountNetValue: 100000,
      currentOpenRisk: 9875,
      existingPositionKeys: [],
      nowMs: 1_000_000,
    },
    makeConfig({ maxPortfolioRiskPct: 0.1 })
  );

  assert.equal(result.accepted, true);
  assert.equal(result.quantity, 1);
  assert.equal(result.sizedCandidate.quantity, 1);
  assert.equal(result.riskCheck.passed, true);
});

test('rejects when aggregate open risk leaves no room for a contract', () => {
  const result = evaluateCreditSpreadCandidateRisk(
    makeCandidate(),
    {
      accountNetValue: 100000,
      currentOpenRisk: 9900,
      existingPositionKeys: [],
      nowMs: 1_000_000,
    },
    makeConfig({ maxPortfolioRiskPct: 0.1 })
  );

  assert.equal(result.accepted, false);
  assert.equal(result.quantity, 0);
  assert.deepEqual(result.riskCheck.reasonCodes, ['TRADE_SIZE_TOO_SMALL']);
});

test('rejects when duplicate position key already exists', () => {
  const result = evaluateCreditSpreadCandidateRisk(
    makeCandidate(),
    {
      accountNetValue: 100000,
      currentOpenRisk: 0,
      existingPositionKeys: [makeCandidate().idempotencyKey],
      nowMs: 1_000_000,
    },
    makeConfig()
  );

  assert.equal(result.accepted, false);
  assert.equal(result.quantity, 0);
  assert.deepEqual(result.riskCheck.reasonCodes, ['DUPLICATE_POSITION_KEY']);
});

test('rejects when cooldown is active for the same idempotency key', () => {
  const candidate = makeCandidate();
  const result = evaluateCreditSpreadCandidateRisk(
    candidate,
    {
      accountNetValue: 100000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
      cooldownUntilByKey: {
        [candidate.idempotencyKey]: 1_500_000,
      },
      nowMs: 1_000_000,
    },
    makeConfig()
  );

  assert.equal(result.accepted, false);
  assert.equal(result.quantity, 0);
  assert.deepEqual(result.riskCheck.reasonCodes, ['COOLDOWN_ACTIVE']);
});
