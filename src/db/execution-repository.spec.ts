import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  createExecutionRepository,
  type CreateManagedPositionInput,
  type CreateRiskEventInput,
  type CreateTradeIntentInput,
  type UpdateManagedPositionInput,
  type UpdateTradeExecutionInput,
  type UpdateTradeIntentInput,
} from './execution-repository.js';

test('execution repository persists intent, managed position, and risk event records', async () => {
  const runId = `${Date.now()}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-credit-spread-execution-'));
  const databasePath = path.join(tempDir, `execution-${runId}.db`);
  const migrationPath = new URL(
    '../../prisma/migrations/20260320001000_add_auto_credit_spread_execution/migration.sql',
    import.meta.url
  );
  const idempotencyKey = `AAPL:BEAR_CALL_CREDIT:2026-03-27:105.0000:110.0000:${runId}`;
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  execFileSync('sqlite3', [databasePath], {
    input: migrationSql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const repo = createExecutionRepository({
    databaseUrl: `file:${databasePath}`,
  });

  try {
    const intent = await repo.createTradeIntent({
      symbol: 'AAPL',
      strategyType: 'BEAR_CALL_CREDIT',
      status: 'PENDING_PREVIEW',
      idempotencyKey,
      expiryISO: '2026-03-27',
      quantity: 2,
      width: 5,
      targetNetCredit: 1.25,
      minAcceptableNetCredit: 1.0,
      maxLoss: 375,
    } satisfies CreateTradeIntentInput);

    assert.equal(intent.symbol, 'AAPL');
    assert.equal(intent.status, 'PENDING_PREVIEW');

    const position = await repo.createManagedPosition({
      tradeIntentId: intent.id,
      symbol: 'AAPL',
      strategyType: 'BEAR_CALL_CREDIT',
      status: 'PENDING_ENTRY',
      idempotencyKey,
      expiryISO: '2026-03-27',
      quantity: 2,
      width: 5,
      maxLoss: 375,
    } satisfies CreateManagedPositionInput);

    assert.equal(position.tradeIntentId, intent.id);

    const riskEvent = await repo.createRiskEvent({
      tradeIntentId: intent.id,
      reasonCode: 'RISK_BUDGET_EXCEEDED',
      message: 'position exceeds configured portfolio risk cap',
    } satisfies CreateRiskEventInput);

    assert.equal(riskEvent.tradeIntentId, intent.id);
    assert.equal(riskEvent.reasonCode, 'RISK_BUDGET_EXCEEDED');

    const updatedIntent = await repo.updateTradeIntent({
      id: intent.id,
      status: 'OPEN',
      quantity: 1,
      targetNetCredit: 1.15,
      minAcceptableNetCredit: 0.95,
      maxLoss: 300,
    } satisfies UpdateTradeIntentInput);

    assert.equal(updatedIntent.status, 'OPEN');
    assert.equal(updatedIntent.quantity, 1);

    const execution = await repo.createTradeExecution({
      tradeIntentId: intent.id,
      managedPositionId: position.id,
      phase: 'ENTRY',
      status: 'SUBMITTED',
      brokerOrderId: 'T-123',
      quantity: 2,
      limitPrice: 1.25,
    });

    const updatedExecution = await repo.updateTradeExecution({
      id: execution.id,
      status: 'FILLED',
      filledPrice: 1.18,
      notes: 'filled as combo order',
    } satisfies UpdateTradeExecutionInput);

    assert.equal(updatedExecution.status, 'FILLED');
    assert.equal(updatedExecution.filledPrice, 1.18);

    const updatedPosition = await repo.updateManagedPosition({
      id: position.id,
      status: 'OPEN',
      entryCredit: 1.25,
      maxLoss: 300,
    } satisfies UpdateManagedPositionInput);

    assert.equal(updatedPosition.status, 'OPEN');
    assert.equal(updatedPosition.entryCredit, 1.25);
  } finally {
    await repo.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
