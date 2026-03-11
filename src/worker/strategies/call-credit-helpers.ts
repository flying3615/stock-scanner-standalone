import type {
  BreakdownStateInput,
  CallCreditTemplate,
  CallOptionQuote,
  EstimateCallDeltaInput,
  SelectCallCreditTemplateInput,
  StrategyCandle,
} from './call-credit-types.js';

export function calculateCloseLocationValue(candle: StrategyCandle): number {
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

export function midpoint(bid: number, ask: number): number {
  if (bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }

  return Math.max(bid, ask, 0);
}

export function estimateCallDelta(input: EstimateCallDeltaInput): number {
  const timeFactor = Math.max(Math.sqrt(Math.max(input.dte, 1) / 30), 0.2);
  const moneynessPct = Math.max((input.strike - input.spotPrice) / input.spotPrice, 0);
  const estimated = 0.5 * Math.exp((-5.5 * moneynessPct) / timeFactor);

  return Math.max(0.01, Math.min(0.5, estimated));
}

export function selectCallCreditTemplate(
  input: SelectCallCreditTemplateInput,
): CallCreditTemplate | null {
  const optionsByStrike = new Map<number, CallOptionQuote>();
  for (const option of input.options) {
    optionsByStrike.set(option.strike, option);
  }

  let bestTemplate: CallCreditTemplate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const shortOption of input.options) {
    if (shortOption.strike <= input.structureResistance) {
      continue;
    }

    const shortDelta = Math.abs(
      shortOption.delta ?? estimateCallDelta({
        spotPrice: input.spotPrice,
        strike: shortOption.strike,
        dte: input.dte,
      }),
    );

    if (shortDelta < 0.1 || shortDelta > 0.2) {
      continue;
    }

    if (shortOption.openInterest < 500 || shortOption.volume < 100) {
      continue;
    }

    for (const width of input.widthCandidates) {
      const longOption = optionsByStrike.get(shortOption.strike + width);
      if (!longOption) {
        continue;
      }

      const shortMid = midpoint(shortOption.bid, shortOption.ask);
      const longMid = midpoint(longOption.bid, longOption.ask);
      const creditMid = Math.max(0, shortMid - longMid);
      if (creditMid <= 0) {
        continue;
      }

      const template: CallCreditTemplate = {
        shortStrike: shortOption.strike,
        longStrike: longOption.strike,
        width,
        dte: input.dte,
        shortDelta,
        shortBid: shortOption.bid,
        shortAsk: shortOption.ask,
        longBid: longOption.bid,
        longAsk: longOption.ask,
        shortMid,
        longMid,
        creditMid,
        creditPctWidth: shortMid / width,
        takeProfitAt: creditMid * 0.4,
        stopLossAt: creditMid * 2,
      };

      const liquidityScore = Math.min(shortOption.openInterest / 1000, 5) + Math.min(shortOption.volume / 1000, 5);
      const deltaScore = 1 - Math.abs(shortDelta - 0.15);
      const resistanceBuffer = Math.min((shortOption.strike - input.structureResistance) / Math.max(width, 1), 2);
      const candidateScore = liquidityScore + deltaScore + resistanceBuffer;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestTemplate = template;
      }
    }
  }

  return bestTemplate;
}
