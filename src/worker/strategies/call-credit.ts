import { fetchMarketMovers, type MarketMover } from '../scanner/market-movers.js';
import { analyzeStockValue } from '../scanner/value-analyzer.js';
import { getMacroSnapshot, type MacroSnapshot } from '../macro/macro-monitor.js';
import { fetchOptionsData } from '../options/fetch.js';
import { getDaysToEarnings } from '../options/earnings.js';
import { fetchDirectChart } from '../yahoo-direct.js';
import {
  averageNumbers,
  calculateLastEma,
  calculateCloseLocationValue,
  calculateLowerWickRatio,
  calculateUpperWickRatio,
  scoreBounceState,
  scoreBreakdownState,
  selectBearCallCreditTemplate,
  selectBullPutCreditTemplate,
} from './call-credit-helpers.js';
import type {
  CallCreditCandidate,
  CallCreditStrategyFilters,
  CallCreditStrategySnapshot,
  CallCreditSymbolInput,
  CreditSpreadAnchorType,
  CreditSpreadBlocker,
  CreditSpreadCandidate,
  CreditSpreadStrategyFilters,
  CreditSpreadStrategySnapshot,
  CreditSpreadStrategyType,
  CreditSpreadSymbolInput,
  StrategyDailyBar,
  StrategyOptionQuote,
} from './call-credit-types.js';

const MAX_PRECHAIN_CANDIDATES = 25;

export const DEFAULT_CREDIT_SPREAD_FILTERS: CreditSpreadStrategyFilters = {
  minPrice: 20,
  maxPrice: 500,
  minVolume: 20_000_000,
  targetDteMin: 3,
  targetDteMax: 7,
};

export const DEFAULT_CALL_CREDIT_FILTERS: CallCreditStrategyFilters = DEFAULT_CREDIT_SPREAD_FILTERS;

export interface RankCreditSpreadCandidatesInput {
  strategyType: CreditSpreadStrategyType;
  movers: MarketMover[];
  macro: MacroSnapshot | null;
  symbolInputs: Record<string, CreditSpreadSymbolInput>;
  filters?: Partial<CreditSpreadStrategyFilters>;
  generatedAt?: Date | string;
}

export interface RankCallCreditCandidatesInput {
  movers: MarketMover[];
  macro: MacroSnapshot | null;
  symbolInputs: Record<string, CallCreditSymbolInput>;
  filters?: Partial<CallCreditStrategyFilters>;
  generatedAt?: Date | string;
}

export interface CreditSpreadSnapshotLoaders {
  fetchMovers?: (type: 'active' | 'losers', limit: number) => Promise<MarketMover[]>;
  fetchMacro?: () => Promise<MacroSnapshot>;
  buildSymbolInput?: (
    symbol: string,
    options: {
      strategyType: CreditSpreadStrategyType;
      filters: CreditSpreadStrategyFilters;
      polygonApiKey?: string;
      mover: MarketMover;
    },
  ) => Promise<CreditSpreadSymbolInput>;
}

export interface CallCreditSnapshotLoaders {
  fetchMovers?: (type: 'active' | 'losers', limit: number) => Promise<MarketMover[]>;
  fetchMacro?: () => Promise<MacroSnapshot>;
  buildSymbolInput?: (
    symbol: string,
    options: {
      filters: CallCreditStrategyFilters;
      polygonApiKey?: string;
      mover: MarketMover;
    },
  ) => Promise<CallCreditSymbolInput>;
}

interface StrategyStructure {
  anchorType: CreditSpreadAnchorType;
  anchorLevel: number;
  invalidationPrice: number;
  volumeRatio20: number;
  closeLocationValue: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  brokeEma20: boolean;
  brokeEma50: boolean;
  brokePrior20Low: boolean;
  heldEma20: boolean;
  heldEma50: boolean;
  heldPrior20Low: boolean;
}

export async function rankCreditSpreadCandidates(
  input: RankCreditSpreadCandidatesInput,
): Promise<CreditSpreadStrategySnapshot> {
  const filters = { ...DEFAULT_CREDIT_SPREAD_FILTERS, ...input.filters };
  const generatedAt = normalizeGeneratedAt(input.generatedAt);
  const candidates: CreditSpreadCandidate[] = [];

  for (const mover of input.movers) {
    if (mover.price < filters.minPrice || mover.price > filters.maxPrice || mover.volume < filters.minVolume) {
      continue;
    }

    const symbolInput = input.symbolInputs[mover.symbol];
    if (!symbolInput || symbolInput.chart.length === 0) {
      continue;
    }

    const structure = analyzeDailyStructure(symbolInput.chart, input.strategyType, symbolInput);
    if (!structure) {
      continue;
    }

    const structureScore = input.strategyType === 'BEAR_CALL_CREDIT'
      ? scoreBreakdownState({
        changePercent: mover.changePercent,
        volumeRatio20: structure.volumeRatio20,
        closeLocationValue: structure.closeLocationValue,
        upperWickRatio: structure.upperWickRatio,
        brokeEma20: structure.brokeEma20,
        brokeEma50: structure.brokeEma50,
        brokePrior20Low: structure.brokePrior20Low,
      })
      : scoreBounceState({
        changePercent: mover.changePercent,
        volumeRatio20: structure.volumeRatio20,
        closeLocationValue: structure.closeLocationValue,
        lowerWickRatio: structure.lowerWickRatio,
        heldEma20: structure.heldEma20,
        heldEma50: structure.heldEma50,
        heldPrior20Low: structure.heldPrior20Low,
      });

    const macroScore = scoreMacroAlignment(input.macro, input.strategyType);
    const valueBias = scoreValueBias(symbolInput.valueScore ?? null, input.strategyType);
    const dte = symbolInput.dte ?? null;
    const expiryISO = symbolInput.expiryISO ?? new Date().toISOString().slice(0, 10);
    const spreadTemplate = dte !== null
      ? input.strategyType === 'BEAR_CALL_CREDIT'
        ? selectBearCallCreditTemplate({
          spotPrice: mover.price,
          anchorLevel: structure.anchorLevel,
          expiryISO,
          options: symbolInput.callOptions,
          widthCandidates: [2, 3, 5, 10],
          dte,
        })
        : selectBullPutCreditTemplate({
          spotPrice: mover.price,
          anchorLevel: structure.anchorLevel,
          expiryISO,
          options: symbolInput.putOptions,
          widthCandidates: [2, 3, 5, 10],
          dte,
        })
      : null;

    const eventTags = buildEventTags(symbolInput);
    const blockers = buildBlockers({
      strategyType: input.strategyType,
      mover,
      structure,
      structureScore,
      macroScore,
      spreadTemplateExists: spreadTemplate !== null,
      creditPctWidth: spreadTemplate?.creditPctWidth ?? null,
    });
    const watchlistReasons = blockers.map((blocker) => blockerToReason(blocker, input.strategyType));
    const thesis = buildThesis({
      strategyType: input.strategyType,
      structure,
      mover,
      macro: input.macro,
      hasSpreadTemplate: spreadTemplate !== null,
      creditPctWidth: spreadTemplate?.creditPctWidth ?? null,
    });

    const score = round2(
      structureScore
      + macroScore
      + valueBias
      + (spreadTemplate ? 3 : 0)
      - blockers.length * 1.5,
    );

    candidates.push({
      strategyType: input.strategyType,
      direction: input.strategyType === 'BEAR_CALL_CREDIT' ? 'BEARISH' : 'BULLISH',
      symbol: mover.symbol,
      name: mover.name,
      price: mover.price,
      changePercent: mover.changePercent,
      volume: mover.volume,
      score,
      setupState: blockers.length === 0 ? 'ACTIONABLE' : 'WATCHLIST',
      structureScore,
      macroScore,
      valueBias,
      anchorType: structure.anchorType,
      anchorLevel: round2(structure.anchorLevel),
      invalidationPrice: round2(structure.invalidationPrice),
      volumeRatio20: round2(structure.volumeRatio20),
      closeLocationValue: round2(structure.closeLocationValue),
      upperWickRatio: round2(structure.upperWickRatio),
      lowerWickRatio: round2(structure.lowerWickRatio),
      eventTags,
      thesis,
      blockers,
      watchlistReasons,
      spreadTemplate,
      dte,
      sector: symbolInput.sector,
      industry: symbolInput.industry,
    });
  }

  candidates.sort((left, right) => right.score - left.score);

  return {
    generatedAt,
    strategyType: input.strategyType,
    macro: input.macro,
    filters,
    candidates,
  };
}

export async function rankCallCreditCandidates(
  input: RankCallCreditCandidatesInput,
): Promise<CallCreditStrategySnapshot> {
  return rankCreditSpreadCandidates({
    strategyType: 'BEAR_CALL_CREDIT',
    movers: input.movers,
    macro: input.macro,
    symbolInputs: input.symbolInputs,
    filters: input.filters,
    generatedAt: input.generatedAt,
  });
}

export async function getCreditSpreadStrategySnapshot(options?: {
  strategyType: CreditSpreadStrategyType;
  activeLimit?: number;
  loserLimit?: number;
  filters?: Partial<CreditSpreadStrategyFilters>;
  polygonApiKey?: string;
  loaders?: CreditSpreadSnapshotLoaders;
}): Promise<CreditSpreadStrategySnapshot> {
  const filters = { ...DEFAULT_CREDIT_SPREAD_FILTERS, ...options?.filters };
  const fetchMovers = options?.loaders?.fetchMovers ?? ((type: 'active' | 'losers', limit: number) => fetchMarketMovers(type, limit));
  const buildSymbolInput = options?.loaders?.buildSymbolInput ?? buildLiveSymbolInput;
  const [mostActives, dayLosers, macro] = await Promise.all([
    fetchMovers('active', options?.activeLimit ?? 15),
    fetchMovers('losers', options?.loserLimit ?? 15),
    loadMacroSnapshot(options?.loaders?.fetchMacro),
  ]);

  const mergedMovers = mergeMovers([...mostActives, ...dayLosers]);
  const eligibleMovers = mergedMovers
    .filter((mover) => mover.price >= filters.minPrice && mover.price <= filters.maxPrice && mover.volume >= filters.minVolume)
    .sort((left, right) => {
      const leftPriority = Math.abs(left.changePercent) * 2 + left.volume / 1_000_000;
      const rightPriority = Math.abs(right.changePercent) * 2 + right.volume / 1_000_000;
      return rightPriority - leftPriority;
    })
    .slice(0, MAX_PRECHAIN_CANDIDATES);

  const entries = await Promise.all(
    eligibleMovers.map(async (mover) => {
      try {
        const symbolInput = await buildSymbolInput(mover.symbol, {
          strategyType: options?.strategyType ?? 'BEAR_CALL_CREDIT',
          filters,
          polygonApiKey: options?.polygonApiKey ?? process.env.POLYGON_API_KEY,
          mover,
        });
        return [mover.symbol, symbolInput] as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[credit-spreads] Failed to build symbol input for ${mover.symbol}: ${message}`);
        return null;
      }
    }),
  );

  const symbolInputs = Object.fromEntries(
    entries.filter((entry): entry is readonly [string, CreditSpreadSymbolInput] => entry !== null),
  );

  return rankCreditSpreadCandidates({
    strategyType: options?.strategyType ?? 'BEAR_CALL_CREDIT',
    movers: eligibleMovers,
    macro,
    symbolInputs,
    filters,
  });
}

export async function getCallCreditStrategySnapshot(options?: {
  activeLimit?: number;
  loserLimit?: number;
  filters?: Partial<CallCreditStrategyFilters>;
  polygonApiKey?: string;
  loaders?: CallCreditSnapshotLoaders;
}): Promise<CallCreditStrategySnapshot> {
  const loaders = options?.loaders
    ? {
      fetchMovers: options.loaders.fetchMovers,
      fetchMacro: options.loaders.fetchMacro,
      buildSymbolInput: options.loaders.buildSymbolInput
        ? async (
          symbol: string,
          builderOptions: {
            strategyType: CreditSpreadStrategyType;
            filters: CreditSpreadStrategyFilters;
            polygonApiKey?: string;
            mover: MarketMover;
          },
        ) => options.loaders?.buildSymbolInput?.(symbol, {
          filters: builderOptions.filters,
          polygonApiKey: builderOptions.polygonApiKey,
          mover: builderOptions.mover,
        }) ?? null
        : undefined,
    }
    : undefined;

  return getCreditSpreadStrategySnapshot({
    strategyType: 'BEAR_CALL_CREDIT',
    activeLimit: options?.activeLimit,
    loserLimit: options?.loserLimit,
    filters: options?.filters,
    polygonApiKey: options?.polygonApiKey,
    loaders: loaders as CreditSpreadSnapshotLoaders | undefined,
  });
}

async function buildLiveSymbolInput(
  symbol: string,
  options: {
    strategyType: CreditSpreadStrategyType;
    filters: CreditSpreadStrategyFilters;
    polygonApiKey?: string;
    mover: MarketMover;
  },
): Promise<CreditSpreadSymbolInput> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 4);

  const [chart, initialOptionsData, valueScore, earningsDays] = await Promise.all([
    fetchDirectChart(symbol, startDate, endDate, '1d'),
    fetchOptionsData(symbol, {
      includeQuote: true,
      polygonApiKey: options.polygonApiKey,
    }),
    analyzeStockValue(symbol),
    getDaysToEarnings(symbol),
  ]);

  const chartBars = normalizeChartBars(chart?.quotes ?? []);
  const expirationDates = normalizeExpirationDates(initialOptionsData.base?.expirationDates ?? []);
  const targetExpiration = selectTargetExpiration(expirationDates, options.filters.targetDteMin, options.filters.targetDteMax);

  let optionsBase = initialOptionsData.base;
  let dte = targetExpiration ? diffCalendarDays(targetExpiration) : null;
  const expiryISO = targetExpiration ? targetExpiration.toISOString().slice(0, 10) : null;

  if (targetExpiration && !findOptionChain(optionsBase?.options, targetExpiration)) {
    const targetedOptions = await fetchOptionsData(symbol, {
      includeQuote: true,
      polygonApiKey: options.polygonApiKey,
      date: targetExpiration,
    });
    optionsBase = targetedOptions.base;
    dte = diffCalendarDays(targetExpiration);
  }

  const chain = findOptionChain(optionsBase?.options, targetExpiration);
  const calls = normalizeOptionQuotes(chain?.calls ?? [], 'CALL');
  const puts = normalizeOptionQuotes(chain?.puts ?? [], 'PUT');

  return {
    chart: chartBars,
    callOptions: calls,
    putOptions: puts,
    dte,
    expiryISO,
    valueScore: valueScore?.score ?? null,
    sector: valueScore?.sector,
    industry: valueScore?.industry,
    earningsDays,
  };
}

async function loadMacroSnapshot(fetchMacro?: () => Promise<MacroSnapshot>): Promise<MacroSnapshot | null> {
  try {
    return await (fetchMacro ?? getMacroSnapshot)();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[credit-spreads] Macro snapshot unavailable, continuing with null macro: ${message}`);
    return null;
  }
}

function normalizeGeneratedAt(value?: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function mergeMovers(movers: MarketMover[]): MarketMover[] {
  const bySymbol = new Map<string, MarketMover>();

  for (const mover of movers) {
    const existing = bySymbol.get(mover.symbol);
    if (!existing || Math.abs(mover.changePercent) > Math.abs(existing.changePercent) || mover.volume > existing.volume) {
      bySymbol.set(mover.symbol, mover);
    }
  }

  return [...bySymbol.values()];
}

function analyzeDailyStructure(
  chart: StrategyDailyBar[],
  strategyType: CreditSpreadStrategyType,
  input: CreditSpreadSymbolInput,
): StrategyStructure | null {
  if (chart.length < 21) {
    return null;
  }

  const latest = chart[chart.length - 1];
  const priorBars = chart.slice(0, -1);
  const closes = chart.map((bar) => bar.close).filter(Number.isFinite);
  const ema20 = calculateLastEma(closes, 20);
  const ema50 = calculateLastEma(closes, 50);
  const prior20 = priorBars.slice(-20);
  const prior10 = priorBars.slice(-10);
  const prior20Low = prior20.length > 0 ? Math.min(...prior20.map((bar) => bar.low)) : latest.low;
  const prior10High = prior10.length > 0 ? Math.max(...prior10.map((bar) => bar.high)) : latest.high;
  const averageVolume20 = averageNumbers(prior20.map((bar) => bar.volume).filter((volume) => volume > 0));
  const volumeRatio20 = averageVolume20 > 0 ? latest.volume / averageVolume20 : 1;
  const supportFallback = Math.min(
    ema20 ?? Number.POSITIVE_INFINITY,
    ema50 ?? Number.POSITIVE_INFINITY,
    prior20Low,
  );
  const resistanceFallback = Math.max(
    ema20 ?? Number.NEGATIVE_INFINITY,
    ema50 ?? Number.NEGATIVE_INFINITY,
    prior10High,
  );
  const anchorLevel = strategyType === 'BEAR_CALL_CREDIT'
    ? input.structureResistance ?? input.anchorLevel ?? resistanceFallback
    : input.structureSupport ?? input.anchorLevel ?? supportFallback;

  return {
    anchorType: strategyType === 'BEAR_CALL_CREDIT' ? 'RESISTANCE' : 'SUPPORT',
    anchorLevel,
    invalidationPrice: strategyType === 'BEAR_CALL_CREDIT' ? anchorLevel * 1.01 : anchorLevel * 0.99,
    volumeRatio20,
    closeLocationValue: calculateCloseLocationValue(latest),
    upperWickRatio: calculateUpperWickRatio(latest),
    lowerWickRatio: calculateLowerWickRatio(latest),
    brokeEma20: ema20 !== null ? latest.close < ema20 : false,
    brokeEma50: ema50 !== null ? latest.close < ema50 : false,
    brokePrior20Low: latest.close < prior20Low,
    heldEma20: ema20 !== null ? latest.close >= ema20 : false,
    heldEma50: ema50 !== null ? latest.close >= ema50 : false,
    heldPrior20Low: latest.close >= prior20Low,
  };
}

function scoreMacroAlignment(macro: MacroSnapshot | null, strategyType: CreditSpreadStrategyType): number {
  if (!macro) {
    return 0;
  }

  let score = 0;
  if (strategyType === 'BEAR_CALL_CREDIT') {
    if (macro.overallRegime === 'RISK_OFF') score += 4;
    if (macro.overallRegime === 'CHOPPY') score += 1;
    if (macro.overallRegime === 'RISK_ON') score -= 4;
    if (macro.dxy.trend === 'UP') score += 1;
    if (macro.dxy.trend === 'DOWN') score -= 1;
    if (macro.vix.status === 'RISING') score += 1;
    if (macro.vix.status === 'FALLING') score -= 1;
    return score;
  }

  if (macro.overallRegime === 'RISK_ON') score += 4;
  if (macro.overallRegime === 'CHOPPY') score += 1;
  if (macro.overallRegime === 'RISK_OFF') score -= 4;
  if (macro.dxy.trend === 'DOWN') score += 1;
  if (macro.dxy.trend === 'UP') score -= 1;
  if (macro.vix.status === 'FALLING') score += 1;
  if (macro.vix.status === 'RISING') score -= 1;
  return score;
}

function scoreValueBias(valueScore: number | null, strategyType: CreditSpreadStrategyType): number {
  if (valueScore === null) {
    return 0;
  }

  if (strategyType === 'BEAR_CALL_CREDIT') {
    if (valueScore <= 2) return 2;
    if (valueScore <= 3) return 1;
    if (valueScore >= 5) return -2;
    if (valueScore >= 4) return -1;
    return 0;
  }

  if (valueScore >= 5) return 2;
  if (valueScore >= 4) return 1;
  if (valueScore <= 2) return -2;
  if (valueScore <= 3) return -1;
  return 0;
}

function buildEventTags(input: CreditSpreadSymbolInput): string[] {
  const tags = [...(input.eventTags ?? [])];

  if (input.earningsDays !== null && input.earningsDays !== undefined && input.earningsDays <= 7) {
    tags.push(`earnings-${input.earningsDays}d`);
  }

  if (input.recentEventDays !== null && input.recentEventDays !== undefined && input.recentEventDays >= 0) {
    tags.push(`recent-event-${input.recentEventDays}d`);
  }

  return tags;
}

function buildThesis(input: {
  strategyType: CreditSpreadStrategyType;
  structure: StrategyStructure;
  mover: MarketMover;
  macro: MacroSnapshot | null;
  hasSpreadTemplate: boolean;
  creditPctWidth: number | null;
}): string[] {
  const thesis: string[] = [];

  if (input.strategyType === 'BEAR_CALL_CREDIT') {
    if (input.structure.brokePrior20Low) thesis.push('Closed below the prior 20-session low');
    if (input.structure.brokeEma20) thesis.push('Price is trading beneath the 20-day EMA');
    if (input.structure.brokeEma50) thesis.push('Price is trading beneath the 50-day EMA');
    if (input.structure.volumeRatio20 >= 1.5) thesis.push(`Volume expanded to ${round2(input.structure.volumeRatio20)}x the 20-day average`);
    if (input.mover.changePercent <= -5) thesis.push(`Daily loss is ${round2(Math.abs(input.mover.changePercent))}%`);
    if (input.macro?.overallRegime === 'RISK_OFF') thesis.push('Macro tape is risk-off, which supports bearish premium-selling setups');
    if (input.hasSpreadTemplate) thesis.push('Options chain offers a liquid call credit spread above resistance');
  } else {
    if (input.structure.heldPrior20Low) thesis.push('Close held above the prior 20-session low');
    if (input.structure.heldEma20) thesis.push('Price reclaimed or held the 20-day EMA');
    if (input.structure.heldEma50) thesis.push('Price is above the 50-day EMA support');
    if (input.structure.lowerWickRatio >= 0.2) thesis.push('Lower wick suggests buyers absorbed intraday weakness');
    if (input.macro?.overallRegime === 'RISK_ON') thesis.push('Macro tape is supportive for bullish premium-selling setups');
    if (input.hasSpreadTemplate) thesis.push('Options chain offers a liquid put credit spread below support');
  }

  if (input.creditPctWidth !== null && input.creditPctWidth >= 0.25) {
    thesis.push(`Credit captures ${round2(input.creditPctWidth * 100)}% of spread width`);
  }

  return thesis;
}

function buildBlockers(input: {
  strategyType: CreditSpreadStrategyType;
  mover: MarketMover;
  structure: StrategyStructure;
  structureScore: number;
  macroScore: number;
  spreadTemplateExists: boolean;
  creditPctWidth: number | null;
}): CreditSpreadBlocker[] {
  const blockers = new Set<CreditSpreadBlocker>();

  if (input.strategyType === 'BEAR_CALL_CREDIT') {
    if (input.mover.changePercent >= 0) {
      blockers.add('MOVE_DIRECTION_CONFLICT');
    }
    if (input.mover.changePercent > -3 || input.structureScore < 18) {
      blockers.add('BREAKDOWN_TOO_WEAK');
    }
    if (input.mover.price >= input.structure.anchorLevel) {
      blockers.add('RESISTANCE_ALREADY_RECLAIMED');
    }
  } else {
    if (input.mover.price <= input.structure.anchorLevel) {
      blockers.add('SUPPORT_ALREADY_LOST');
    }
    if (input.structure.closeLocationValue < 0.45 || input.structure.lowerWickRatio < 0.1 || input.structureScore < 10) {
      blockers.add('BOUNCE_NOT_CONFIRMED');
    }
  }

  if (input.macroScore < 0) {
    blockers.add('MACRO_NOT_ALIGNED');
  }
  if (!input.spreadTemplateExists) {
    blockers.add('NO_LIQUID_TEMPLATE');
  }
  if (input.creditPctWidth !== null && input.creditPctWidth < 0.25) {
    blockers.add('CREDIT_TOO_THIN');
  }

  return [...blockers];
}

function blockerToReason(blocker: CreditSpreadBlocker, strategyType: CreditSpreadStrategyType): string {
  switch (blocker) {
    case 'MOVE_DIRECTION_CONFLICT':
      return 'watchlist-only: Session is green, not a confirmed downside breakdown';
    case 'BREAKDOWN_TOO_WEAK':
      return 'watchlist-only: Breakdown score is below the actionable threshold';
    case 'BOUNCE_NOT_CONFIRMED':
      return 'watchlist-only: Bounce quality is below the actionable threshold';
    case 'MACRO_NOT_ALIGNED':
      return strategyType === 'BEAR_CALL_CREDIT'
        ? 'watchlist-only: Macro regime does not currently favor bearish call credit setups'
        : 'watchlist-only: Macro regime does not currently favor bullish put credit setups';
    case 'NO_LIQUID_TEMPLATE':
      return strategyType === 'BEAR_CALL_CREDIT'
        ? 'watchlist-only: No liquid 3-7 DTE call spread was found above resistance'
        : 'watchlist-only: No liquid 3-7 DTE put spread was found below support';
    case 'CREDIT_TOO_THIN':
      return 'watchlist-only: Credit capture is below the actionable threshold';
    case 'SUPPORT_ALREADY_LOST':
      return 'watchlist-only: Price is already through the support anchor';
    case 'RESISTANCE_ALREADY_RECLAIMED':
      return 'watchlist-only: Price already reclaimed the resistance anchor';
    default:
      return 'watchlist-only: Strategy requirements are not fully aligned';
  }
}

function normalizeChartBars(quotes: any[]): StrategyDailyBar[] {
  return quotes
    .map((quote) => ({
      date: quote?.date instanceof Date ? quote.date.toISOString() : typeof quote?.date === 'string' ? quote.date : undefined,
      open: toFiniteNumber(quote?.open),
      high: toFiniteNumber(quote?.high),
      low: toFiniteNumber(quote?.low),
      close: toFiniteNumber(quote?.close),
      volume: toFiniteNumber(quote?.volume),
    }))
    .filter((bar) => bar.close > 0 && bar.high > 0 && bar.low > 0);
}

function normalizeExpirationDates(values: any[]): Date[] {
  return values
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((value) => !Number.isNaN(value.getTime()));
}

function selectTargetExpiration(expirationDates: Date[], minDte: number, maxDte: number): Date | null {
  const target = expirationDates.find((date) => {
    const dte = diffCalendarDays(date);
    return dte >= minDte && dte <= maxDte;
  });

  return target ?? null;
}

function diffCalendarDays(date: Date): number {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function findOptionChain(options: any, targetExpiration: Date | null) {
  if (!Array.isArray(options) || options.length === 0) {
    return null;
  }

  if (!targetExpiration) {
    return options[0] ?? null;
  }

  const targetIso = targetExpiration.toISOString().slice(0, 10);
  return options.find((option) => {
    const expiration = option?.expirationDate instanceof Date
      ? option.expirationDate.toISOString().slice(0, 10)
      : typeof option?.expirationDate === 'string'
        ? option.expirationDate.slice(0, 10)
        : '';
    return expiration === targetIso;
  }) ?? null;
}

function normalizeOptionQuotes(options: any[], optionType: 'CALL' | 'PUT'): StrategyOptionQuote[] {
  return options
    .map((option) => normalizeOptionQuote(option, optionType))
    .filter((option): option is StrategyOptionQuote => option !== null);
}

function normalizeOptionQuote(option: any, optionType: 'CALL' | 'PUT'): StrategyOptionQuote | null {
  const strike = toFiniteNumber(option?.strike ?? option?.details?.strike_price);
  if (strike <= 0) {
    return null;
  }

  return {
    optionType,
    strike,
    delta: toOptionalNumber(option?.delta ?? option?.greeks?.delta),
    bid: toFiniteNumber(option?.bid ?? option?.last_quote?.bid),
    ask: toFiniteNumber(option?.ask ?? option?.last_quote?.ask),
    openInterest: Math.round(toFiniteNumber(option?.openInterest ?? option?.open_interest)),
    volume: Math.round(toFiniteNumber(option?.volume ?? option?.day?.volume)),
  };
}

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
