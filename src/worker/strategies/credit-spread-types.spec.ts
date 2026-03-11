import test from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_SPREAD_ANCHOR_TYPES, CREDIT_SPREAD_STRATEGY_TYPES } from './call-credit-types.js';

test('credit spread candidate supports both bearish and bullish variants', () => {
  assert.deepEqual(CREDIT_SPREAD_STRATEGY_TYPES, ['BEAR_CALL_CREDIT', 'BULL_PUT_CREDIT']);
  assert.deepEqual(CREDIT_SPREAD_ANCHOR_TYPES, ['RESISTANCE', 'SUPPORT']);
});
