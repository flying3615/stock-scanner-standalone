import test from 'node:test';
import assert from 'node:assert/strict';

import { manageCreditSpreadPositions } from './position-manager.js';
import type { ExitPolicy } from './types.js';

function makeManagedPosition(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    symbol: 'AAPL',
    strategyType: 'BULL_PUT_CREDIT',
    status: 'OPEN',
    idempotencyKey: 'AAPL:BULL_PUT_CREDIT:2026-03-27:190.0000:188.0000',
    expiryISO: '2026-03-27',
    quantity: 1,
    width: 2,
    entryCredit: 1.2,
    maxLoss: 80,
    ...overrides,
  };
}

function createRepositoryStub() {
  const updates: any[] = [];
  const executions: any[] = [];
  const riskEvents: any[] = [];

  return {
    updates,
    executions,
    riskEvents,
    async updateManagedPosition(input: Record<string, unknown>) {
      updates.push(input);
      return input;
    },
    async createTradeExecution(input: Record<string, unknown>) {
      executions.push(input);
      return { id: executions.length, ...input };
    },
    async createRiskEvent(input: Record<string, unknown>) {
      riskEvents.push(input);
      return { id: riskEvents.length, ...input };
    },
  };
}

function makeExitPolicy(overrides?: Partial<ExitPolicy>): ExitPolicy {
  return {
    takeProfitCreditPct: 0.5,
    stopLossMultiple: 2,
    forceCloseDte: 1,
    ...overrides,
  };
}

test('take-profit exit trigger submits combo close order', async () => {
  const repository = createRepositoryStub();
  const placeCalls: unknown[] = [];

  const result = await manageCreditSpreadPositions({
    loadManagedPositions: async () => [makeManagedPosition()],
    repository,
    tigerClient: {
      async getOptionPositions() {
        return [
          { symbol: 'AAPL', putCall: 'PUT', strike: 190, expiry: '20260327', quantity: -1, marketPrice: 0.4 },
          { symbol: 'AAPL', putCall: 'PUT', strike: 188, expiry: '20260327', quantity: 1, marketPrice: 0.1 },
        ];
      },
      async getOptionOrders() {
        return [];
      },
      async placeCombo(request) {
        placeCalls.push(request);
        return { orderId: 'EXIT-1', status: 'SUBMITTED' };
      },
    },
    exitPolicy: makeExitPolicy(),
    now: () => new Date('2026-03-25T15:00:00Z'),
  });

  assert.equal(result.processed, 1);
  assert.equal(result.exitsSubmitted, 1);
  assert.equal(placeCalls.length, 1);
  assert.equal((placeCalls[0] as { netPrice: number }).netPrice, 0.3);
  assert.equal(repository.updates[0].status, 'PENDING_EXIT');
});

test('stop-loss exit trigger submits combo close order', async () => {
  const repository = createRepositoryStub();
  const placeCalls: unknown[] = [];

  const result = await manageCreditSpreadPositions({
    loadManagedPositions: async () => [makeManagedPosition({ entryCredit: 1.0 })],
    repository,
    tigerClient: {
      async getOptionPositions() {
        return [
          { symbol: 'AAPL', putCall: 'PUT', strike: 190, expiry: '20260327', quantity: -1, marketPrice: 2.4 },
          { symbol: 'AAPL', putCall: 'PUT', strike: 188, expiry: '20260327', quantity: 1, marketPrice: 0.1 },
        ];
      },
      async getOptionOrders() {
        return [];
      },
      async placeCombo(request) {
        placeCalls.push(request);
        return { orderId: 'EXIT-2', status: 'SUBMITTED' };
      },
    },
    exitPolicy: makeExitPolicy(),
    now: () => new Date('2026-03-25T15:00:00Z'),
  });

  assert.equal(result.exitsSubmitted, 1);
  assert.equal(placeCalls.length, 1);
  assert.equal((placeCalls[0] as { netPrice: number }).netPrice, 2.3);
});

test('forced close before expiration submits exit order', async () => {
  const repository = createRepositoryStub();
  const placeCalls: unknown[] = [];

  const result = await manageCreditSpreadPositions({
    loadManagedPositions: async () => [makeManagedPosition()],
    repository,
    tigerClient: {
      async getOptionPositions() {
        return [
          { symbol: 'AAPL', putCall: 'PUT', strike: 190, expiry: '20260327', quantity: -1, marketPrice: 0.9 },
          { symbol: 'AAPL', putCall: 'PUT', strike: 188, expiry: '20260327', quantity: 1, marketPrice: 0.3 },
        ];
      },
      async getOptionOrders() {
        return [];
      },
      async placeCombo(request) {
        placeCalls.push(request);
        return { orderId: 'EXIT-3', status: 'SUBMITTED' };
      },
    },
    exitPolicy: makeExitPolicy({ forceCloseDte: 1 }),
    now: () => new Date('2026-03-26T15:00:00Z'),
  });

  assert.equal(result.exitsSubmitted, 1);
  assert.equal(placeCalls.length, 1);
});

test('reconciliation mismatch transitions position to manual intervention required', async () => {
  const repository = createRepositoryStub();

  const result = await manageCreditSpreadPositions({
    loadManagedPositions: async () => [makeManagedPosition()],
    repository,
    tigerClient: {
      async getOptionPositions() {
        return [{ symbol: 'AAPL', putCall: 'PUT', strike: 190, expiry: '20260327', quantity: -1, marketPrice: 0.4 }];
      },
      async getOptionOrders() {
        return [];
      },
      async placeCombo() {
        throw new Error('should not place when reconciliation fails');
      },
    },
    exitPolicy: makeExitPolicy(),
    now: () => new Date('2026-03-25T15:00:00Z'),
  });

  assert.equal(result.manualInterventions, 1);
  assert.equal(repository.updates[0].status, 'MANUAL_INTERVENTION_REQUIRED');
  assert.equal(repository.riskEvents[0].reasonCode, 'POSITION_RECONCILIATION_MISMATCH');
});
