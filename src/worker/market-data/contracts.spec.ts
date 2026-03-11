import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CHART_D1_LOOKBACK, DEFAULT_DTE_MAX, DEFAULT_DTE_MIN, DEFAULT_STRIKES_EACH_SIDE, MARKET_DATA_INTERVALS } from './contracts.js';

test('market-data contracts expose supported defaults for nearby chains and d1 charts', () => {
  assert.deepEqual(MARKET_DATA_INTERVALS, ['1d']);
  assert.equal(DEFAULT_DTE_MIN, 3);
  assert.equal(DEFAULT_DTE_MAX, 7);
  assert.equal(DEFAULT_STRIKES_EACH_SIDE, 10);
  assert.equal(DEFAULT_CHART_D1_LOOKBACK, 120);
});
