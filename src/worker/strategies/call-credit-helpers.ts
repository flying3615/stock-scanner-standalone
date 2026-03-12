import type {
  BounceStateInput,
  BreakdownStateInput,
  CallCreditTemplate,
  CreditSpreadTemplate,
  EstimateCallDeltaInput,
  EstimateOptionDeltaInput,
  SelectBearCallCreditTemplateInput,
  SelectBullPutCreditTemplateInput,
  StrategyCandle,
  StrategyOptionQuote,
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

export function calculateLowerWickRatio(candle: StrategyCandle): number {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return 0;
  }

  return Math.max(0, (Math.min(candle.open, candle.close) - candle.low) / range);
}

export function averageNumbers(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateLastEma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = averageNumbers(values.slice(0, period));
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
  }

  return ema;
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

export function scoreBounceState(input: BounceStateInput): number {
  let score = 0;

  if (input.changePercent <= -7) score += 4;
  else if (input.changePercent <= -5) score += 3;
  else if (input.changePercent <= -3) score += 2;

  if (input.volumeRatio20 >= 2) score += 3;
  else if (input.volumeRatio20 >= 1.5) score += 2;
  else if (input.volumeRatio20 >= 1.2) score += 1;

  if (input.closeLocationValue >= 0.75) score += 5;
  else if (input.closeLocationValue >= 0.6) score += 4;
  else if (input.closeLocationValue >= 0.45) score += 2;

  if (input.lowerWickRatio >= 0.35) score += 4;
  else if (input.lowerWickRatio >= 0.2) score += 2;

  if (input.heldEma20) score += 3;
  if (input.heldEma50) score += 4;
  if (input.heldPrior20Low) score += 4;

  return score;
}

export function midpoint(bid: number, ask: number): number {
  if (bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }

  return Math.max(bid, ask, 0);
}

export function estimateOptionDelta(input: EstimateOptionDeltaInput): number {
  const timeFactor = Math.max(Math.sqrt(Math.max(input.dte, 1) / 30), 0.2);
  const moneynessPct = input.optionType === 'CALL'
    ? Math.max((input.strike - input.spotPrice) / input.spotPrice, 0)
    : Math.max((input.spotPrice - input.strike) / input.spotPrice, 0);
  const estimatedAbs = 0.5 * Math.exp((-5.5 * moneynessPct) / timeFactor);
  const clamped = Math.max(0.01, Math.min(0.5, estimatedAbs));
  return input.optionType === 'PUT' ? -clamped : clamped;
}

export function estimateCallDelta(input: EstimateCallDeltaInput): number {
  return estimateOptionDelta({ ...input, optionType: 'CALL' });
}

function filterLiquidOptions(
  options: StrategyOptionQuote[],
  optionType: 'CALL' | 'PUT',
): StrategyOptionQuote[] {
  return options.filter((option) => option.optionType === optionType);
}

function buildTemplate(input: {
  strategyType: 'BEAR_CALL_CREDIT' | 'BULL_PUT_CREDIT';
  shortLegType: 'CALL' | 'PUT';
  longLegType: 'CALL' | 'PUT';
  expiryISO: string;
  dte: number;
  width: number;
  shortOption: StrategyOptionQuote;
  longOption: StrategyOptionQuote;
  shortDelta: number;
}): CreditSpreadTemplate {
  const shortMid = midpoint(input.shortOption.bid, input.shortOption.ask);
  const longMid = midpoint(input.longOption.bid, input.longOption.ask);
  const creditMid = Math.max(0, shortMid - longMid);

  return {
    strategyType: input.strategyType,
    shortLegType: input.shortLegType,
    longLegType: input.longLegType,
    expiryISO: input.expiryISO,
    shortStrike: input.shortOption.strike,
    longStrike: input.longOption.strike,
    width: input.width,
    dte: input.dte,
    shortDelta: Math.abs(input.shortDelta),
    shortBid: input.shortOption.bid,
    shortAsk: input.shortOption.ask,
    longBid: input.longOption.bid,
    longAsk: input.longOption.ask,
    shortMid,
    longMid,
    creditMid,
    creditPctWidth: creditMid / input.width,
    takeProfitAt: creditMid * 0.4,
    stopLossAt: creditMid * 2,
  };
}

export function selectBearCallCreditTemplate(
  input: SelectBearCallCreditTemplateInput,
): CreditSpreadTemplate | null {
  const options = filterLiquidOptions(input.options, 'CALL');
  const optionsByStrike = new Map<number, StrategyOptionQuote>();
  for (const option of options) {
    optionsByStrike.set(option.strike, option);
  }

  let bestTemplate: CreditSpreadTemplate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const shortOption of options) {
    if (shortOption.strike <= input.anchorLevel) {
      continue;
    }

    const shortDelta = Math.abs(shortOption.delta ?? estimateOptionDelta({
      spotPrice: input.spotPrice,
      strike: shortOption.strike,
      dte: input.dte,
      optionType: 'CALL',
    }));

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

      const template = buildTemplate({
        strategyType: 'BEAR_CALL_CREDIT',
        shortLegType: 'CALL',
        longLegType: 'CALL',
        expiryISO: input.expiryISO,
        dte: input.dte,
        width,
        shortOption,
        longOption,
        shortDelta,
      });

      if (template.creditMid <= 0) {
        continue;
      }

      const liquidityScore = Math.min(shortOption.openInterest / 1000, 5) + Math.min(shortOption.volume / 1000, 5);
      const deltaScore = 1 - Math.abs(shortDelta - 0.15);
      const resistanceBuffer = Math.min((shortOption.strike - input.anchorLevel) / Math.max(width, 1), 2);
      const candidateScore = liquidityScore + deltaScore + resistanceBuffer;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestTemplate = template;
      }
    }
  }

  return bestTemplate;
}

export function selectBullPutCreditTemplate(
  input: SelectBullPutCreditTemplateInput,
): CreditSpreadTemplate | null {
  const options = filterLiquidOptions(input.options, 'PUT');
  const optionsByStrike = new Map<number, StrategyOptionQuote>();
  for (const option of options) {
    optionsByStrike.set(option.strike, option);
  }

  let bestTemplate: CreditSpreadTemplate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const shortOption of options) {
    if (shortOption.strike >= input.anchorLevel) {
      continue;
    }

    const shortDelta = Math.abs(shortOption.delta ?? estimateOptionDelta({
      spotPrice: input.spotPrice,
      strike: shortOption.strike,
      dte: input.dte,
      optionType: 'PUT',
    }));

    if (shortDelta < 0.1 || shortDelta > 0.2) {
      continue;
    }

    if (shortOption.openInterest < 500 || shortOption.volume < 100) {
      continue;
    }

    for (const width of input.widthCandidates) {
      const longOption = optionsByStrike.get(shortOption.strike - width);
      if (!longOption) {
        continue;
      }

      const template = buildTemplate({
        strategyType: 'BULL_PUT_CREDIT',
        shortLegType: 'PUT',
        longLegType: 'PUT',
        expiryISO: input.expiryISO,
        dte: input.dte,
        width,
        shortOption,
        longOption,
        shortDelta,
      });

      if (template.creditMid <= 0) {
        continue;
      }

      const liquidityScore = Math.min(shortOption.openInterest / 1000, 5) + Math.min(shortOption.volume / 1000, 5);
      const deltaScore = 1 - Math.abs(shortDelta - 0.15);
      const supportBuffer = Math.min((input.anchorLevel - shortOption.strike) / Math.max(width, 1), 2);
      const candidateScore = liquidityScore + deltaScore + supportBuffer;

      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestTemplate = template;
      }
    }
  }

  return bestTemplate;
}

export function selectCallCreditTemplate(
  input: SelectBearCallCreditTemplateInput,
): CallCreditTemplate | null {
  return selectBearCallCreditTemplate(input);
}
