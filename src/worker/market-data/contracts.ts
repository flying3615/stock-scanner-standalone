export const MARKET_DATA_INTERVALS = ['1d'] as const;
export type MarketDataInterval = (typeof MARKET_DATA_INTERVALS)[number];

export const DEFAULT_DTE_MIN = 3;
export const DEFAULT_DTE_MAX = 7;
export const DEFAULT_STRIKES_EACH_SIDE = 10;
export const DEFAULT_CHART_D1_LOOKBACK = 120;
export const NEARBY_OPTIONS_EMPTY_REASON_CODES = ['NO_EXPIRIES_IN_RANGE', 'NO_OPTION_DATA'] as const;
export type NearbyOptionsEmptyReasonCode = (typeof NEARBY_OPTIONS_EMPTY_REASON_CODES)[number];

export interface NearbyOptionRow {
  contractSymbol: string | null;
  strike: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  delta: number | null;
  impliedVolatility: number | null;
  openInterest: number | null;
  volume: number | null;
  inTheMoney: boolean | null;
  lastTradeDate: string | null;
}

export interface NearbyOptionsExpiryBucket {
  expiryISO: string;
  dte: number;
  atmStrike: number | null;
  calls: NearbyOptionRow[];
  puts: NearbyOptionRow[];
}

export interface NearbyOptionsChainSnapshot {
  symbol: string;
  spot: number | null;
  asOf: string;
  requested: {
    dteMin: number;
    dteMax: number;
    strikesEachSide: number;
  };
    summary: {
      selectedExpiryCount: number;
      availableExpiries: string[];
      atmStrike: number | null;
      strikeWindow: {
        belowSpot: number;
        aboveSpot: number;
      };
      emptyReasonCode: NearbyOptionsEmptyReasonCode | null;
    };
  expiries: NearbyOptionsExpiryBucket[];
}

export interface DailyChartBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DailyChartIndicators {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  volumeRatio20: number | null;
  closeLocationValue: number | null;
  upperWickRatio: number | null;
  lowerWickRatio: number | null;
  support: number | null;
  resistance: number | null;
}

export interface DailyChartSnapshot {
  symbol: string;
  interval: MarketDataInterval;
  asOf: string;
  requested: {
    lookback: number;
  };
  summary: {
    latestClose: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    percentChange: number | null;
    averageVolume20: number | null;
  };
  indicators: DailyChartIndicators;
  bars: DailyChartBar[];
}
