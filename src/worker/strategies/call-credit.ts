import { fetchMarketMovers, type MarketMover } from '../scanner/market-movers.js';
import { analyzeStockValue } from '../scanner/value-analyzer.js';
import { getMacroSnapshot, type MacroSnapshot } from '../macro/macro-monitor.js';
import { fetchOptionsData } from '../options/fetch.js';
import { getDaysToEarnings } from '../options/earnings.js';
import { fetchDirectChart } from '../yahoo-direct.js';
import {
  calculateCloseLocationValue,
  calculateUpperWickRatio,
  scoreBreakdownState,
  selectCallCreditTemplate,
} from './call-credit-helpers.js';
import type {
  CallCreditCandidate,
  CallCreditStrategyFilters,
  CallCreditStrategySnapshot,
  CallCreditSymbolInput,
  CallOptionQuote,
  StrategyDailyBar,
} from './call-credit-types.js';

export const DEFAULT_CALL_CREDIT_FILTERS: CallCreditStrategyFilters = {
  minPrice: 20,
  maxPrice: 500,
  minVolume: 20_000_000,
  targetDteMin: 3,
  targetDteMax: 7,
};

export interface RankCallCreditCandidatesInput {
  movers: MarketMover[];
  macro: MacroSnapshot | null;
  symbolInputs: Record<string, CallCreditSymbolInput>;
  filters?: Partial<CallCreditStrategyFilters>;
  generatedAt?: Date | string;
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

export async function rankCallCreditCandidates(
  input: RankCallCreditCandidatesInput,
): Promise<CallCreditStrategySnapshot> {
  const filters = { ...DEFAULT_CALL_CREDIT_FILTERS, ...input.filters };
  const generatedAt = normalizeGeneratedAt(input.generatedAt);
  const candidates: CallCreditCandidate[] = [];

  for (const mover of input.movers) {
    if (mover.price < filters.minPrice || mover.price > filters.maxPrice || mover.volume < filters.minVolume) {
      continue;
    }

    const symbolInput = input.symbolInputs[mover.symbol];
    if (!symbolInput || symbolInput.chart.length === 0) {
      continue;
    }

    const structure = analyzeDailyStructure(symbolInput.chart, symbolInput.structureResistance);
    if (!structure) {
      continue;
    }

    const breakdownScore = scoreBreakdownState({
      changePercent: mover.changePercent,
      volumeRatio20: structure.volumeRatio20,
      closeLocationValue: structure.closeLocationValue,
      upperWickRatio: structure.upperWickRatio,
      brokeEma20: structure.brokeEma20,
      brokeEma50: structure.brokeEma50,
      brokePrior20Low: structure.brokePrior20Low,
    });

    const macroScore = scoreMacroPressure(input.macro);
    const valueBias = scoreValueBias(symbolInput.valueScore ?? null);
    const directionalPenalty = scoreDirectionalPenalty(mover.changePercent);
    const dte = symbolInput.dte ?? null;

    const spreadTemplate = dte !== null
      ? selectCallCreditTemplate({
        spotPrice: mover.price,
        structureResistance: structure.structureResistance,
        expiryISO: symbolInput.expiryISO ?? new Date().toISOString().slice(0, 10),
        options: symbolInput.options,
        widthCandidates: [2, 3, 5, 10],
        dte,
      })
      : null;

    const eventTags = buildEventTags(symbolInput);
    const thesis = buildThesis(structure, mover, input.macro, spreadTemplate !== null);
    const watchlistReasons = buildWatchlistReasons({
      changePercent: mover.changePercent,
      breakdownScore,
      macroScore,
      spreadTemplateExists: spreadTemplate !== null,
    });

    const score = round2(
      breakdownScore
      + macroScore
      + valueBias
      + (spreadTemplate ? 3 : 0)
      - directionalPenalty
      - watchlistReasons.length * 0.5,
    );

    candidates.push({
      symbol: mover.symbol,
      name: mover.name,
      price: mover.price,
      changePercent: mover.changePercent,
      volume: mover.volume,
      score,
      setupState: watchlistReasons.length === 0 ? 'ACTIONABLE' : 'WATCHLIST',
      breakdownScore,
      macroScore,
      valueBias,
      structureResistance: round2(structure.structureResistance),
      invalidationPrice: round2(structure.invalidationPrice),
      volumeRatio20: round2(structure.volumeRatio20),
      closeLocationValue: round2(structure.closeLocationValue),
      upperWickRatio: round2(structure.upperWickRatio),
      eventTags,
      thesis,
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
    macro: input.macro,
    filters,
    candidates,
  };
}

export async function getCallCreditStrategySnapshot(options?: {
  activeLimit?: number;
  loserLimit?: number;
  filters?: Partial<CallCreditStrategyFilters>;
  polygonApiKey?: string;
  loaders?: CallCreditSnapshotLoaders;
}): Promise<CallCreditStrategySnapshot> {
  const filters = { ...DEFAULT_CALL_CREDIT_FILTERS, ...options?.filters };
  const fetchMovers = options?.loaders?.fetchMovers ?? ((type: 'active' | 'losers', limit: number) => fetchMarketMovers(type, limit));
  const buildSymbolInput = options?.loaders?.buildSymbolInput ?? buildLiveSymbolInput;
  const [mostActives, dayLosers, macro] = await Promise.all([
    fetchMovers('active', options?.activeLimit ?? 15),
    fetchMovers('losers', options?.loserLimit ?? 15),
    loadMacroSnapshot(options?.loaders?.fetchMacro),
  ]);

  const mergedMovers = mergeMovers([...mostActives, ...dayLosers]);
  const eligibleMovers = mergedMovers.filter(
    (mover) => mover.price >= filters.minPrice && mover.price <= filters.maxPrice && mover.volume >= filters.minVolume,
  );

  const entries = await Promise.all(
    eligibleMovers.map(async (mover) => {
      try {
        const symbolInput = await buildSymbolInput(mover.symbol, {
          filters,
          polygonApiKey: options?.polygonApiKey ?? process.env.POLYGON_API_KEY,
          mover,
        });
        return [mover.symbol, symbolInput] as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[call-credit] Failed to build symbol input for ${mover.symbol}: ${message}`);
        return null;
      }
    }),
  );

  const symbolInputs = Object.fromEntries(entries.filter((entry): entry is readonly [string, CallCreditSymbolInput] => entry !== null));

  return rankCallCreditCandidates({
    movers: eligibleMovers,
    macro,
    symbolInputs,
    filters,
  });
}

async function buildLiveSymbolInput(
  symbol: string,
  options: {
    filters: CallCreditStrategyFilters;
    polygonApiKey?: string;
    mover: MarketMover;
  },
): Promise<CallCreditSymbolInput> {
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
  const calls = normalizeCallQuotes(chain?.calls ?? []);

  return {
    chart: chartBars,
    options: calls,
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
    console.warn(`[call-credit] Macro snapshot unavailable, continuing with null macro: ${message}`);
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

function analyzeDailyStructure(chart: StrategyDailyBar[], structureResistance?: number) {
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
  const averageVolume20 = average(prior20.map((bar) => bar.volume).filter((volume) => volume > 0));
  const volumeRatio20 = averageVolume20 > 0 ? latest.volume / averageVolume20 : 1;
  const resolvedResistance = structureResistance ?? Math.max(ema20 ?? latest.high, prior10High);

  return {
    closeLocationValue: calculateCloseLocationValue(latest),
    upperWickRatio: calculateUpperWickRatio(latest),
    volumeRatio20,
    brokeEma20: ema20 !== null ? latest.close < ema20 : false,
    brokeEma50: ema50 !== null ? latest.close < ema50 : false,
    brokePrior20Low: latest.close < prior20Low,
    structureResistance: resolvedResistance,
    invalidationPrice: resolvedResistance * 1.01,
  };
}

function calculateLastEma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreMacroPressure(macro: MacroSnapshot | null): number {
  if (!macro) {
    return 0;
  }

  let score = 0;
  if (macro.overallRegime === 'RISK_OFF') score += 4;
  if (macro.overallRegime === 'CHOPPY') score += 1;
  if (macro.overallRegime === 'RISK_ON') score -= 4;
  if (macro.dxy.trend === 'UP') score += 1;
  if (macro.dxy.trend === 'DOWN') score -= 1;
  if (macro.vix.status === 'RISING') score += 1;
  if (macro.vix.status === 'FALLING') score -= 1;
  return score;
}

function scoreValueBias(valueScore: number | null): number {
  if (valueScore === null) {
    return 0;
  }

  if (valueScore <= 2) return 2;
  if (valueScore <= 3) return 1;
  if (valueScore >= 5) return -2;
  if (valueScore >= 4) return -1;
  return 0;
}

function scoreDirectionalPenalty(changePercent: number): number {
  if (changePercent >= 0) {
    return 8;
  }

  if (changePercent > -3) {
    return 4;
  }

  return 0;
}

function buildEventTags(input: CallCreditSymbolInput): string[] {
  const tags = [...(input.eventTags ?? [])];

  if (input.earningsDays !== null && input.earningsDays !== undefined && input.earningsDays <= 7) {
    tags.push(`earnings-${input.earningsDays}d`);
  }

  return tags;
}

function buildThesis(
  structure: ReturnType<typeof analyzeDailyStructure>,
  mover: MarketMover,
  macro: MacroSnapshot | null,
  hasSpreadTemplate: boolean,
): string[] {
  if (!structure) {
    return [];
  }

  const thesis: string[] = [];
  if (structure.brokePrior20Low) thesis.push('Closed below the prior 20-session low');
  if (structure.brokeEma20) thesis.push('Price is trading beneath the 20-day EMA');
  if (structure.brokeEma50) thesis.push('Price is trading beneath the 50-day EMA');
  if (structure.volumeRatio20 >= 1.5) thesis.push(`Volume expanded to ${round2(structure.volumeRatio20)}x the 20-day average`);
  if (mover.changePercent <= -5) thesis.push(`Daily loss is ${round2(Math.abs(mover.changePercent))}%`);
  if (macro?.overallRegime === 'RISK_OFF') thesis.push('Macro tape is risk-off, which supports bearish premium-selling setups');
  if (hasSpreadTemplate) thesis.push('Options chain offers a liquid call credit spread above resistance');
  return thesis;
}

function buildWatchlistReasons(input: {
  changePercent: number;
  breakdownScore: number;
  macroScore: number;
  spreadTemplateExists: boolean;
}): string[] {
  const reasons: string[] = [];

  if (input.changePercent >= 0) {
    reasons.push('watchlist-only: Session is green, not a confirmed downside breakdown');
  } else if (input.changePercent > -3) {
    reasons.push('watchlist-only: Downside move is not deep enough for the call credit playbook');
  }

  if (input.breakdownScore < 18) {
    reasons.push('watchlist-only: Breakdown score is below the actionable threshold');
  }

  if (input.macroScore < 0) {
    reasons.push('watchlist-only: Macro regime does not currently favor bearish call credit setups');
  }

  if (!input.spreadTemplateExists) {
    reasons.push('watchlist-only: No liquid 3-7 DTE call spread was found above resistance');
  }

  return reasons;
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

function normalizeCallQuotes(calls: any[]): CallOptionQuote[] {
  return calls
    .map((call) => normalizeCallQuote(call))
    .filter((call): call is CallOptionQuote => call !== null);
}

function normalizeCallQuote(call: any): CallOptionQuote | null {
  const strike = toFiniteNumber(call?.strike ?? call?.details?.strike_price);
  if (strike <= 0) {
    return null;
  }

  return {
    strike,
    delta: toOptionalNumber(call?.delta ?? call?.greeks?.delta),
    bid: toFiniteNumber(call?.bid ?? call?.last_quote?.bid),
    ask: toFiniteNumber(call?.ask ?? call?.last_quote?.ask),
    openInterest: Math.round(toFiniteNumber(call?.openInterest ?? call?.open_interest)),
    volume: Math.round(toFiniteNumber(call?.volume ?? call?.day?.volume)),
  };
}

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
