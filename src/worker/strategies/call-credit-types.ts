export interface StrategyCandle {
  open: number;
  high: number;
  low: number;
  close: number;
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
