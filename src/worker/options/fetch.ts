import { fetchPolygonOptionsChain, fetchPolygonQuote, transformPolygonOptionsToAppFormat } from '../polygon-api.js';
import { fetchDirectOptions, fetchDirectQuote } from '../yahoo-direct.js';
import { timeout, toNum, retry } from '../util.js';

// Timeouts (ms) to guard fetch calls
const BASE_TIMEOUT_MS = 30_000;

/**
 * Unified function to fetch options data for a symbol.
 * Uses Polygon.io as primary source if API key is available, falls back to Yahoo.
 */
export async function fetchOptionsData(
  symbol: string,
  options: {
    date?: Date;
    startDate?: Date;
    endDate?: Date;
    includeQuote?: boolean;
    debug?: boolean;
    polygonApiKey?: string; // Pass from env
  } = {}
): Promise<{
  base: any;
  rmp: number;
  marketCap: number;
  marketState: string;
  options?: any[];
}> {
  const {
    date,
    includeQuote = true,
    debug = false,
    polygonApiKey,
  } = options;

  // Try Polygon first if API key is available
  if (polygonApiKey) {
    try {
      const expirationDate = date ? date.toISOString().split('T')[0] : undefined;

      const polygonData = await retry(2, () => timeout(
        BASE_TIMEOUT_MS,
        fetchPolygonOptionsChain(symbol, polygonApiKey, { expirationDate })
      ), 2000);

      const base = transformPolygonOptionsToAppFormat(polygonData, symbol);

      let rmp = toNum(base?.quote?.regularMarketPrice, 0);
      let marketCap = 0;
      let marketState = 'REGULAR'; // Polygon doesn't provide this directly

      // If we need more quote details, fetch from Polygon quote endpoint
      if (includeQuote && rmp === 0) {
        try {
          const quote = await retry(2, () => timeout(5000, fetchPolygonQuote(symbol, polygonApiKey)), 1000);
          rmp = toNum(quote?.lastTrade?.p || quote?.day?.c, 0);
          if (quote) {
            base.quote = {
              ...base.quote,
              regularMarketPrice: rmp,
              regularMarketChange: quote.todaysChange,
              regularMarketChangePercent: quote.todaysChangePerc,
            };
          }
        } catch (e) {
          if (debug) console.log(`[fetchOptionsData] Polygon quote fallback failed for ${symbol}:`, e);
        }
      }

      if (debug) console.log(`[fetchOptionsData] Successfully fetched ${symbol} from Polygon`);
      return { base, rmp, marketCap, marketState, options: base?.options };

    } catch (e: any) {
      if (debug) console.log(`[fetchOptionsData] Polygon failed for ${symbol}, falling back to Yahoo:`, e?.message);
      // Fall through to Yahoo
    }
  }

  // Fallback to Yahoo direct fetch
  const base = await retry(3, () => timeout(
    BASE_TIMEOUT_MS,
    fetchDirectOptions(symbol, date)
  ), 2000);

  let rmp = 0;
  let marketCap = 0;
  let marketState = '';

  if (includeQuote) {
    rmp = toNum(base?.quote?.regularMarketPrice, 0);
    if (rmp === 0 || !base?.quote) {
      try {
        const quote = await retry(2, () => timeout(5000, fetchDirectQuote(symbol)), 1000);
        rmp = toNum(quote?.regularMarketPrice, 0);
        if (quote) {
          marketCap = toNum(quote?.marketCap, 0);
          marketState = (quote?.marketState as string) || '';
          if (!base.quote) base.quote = quote;
        }
      } catch (e) {
        if (debug) console.log(`[fetchOptionsData] Yahoo quote fallback failed for ${symbol}:`, e);
      }
    } else {
      marketCap = toNum(base?.quote?.marketCap, 0);
      marketState = (base?.quote?.marketState as string) || '';
    }
  }

  return { base, rmp, marketCap, marketState, options: base?.options };
}

/**
 * Fetches base options data and quote for a symbol.
 * @deprecated Use fetchOptionsData instead for more flexibility.
 */
export async function fetchBaseOptionsAndQuote(
  symbol: string,
  debug: boolean,
  polygonApiKey?: string
): Promise<{
  base: any;
  rmp: number;
  marketCap: number;
  marketState: string;
}> {
  const result = await fetchOptionsData(symbol, { includeQuote: true, debug, polygonApiKey });
  const { options, ...rest } = result;
  return rest;
}
