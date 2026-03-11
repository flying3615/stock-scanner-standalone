import type { MacroSnapshot } from '../macro/macro-monitor.js';

export interface StrategyCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StrategyDailyBar extends StrategyCandle {
  date?: string;
  volume: number;
}

export interface BreakdownStateInput {
  changePercent: number;
  volumeRatio20: number;
  closeLocationValue: number;
  upperWickRatio: number;
  brokeEma20: boolean;
  brokeEma50: boolean;
  brokePrior20Low: boolean;
}

export interface CallOptionQuote {
  strike: number;
  delta?: number | null;
  bid: number;
  ask: number;
  openInterest: number;
  volume: number;
}

export interface EstimateCallDeltaInput {
  spotPrice: number;
  strike: number;
  dte: number;
}

export interface SelectCallCreditTemplateInput {
  spotPrice: number;
  structureResistance: number;
  options: CallOptionQuote[];
  widthCandidates: number[];
  dte: number;
}

export interface CallCreditTemplate {
  shortStrike: number;
  longStrike: number;
  width: number;
  dte: number;
  shortDelta: number;
  shortBid: number;
  shortAsk: number;
  longBid: number;
  longAsk: number;
  shortMid: number;
  longMid: number;
  creditMid: number;
  creditPctWidth: number;
  takeProfitAt: number;
  stopLossAt: number;
}

export type CallCreditSetupState = 'ACTIONABLE' | 'WATCHLIST';

export interface CallCreditCandidate {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  score: number;
  setupState: CallCreditSetupState;
  breakdownScore: number;
  macroScore: number;
  valueBias: number;
  structureResistance: number;
  invalidationPrice: number;
  volumeRatio20: number;
  closeLocationValue: number;
  upperWickRatio: number;
  eventTags: string[];
  thesis: string[];
  watchlistReasons: string[];
  spreadTemplate: CallCreditTemplate | null;
  dte: number | null;
  sector?: string;
  industry?: string;
}

export interface CallCreditStrategyFilters {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  targetDteMin: number;
  targetDteMax: number;
}

export interface CallCreditStrategySnapshot {
  generatedAt: string;
  macro: MacroSnapshot | null;
  filters: CallCreditStrategyFilters;
  candidates: CallCreditCandidate[];
}

export interface CallCreditSymbolInput {
  chart: StrategyDailyBar[];
  options: CallOptionQuote[];
  dte?: number | null;
  structureResistance?: number;
  valueScore?: number | null;
  sector?: string;
  industry?: string;
  earningsDays?: number | null;
  eventTags?: string[];
}
