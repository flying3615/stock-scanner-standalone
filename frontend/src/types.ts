export interface ValueMetrics {
    pb: number | null;
    pe: number | null;
    roe: number | null;
    profitMargin: number | null;
    debtToEquity: number | null;
    growth?: number | null;
}

export interface SectorThresholds {
    peMax: number;
    peOver: number;
    pbMax: number;
    roeMin: number;
    debtMax: number;
    marginHealthy?: number;
    marginStrong?: number;
    lowDebtBonus?: number;
}

export interface Stock {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    valueScore?: number | null;
    valueMetrics?: ValueMetrics | null;
    moneyFlowStrength?: number | null;
    sector?: string;
    industry?: string;
    thresholds?: SectorThresholds;
    reasons?: string[];
}

export interface OptionSignal {
    type: string;
    strike: number;
    expiryISO: string;
    direction: string;
    notional: number;
    directionConfidence: number;
    spotConfirmation: string | null;
}

export interface NewsItem {
    id: string;
    timestamp: string;
    headline: string;
    category: string;
    urgency: number;
    source: string;
}

export interface OptionCombo {
    strategy: string;
    description: string;
    notional: number;
    riskProfile: string;
}

export interface StockSnapshot {
    id: number;
    date: string;
    price: number;
    sentimentScore: number;
    moneyFlowStrength: number;
    combos: OptionCombo[];
}

export interface SectorStat {
    id: number;
    date: string;
    sector: string;
    stockCount: number;
    avgChange: number;
    totalVolume: number;
    leaderSymbol: string | null;
    leaderChange: number | null;
    rank: number;
}

// Enhanced sector analysis types
export interface SectorHistoryPoint {
    date: string;
    rank: number;
    avgChange: number;
    totalVolume: number;
    stockCount: number;
}

export interface EnhancedSectorData {
    sector: string;
    currentRank: number;
    avgChange: number;
    totalVolume: number;
    consecutiveTop3: number;
    leader: string | null;
    leaderChange: number | null;
    stockCount: number;
    volumeChangeRate: number | null;
    rankDelta: number | null;
    divergenceFlag: boolean;
    leaderGap: number | null;
    isHot: boolean;
    history: SectorHistoryPoint[];
}

export interface SectorSignal {
    type: 'momentum_decay' | 'volume_divergence' | 'rank_breakout' | 'sector_exhaustion' | 'emerging_sector';
    sector: string;
    severity: 'info' | 'warning' | 'alert';
    message: string;
    detail: string;
}

export interface EnhancedSectorTrends {
    sectors: EnhancedSectorData[];
    signals: SectorSignal[];
}

export interface MacroIndexSnapshot {
    symbol: string;
    label: string;
    price: number;
    changePercent: number;
    mfi: number;
    score: number;
    regime: string;
}

export interface MacroTickerSnapshot {
    symbol: string;
    price: number;
    changePercent: number;
    trend?: string;
    status?: string;
}

export interface MacroSnapshot {
    indices: MacroIndexSnapshot[];
    dxy: MacroTickerSnapshot;
    vix: MacroTickerSnapshot;
    overallRegime: 'RISK_ON' | 'RISK_OFF' | 'CHOPPY';
}

export type MarketDataInterval = '1d';

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

export type CreditSpreadStrategyType = 'BEAR_CALL_CREDIT' | 'BULL_PUT_CREDIT';
export type CreditSpreadDirection = 'BEARISH' | 'BULLISH';
export type CreditSpreadAnchorType = 'RESISTANCE' | 'SUPPORT';
export type CreditSpreadSetupState = 'ACTIONABLE' | 'WATCHLIST';
export type CreditSpreadOptionType = 'CALL' | 'PUT';
export type CreditSpreadBlocker =
    | 'MOVE_DIRECTION_CONFLICT'
    | 'BREAKDOWN_TOO_WEAK'
    | 'BOUNCE_NOT_CONFIRMED'
    | 'MACRO_NOT_ALIGNED'
    | 'NO_LIQUID_TEMPLATE'
    | 'CREDIT_TOO_THIN'
    | 'SUPPORT_ALREADY_LOST'
    | 'RESISTANCE_ALREADY_RECLAIMED';

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

export interface CreditSpreadStrategySnapshot {
    generatedAt: string;
    strategyType: CreditSpreadStrategyType;
    macro: MacroSnapshot | null;
    filters: {
        minPrice: number;
        maxPrice: number;
        minVolume: number;
        targetDteMin: number;
        targetDteMax: number;
    };
    candidates: CreditSpreadCandidate[];
}

export type CallCreditTemplate = CreditSpreadTemplate;
export type CallCreditCandidate = CreditSpreadCandidate;
export type CallCreditStrategySnapshot = CreditSpreadStrategySnapshot;
