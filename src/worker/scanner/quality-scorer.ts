type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
type Direction = 'bullish' | 'bearish' | 'neutral';

export interface QualityValueMetrics {
  pb: number | null;
  pe: number | null;
  roe: number | null;
  profitMargin: number | null;
  debtToEquity: number | null;
  growth?: number | null;
}

export interface StockQualityInput {
  valueScore?: number | null;
  metrics?: QualityValueMetrics | null;
  sector?: string;
  volume?: number | null;
}

export interface StockQualityScore {
  score: number;
  grade: Grade;
  components: {
    valuation: number;
    profitability: number;
    growth: number;
    balanceSheet: number;
    liquidity: number;
  };
  reasons: string[];
}

export interface ShortTermOptionSignalInput {
  type: string;
  direction: string;
  notional: number;
  directionConfidence?: number | null;
  signalQuality?: number | null;
  spreadPct?: number | null;
  spotConfirmation?: string | null;
  ageMin?: number | null;
}

export interface ShortTermSignalInput {
  moneyFlowStrength?: number | null;
  changePercent?: number | null;
  options?: {
    signals?: ShortTermOptionSignalInput[];
    sentiment?: {
      sentiment?: number | null;
      totalNotional?: number | null;
    } | null;
  } | null;
}

export interface ShortTermSignalScore {
  score: number;
  direction: Direction;
  components: {
    priceMomentum: number;
    moneyFlow: number;
    optionsFlow: number;
    alignment: number;
    noisePenalty: number;
  };
  reasons: string[];
}

export function scoreStockQuality(input: StockQualityInput): StockQualityScore {
  const metrics = input.metrics;
  const valueScore = finite(input.valueScore, 0);

  const valuation = scoreValuation(valueScore, metrics);
  const profitability = scoreProfitability(metrics);
  const growth = scoreGrowth(metrics);
  const balanceSheet = scoreBalanceSheet(metrics, input.sector);
  const liquidity = scoreLiquidity(input.volume);

  const score = clampScore(valuation + profitability + growth + balanceSheet + liquidity);
  const reasons = buildStockQualityReasons({ valuation, profitability, growth, balanceSheet, liquidity });

  return {
    score,
    grade: gradeForScore(score),
    components: {
      valuation,
      profitability,
      growth,
      balanceSheet,
      liquidity,
    },
    reasons,
  };
}

export function scoreShortTermSignal(input: ShortTermSignalInput): ShortTermSignalScore {
  const signals = input.options?.signals ?? [];
  const sentiment = finite(input.options?.sentiment?.sentiment, 0);
  const totalNotional = finite(input.options?.sentiment?.totalNotional, 0);
  const moneyFlowStrength = finite(input.moneyFlowStrength, 0);
  const changePercent = finite(input.changePercent, 0);

  const priceMomentum = scorePriceMomentum(changePercent);
  const moneyFlow = scoreMoneyFlow(moneyFlowStrength);
  const optionsFlow = scoreOptionsFlow(signals, totalNotional);
  const alignment = scoreAlignment({
    signalDirection: inferOptionsDirection(signals, sentiment),
    moneyFlowStrength,
    changePercent,
  });
  const noisePenalty = scoreNoisePenalty(signals);

  const rawScore = 20 + priceMomentum + moneyFlow + optionsFlow + alignment + noisePenalty;
  const score = clampScore(rawScore);
  const direction = inferShortTermDirection(score, sentiment, moneyFlowStrength, changePercent, signals);
  const reasons = buildShortTermReasons({ priceMomentum, moneyFlow, optionsFlow, alignment, noisePenalty });

  return {
    score,
    direction,
    components: {
      priceMomentum,
      moneyFlow,
      optionsFlow,
      alignment,
      noisePenalty,
    },
    reasons,
  };
}

function scoreValuation(valueScore: number, metrics?: QualityValueMetrics | null): number {
  let score = Math.min(20, Math.max(0, valueScore * 3));
  const pe = finiteOrNull(metrics?.pe);
  const pb = finiteOrNull(metrics?.pb);

  if (pe !== null && pe > 0 && pe <= 20) score += 3;
  if (pe !== null && pe >= 60) score -= 4;
  if (pb !== null && pb > 0 && pb <= 3) score += 2;
  if (pb !== null && pb >= 10) score -= 3;

  return clamp(score, 0, 22);
}

function scoreProfitability(metrics?: QualityValueMetrics | null): number {
  const roe = finiteOrNull(metrics?.roe);
  const margin = finiteOrNull(metrics?.profitMargin);
  let score = 0;

  if (roe !== null) {
    if (roe >= 25) score += 12;
    else if (roe >= 15) score += 9;
    else if (roe >= 8) score += 5;
    else if (roe < 0) score -= 4;
  }

  if (margin !== null) {
    if (margin >= 25) score += 12;
    else if (margin >= 15) score += 9;
    else if (margin >= 8) score += 5;
    else if (margin < 0) score -= 4;
  }

  return clamp(score, 0, 26);
}

function scoreGrowth(metrics?: QualityValueMetrics | null): number {
  const growth = finiteOrNull(metrics?.growth);
  if (growth === null) return 4;
  if (growth >= 20) return 18;
  if (growth >= 10) return 15;
  if (growth >= 5) return 10;
  if (growth >= 0) return 6;
  return 1;
}

function scoreBalanceSheet(metrics?: QualityValueMetrics | null, sector?: string): number {
  const debtToEquity = finiteOrNull(metrics?.debtToEquity);
  if (debtToEquity === null) return 6;

  const isFinancial = sector === 'Financial Services';
  if (isFinancial) {
    if (debtToEquity <= 250) return 16;
    if (debtToEquity <= 600) return 10;
    return 3;
  }

  if (debtToEquity <= 50) return 16;
  if (debtToEquity <= 120) return 12;
  if (debtToEquity <= 220) return 7;
  return 2;
}

function scoreLiquidity(volume?: number | null): number {
  const value = finite(volume, 0);
  if (value >= 20_000_000) return 18;
  if (value >= 10_000_000) return 14;
  if (value >= 3_000_000) return 10;
  if (value >= 1_000_000) return 6;
  return 2;
}

function scorePriceMomentum(changePercent: number): number {
  const magnitude = Math.abs(changePercent);
  if (magnitude >= 5) return 10;
  if (magnitude >= 3) return 8;
  if (magnitude >= 1) return 4;
  return 1;
}

function scoreMoneyFlow(moneyFlowStrength: number): number {
  const magnitude = Math.abs(moneyFlowStrength);
  if (magnitude >= 0.6) return 16;
  if (magnitude >= 0.35) return 12;
  if (magnitude >= 0.15) return 7;
  return 2;
}

function scoreOptionsFlow(signals: ShortTermOptionSignalInput[], totalNotional: number): number {
  if (signals.length === 0 || totalNotional <= 0) {
    return 0;
  }

  const highQualityNotional = signals.reduce((sum, signal) => {
    const quality = finite(signal.signalQuality, finite(signal.directionConfidence, 0.4));
    const spread = finite(signal.spreadPct, 0.3);
    const freshness = finite(signal.ageMin, 999) <= 60 ? 1 : 0.55;
    const spreadPenalty = spread <= 0.1 ? 1 : spread <= 0.2 ? 0.75 : 0.35;
    return sum + finite(signal.notional, 0) * quality * freshness * spreadPenalty;
  }, 0);

  const notionalScore = totalNotional >= 1_000_000 ? 14 : totalNotional >= 300_000 ? 10 : totalNotional >= 75_000 ? 6 : 2;
  const qualityShare = highQualityNotional / totalNotional;
  return clamp(notionalScore + qualityShare * 18, 0, 32);
}

function scoreAlignment(input: {
  signalDirection: Direction;
  moneyFlowStrength: number;
  changePercent: number;
}): number {
  const flowDirection: Direction = input.moneyFlowStrength > 0.15 ? 'bullish' : input.moneyFlowStrength < -0.15 ? 'bearish' : 'neutral';
  const priceDirection: Direction = input.changePercent > 1 ? 'bullish' : input.changePercent < -1 ? 'bearish' : 'neutral';
  const directions = [input.signalDirection, flowDirection, priceDirection].filter((direction) => direction !== 'neutral');

  if (directions.length < 2) return 2;
  const bullish = directions.filter((direction) => direction === 'bullish').length;
  const bearish = directions.filter((direction) => direction === 'bearish').length;
  if (bullish >= 2 || bearish >= 2) return 14;
  return -4;
}

function scoreNoisePenalty(signals: ShortTermOptionSignalInput[]): number {
  if (signals.length === 0) return 0;

  let penalty = 0;
  const noisyCount = signals.filter((signal) => {
    const spread = finite(signal.spreadPct, 0);
    const confidence = finite(signal.directionConfidence, 1);
    const quality = finite(signal.signalQuality, 1);
    const stale = finite(signal.ageMin, 0) > 180;
    return spread >= 0.3 || confidence < 0.35 || quality < 0.35 || stale || signal.spotConfirmation === 'contradiction';
  }).length;

  penalty -= Math.min(12, noisyCount * 5);
  return penalty;
}

function inferOptionsDirection(signals: ShortTermOptionSignalInput[], sentiment: number): Direction {
  let bullish = sentiment > 35 ? Math.abs(sentiment) : 0;
  let bearish = sentiment < -35 ? Math.abs(sentiment) : 0;

  for (const signal of signals) {
    const weighted = finite(signal.notional, 0)
      * finite(signal.directionConfidence, 0.5)
      * finite(signal.signalQuality, 0.5);
    if ((signal.type === 'call' && signal.direction === 'buy') || (signal.type === 'put' && signal.direction === 'sell')) {
      bullish += weighted;
    } else if ((signal.type === 'put' && signal.direction === 'buy') || (signal.type === 'call' && signal.direction === 'sell')) {
      bearish += weighted;
    }
  }

  if (bullish + bearish < 75_000) return 'neutral';
  if (bullish > bearish * 1.2) return 'bullish';
  if (bearish > bullish * 1.2) return 'bearish';
  return 'neutral';
}

function inferShortTermDirection(
  score: number,
  sentiment: number,
  moneyFlowStrength: number,
  changePercent: number,
  signals: ShortTermOptionSignalInput[],
): Direction {
  if (score < 35) return 'neutral';

  const optionsDirection = inferOptionsDirection(signals, sentiment);
  if (optionsDirection !== 'neutral') return optionsDirection;
  if (moneyFlowStrength > 0.2 || changePercent > 2) return 'bullish';
  if (moneyFlowStrength < -0.2 || changePercent < -2) return 'bearish';
  return 'neutral';
}

function buildStockQualityReasons(components: StockQualityScore['components']): string[] {
  const reasons: string[] = [];
  if (components.profitability >= 18) reasons.push('Strong profitability quality');
  if (components.growth >= 15) reasons.push('Growth quality is supportive');
  if (components.balanceSheet >= 12) reasons.push('Balance sheet quality is healthy');
  if (components.valuation >= 15) reasons.push('Valuation remains reasonable');
  if (components.liquidity >= 10) reasons.push('Liquidity is sufficient for active monitoring');
  if (reasons.length === 0) reasons.push('Quality factors are mixed');
  return reasons;
}

function buildShortTermReasons(components: ShortTermSignalScore['components']): string[] {
  const reasons: string[] = [];
  if (components.optionsFlow >= 20) reasons.push('High-quality options flow is present');
  if (components.moneyFlow >= 12) reasons.push('Money flow confirms the short-term move');
  if (components.priceMomentum >= 8) reasons.push('Price momentum is active');
  if (components.alignment >= 10) reasons.push('Signals are directionally aligned');
  if (components.noisePenalty < 0) reasons.push('Noisy or stale flow reduced the score');
  if (reasons.length === 0) reasons.push('Short-term setup is not compelling yet');
  return reasons;
}

function gradeForScore(score: number): Grade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
