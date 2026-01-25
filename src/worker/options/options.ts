import { OptionsAnalysis, OptionSignalLite } from '../shared.ts';
import { calculateMoneyFlowStrength, withinDays } from '../util.ts';
import { fetchOptionsData } from './fetch.ts';
import { processExpirations } from './processing.ts';
import { aggregateSentiment } from './sentiment.ts';
import { identifyCombos } from './combos.ts';
import { computeHedgeScoreForSignal } from './hedge.ts';
import { getDaysToEarnings } from './earnings.ts';
import {
  analyzeOptionsSignals,
  FetchedOptionsData,
  DailyDataRecord,
  processOptionsContracts,
  convertDailyDataToFetchedOptionsData,
} from './history.ts';

/**
 * Calculate overall signal quality score (0-1).
 */
function calculateSignalQualityScore(
  directionConfidence: number,
  spreadPct: number,
  spotConfirmation: 'strong' | 'weak' | 'contradiction' | null,
  traderType: 'institutional' | 'retail' | 'mixed',
  hedgeScore: number
): number {
  // Weighted factors
  const weights = {
    direction: 0.30,
    spread: 0.20,
    confirm: 0.20,
    trader: 0.15,
    hedge: 0.15,
  };

  // Calculate individual scores
  const spreadScore = Math.max(0, 1 - spreadPct / 0.20);
  const confirmScore = spotConfirmation === 'strong' ? 1.0 :
    spotConfirmation === 'weak' ? 0.5 :
      spotConfirmation === 'contradiction' ? 0.2 : 0.5;
  const traderScore = traderType === 'institutional' ? 1.0 :
    traderType === 'mixed' ? 0.7 : 0.5;
  const directionalScore = 1 - hedgeScore;

  return (
    directionConfidence * weights.direction +
    spreadScore * weights.spread +
    confirmScore * weights.confirm +
    traderScore * weights.trader +
    directionalScore * weights.hedge
  );
}

/**
 * 扫描单个标的的期权链，产出过滤后的信号与基础（非衰减）情绪聚合。
 * 支持共享子请求预算（Cloudflare Free 套餐避免触顶）。
 */
export async function scanSymbolOptions(
  symbol: string,
  debug = true,
  scanCfg?: {
    limitExpirations?: number;
    regularFreshWindowMins?: number;
    nonRegularFreshWindowMins?: number;
    deepOTMPutCut?: number;
    shortTermDays?: number;
    longTermDays?: number;
    comboTimeWindowMin?: number;
    comboNotionalRatioTol?: number;
    callOTMMin?: number;
    callBandMax?: number;
    putOTMMax?: number;
    putBandMin?: number;
    polygonApiKey?: string;
    minVolume?: number;
    minNotional?: number;
    minNotionalNoRatio?: number;
    minRatio?: number;
  }
): Promise<{
  moneyFlowStrength: number;
  signals: OptionSignalLite[];
  sentiment: {
    symbol: string;
    bullishNotional: number;
    bearishNotional: number;
    totalNotional: number;
    putNotional: number;
    callNotional: number;
    putCallRatio: number;
    askBias: number;
    sentiment: number;
  };
  optionsAnalysis: OptionsAnalysis;
  isRegular: boolean;
  freshWindowMins: number;
  marketState: string;
  rmp: number;
}> {
  if (debug) console.log(`[scanSymbolOptions] Start for symbol: ${symbol}`);

  const [
    { base, rmp, marketCap, marketState, options },
    moneyFlowStrength,
    daysToEarnings,
  ] = await Promise.all([
    fetchOptionsData(symbol, { includeQuote: true, debug, polygonApiKey: scanCfg?.polygonApiKey }),
    calculateMoneyFlowStrength(symbol, 7),
    getDaysToEarnings(symbol),
  ]);

  if (debug)
    console.log(
      `[scanSymbolOptions] 14-day Money Flow Strength for ${symbol}: ${moneyFlowStrength.toFixed(
        3
      )}`
    );

  const expirationsRaw: any[] = Array.isArray(base?.expirationDates)
    ? base.expirationDates
    : [];
  let targetDates: Date[] = expirationsRaw
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .filter((d) => !isNaN(d.getTime()) && withinDays(d, 30));
  if (
    scanCfg &&
    Number.isFinite(scanCfg.limitExpirations) &&
    scanCfg.limitExpirations > 0
  ) {
    const lim = Math.floor(scanCfg.limitExpirations);
    targetDates = targetDates.slice(0, Math.max(1, lim));
  }

  const isRegular = (marketState || '').toUpperCase() === 'REGULAR';
  const regFresh = Number.isFinite(scanCfg?.regularFreshWindowMins)
    ? Math.max(1, Math.floor(scanCfg.regularFreshWindowMins))
    : 60;
  const nonRegFresh = Number.isFinite(scanCfg?.nonRegularFreshWindowMins)
    ? Math.max(1, Math.floor(scanCfg.nonRegularFreshWindowMins))
    : 24 * 60;
  const freshWindowMins = isRegular ? regFresh : nonRegFresh;

  const dbg = {
    expWithin30: targetDates.length,
    totalContracts: 0,
    skippedPriceBand: 0,
    invalidMid: 0,
    belowThreshold: 0,
    ratioLow: 0,
    stale: 0,
    added: 0,
    marketState,
    rmp,
  };

  const signals = await processExpirations(
    symbol,
    targetDates,
    rmp,
    marketCap,
    freshWindowMins,
    scanCfg,
    debug,
    dbg
  );

  const sentiment = aggregateSentiment(signals, symbol, debug);

  identifyCombos(signals, scanCfg, debug);
  computeHedgeScoreForSignal(signals, moneyFlowStrength, scanCfg);

  // Enhance signals with earnings and spot confirmation
  for (const sig of signals) {
    // Set days to earnings for all signals
    sig.daysToEarnings = daysToEarnings;

    // Set spot confirmation based on money flow vs signal direction
    const isBullishSignal =
      (sig.type === 'call' && sig.direction === 'buy') ||
      (sig.type === 'put' && sig.direction === 'sell');
    const isBearishSignal =
      (sig.type === 'put' && sig.direction === 'buy') ||
      (sig.type === 'call' && sig.direction === 'sell');

    if (sig.direction === 'neutral') {
      sig.spotConfirmation = null;
    } else if (isBullishSignal && moneyFlowStrength > 0.2) {
      sig.spotConfirmation = 'strong';
    } else if (isBearishSignal && moneyFlowStrength < -0.2) {
      sig.spotConfirmation = 'strong';
    } else if (isBullishSignal && moneyFlowStrength < -0.2) {
      sig.spotConfirmation = 'contradiction';
    } else if (isBearishSignal && moneyFlowStrength > 0.2) {
      sig.spotConfirmation = 'contradiction';
    } else {
      sig.spotConfirmation = 'weak';
    }

    // Calculate overall signal quality score (0-1)
    sig.signalQuality = calculateSignalQualityScore(
      sig.directionConfidence,
      sig.spreadPct,
      sig.spotConfirmation,
      sig.traderType,
      sig.hedgeScore
    );
  }

  // Generate options analysis for the symbol using the already fetched options data
  let optionsAnalysis = null;
  try {
    // Extract historical data from the already fetched options data
    const historicalData = extractHistoricalDataFromOptions(options, 30);
    optionsAnalysis = analyzeOptionsSignals(historicalData);
  } catch (error) {
    if (debug) {
      console.warn(
        `[scanSymbolOptions] Failed to generate options analysis for ${symbol}:`,
        error
      );
    }
    // Set default analysis if historical data extraction fails
    optionsAnalysis = {
      signals: [],
      analysis: {
        trend: 'neutral' as const,
        pcrTrend: 'stable' as const,
        ivTrend: 'stable' as const,
        recentActivity: '数据不足，无法分析',
      },
    };
  }

  return {
    signals,
    sentiment,
    isRegular,
    freshWindowMins,
    marketState,
    rmp,
    moneyFlowStrength,
    optionsAnalysis,
  };
}

/**
 * Extract historical data from already fetched options data for analysis
 */
function extractHistoricalDataFromOptions(
  options: any[] | undefined,
  days: number
): FetchedOptionsData[] {
  if (!options || !Array.isArray(options)) {
    return [];
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const dailyData: Record<string, DailyDataRecord> = {};

  // Process each expiration leg
  for (const leg of options) {
    if (!Array.isArray(leg?.calls) || !Array.isArray(leg?.puts)) continue;

    // Process calls and puts using the shared helper function
    processOptionsContracts(leg.calls, startDate, endDate, dailyData, 'call');
    processOptionsContracts(leg.puts, startDate, endDate, dailyData, 'put');
  }

  // Convert to FetchedOptionsData format using the shared helper function
  return convertDailyDataToFetchedOptionsData(dailyData);
}
