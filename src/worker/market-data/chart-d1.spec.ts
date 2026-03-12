import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyChartSnapshot } from './chart-d1.js';

function createQuote(index: number) {
  const close = 100 + index * 0.5;
  return {
    date: new Date(Date.UTC(2025, 0, index + 1)),
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1_000_000,
  };
}

test('buildDailyChartSnapshot trims returned bars but keeps longer-history indicators stable', () => {
  const quotes = Array.from({ length: 239 }, (_, index) => createQuote(index));
  quotes.push({
    date: new Date('2025-08-28T00:00:00.000Z'),
    open: 220,
    high: 230,
    low: 210,
    close: 214,
    volume: 4_000_000,
  });

  const snapshot = buildDailyChartSnapshot({
    symbol: 'NVDA',
    quotes,
    lookback: 120,
    asOf: new Date('2025-08-28T20:00:00.000Z'),
  });

  assert.equal(snapshot.bars.length, 120);
  assert.equal(snapshot.bars[0]?.date, '2025-05-01T00:00:00.000Z');
  assert.equal(snapshot.bars.at(-1)?.date, '2025-08-28T00:00:00.000Z');
  assert.equal(snapshot.interval, '1d');
  assert.equal(snapshot.requested.lookback, 120);
  assert.ok(snapshot.indicators.ema20 !== null);
  assert.ok(snapshot.indicators.ema50 !== null);
  assert.ok(snapshot.indicators.ema200 !== null);
  assert.ok((snapshot.indicators.ema20 ?? 0) > (snapshot.indicators.ema50 ?? 0));
  assert.ok((snapshot.indicators.ema50 ?? 0) > (snapshot.indicators.ema200 ?? 0));
  assert.equal(snapshot.indicators.closeLocationValue, 0.2);
  assert.equal(snapshot.indicators.upperWickRatio, 0.5);
  assert.equal(snapshot.indicators.lowerWickRatio, 0.2);
  assert.equal(snapshot.indicators.volumeRatio20, 4);
  assert.ok(snapshot.indicators.support !== null);
  assert.ok(snapshot.indicators.resistance !== null);
  assert.ok((snapshot.indicators.support ?? 0) < 214);
  assert.ok((snapshot.indicators.resistance ?? 0) > 214);
  assert.equal(snapshot.summary.latestClose, 214);
  assert.equal(snapshot.summary.averageVolume20, 1_000_000);
  assert.equal(snapshot.summary.periodLow, 158);
  assert.equal(snapshot.summary.periodHigh, 230);
  assert.equal(snapshot.summary.percentChange, 33.75);
});
