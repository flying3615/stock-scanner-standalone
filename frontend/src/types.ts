export interface ValueMetrics {
    pb: number;
    pe: number;
    roe: number;
    profitMargin: number;
    debtToEquity: number;
}

export interface Stock {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    volume: number;
    valueScore?: number | null;
    valueMetrics?: ValueMetrics | null;
    sector?: string;
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
