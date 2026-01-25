/**
 * Shared types and utilities for the Worker.
 * Extracted from server.ts for maintainability.
 */

// Cloudflare minimal types (no external deps)
export type KVNamespace = {
  get: (
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream'
  ) => Promise<any>;
  put: (
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { expiration?: number; expirationTtl?: number; metadata?: any }
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list(): Promise<any>;
};

export interface ScheduledEvent {
  type: 'scheduled';
  scheduledTime: number;
  cron: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

export interface Env {
  STOCK_CACHE: KVNamespace;
  SCAN_SIGNAL: KVNamespace;
  TASKS: KVNamespace;
  MONITOR: KVNamespace;
  AI: any;
  POLYGON_API_KEY?: string;
}

export type UniverseType = 'sp500' | 'qqq' | 'combined';

/**
 * Option signal and aggregation types (shared between scanner and routes).
 */
export type OptionSignalLite = {
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiryISO: string;
  volume: number;
  openInterest: number;
  last: number;
  bid: number;
  ask: number;
  mid: number;
  notional: number;
  pos: number;
  direction: 'buy' | 'sell' | 'neutral';
  lastTradeISO: string;
  ageMin: number;
  // Extended fields for hedge detection
  rmp: number;
  moneyness: number;
  daysToExpiry: number;
  marketCap: number;
  notionalToMarketCap: number;
  isDeepOTMPut: boolean;
  tenorBucket: string;
  isShortTermSpec: boolean;
  isLongTermHedge: boolean;
  comboId: string;
  comboType: string;
  isComboHedge: boolean;
  isLargeOTMCall: boolean;
  hedgeScore: number;
  hedgeTags: string[];
  // New fields for enhanced signal analysis
  iv: number; // Implied volatility
  spreadPct: number; // Bid-ask spread as percentage of mid price
  traderType: 'institutional' | 'retail' | 'mixed'; // Trader classification
  spotConfirmation: 'strong' | 'weak' | 'contradiction' | null; // Spot price confirmation
  daysToEarnings: number | null; // Days until earnings announcement
  // Accuracy enhancement fields
  directionConfidence: number; // 0-1, confidence in direction judgment
  signalQuality: number; // 0-1, overall signal quality score
  comboMatchTier?: number; // 0=strict, 1=medium, 2=loose match for combos
};

export type TechnicalIndicatorsResult = {
  breakoutHigh: boolean;
  maBullish: boolean;
  ema5?: number;
  ema10?: number;
  ema20?: number;
  ema30?: number;
  ema60?: number;
  ema120?: number;
  volumeBreakout?: boolean;
  turnoverRate?: number;
  error?: string;
};

export type SymbolSentimentBase = {
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

export type PoolType = 'sp500' | 'qqq' | 'combined';

export type OptionsScanTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type ThresholdPolicy = {
  mode: 'static' | 'capratio';
  capRatio?: number;
  capMin?: number;
  capMax?: number;
  staticMinBullish?: number;
};

export type OptionsAnalysis = {
  signals: Array<{
    date: string;
    signal: 'bullish' | 'bearish' | 'neutral' | 'exit';
    description: string;
    strength: number;
  }>;
  analysis: {
    trend: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    pcrTrend: 'increasing' | 'decreasing' | 'stable';
    ivTrend: 'increasing' | 'decreasing' | 'stable';
    recentActivity: string;
  };
};

export type OptionsScanParams = {
  pool: PoolType;
  date: string; // YYYY-MM-DD
  topN: number;
  lastN?: number;
  windowMins: number;
  halfLifeMins: number;
  minBullishWindowNotional: number;
  concurrency: number;
  regularFreshWindowMins: number;
  nonRegularFreshWindowMins: number;
  chunkSize: number;
  thresholdPolicy?: ThresholdPolicy;
  // Prefilter configuration to reduce API calls
  prefilter?: {
    enabled: boolean;
    minVolume?: number; // default: 5,000,000
    minChangePercent?: number; // default: 3
    earningsWithinDays?: number; // default: 7
    alwaysInclude?: string[]; // default: ['SPY', 'QQQ', 'IWM']
    maxSymbols?: number; // default: 80
  };
};

export type OptionsScanTaskMeta = {
  id: string; // options-scan:{pool}:{date}
  status: OptionsScanTaskStatus;
  nextIndex: number;
  processedSymbols: number;
  totalSymbols: number;
  progress: number; // 0..100
  params: OptionsScanParams;
  createdAtISO: string;
  updatedAtISO: string;
  error?: string;
};

export type SymbolSummary = SymbolSentimentExtended & {
  optionsAnalysis?: OptionsAnalysis;
};

export type OptionsScanResultPayload = {
  generatedAtISO: string;
  params: OptionsScanParams;
  // symbols?: string[]; // optional to reduce size
  top: SymbolSummary[];
  last: SymbolSummary[];
  signals: Record<string, any[]>; // only TopN signals
};

export type SymbolSentimentExtended = {
  symbol: string;

  // Raw (existing base metrics)
  bullishNotional: number;
  bearishNotional: number;
  totalNotional: number;
  putNotional: number;
  callNotional: number;
  putCallRatio: number | null;
  askBias: number;
  sentiment: number;
  currentPrice: number;

  // Decayed metrics
  bullishNotionalDecayed: number;
  bearishNotionalDecayed: number;
  totalNotionalDecayed: number;
  putNotionalDecayed: number;
  callNotionalDecayed: number;
  putCallRatioDecayed: number | null;
  askBiasDecayed: number;
  sentimentDecayed: number;

  // Adjusted decayed metrics (hedge-weighted)
  bullishNotionalDecayedAdj: number;
  bearishNotionalDecayedAdj: number;
  totalNotionalDecayedAdj: number;
  putNotionalDecayedAdj: number;
  callNotionalDecayedAdj: number;
  putCallRatioDecayedAdj: number | null;
  askBiasDecayedAdj: number;
  sentimentDecayedAdj: number;

  // Window accumulation (raw, non-decayed)
  windowBullishNotionalRaw: number;
  windowBearishNotionalRaw: number;
  windowBullishOverThreshold: boolean;
  windowBullishThresholdUsed?: number; // actual threshold used (for reporting)

  // Hedge detection summaries
  hedgeSignalsCount: number;
  hedgeNotionalShare: number;
  comboHedgeShare: number;

  // Parameters echo + freshness
  windowMins: number;
  halfLifeMins: number;
  lastTradeMinAgo: number | null;
  moneyFlowStrength: number;
  // New fields for enhanced analysis
  avgIV: number; // Average implied volatility across signals
  institutionalShare: number; // Share of institutional trading (0-1)
  daysToEarnings: number | null; // Days until earnings announcement
  spotConfirmation: 'strong' | 'weak' | 'contradiction' | null; // Overall spot confirmation
};

/**
 * 蜡烛图数据
 */
export interface Candle {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export type QuoteSummary = {
  symbol: string;
  fullExchangeName: string;
  stockCode: string;
  price: {
    regularMarketPrice: number;
    regularMarketDayHigh: number;
    regularMarketDayLow: number;
    regularMarketOpen: number;
    regularMarketChangePercent: number;
    twoHundredDayAverage: number;
    fiftyDayAverage: number;
  };
  summaryDetail: {
    turnoverRate: number;
    volumeRatio: number;
    volume: number;
    marketCap: number;
    averageVolume: number;
    ROE: number;
    sharesOutstanding: number;
  };
  defaultKeyStatistics: {
    floatShares: number;
    trailingEps: number;
    forwardEps: number;
    forwardPE: number;
  };
  assetProfile: {
    industry: string;
    sector: string;
  };
  score?: number;
  breakSignal?: BreakSignal;
};

export interface BreakSignal {
  time: Date;
  type: 'support_break' | 'resistance_break' | 'bull_wick' | 'bear_wick';
  price: number;
  strength: number; // 0-100 based on volume and other factors
  breakPriceLevel: number;
}

export type Interval =
  | '1m'
  | '2m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '90m'
  | '1h'
  | '1d'
  | '5d'
  | '1wk'
  | '1mo'
  | '3mo';

export interface SupportResistanceResult {
  symbol: string;
  supportLevels: number[];
  resistanceLevels: number[];
  dynamicSupport: number | null;
  dynamicResistance: number | null;
  breakSignals: BreakSignal[];
}

export type Weight = {
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  volumeRatio: number;
  sharesOutstanding: number;
  breakoutStrength: number;
};

export type ConditionOptions = {
  shouldHigherThanAveragePriceDays?: number[];
  priceDeviationWithin?: number;
  closeToHighestWithin?: number;
  turnOverRateRange?: [min: number, max?: number];
  volumeRatioRange?: [min: number, max?: number];
  minVolume?: number;
  higherThanLast120DaysHighest?: boolean;
  maxSharesOutstanding?: number;
  bullish?: boolean;
  breakout?: boolean;
};

export type ConditionOptionsWithSrc = ConditionOptions & {
  sourceIds: string[];
};

export interface Strategy<T> {
  run(_): T;
}

export interface CompanyFundamentalsArgs {
  symbol: string;
  metrics?: ('overview' | 'income' | 'balance' | 'cash' | 'earnings')[];
}

export interface StockQueryResult {
  symbol: string;
  price: number;
  name: string;
  change: number;
  changesPercentage: number;
  exchange: string;
}

export interface FearGreedData {
  score: number;
  rating: string;
  timestamp: number;
  historical?: Array<{
    score: number;
    rating: string;
    timestamp: number;
  }>;
}

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: string;
  timestamp: Date;
}

export interface Candle {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}
