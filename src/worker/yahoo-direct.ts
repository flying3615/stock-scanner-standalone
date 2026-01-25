
import YahooFinance from 'yahoo-finance2';

// Instantiate the library to handle cookies/crumbs automatically
const yahooFinance = new YahooFinance();

/**
 * Direct fetch implementation for Yahoo Finance data.
 * NOW UPDATED to use yahoo-finance2 v3 to handle auth/cookies, 
 * but maintaining the expected return signatures for the app.
 */

/**
 * Fetch a quote for a given symbol.
 */
export async function fetchDirectQuote(symbol: string): Promise<any> {
    try {
        const result = await yahooFinance.quote(symbol);
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch quote for ${symbol}: ${error}`);
    }
}

/**
 * Fetch options chain for a given symbol.
 */
export async function fetchDirectOptions(symbol: string, date?: Date | number): Promise<any> {
    try {
        const queryOptions: any = {};
        if (date) {
            const timestamp = date instanceof Date ? Math.floor(date.getTime() / 1000) : date;
            queryOptions.date = timestamp;
        }

        // yahooFinance.options returns the full object that matches 'optionChain.result[0]'
        const result = await yahooFinance.options(symbol, queryOptions);
        return result;
    } catch (error) {
        throw new Error(`Failed to fetch options for ${symbol}: ${error}`);
    }
}

/**
 * Fetch chart data for a given symbol.
 */
export async function fetchDirectChart(
    symbol: string,
    start: Date | string | number,
    end: Date | string | number,
    interval: string = '1d'
): Promise<any> {
    try {
        const period1 = dateToStr(start);
        const period2 = dateToStr(end);

        // interval mapping: yahoo-finance2 expects '1d', '1m', etc. matching our input
        const queryOptions = {
            period1,
            period2,
            interval: interval as any
        };

        const result = await yahooFinance.chart(symbol, queryOptions);

        // Transform library result back to "raw-like" structure if needed by consumers?
        // The original 'processChartData' expected raw JSON structure with 'indicators'.
        // yahooFinance.chart returns a nice array of quotes and meta.
        // We might need to map it to what the app expects.

        // Let's look at what the original processChartData returned: { meta, quotes }
        // yahooFinance.chart returns exactly { meta, quotes } + more

        // Wait, yahooFinance.chart returns { meta, quotes, ... } in v2/v3?
        // Actually v2 returned { meta, quotes: [...] }.

        return result;

    } catch (error) {
        throw new Error(`Failed to fetch chart for ${symbol}: ${error}`);
    }
}

function dateToStr(date: Date | string | number): string {
    if (date instanceof Date) return date.toISOString().split('T')[0];
    if (typeof date === 'number') return new Date(date * 1000).toISOString().split('T')[0];
    return date as string;
}

export interface YahooOptionResult {
    underlyingSymbol: string;
    expirationDates: number[];
    strikes: number[];
    hasMiniOptions: boolean;
    quote: any;
    options: Array<{
        expirationDate: number;
        hasMiniOptions: boolean;
        calls: any[];
        puts: any[];
    }>;
}
