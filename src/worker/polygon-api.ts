/**
 * Polygon.io API client for options and stock data.
 * Documentation: https://polygon.io/docs/options
 */

const POLYGON_BASE_URL = 'https://api.polygon.io';

/**
 * Fetch options chain snapshot for a symbol.
 * Endpoint: GET /v3/snapshot/options/{underlyingAsset}
 * Returns all options contracts with Greeks, IV, quotes, open interest.
 */
export async function fetchPolygonOptionsChain(
    symbol: string,
    apiKey: string,
    options: {
        expirationDate?: string; // YYYY-MM-DD format
        contractType?: 'call' | 'put';
        limit?: number;
    } = {}
): Promise<PolygonOptionsResponse> {
    const params = new URLSearchParams();
    params.set('apiKey', apiKey);
    params.set('limit', String(options.limit || 250));

    if (options.expirationDate) {
        params.set('expiration_date', options.expirationDate);
    }
    if (options.contractType) {
        params.set('contract_type', options.contractType);
    }

    const url = `${POLYGON_BASE_URL}/v3/snapshot/options/${symbol}?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Polygon API error for ${symbol}: ${res.status} ${errorText}`);
    }

    const data: any = await res.json();

    if (data.status === 'ERROR') {
        throw new Error(`Polygon API error: ${data.error || 'Unknown error'}`);
    }

    return data;
}

/**
 * Fetch available expiration dates for a symbol's options.
 * Uses the contracts endpoint to get unique expiration dates.
 */
export async function fetchPolygonExpirations(
    symbol: string,
    apiKey: string
): Promise<string[]> {
    const params = new URLSearchParams();
    params.set('apiKey', apiKey);
    params.set('underlying_ticker', symbol);
    params.set('expired', 'false');
    params.set('limit', '1000');
    params.set('order', 'asc');
    params.set('sort', 'expiration_date');

    const url = `${POLYGON_BASE_URL}/v3/reference/options/contracts?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Polygon API error fetching expirations: ${res.status}`);
    }

    const data: any = await res.json();

    // Extract unique expiration dates
    const expirations = new Set<string>();
    if (data.results) {
        for (const contract of data.results) {
            if (contract.expiration_date) {
                expirations.add(contract.expiration_date);
            }
        }
    }

    return Array.from(expirations).sort();
}

/**
 * Fetch stock quote/snapshot.
 * Endpoint: GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
 */
export async function fetchPolygonQuote(
    symbol: string,
    apiKey: string
): Promise<PolygonQuote> {
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Polygon quote error for ${symbol}: ${res.status}`);
    }

    const data: any = await res.json();

    if (data.status === 'ERROR' || !data.ticker) {
        throw new Error(`Polygon quote error: ${data.error || 'No data'}`);
    }

    return data.ticker;
}

/**
 * Fetch stock aggregates (OHLCV bars) for chart data.
 * Endpoint: GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
 */
export async function fetchPolygonChart(
    symbol: string,
    apiKey: string,
    from: string, // YYYY-MM-DD
    to: string,   // YYYY-MM-DD
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month' = 'day',
    multiplier: number = 1
): Promise<PolygonChartResponse> {
    const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Polygon chart error for ${symbol}: ${res.status}`);
    }

    const data: any = await res.json();

    if (data.status === 'ERROR') {
        throw new Error(`Polygon chart error: ${data.error || 'Unknown error'}`);
    }

    // Transform to match our expected format
    const quotes = (data.results || []).map((bar: any) => ({
        date: new Date(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        vwap: bar.vw,
    }));

    return {
        ticker: data.ticker,
        queryCount: data.queryCount,
        resultsCount: data.resultsCount,
        quotes,
    };
}

/**
 * Transform Polygon options snapshot to match our app's expected structure.
 * This maps Polygon's format to what our processing logic expects.
 */
export function transformPolygonOptionsToAppFormat(
    polygonData: PolygonOptionsResponse,
    symbol: string
): any {
    const calls: any[] = [];
    const puts: any[] = [];
    const expirationDatesSet = new Set<number>();
    const strikesSet = new Set<number>();

    let underlyingPrice = 0;

    for (const result of polygonData.results || []) {
        const details = result.details;
        const greeks = result.greeks || {};
        const dayData = result.day || {};
        const lastQuote = result.last_quote || {};
        const lastTrade = result.last_trade || {};

        // Get underlying price from first result
        if (!underlyingPrice && result.underlying_asset?.price) {
            underlyingPrice = result.underlying_asset.price;
        }

        const expirationTimestamp = new Date(details.expiration_date).getTime() / 1000;
        expirationDatesSet.add(expirationTimestamp);
        strikesSet.add(details.strike_price);

        const optionContract = {
            contractSymbol: details.ticker,
            strike: details.strike_price,
            currency: 'USD',
            lastPrice: lastTrade.price || 0,
            change: dayData.change || 0,
            percentChange: dayData.change_percent || 0,
            volume: dayData.volume || 0,
            openInterest: result.open_interest || 0,
            bid: lastQuote.bid || 0,
            ask: lastQuote.ask || 0,
            contractSize: 'REGULAR',
            expiration: new Date(details.expiration_date),
            lastTradeDate: lastTrade.sip_timestamp ? new Date(lastTrade.sip_timestamp / 1000000) : null,
            impliedVolatility: result.implied_volatility || 0,
            inTheMoney: details.contract_type === 'call'
                ? underlyingPrice > details.strike_price
                : underlyingPrice < details.strike_price,
            // Greeks
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.theta,
            vega: greeks.vega,
        };

        if (details.contract_type === 'call') {
            calls.push(optionContract);
        } else {
            puts.push(optionContract);
        }
    }

    // Group by expiration
    const expirationDates = Array.from(expirationDatesSet).sort((a, b) => a - b);
    const strikes = Array.from(strikesSet).sort((a, b) => a - b);

    // Build options array grouped by expiration (matching Yahoo format)
    const optionsByExpiration: Map<number, { calls: any[], puts: any[] }> = new Map();

    for (const call of calls) {
        const expTs = new Date(call.expiration).getTime() / 1000;
        if (!optionsByExpiration.has(expTs)) {
            optionsByExpiration.set(expTs, { calls: [], puts: [] });
        }
        optionsByExpiration.get(expTs)!.calls.push(call);
    }

    for (const put of puts) {
        const expTs = new Date(put.expiration).getTime() / 1000;
        if (!optionsByExpiration.has(expTs)) {
            optionsByExpiration.set(expTs, { calls: [], puts: [] });
        }
        optionsByExpiration.get(expTs)!.puts.push(put);
    }

    const options = Array.from(optionsByExpiration.entries())
        .sort(([a], [b]) => a - b)
        .map(([expirationDate, { calls, puts }]) => ({
            expirationDate: new Date(expirationDate * 1000),
            hasMiniOptions: false,
            calls: calls.sort((a, b) => a.strike - b.strike),
            puts: puts.sort((a, b) => a.strike - b.strike),
        }));

    return {
        underlyingSymbol: symbol,
        expirationDates: expirationDates.map(ts => new Date(ts * 1000)),
        strikes,
        hasMiniOptions: false,
        quote: {
            regularMarketPrice: underlyingPrice,
            symbol,
        },
        options,
    };
}

// Type definitions
export interface PolygonOptionsResponse {
    status: string;
    request_id: string;
    results?: PolygonOptionSnapshot[];
    next_url?: string;
}

export interface PolygonOptionSnapshot {
    break_even_price?: number;
    day?: {
        change?: number;
        change_percent?: number;
        close?: number;
        high?: number;
        last_updated?: number;
        low?: number;
        open?: number;
        previous_close?: number;
        volume?: number;
        vwap?: number;
    };
    details: {
        contract_type: 'call' | 'put';
        exercise_style: string;
        expiration_date: string;
        shares_per_contract: number;
        strike_price: number;
        ticker: string;
    };
    greeks?: {
        delta?: number;
        gamma?: number;
        theta?: number;
        vega?: number;
    };
    implied_volatility?: number;
    last_quote?: {
        ask?: number;
        ask_size?: number;
        bid?: number;
        bid_size?: number;
        last_updated?: number;
        midpoint?: number;
        timeframe?: string;
    };
    last_trade?: {
        conditions?: number[];
        exchange?: number;
        price?: number;
        sip_timestamp?: number;
        size?: number;
        timeframe?: string;
    };
    open_interest?: number;
    underlying_asset?: {
        change_to_break_even?: number;
        last_updated?: number;
        price?: number;
        ticker?: string;
        timeframe?: string;
    };
}

export interface PolygonQuote {
    ticker: string;
    todaysChange?: number;
    todaysChangePerc?: number;
    updated?: number;
    day?: {
        c?: number;
        h?: number;
        l?: number;
        o?: number;
        v?: number;
        vw?: number;
    };
    lastQuote?: {
        P?: number;
        S?: number;
        p?: number;
        s?: number;
        t?: number;
    };
    lastTrade?: {
        c?: number[];
        i?: string;
        p?: number;
        s?: number;
        t?: number;
        x?: number;
    };
    min?: {
        av?: number;
        c?: number;
        h?: number;
        l?: number;
        n?: number;
        o?: number;
        t?: number;
        v?: number;
        vw?: number;
    };
    prevDay?: {
        c?: number;
        h?: number;
        l?: number;
        o?: number;
        v?: number;
        vw?: number;
    };
}

export interface PolygonChartResponse {
    ticker: string;
    queryCount: number;
    resultsCount: number;
    quotes: Array<{
        date: Date;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        vwap?: number;
    }>;
}
