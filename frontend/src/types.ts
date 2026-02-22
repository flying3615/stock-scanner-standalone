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
