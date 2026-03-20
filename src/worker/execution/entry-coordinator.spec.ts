import test from 'node:test';
import assert from 'node:assert/strict';

import type { CreditSpreadCandidate } from './types.js';
import { executeCreditSpreadEntries } from './entry-coordinator.js';

function makeCandidate(overrides?: Partial<CreditSpreadCandidate>): CreditSpreadCandidate {
  return {
    strategyType: 'BULL_PUT_CREDIT',
    symbol: 'AAPL',
    expiryISO: '2026-03-27',
    quantity: 1,
    width: 2,
    targetNetCredit: 1.2,
    minAcceptableNetCredit: 1.0,
    maxLoss: 100,
    shortLeg: {
      symbol: 'AAPL',
      expiry: '20260327',
      strike: 190,
      putCall: 'PUT',
      action: 'SELL',
      multiplier: 100,
    },
    longLeg: {
      symbol: 'AAPL',
      expiry: '20260327',
      strike: 188,
      putCall: 'PUT',
      action: 'BUY',
      multiplier: 100,
    },
    idempotencyKey: 'AAPL:BULL_PUT_CREDIT:2026-03-27:190.0000:188.0000',
    ...overrides,
  };
}

function createRepositoryStub() {
  let nextId = 1;
  const intents: any[] = [];
  const executions: any[] = [];
  const positions: any[] = [];
  const riskEvents: any[] = [];

  return {
    intents,
    executions,
    positions,
    riskEvents,
    async createTradeIntent(input: Record<string, unknown>) {
      const record = { id: nextId++, ...input };
      intents.push(record);
      return record;
    },
    async updateTradeIntent(input: Record<string, unknown>) {
      intents.push({ update: input });
      return input;
    },
    async createTradeExecution(input: Record<string, unknown>) {
      const record = { id: nextId++, ...input };
      executions.push(record);
      return record;
    },
    async updateTradeExecution(input: Record<string, unknown>) {
      executions.push({ update: input });
      return input;
    },
    async createManagedPosition(input: Record<string, unknown>) {
      const record = { id: nextId++, ...input };
      positions.push(record);
      return record;
    },
    async createRiskEvent(input: Record<string, unknown>) {
      const record = { id: nextId++, ...input };
      riskEvents.push(record);
      return record;
    },
  };
}

test('candidate is accepted only after local risk pass and broker preview pass', async () => {
  const candidate = makeCandidate();
  const repository = createRepositoryStub();
  const previewCalls: unknown[] = [];
  const placeCalls: unknown[] = [];

  const result = await executeCreditSpreadEntries({
    loadCandidates: async () => [candidate],
    getRiskContext: async () => ({
      accountNetValue: 10_000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
    }),
    repository,
    tigerClient: {
      async previewCombo(request) {
        previewCalls.push(request);
        return { ok: true, requiredBuyingPower: 200 };
      },
      async placeCombo(request) {
        placeCalls.push(request);
        return { orderId: 'T-100', status: 'SUBMITTED' };
      },
    },
    riskConfig: {
      maxRiskPctPerTrade: 0.02,
      maxPortfolioRiskPct: 0.1,
      cooldownMinutes: 60,
    },
    repricingStepCredits: 0.1,
  });

  assert.equal(result.processed, 1);
  assert.equal(result.accepted, 1);
  assert.equal(result.placed, 1);
  assert.equal(previewCalls.length, 1);
  assert.equal(placeCalls.length, 1);
  assert.equal((previewCalls[0] as { quantity: number }).quantity, 2);
  assert.equal((placeCalls[0] as { netPrice: number }).netPrice, 1.2);
  assert.equal(repository.intents.length >= 1, true);
  assert.equal(repository.positions.length, 1);
});

test('repricing stops at minAcceptableNetCredit', async () => {
  const candidate = makeCandidate({
    targetNetCredit: 1.2,
    minAcceptableNetCredit: 1.0,
  });
  const repository = createRepositoryStub();
  const placeCalls: Array<{ netPrice: number }> = [];

  const result = await executeCreditSpreadEntries({
    loadCandidates: async () => [candidate],
    getRiskContext: async () => ({
      accountNetValue: 10_000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
    }),
    repository,
    tigerClient: {
      async previewCombo() {
        return { ok: true };
      },
      async placeCombo(request) {
        placeCalls.push({ netPrice: request.netPrice });
        return { status: 'REJECTED', message: 'no fill' };
      },
    },
    riskConfig: {
      maxRiskPctPerTrade: 0.02,
      maxPortfolioRiskPct: 0.1,
      cooldownMinutes: 60,
    },
    repricingStepCredits: 0.1,
  });

  assert.equal(result.placed, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(placeCalls.map((call) => call.netPrice), [1.2, 1.1, 1.0]);
});

test('duplicate idempotency key does not create another order', async () => {
  const candidate = makeCandidate();
  const repository = createRepositoryStub();

  const result = await executeCreditSpreadEntries({
    loadCandidates: async () => [candidate],
    getRiskContext: async () => ({
      accountNetValue: 10_000,
      currentOpenRisk: 0,
      existingPositionKeys: [candidate.idempotencyKey],
    }),
    repository,
    tigerClient: {
      async previewCombo() {
        throw new Error('should not preview duplicate candidate');
      },
      async placeCombo() {
        throw new Error('should not place duplicate candidate');
      },
    },
    riskConfig: {
      maxRiskPctPerTrade: 0.02,
      maxPortfolioRiskPct: 0.1,
      cooldownMinutes: 60,
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.accepted, 0);
  assert.equal(repository.intents.length, 0);
});

test('failed preview stores a risk event', async () => {
  const candidate = makeCandidate();
  const repository = createRepositoryStub();

  const result = await executeCreditSpreadEntries({
    loadCandidates: async () => [candidate],
    getRiskContext: async () => ({
      accountNetValue: 10_000,
      currentOpenRisk: 0,
      existingPositionKeys: [],
    }),
    repository,
    tigerClient: {
      async previewCombo() {
        return { ok: false, message: 'insufficient buying power' };
      },
      async placeCombo() {
        throw new Error('should not place rejected preview');
      },
    },
    riskConfig: {
      maxRiskPctPerTrade: 0.02,
      maxPortfolioRiskPct: 0.1,
      cooldownMinutes: 60,
    },
  });

  assert.equal(result.failed, 1);
  assert.equal(repository.riskEvents.length, 1);
  assert.equal(repository.riskEvents[0].reasonCode, 'BROKER_PREVIEW_REJECTED');
  assert.match(String(repository.riskEvents[0].message), /insufficient buying power/i);
});
