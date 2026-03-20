import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAccountModeAllowed,
  isCreditSpreadExecutionWindow,
  isUsRegularMarketHours,
  shouldRunCreditSpreadAutomation,
} from './market-hours.js';

test('regular-hours-only guard', () => {
  assert.equal(isUsRegularMarketHours(new Date('2026-03-20T13:29:00Z')), false);
  assert.equal(isUsRegularMarketHours(new Date('2026-03-20T13:30:00Z')), true);
  assert.equal(isUsRegularMarketHours(new Date('2026-03-20T19:59:00Z')), true);
  assert.equal(isUsRegularMarketHours(new Date('2026-03-20T20:00:00Z')), false);
});

test('weekday 15-minute execution cadence helper', () => {
  assert.equal(isCreditSpreadExecutionWindow(new Date('2026-03-20T13:30:00Z')), true);
  assert.equal(isCreditSpreadExecutionWindow(new Date('2026-03-20T13:45:00Z')), true);
  assert.equal(isCreditSpreadExecutionWindow(new Date('2026-03-20T13:37:00Z')), false);
  assert.equal(isCreditSpreadExecutionWindow(new Date('2026-03-21T13:30:00Z')), false);
});

test('automation disabled flag blocks run', () => {
  assert.equal(
    shouldRunCreditSpreadAutomation(new Date('2026-03-20T13:30:00Z'), {
      AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED: 'false',
    }),
    false
  );
});

test('paper-only flag blocks live-account calls', () => {
  assert.throws(
    () =>
      assertAccountModeAllowed('LIVE', {
        AUTO_CREDIT_SPREAD_PAPER_ONLY: 'true',
      }),
    /paper-only/i
  );

  assert.doesNotThrow(() =>
    assertAccountModeAllowed('PAPER', {
      AUTO_CREDIT_SPREAD_PAPER_ONLY: 'true',
    })
  );
});
