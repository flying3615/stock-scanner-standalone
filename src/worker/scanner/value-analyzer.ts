
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface ValueScore {
    symbol: string;
    price: number;
    score: number;
    metrics: {
        pb: number;
        pe: number;
        roe: number;
        profitMargin: number;
        debtToEquity: number;
    };
    reasons: string[];
}

export async function analyzeStockValue(symbol: string): Promise<ValueScore | null> {
    try {
        const quote = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'defaultKeyStatistics', 'price', 'summaryDetail']
        });

        const financialData = quote.financialData;
        const keyStats = quote.defaultKeyStatistics;
        const priceData = quote.price;
        const summaryDetail = quote.summaryDetail;

        if (!financialData || !keyStats || !priceData) {
            console.warn(`Insufficient data for ${symbol}`);
            return null;
        }

        const price = priceData.regularMarketPrice || 0;
        const pb = keyStats.priceToBook || 0;

        // Use trailing PE from summaryDetail, fallback to forward PE or defaults
        const pe = summaryDetail?.trailingPE || summaryDetail?.forwardPE || 999;

        // Yahoo often returns 0.15 for 15%
        const roe = (financialData.returnOnEquity || 0) * 100;
        const profitMargin = (financialData.profitMargins || 0) * 100;
        const debtToEquity = (financialData.debtToEquity || 999);

        let score = 0;
        const reasons: string[] = [];

        // 1. Valuation (P/B)
        if (pb > 0 && pb < 1.5) {
            score += 2;
            reasons.push("P/B Extremely Low");
        } else if (pb > 0 && pb < 3.0) {
            score += 1;
        }

        // 2. Valuation (P/E)
        if (pe > 0 && pe < 15) {
            score += 1;
            reasons.push("P/E Cheap");
        } else if (pe > 50) {
            score -= 1;
            reasons.push("Overvalued");
        }

        // 3. Quality (ROE)
        if (roe > 15) {
            score += 2;
            reasons.push("High ROE");
        } else if (roe < 5) {
            score -= 1;
            reasons.push("Low ROE");
        }

        // 4. Quality (Margin)
        if (profitMargin > 20) {
            score += 1;
            reasons.push("High Margin");
        }

        // 5. Risk (Debt)
        if (debtToEquity > 200) {
            score -= 1;
            reasons.push("High Debt");
        }

        return {
            symbol,
            price,
            score,
            metrics: {
                pb,
                pe,
                roe,
                profitMargin,
                debtToEquity
            },
            reasons
        };

    } catch (error) {
        console.error(`Error analyzing value for ${symbol}:`, error);
        return null;
    }
}
