import {
  SymbolSentimentExtended,
  SymbolSentimentBase,
  ThresholdPolicy,
} from '../shared.ts';

/**
 * Aggregates sentiment from signals.
 */
export function aggregateSentiment(
  signals: any[],
  symbol: string,
  debug: boolean
): {
  symbol: string;
  bullishNotional: number;
  bearishNotional: number;
  totalNotional: number;
  putNotional: number;
  callNotional: number;
  putCallRatio: number;
  askBias: number;
  sentiment: number;
} {
  let bullish = 0;
  let bearish = 0;
  let askNotional = 0;
  let totalNotional = 0;
  let putNotional = 0;
  let callNotional = 0;

  for (const s of signals) {
    totalNotional += s.notional;
    if (s.type === 'call') callNotional += s.notional;
    else putNotional += s.notional;

    if (s.pos >= 0.66) askNotional += s.notional;

    if (s.type === 'call') {
      if (s.direction === 'buy') bullish += s.notional;
      else if (s.direction === 'sell') bearish += s.notional;
    } else {
      if (s.direction === 'buy') bearish += s.notional;
      else if (s.direction === 'sell') bullish += s.notional;
    }
  }

  const askBias = totalNotional > 0 ? askNotional / totalNotional : 0;
  const putCallRatio =
    callNotional > 0
      ? putNotional / callNotional
      : putNotional > 0
        ? Infinity
        : 0;
  const sentimentScore =
    totalNotional > 0
      ? (100 * (bullish - bearish)) / totalNotional + 20 * (askBias - 0.5)
      : 0;

  const sentiment = {
    symbol,
    bullishNotional: bullish,
    bearishNotional: bearish,
    totalNotional,
    putNotional,
    callNotional,
    putCallRatio,
    askBias,
    sentiment: Math.max(-100, Math.min(100, sentimentScore)),
  };

  if (debug) {
    console.log(
      `[aggregateSentiment] Aggregated sentiment for ${symbol}:`,
      sentiment
    );
  }

  return sentiment;
}

/**
 * Processes configuration parameters for extended sentiment computation.
 */
function processConfiguration({
  halfLifeMins,
  alpha,
  debug,
  thresholdPolicy,
  aggregationPolicy,
  auxShortPutWeight,
}: {
  windowMins: number;
  halfLifeMins: number;
  minBullishWindowNotional: number;
  alpha?: number;
  debug?: boolean;
  thresholdPolicy?: ThresholdPolicy;
  aggregationPolicy?: 'standard' | 'buyersOnly' | 'buyersOnlyAuxSP';
  auxShortPutWeight?: number;
}) {
  const hl = Math.max(1, halfLifeMins);
  const alphaVal = Number.isFinite(alpha)
    ? Math.max(0, Math.min(1, alpha))
    : 0.5;
  const policy = aggregationPolicy || 'standard';
  const auxWeight = Number.isFinite(auxShortPutWeight)
    ? Math.max(0, Math.min(1, auxShortPutWeight))
    : 0.35;

  return { hl, alphaVal, policy, auxWeight, thresholdPolicy, debug };
}

/**
 * Applies aggregation policy to filter signals.
 */
function applyAggregationPolicy(
  signals: any[],
  policy: string,
  auxWeight: number,
  debug: boolean | undefined,
  symbol: string
): any[] {
  const signalsEff =
    policy === 'buyersOnly' || policy === 'buyersOnlyAuxSP'
      ? signals.filter((s) => s.direction === 'buy')
      : signals;

  if (debug && (policy === 'buyersOnly' || policy === 'buyersOnlyAuxSP')) {
    const totalSignals = signals.length;
    const buyersOnlySignals = signalsEff.length;
    const excludedSellers = totalSignals - buyersOnlySignals;
    const excludedNotional = signals
      .filter((s) => s.direction !== 'buy')
      .reduce((sum, s) => sum + s.notional, 0);
    console.log(
      `[applyAggregationPolicy] ${policy} policy for ${symbol}: total=${totalSignals}, buyers=${buyersOnlySignals}, excludedSellers=${excludedSellers}, excludedNotional=${excludedNotional}, auxWeight=${auxWeight}`
    );
  }

  return signalsEff;
}

/**
 * Calculates market cap and dynamic threshold.
 */
function calculateMarketCapAndThreshold(
  signalsEff: any[],
  minBullishWindowNotional: number,
  thresholdPolicy: ThresholdPolicy | undefined
): { marketCap: number; thresholdUsed: number } {
  let marketCap = 0;
  const marketCaps: number[] = [];
  for (const s of signalsEff) {
    if (Number.isFinite(s.marketCap) && s.marketCap > 0) {
      marketCaps.push(s.marketCap);
    }
  }
  if (marketCaps.length > 0) {
    marketCaps.sort((a, b) => a - b);
    const mid = Math.floor(marketCaps.length / 2);
    marketCap =
      marketCaps.length % 2
        ? marketCaps[mid]
        : (marketCaps[mid - 1] + marketCaps[mid]) / 2;
  }

  let thresholdUsed = minBullishWindowNotional;
  if (thresholdPolicy && thresholdPolicy.mode === 'capratio') {
    if (Number.isFinite(marketCap) && marketCap > 0) {
      const capRatio = Number.isFinite(thresholdPolicy.capRatio)
        ? thresholdPolicy.capRatio
        : 2e-6;
      const capMin = Number.isFinite(thresholdPolicy.capMin)
        ? thresholdPolicy.capMin
        : 200_000;
      const capMax = Number.isFinite(thresholdPolicy.capMax)
        ? thresholdPolicy.capMax
        : 5_000_000;
      thresholdUsed = Math.max(capMin, Math.min(capMax, marketCap * capRatio));
    } else {
      thresholdUsed = Number.isFinite(thresholdPolicy.staticMinBullish)
        ? thresholdPolicy.staticMinBullish
        : minBullishWindowNotional;
    }
  } else if (thresholdPolicy && thresholdPolicy.mode === 'static') {
    thresholdUsed = Number.isFinite(thresholdPolicy.staticMinBullish)
      ? thresholdPolicy.staticMinBullish
      : minBullishWindowNotional;
  }

  return { marketCap, thresholdUsed };
}

/**
 * Calculates decayed and adjusted metrics from signals.
 */
function calculateDecayedMetrics(
  signals: any[],
  hl: number,
  alphaVal: number,
  policy: string,
  auxWeight: number,
  windowMins: number
): {
  bullishD: number;
  bearishD: number;
  totalD: number;
  putD: number;
  callD: number;
  askD: number;
  bullishDAdj: number;
  bearishDAdj: number;
  totalDAdj: number;
  putDAdj: number;
  callDAdj: number;
  askDAdj: number;
  auxSPContribution: number;
  winBullish: number;
  winBearish: number;
  withinCount: number;
  withinAges: number[];
  lastTradeMinAgo: number;
  hedgeNotionalD: number;
  comboNotionalD: number;
} {
  let bullishD = 0,
    bearishD = 0,
    totalD = 0,
    putD = 0,
    callD = 0,
    askD = 0;
  let bullishDAdj = 0,
    bearishDAdj = 0,
    totalDAdj = 0,
    putDAdj = 0,
    callDAdj = 0,
    askDAdj = 0;
  let auxSPContribution = 0;
  let winBullish = 0,
    winBearish = 0;
  let withinCount = 0;
  const withinAges: number[] = [];
  let lastTradeMinAgo = Infinity;
  let hedgeNotionalD = 0,
    comboNotionalD = 0;

  for (const s of signals) {
    const age = Number.isFinite(s.ageMin) ? s.ageMin : Infinity;
    if (age < lastTradeMinAgo) lastTradeMinAgo = age;

    const w = Number.isFinite(age) ? Math.pow(0.5, age / hl) : 0;
    const notionalD = s.notional * w;
    const notionalDWeighted = notionalD * (1 - alphaVal * s.hedgeScore);

    // 1. Calculate market-wide metrics unconditionally for an unbiased Ask Bias
    totalD += notionalD;
    totalDAdj += notionalDWeighted;
    if (s.pos >= 0.66) {
      askD += notionalD;
      askDAdj += notionalDWeighted;
    }

    // 2. Check if the signal should be included for sentiment calculation based on the policy
    const isSignalForSentiment =
      policy === 'standard' ||
      (policy === 'buyersOnly' && s.direction === 'buy') ||
      (policy === 'buyersOnlyAuxSP' && s.direction === 'buy');

    if (!isSignalForSentiment) {
      continue; // Skip sentiment-specific calculations if excluded by policy
    }

    // 3. The rest of the metrics are calculated only on signals that pass the policy filter
    if (s.type === 'call') {
      callD += notionalD;
      callDAdj += notionalDWeighted;
    } else {
      putD += notionalD;
      putDAdj += notionalDWeighted;
    }

    if (s.type === 'call') {
      if (s.direction === 'buy') {
        bullishD += notionalD;
        bullishDAdj += notionalDWeighted;
      } else if (s.direction === 'sell') {
        bearishD += notionalD;
        bearishDAdj += notionalDWeighted;
      }
    } else {
      if (s.direction === 'buy') {
        bearishD += notionalD;
        bearishDAdj += notionalDWeighted;
      } else if (s.direction === 'sell') {
        bullishD += notionalD;
        bullishDAdj += notionalDWeighted;

        if (
          policy === 'buyersOnlyAuxSP' &&
          Number.isFinite(s.moneyness) &&
          s.moneyness <= 0.95
        ) {
          auxSPContribution += notionalDWeighted * auxWeight;
        }
      }
    }

    if (age <= windowMins) {
      withinCount++;
      if (Number.isFinite(age)) withinAges.push(age);
      if (s.type === 'call') {
        if (s.direction === 'buy') winBullish += s.notional;
        else if (s.direction === 'sell') winBearish += s.notional;
      } else {
        if (s.direction === 'buy') winBearish += s.notional;
        else if (s.direction === 'sell') winBullish += s.notional;
      }
    }

    hedgeNotionalD += notionalD * s.hedgeScore;
    if (s.isComboHedge) comboNotionalD += notionalD;
  }

  return {
    bullishD,
    bearishD,
    totalD,
    putD,
    callD,
    askD,
    bullishDAdj,
    bearishDAdj,
    totalDAdj,
    putDAdj,
    callDAdj,
    askDAdj,
    auxSPContribution,
    winBullish,
    winBearish,
    withinCount,
    withinAges,
    lastTradeMinAgo,
    hedgeNotionalD,
    comboNotionalD,
  };
}

/**
 * Calculates window metrics and hedge summaries.
 */
function calculateWindowAndHedgeMetrics(
  withinAges: number[],
  totalD: number,
  hedgeNotionalD: number,
  comboNotionalD: number,
  signals: any[]
): {
  withinMinAge: number;
  withinMedianAge: number;
  hedgeSignalsCount: number;
  hedgeNotionalShare: number;
  comboHedgeShare: number;
} {
  const withinMinAge = withinAges.length ? Math.min(...withinAges) : Infinity;
  const withinMedianAge = withinAges.length
    ? (() => {
      const as = [...withinAges].sort((a, b) => a - b);
      const mid = Math.floor(as.length / 2);
      return as.length % 2 ? as[mid] : (as[mid - 1] + as[mid]) / 2;
    })()
    : Infinity;

  const hedgeSignalsCount = signals.filter((s) => s.hedgeScore > 0).length;
  const hedgeNotionalShare = totalD > 0 ? hedgeNotionalD / totalD : 0;
  const comboHedgeShare = totalD > 0 ? comboNotionalD / totalD : 0;

  return {
    withinMinAge,
    withinMedianAge,
    hedgeSignalsCount,
    hedgeNotionalShare,
    comboHedgeShare,
  };
}

/**
 * Assembles the final sentiment result.
 */
function assembleResult(
  base: SymbolSentimentBase,
  currentPrice: number,
  metrics: any,
  windowMins: number,
  halfLifeMins: number,
  thresholdUsed: number,
  debug: boolean | undefined,
  symbol: string,
  policy: string,
  auxSPContribution: number,
  moneyFlowStrength: number,
  signals?: any[] // Added to calculate new fields
): SymbolSentimentExtended {
  const askBiasDecayed = metrics.totalD > 0 ? metrics.askD / metrics.totalD : 0;
  const putCallRatioDecayed =
    metrics.callD > 0
      ? metrics.putD / metrics.callD
      : metrics.putD > 0
        ? Infinity
        : 0;
  // New scoring: tanh compression + confidence; keep API shape unchanged.
  // Parameters (frozen defaults): K=1.0, BETA=5 (reduced compression and ask bias)
  const K = 1.0;
  const BETA = 5;
  const clamp = (x: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, x));

  // Compressed absolute sentiment with confidence (raw decayed)
  const coreRaw =
    metrics.totalD > 0
      ? (metrics.bullishD - metrics.bearishD) / metrics.totalD
      : 0;
  const askRaw = askBiasDecayed - 0.5;
  const coreScore = 100 * Math.tanh(K * coreRaw);
  const askScore = BETA * askRaw;
  const conf =
    metrics.totalD > 0 && Number.isFinite(thresholdUsed) && thresholdUsed > 0
      ? 1 - Math.exp(-metrics.totalD / thresholdUsed)
      : 0;
  const sentimentDecayed = clamp((coreScore + askScore) * conf, -100, 100);

  const askBiasDecayedAdj =
    metrics.totalDAdj > 0 ? metrics.askDAdj / metrics.totalDAdj : 0;
  const putCallRatioDecayedAdj =
    metrics.callDAdj > 0
      ? metrics.putDAdj / metrics.callDAdj
      : metrics.putDAdj > 0
        ? Infinity
        : 0;

  // Compressed absolute sentiment with confidence (hedge-adjusted)
  const coreAdj =
    metrics.totalDAdj > 0
      ? (metrics.bullishDAdj + auxSPContribution - metrics.bearishDAdj) /
      metrics.totalDAdj
      : 0;
  const askAdj = askBiasDecayedAdj - 0.5;
  const coreScoreAdj = 100 * Math.tanh(K * coreAdj);
  const askScoreAdj = BETA * askAdj;
  const confAdj =
    metrics.totalDAdj > 0 && Number.isFinite(thresholdUsed) && thresholdUsed > 0
      ? 1 - Math.exp(-metrics.totalDAdj / thresholdUsed)
      : 0;
  const sentimentDecayedAdj = clamp(
    (coreScoreAdj + askScoreAdj) * confAdj,
    -100,
    100
  );

  if (debug) {
    console.log(`[assembleResult] Result for ${symbol}:`, {
      bullishD: metrics.bullishD,
      bearishD: metrics.bearishD,
      totalD: metrics.totalD,
      putD: metrics.putD,
      callD: metrics.callD,
      askD: metrics.askD,
      winBullish: metrics.winBullish,
      winBearish: metrics.winBearish,
      withinCount: metrics.withinCount,
      withinMinAge: metrics.withinMinAge,
      withinMedianAge: metrics.withinMedianAge,
      effectiveWindowMins: windowMins,
      sentimentDecayed,
      sentimentDecayedAdj,
      auxSPContribution: policy === 'buyersOnlyAuxSP' ? auxSPContribution : 0,
      hedgeSignalsCount: metrics.hedgeSignalsCount,
      hedgeNotionalShare: metrics.hedgeNotionalShare,
      comboHedgeShare: metrics.comboHedgeShare,
    });
  }

  return {
    symbol,
    bullishNotional: base.bullishNotional,
    bearishNotional: base.bearishNotional,
    totalNotional: base.totalNotional,
    putNotional: base.putNotional,
    callNotional: base.callNotional,
    putCallRatio: base.putCallRatio,
    askBias: base.askBias,
    sentiment: base.sentiment,
    currentPrice,
    bullishNotionalDecayed: metrics.bullishD,
    bearishNotionalDecayed: metrics.bearishD,
    totalNotionalDecayed: metrics.totalD,
    putNotionalDecayed: metrics.putD,
    callNotionalDecayed: metrics.callD,
    putCallRatioDecayed:
      putCallRatioDecayed === Infinity ? null : putCallRatioDecayed,
    askBiasDecayed,
    sentimentDecayed,
    bullishNotionalDecayedAdj: metrics.bullishDAdj,
    bearishNotionalDecayedAdj: metrics.bearishDAdj,
    totalNotionalDecayedAdj: metrics.totalDAdj,
    putNotionalDecayedAdj: metrics.putDAdj,
    callNotionalDecayedAdj: metrics.callDAdj,
    putCallRatioDecayedAdj:
      putCallRatioDecayedAdj === Infinity ? null : putCallRatioDecayedAdj,
    askBiasDecayedAdj,
    sentimentDecayedAdj,
    windowBullishNotionalRaw: metrics.winBullish,
    windowBearishNotionalRaw: metrics.winBearish,
    windowBullishOverThreshold: metrics.winBullish >= thresholdUsed,
    windowBullishThresholdUsed: thresholdUsed,
    hedgeSignalsCount: metrics.hedgeSignalsCount,
    hedgeNotionalShare: metrics.hedgeNotionalShare,
    comboHedgeShare: metrics.comboHedgeShare,
    windowMins,
    halfLifeMins,
    lastTradeMinAgo: Number.isFinite(metrics.lastTradeMinAgo)
      ? metrics.lastTradeMinAgo
      : null,
    moneyFlowStrength,
    // New enhanced fields
    avgIV: signals && signals.length > 0
      ? signals.reduce((sum, s) => sum + (s.iv || 0), 0) / signals.length
      : 0,
    institutionalShare: signals && signals.length > 0
      ? signals.filter(s => s.traderType === 'institutional').length / signals.length
      : 0,
    daysToEarnings: signals && signals.length > 0 ? signals[0]?.daysToEarnings : null,
    spotConfirmation: (() => {
      if (!signals || signals.length === 0) return null;
      const confirmations = signals.map(s => s.spotConfirmation).filter(Boolean);
      const strong = confirmations.filter(c => c === 'strong').length;
      const contradiction = confirmations.filter(c => c === 'contradiction').length;
      if (strong > contradiction * 2) return 'strong';
      if (contradiction > strong * 2) return 'contradiction';
      return 'weak';
    })(),
  };
}

/**
 * 扩展情绪聚合：时间衰减 + 窗口累计。
 * @param signals
 * @param base
 * @param currentPrice
 * @param config
 * @param moneyFlowStrength
 */
export function computeExtendedSentiment(
  signals: any[],
  base: SymbolSentimentBase,
  currentPrice: number,
  config: {
    windowMins: number;
    halfLifeMins: number;
    minBullishWindowNotional: number;
    alpha?: number;
    debug?: boolean;
    thresholdPolicy?: ThresholdPolicy;
    aggregationPolicy?: 'standard' | 'buyersOnly' | 'buyersOnlyAuxSP';
    auxShortPutWeight?: number;
  },
  moneyFlowStrength: number
): SymbolSentimentExtended {
  const { symbol } = base;
  const { hl, alphaVal, policy, auxWeight, thresholdPolicy, debug } =
    processConfiguration(config);

  // 1. Calculate Ask Bias metrics on the *entire* signal set first to get a true market picture.
  const marketMetrics = calculateDecayedMetrics(
    signals, // Use original, unfiltered signals
    hl,
    alphaVal,
    'standard', // Use standard policy to include all signals for this calculation
    0,
    config.windowMins
  );

  // 2. Apply the user-specified aggregation policy to get the effective signals for sentiment calculation.
  const signalsEff = applyAggregationPolicy(
    signals,
    policy,
    auxWeight,
    debug,
    symbol
  );
  const { marketCap, thresholdUsed } = calculateMarketCapAndThreshold(
    signalsEff,
    config.minBullishWindowNotional,
    thresholdPolicy
  );

  // 3. Calculate sentiment-related metrics using the *effective* (potentially filtered) signals.
  const sentimentMetrics = calculateDecayedMetrics(
    signalsEff,
    hl,
    alphaVal,
    policy,
    auxWeight,
    config.windowMins
  );

  // 4. Combine the metrics: use market-wide ask bias and policy-driven sentiment.
  const metrics = {
    ...sentimentMetrics, // Contains bullish/bearish/etc. from filtered set
    // Overwrite with metrics from the full market view for an unbiased reading
    askD: marketMetrics.askD,
    totalD: marketMetrics.totalD,
    askDAdj: marketMetrics.askDAdj,
    totalDAdj: marketMetrics.totalDAdj,
  };

  const windowMetrics = calculateWindowAndHedgeMetrics(
    metrics.withinAges,
    metrics.totalD,
    metrics.hedgeNotionalD,
    metrics.comboNotionalD,
    signals
  );

  const finalMetrics = { ...metrics, ...windowMetrics };

  return assembleResult(
    base,
    currentPrice,
    finalMetrics,
    config.windowMins,
    config.halfLifeMins,
    thresholdUsed,
    debug,
    symbol,
    policy,
    metrics.auxSPContribution,
    moneyFlowStrength,
    signals
  );
}
