
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface ValueScore {
    symbol: string;
    price: number;
    score: number;
    metrics: {
        pb: number | null;
        pe: number | null;
        roe: number | null;
        profitMargin: number | null;
        debtToEquity: number | null;
        growth?: number | null;
    };
    sector?: string;
    industry?: string;
    thresholds?: SectorConfig;
    reasons: string[];
    // Search Enrichment
    name?: string;
    changePercent?: number;
    volume?: number;
}

interface SectorConfig {
    peMax: number;    // "Cheap" if below this
    peOver: number;   // "Overvalued" if above this
    pbMax: number;    // "Good value" if below this
    roeMin: number;   // "Good quality" if above this
    debtMax: number;  // "Risky" if above this (Financials handle differently)
    marginHealthy?: number;
    marginStrong?: number;
    lowDebtBonus?: number;
}

const DEFAULT_CONFIG: SectorConfig = {
    peMax: 22, peOver: 55,
    pbMax: 3.2,
    roeMin: 11,
    debtMax: 220, // 220%
    marginHealthy: 10,
    marginStrong: 25,
    lowDebtBonus: 50
};

const CHINA_ADJUSTMENT: SectorConfig = {
    peMax: 18,
    peOver: 45,
    pbMax: 2.5,
    roeMin: 9,
    debtMax: 300,
    marginHealthy: 8,
    marginStrong: 18,
    lowDebtBonus: 80
};

const SECTOR_CONFIGS: Record<string, SectorConfig> = {
    'Technology': { peMax: 40, peOver: 85, pbMax: 9.0, roeMin: 16, debtMax: 140, marginHealthy: 12, marginStrong: 24, lowDebtBonus: 60 },
    'Communication Services': { peMax: 32, peOver: 65, pbMax: 5.5, roeMin: 13, debtMax: 160, marginHealthy: 10, marginStrong: 22, lowDebtBonus: 70 },
    'Consumer Cyclical': { peMax: 28, peOver: 60, pbMax: 4.5, roeMin: 14, debtMax: 210, marginHealthy: 8, marginStrong: 18, lowDebtBonus: 80 },
    'Consumer Defensive': { peMax: 24, peOver: 50, pbMax: 4.0, roeMin: 12, debtMax: 200, marginHealthy: 9, marginStrong: 18, lowDebtBonus: 70 },
    'Industrials': { peMax: 23, peOver: 48, pbMax: 3.5, roeMin: 11, debtMax: 240, marginHealthy: 8, marginStrong: 16, lowDebtBonus: 70 },
    'Basic Materials': { peMax: 22, peOver: 45, pbMax: 3.2, roeMin: 10, debtMax: 220, marginHealthy: 12, marginStrong: 22, lowDebtBonus: 70 },
    'Financial Services': { peMax: 16, peOver: 30, pbMax: 1.8, roeMin: 9, debtMax: 600, marginHealthy: 15, marginStrong: 25, lowDebtBonus: 150 }, // Banks leverage high deposits
    'Energy': { peMax: 15, peOver: 35, pbMax: 2.5, roeMin: 12, debtMax: 150, marginHealthy: 12, marginStrong: 25, lowDebtBonus: 60 },
    'Utilities': { peMax: 22, peOver: 40, pbMax: 2.5, roeMin: 9, debtMax: 320, marginHealthy: 8, marginStrong: 15, lowDebtBonus: 120 }, // Capital intensive
    'Real Estate': { peMax: 35, peOver: 75, pbMax: 2.8, roeMin: 6, debtMax: 450, marginHealthy: 15, marginStrong: 30, lowDebtBonus: 150 }, // High debt is normal for REITs
    'Healthcare': { peMax: 30, peOver: 60, pbMax: 6.0, roeMin: 12, debtMax: 170, marginHealthy: 12, marginStrong: 22, lowDebtBonus: 80 }
};

const MAX_SCORE = 6;
const isChinaStock = (symbol: string) => symbol.toUpperCase().endsWith('.SS') || symbol.toUpperCase().endsWith('.SZ');

const clampScore = (value: number) => Math.max(0, Math.min(MAX_SCORE, Number(value.toFixed(2))));

const asPercent = (value?: number | null) => {
    if (value === undefined || value === null) {
        return null;
    }
    return value * 100;
};

export async function analyzeStockValue(symbol: string): Promise<ValueScore | null> {
    try {
        const quote = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'defaultKeyStatistics', 'price', 'summaryDetail', 'summaryProfile']
        });

        const financialData = quote.financialData;
        const keyStats = quote.defaultKeyStatistics;
        const priceData = quote.price;
        const summaryDetail = quote.summaryDetail;
        const summaryProfile = quote.summaryProfile;

        if (!financialData || !keyStats || !priceData) {
            console.warn(`Insufficient data for ${symbol}`);
            return null;
        }

        const price = priceData.regularMarketPrice || 0;
        const pb = keyStats.priceToBook ?? null;
        const sector = summaryProfile?.sector || 'Unknown';

        // Get config for sector or default
        const cfg = isChinaStock(symbol)
            ? { ...DEFAULT_CONFIG, ...CHINA_ADJUSTMENT }
            : (SECTOR_CONFIGS[sector] || DEFAULT_CONFIG);

        const trailingPE = summaryDetail?.trailingPE ?? null;
        const forwardPE = summaryDetail?.forwardPE ?? null;
        const pe = trailingPE ?? forwardPE ?? null;

        // Yahoo often returns 0.15 for 15%
        const roe = asPercent(financialData.returnOnEquity);
        const profitMargin = asPercent(financialData.profitMargins);
        const debtToEquity = financialData.debtToEquity ?? null;
        const growthRate = asPercent(financialData.earningsGrowth) ?? asPercent(financialData.revenueGrowth) ?? null;

        let score = 0;
        const reasons: string[] = [];

        const addScore = (points: number, note?: string) => {
            if (!points) {
                return;
            }
            score += points;
            if (note) {
                reasons.push(note);
            }
        };

        // 1. Valuation (P/B)
        if (pb && pb > 0) {
            if (pb <= cfg.pbMax * 0.5) {
                addScore(1, `P/B very low (${pb.toFixed(2)})`);
            } else if (pb <= cfg.pbMax) {
                addScore(0.5, `P/B attractive (<${cfg.pbMax})`);
            } else if (pb >= cfg.pbMax * 1.5) {
                addScore(-0.5, `P/B rich (>~${(cfg.pbMax * 1.5).toFixed(1)})`);
            }
        } else {
            reasons.push('P/B unavailable');
        }

        // 2. Valuation (P/E)
        if (!trailingPE && forwardPE) {
            reasons.push('Using forward P/E (no trailing EPS)');
        }
        if (pe && pe > 0) {
            if (pe <= cfg.peMax * 0.6) {
                addScore(1, `P/E cheap (${pe.toFixed(1)})`);
            } else if (pe <= cfg.peMax) {
                addScore(0.5, `P/E fair (<${cfg.peMax})`);
            } else if (pe >= cfg.peOver) {
                addScore(-0.5, `P/E stretched (>${cfg.peOver})`);
            }
        } else {
            reasons.push('P/E unavailable');
        }

        // 3. Quality (ROE)
        if (roe !== null) {
            if (roe >= cfg.roeMin * 1.25) {
                addScore(1, `ROE excellent (${roe.toFixed(1)}%)`);
            } else if (roe >= cfg.roeMin) {
                addScore(0.5, `ROE solid (>${cfg.roeMin}%)`);
            } else if (roe > 0 && roe < 2) {
                addScore(-0.5, 'ROE very low (<2%)');
            }
        } else {
            reasons.push('ROE unavailable');
        }

        // 4. Quality (Margin)
        const marginHealthy = cfg.marginHealthy ?? DEFAULT_CONFIG.marginHealthy ?? 10;
        const marginStrong = cfg.marginStrong ?? DEFAULT_CONFIG.marginStrong ?? Math.max(marginHealthy + 10, 20);
        if (profitMargin !== null) {
            if (profitMargin >= marginStrong) {
                addScore(1, `High margin (>${marginStrong}%)`);
            } else if (profitMargin >= marginHealthy) {
                addScore(0.5, `Healthy margin (>${marginHealthy}%)`);
            } else if (profitMargin < 0) {
                addScore(-0.5, 'Negative margin');
            }
        } else {
            reasons.push('Profit margin unavailable');
        }

        // 5. Risk (Debt)
        const lowDebtBonus = cfg.lowDebtBonus ?? DEFAULT_CONFIG.lowDebtBonus ?? 50;
        if (debtToEquity !== null) {
            if (debtToEquity <= lowDebtBonus && sector !== 'Financial Services') {
                addScore(1, 'Low leverage');
            } else if (debtToEquity <= cfg.debtMax) {
                addScore(0.5, 'Debt within sector norm');
            } else {
                addScore(-0.5, `High debt (>${cfg.debtMax}%)`);
            }
        } else {
            reasons.push('Debt-to-equity unavailable');
        }

        // 6. Growth (Trend)
        if (growthRate !== null) {
            if (growthRate >= 15) {
                addScore(1, `Growth strong (${growthRate.toFixed(1)}%)`);
            } else if (growthRate >= 5) {
                addScore(0.5, `Growth steady (${growthRate.toFixed(1)}%)`);
            } else if (growthRate < 0) {
                addScore(-0.5, 'Growth contracting');
            }
        } else {
            reasons.push('Growth data unavailable');
        }

        score = clampScore(score);

        return {
            symbol,
            price,
            score,
            metrics: {
                pb,
                pe,
                roe,
                profitMargin,
                debtToEquity,
                growth: growthRate
            },
            sector,
            industry: summaryProfile?.industry || undefined,
            thresholds: cfg, // Return the config used
            reasons,
            // Search Enrichment Fields
            name: quote.price?.longName || symbol,
            changePercent: quote.price?.regularMarketChangePercent ? (quote.price.regularMarketChangePercent * 100) : 0,
            volume: quote.price?.regularMarketVolume || 0
        };

    } catch (error) {
        console.error(`Error analyzing value for ${symbol}:`, error);
        return null;
    }
}
