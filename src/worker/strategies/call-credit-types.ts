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
