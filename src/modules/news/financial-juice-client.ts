import { newsLogger, withRetry } from './utils.js';
import type { FinancialJuiceTokenManager } from './token-manager.js';
import type { FinancialJuiceCategory, FinancialJuiceNewsItem } from './types.js';

const DEFAULT_BASE_URL = 'https://live.financialjuice.com/FJService.asmx';
const DEFAULT_TIME_OFFSET = '13';
const DEFAULT_TIMEOUT_MS = 12_000;

const CATEGORY_TABS: Record<FinancialJuiceCategory, number> = {
  macro: 1,
  indices: 9,
  equities: 4,
  crypto: 8
};

const AUTH_ERROR_PATTERNS = [
  'invalid token',
  'token expired',
  'authentication',
  'unauthorized',
  'not authorized',
  'invalid info',
  'session expired',
  'please login'
];

interface FinancialJuiceClientConfig {
  tokenManager: FinancialJuiceTokenManager;
  baseUrl?: string;
  timeOffset?: string | number;
  requestTimeoutMs?: number;
  userAgent?: string;
}

interface FetchNewsOptions {
  limit?: number;
  category?: FinancialJuiceCategory;
}

interface SearchTickerOptions {
  limit?: number;
}

type HttpResult = {
  status: number;
  body: string;
};

export class FinancialJuiceClient {
  private readonly tokenManager: FinancialJuiceTokenManager;
  private readonly baseUrl: string;
  private readonly timeOffset: string;
  private readonly requestTimeoutMs: number;
  private readonly userAgent: string;

  constructor(config: FinancialJuiceClientConfig) {
    this.tokenManager = config.tokenManager;
    this.baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
    this.timeOffset = String(config.timeOffset ?? DEFAULT_TIME_OFFSET);
    this.requestTimeoutMs = Math.max(config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000);
    this.userAgent = config.userAgent || 'Mozilla/5.0 (Node.js; stock-scanner FinancialJuice Client)';
  }

  async fetchNews(options: FetchNewsOptions = {}): Promise<FinancialJuiceNewsItem[]> {
    const category = options.category || 'macro';
    const limit = clampLimit(options.limit, 10);
    const tabId = CATEGORY_TABS[category] ?? CATEGORY_TABS.macro;

    const data = await this.requestJson('GetPreviousNews', (token) => ({
      info: quoteToken(token),
      TimeOffset: this.timeOffset,
      tabID: String(tabId),
      oldID: '0',
      TickerID: '0',
      FeedCompanyID: '0',
      strSearch: '""',
      extraNID: '0'
    }));

    return this.mapNewsItems(data, limit);
  }

  async searchTickerNews(symbol: string, options: SearchTickerOptions = {}): Promise<FinancialJuiceNewsItem[]> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new Error('Ticker symbol is required');
    }

    const limit = clampLimit(options.limit, 10);

    let stockCodesPayload = await this.requestJson('GetStockCodes', (token) => ({
      info: quoteToken(token),
      TimeOffset: this.timeOffset,
      s: quoteToken(normalized),
      returnTickersOnly: 'false'
    }));
    let stockCodes = toArrayOfRecords(stockCodesPayload);

    // Some sessions require unquoted symbol in GetStockCodes search parameter.
    if (stockCodes.length === 0) {
      stockCodesPayload = await this.requestJson('GetStockCodes', (token) => ({
        info: quoteToken(token),
        TimeOffset: this.timeOffset,
        s: normalized,
        returnTickersOnly: 'false'
      }));
      stockCodes = toArrayOfRecords(stockCodesPayload);
    }

    const targetStock = findStockBySymbol(stockCodes, normalized);
    if (!targetStock) {
      newsLogger.warn('[FinancialJuice] Symbol lookup returned no ticker match, using headline fallback', {
        symbol: normalized
      });
      return this.searchByHeadlineFallback(normalized, limit);
    }

    const rid = readRecordFieldByKeys(targetStock, ['Rid', 'RID', 'rid', 'TickerID', 'tickerId'], '0');
    if (!rid || rid === '0') {
      newsLogger.warn('[FinancialJuice] Ticker match missing Rid, using headline fallback', {
        symbol: normalized
      });
      return this.searchByHeadlineFallback(normalized, limit);
    }

    const startupPayload = await this.requestJson('Startup', (token) => ({
      info: quoteToken(token),
      TimeOffset: this.timeOffset,
      tabID: '0',
      oldID: '0',
      TickerID: rid,
      FeedCompanyID: '0',
      strSearch: '',
      extraNID: '0'
    }));

    const startupItems = this.mapNewsItems(startupPayload, limit);
    if (startupItems.length > 0) {
      return startupItems;
    }

    newsLogger.warn('[FinancialJuice] Startup lookup returned empty, using headline fallback', {
      symbol: normalized
    });
    return this.searchByHeadlineFallback(normalized, limit);
  }

  async refreshToken() {
    return this.tokenManager.refreshToken('forced');
  }

  async getTokenState() {
    return this.tokenManager.getState();
  }

  async setManualToken(token: string, options?: { softTtlMs?: number; hardTtlMs?: number; source?: string }) {
    return this.tokenManager.setToken(token, options);
  }

  async clearToken() {
    await this.tokenManager.clearToken();
  }

  private async requestJson(
    endpoint: string,
    paramsBuilder: (token: string) => Record<string, string>
  ): Promise<unknown> {
    const token = await this.tokenManager.getValidToken({ reason: 'startup' });
    const first = await this.httpGet(endpoint, paramsBuilder(token));

    if (this.isAuthFailure(first)) {
      newsLogger.warn('[FinancialJuice] Token may be expired, forcing refresh', {
        endpoint,
        status: first.status
      });
      const refreshedToken = await this.tokenManager.getValidToken({
        forceRefresh: true,
        reason: 'auth-failed'
      });
      const second = await this.httpGet(endpoint, paramsBuilder(refreshedToken));
      this.ensureHttpSuccess(second, endpoint);
      return parseFinancialJuicePayload(second.body);
    }

    this.ensureHttpSuccess(first, endpoint);
    return parseFinancialJuicePayload(first.body);
  }

  private async httpGet(endpoint: string, params: Record<string, string>): Promise<HttpResult> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json, text/plain, */*'
          },
          signal: controller.signal
        });

        const body = await response.text();
        if (response.status >= 500) {
          throw new Error(`FinancialJuice temporary server error: ${response.status}`);
        }

        return {
          status: response.status,
          body
        };
      } finally {
        clearTimeout(timeout);
      }
    }, {
      maxRetries: 3,
      delayMs: 500,
      backoff: true
    });
  }

  private isAuthFailure(result: HttpResult): boolean {
    if (result.status === 401 || result.status === 403) {
      return true;
    }

    const normalizedBody = result.body.toLowerCase();
    return AUTH_ERROR_PATTERNS.some((pattern) => normalizedBody.includes(pattern));
  }

  private ensureHttpSuccess(result: HttpResult, endpoint: string) {
    if (result.status >= 400) {
      const preview = result.body.slice(0, 250);
      throw new Error(`[FinancialJuice] ${endpoint} request failed (${result.status}): ${preview}`);
    }
  }

  private mapNewsItems(payload: unknown, limit: number): FinancialJuiceNewsItem[] {
    const records = toArrayOfRecords(payload).slice(0, limit);
    const timestampSeed = Date.now();

    return records.map((record, index) => {
      const rawId = readRecordFieldAsString(record, 'NewsID');
      const rawTimestamp = readRecordFieldAsString(record, 'DatePublished');
      const headline = readRecordFieldAsString(record, 'Title', '');
      const category = readRecordFieldAsString(record, 'Level', 'General');
      const source = readRecordFieldAsString(record, 'FCName', 'FinancialJuice');
      const breaking = readRecordFieldAsBoolean(record, 'Breaking');

      return {
        id: rawId || `fj-${timestampSeed}-${index}`,
        timestamp: normalizeTimestamp(rawTimestamp),
        headline,
        category,
        urgency: breaking ? 5 : 3,
        source
      };
    });
  }

  private async searchByHeadlineFallback(symbol: string, limit: number): Promise<FinancialJuiceNewsItem[]> {
    const categories: FinancialJuiceCategory[] = ['equities', 'indices', 'macro', 'crypto'];
    const seen = new Set<string>();
    const matched: FinancialJuiceNewsItem[] = [];
    const scanLimit = Math.max(limit * 6, 40);

    for (const category of categories) {
      try {
        const items = await this.fetchNews({ category, limit: scanLimit });
        for (const item of items) {
          if (!headlineMentionsSymbol(item.headline, symbol)) {
            continue;
          }
          if (seen.has(item.id)) {
            continue;
          }
          seen.add(item.id);
          matched.push(item);
          if (matched.length >= limit) {
            return matched.slice(0, limit);
          }
        }
      } catch (error) {
        newsLogger.warn('[FinancialJuice] Headline fallback category scan failed', {
          symbol,
          category,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return matched.slice(0, limit);
  }
}

export function createFinancialJuiceClient(config: FinancialJuiceClientConfig): FinancialJuiceClient {
  return new FinancialJuiceClient(config);
}

function parseFinancialJuicePayload(rawResponse: string): unknown {
  const rawJson = extractJsonFromXml(rawResponse);
  if (!rawJson.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (isRecord(parsed) && 'd' in parsed) {
      const wrapped = parsed.d;
      if (typeof wrapped === 'string') {
        return JSON.parse(wrapped);
      }
      return wrapped;
    }
    return parsed;
  } catch (error) {
    const preview = rawJson.slice(0, 200);
    throw new Error(`Failed to parse FinancialJuice payload: ${error instanceof Error ? error.message : String(error)} (${preview})`);
  }
}

function extractJsonFromXml(raw: string): string {
  const xmlMatch = raw.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
  if (!xmlMatch) {
    return raw;
  }

  return decodeXmlEntities(xmlMatch[1]);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function quoteToken(token: string): string {
  return `"${token}"`;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!limit || Number.isNaN(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(limit, 200));
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeTimestamp(value: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) {
    return value;
  }
  return new Date(ts).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toArrayOfRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function readRecordFieldAsString(record: Record<string, unknown>, key: string, fallback = ''): string {
  const value = record[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function readRecordFieldByKeys(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = readRecordFieldAsString(record, key);
    if (value) {
      return value;
    }
  }
  return fallback;
}

function readRecordFieldAsBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function findStockBySymbol(records: Record<string, unknown>[], symbol: string): Record<string, unknown> | null {
  const symbolKeys = ['id', 'ID', 'symbol', 'Symbol', 'ticker', 'Ticker', 'Code', 'code'];

  const exact = records.find((item) => {
    const value = readRecordFieldByKeys(item, symbolKeys);
    return value.toUpperCase() === symbol;
  });
  if (exact) {
    return exact;
  }

  const prefixed = records.find((item) => {
    const value = readRecordFieldByKeys(item, symbolKeys).toUpperCase();
    return value.startsWith(`${symbol}.`);
  });
  if (prefixed) {
    return prefixed;
  }

  return null;
}

function headlineMentionsSymbol(headline: string, symbol: string): boolean {
  if (!headline) {
    return false;
  }
  const normalizedHeadline = headline.toUpperCase();
  if (normalizedHeadline.includes(`$${symbol}`)) {
    return true;
  }

  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plainSymbolPattern = new RegExp(`\\b${escapedSymbol}\\b`, 'i');
  return plainSymbolPattern.test(headline);
}
