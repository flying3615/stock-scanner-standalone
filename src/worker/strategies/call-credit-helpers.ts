import type { BreakdownStateInput, StrategyCandle } from './call-credit-types.js';

export function calculateCloseLocationValue(candle: Pick<StrategyCandle, 'high' | 'low' | 'close'>): number {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, (candle.close - candle.low) / range));
}

export function calculateUpperWickRatio(candle: StrategyCandle): number {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return 0;
  }

  return Math.max(0, (candle.high - Math.max(candle.open, candle.close)) / range);
}

export function scoreBreakdownState(input: BreakdownStateInput): number {
  let score = 0;

  if (input.changePercent <= -7) score += 8;
  else if (input.changePercent <= -5) score += 6;
  else if (input.changePercent <= -3) score += 4;
  else if (input.changePercent <= -1) score += 2;

  if (input.volumeRatio20 >= 2) score += 5;
  else if (input.volumeRatio20 >= 1.5) score += 3;
  else if (input.volumeRatio20 >= 1.2) score += 1;

  if (input.closeLocationValue <= 0.15) score += 4;
  else if (input.closeLocationValue <= 0.3) score += 2;

  if (input.upperWickRatio <= 0.12) score += 2;
  else if (input.upperWickRatio <= 0.25) score += 1;

  if (input.brokeEma20) score += 3;
  if (input.brokeEma50) score += 4;
  if (input.brokePrior20Low) score += 4;

  return score;
}
