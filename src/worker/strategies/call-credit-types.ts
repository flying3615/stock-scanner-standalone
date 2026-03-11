import type { MacroSnapshot } from '../macro/macro-monitor.js';

export const CREDIT_SPREAD_STRATEGY_TYPES = ['BEAR_CALL_CREDIT', 'BULL_PUT_CREDIT'] as const;
export type CreditSpreadStrategyType = (typeof CREDIT_SPREAD_STRATEGY_TYPES)[number];

export const CREDIT_SPREAD_DIRECTIONS = ['BEARISH', 'BULLISH'] as const;
export type CreditSpreadDirection = (typeof CREDIT_SPREAD_DIRECTIONS)[number];

export const CREDIT_SPREAD_ANCHOR_TYPES = ['RESISTANCE', 'SUPPORT'] as const;
export type CreditSpreadAnchorType = (typeof CREDIT_SPREAD_ANCHOR_TYPES)[number];

export const CREDIT_SPREAD_SETUP_STATES = ['ACTIONABLE', 'WATCHLIST'] as const;
export type CreditSpreadSetupState = (typeof CREDIT_SPREAD_SETUP_STATES)[number];

export const CREDIT_SPREAD_OPTION_TYPES = ['CALL', 'PUT'] as const;
export type CreditSpreadOptionType = (typeof CREDIT_SPREAD_OPTION_TYPES)[number];

export const CREDIT_SPREAD_BLOCKERS = [
  'MOVE_DIRECTION_CONFLICT',
  'BREAKDOWN_TOO_WEAK',
  'BOUNCE_NOT_CONFIRMED',
  'MACRO_NOT_ALIGNED',
  'NO_LIQUID_TEMPLATE',
  'CREDIT_TOO_THIN',
  'SUPPORT_ALREADY_LOST',
  'RESISTANCE_ALREADY_RECLAIMED',
] as const;
export type CreditSpreadBlocker = (typeof CREDIT_SPREAD_BLOCKERS)[number];

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

export interface BounceStateInput {
  changePercent: number;
  volumeRatio20: number;
  closeLocationValue: number;
  lowerWickRatio: number;
  heldEma20: boolean;
  heldEma50: boolean;
  heldPrior20Low: boolean;
}

export interface StrategyOptionQuote {
  optionType: CreditSpreadOptionType;
  strike: number;
  delta?: number | null;
  bid: number;
  ask: number;
  openInterest: number;
  volume: number;
}

export interface EstimateOptionDeltaInput {
  spotPrice: number;
  strike: number;
  dte: number;
  optionType: CreditSpreadOptionType;
}

export interface SelectBearCallCreditTemplateInput {
  spotPrice: number;
  anchorLevel: number;
  expiryISO: string;
  options: StrategyOptionQuote[];
  widthCandidates: number[];
  dte: number;
}

export interface SelectBullPutCreditTemplateInput {
  spotPrice: number;
  anchorLevel: number;
  expiryISO: string;
  options: StrategyOptionQuote[];
  widthCandidates: number[];
  dte: number;
}

export interface CreditSpreadTemplate {
  strategyType: CreditSpreadStrategyType;
  shortLegType: CreditSpreadOptionType;
  longLegType: CreditSpreadOptionType;
  expiryISO: string;
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

export interface CreditSpreadCandidate {
  strategyType: CreditSpreadStrategyType;
  direction: CreditSpreadDirection;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  score: number;
  setupState: CreditSpreadSetupState;
  structureScore: number;
  macroScore: number;
  valueBias: number;
  anchorType: CreditSpreadAnchorType;
  anchorLevel: number;
  invalidationPrice: number;
  volumeRatio20: number;
  closeLocationValue: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  eventTags: string[];
  thesis: string[];
  blockers: CreditSpreadBlocker[];
  watchlistReasons: string[];
  spreadTemplate: CreditSpreadTemplate | null;
  dte: number | null;
  sector?: string;
  industry?: string;
}

export interface CreditSpreadStrategyFilters {
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  targetDteMin: number;
  targetDteMax: number;
}

export interface CreditSpreadStrategySnapshot {
  generatedAt: string;
  strategyType: CreditSpreadStrategyType;
  macro: MacroSnapshot | null;
  filters: CreditSpreadStrategyFilters;
  candidates: CreditSpreadCandidate[];
}

export interface CreditSpreadSymbolInput {
  chart: StrategyDailyBar[];
  callOptions: StrategyOptionQuote[];
  putOptions: StrategyOptionQuote[];
  dte?: number | null;
  expiryISO?: string | null;
  anchorLevel?: number;
  structureResistance?: number;
  structureSupport?: number;
  valueScore?: number | null;
  sector?: string;
  industry?: string;
  earningsDays?: number | null;
  recentEventDays?: number | null;
  eventTags?: string[];
}

export type CallOptionQuote = StrategyOptionQuote;
export type EstimateCallDeltaInput = EstimateOptionDeltaInput;
export type SelectCallCreditTemplateInput = SelectBearCallCreditTemplateInput;
export type CallCreditTemplate = CreditSpreadTemplate;
export type CallCreditSetupState = CreditSpreadSetupState;
export type CallCreditCandidate = CreditSpreadCandidate;
export type CallCreditStrategyFilters = CreditSpreadStrategyFilters;
export type CallCreditStrategySnapshot = CreditSpreadStrategySnapshot;
export type CallCreditSymbolInput = CreditSpreadSymbolInput;
