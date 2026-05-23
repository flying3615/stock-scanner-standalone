import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scoreShortTermSignal,
  scoreStockQuality,
} from './quality-scorer.js';

test('scoreStockQuality rewards durable business quality without requiring a short-term setup', () => {
  const result = scoreStockQuality({
    valueScore: 5.5,
    metrics: {
      pe: 24,
      pb: 4.2,
      roe: 28,
      profitMargin: 31,
      debtToEquity: 35,
      growth: 18,
    },
    sector: 'Technology',
    volume: 18_000_000,
  });

  assert.ok(result.score >= 80);
  assert.equal(result.grade, 'A');
  assert.ok(result.components.profitability > result.components.valuation);
  assert.ok(result.reasons.some((reason) => reason.includes('profitability')));
});

test('scoreShortTermSignal can rank a strong near-term setup even when stock quality is ordinary', () => {
  const result = scoreShortTermSignal({
    moneyFlowStrength: 0.62,
    changePercent: 4.8,
    options: {
      signals: [
        {
          type: 'call',
          direction: 'buy',
          notional: 780_000,
          directionConfidence: 0.88,
          signalQuality: 0.82,
          spreadPct: 0.06,
          spotConfirmation: 'strong',
          ageMin: 8,
        },
        {
          type: 'put',
          direction: 'sell',
          notional: 260_000,
          directionConfidence: 0.72,
          signalQuality: 0.68,
          spreadPct: 0.08,
          spotConfirmation: 'strong',
          ageMin: 11,
        },
      ],
      sentiment: {
        sentiment: 72,
        totalNotional: 1_040_000,
      },
    },
  });

  assert.equal(result.direction, 'bullish');
  assert.ok(result.score >= 75);
  assert.ok(result.components.optionsFlow >= 25);
  assert.ok(result.reasons.some((reason) => reason.includes('options flow')));
});

test('scoreShortTermSignal penalizes noisy option flow and directional disagreement', () => {
  const result = scoreShortTermSignal({
    moneyFlowStrength: -0.55,
    changePercent: 3.2,
    options: {
      signals: [
        {
          type: 'call',
          direction: 'buy',
          notional: 40_000,
          directionConfidence: 0.22,
          signalQuality: 0.2,
          spreadPct: 0.42,
          spotConfirmation: 'contradiction',
          ageMin: 220,
        },
      ],
      sentiment: {
        sentiment: 18,
        totalNotional: 40_000,
      },
    },
  });

  assert.ok(result.score <= 35);
  assert.ok(result.components.noisePenalty < 0);
  assert.ok(result.reasons.some((reason) => reason.includes('Noisy')));
});
