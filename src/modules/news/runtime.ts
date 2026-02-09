import path from 'node:path';
import { createFinancialJuiceClient, type FinancialJuiceClient } from './financial-juice-client.js';
import { JsonFileKvStore } from './kv-store.js';
import { createFinancialJuiceTokenManager } from './token-manager.js';
import {
  createCommandTokenRefresher,
  createDisabledTokenRefresher,
  createEnvTokenRefresher,
  createFinancialJuiceBrowserTokenRefresher
} from './token-refreshers.js';
import type { FinancialJuiceCategory, FinancialJuiceTokenState } from './types.js';
import { newsLogger } from './utils.js';

export type FinancialJuiceRefreshMode = 'browser' | 'command' | 'env' | 'manual';

export interface FinancialJuiceRuntime {
  client: FinancialJuiceClient;
  refreshMode: FinancialJuiceRefreshMode;
}

const DEFAULT_NEWS_CATEGORIES: FinancialJuiceCategory[] = ['macro', 'indices', 'equities', 'crypto'];

export function createFinancialJuiceRuntime(): FinancialJuiceRuntime {
  const refreshMode = resolveFinancialJuiceRefreshMode();
  const softTtlMs = parsePositiveInteger(process.env.FJ_TOKEN_SOFT_TTL_MINUTES, 8_640) * 60 * 1000;
  const hardTtlMs = parsePositiveInteger(process.env.FJ_TOKEN_HARD_TTL_MINUTES, 10_080) * 60 * 1000;
  const tokenStorePath = process.env.FJ_TOKEN_STORE_PATH?.trim() || path.join(process.cwd(), 'data', 'news-token-store.json');

  const refresher = buildRefresher(refreshMode, softTtlMs, hardTtlMs);
  const tokenManager = createFinancialJuiceTokenManager({
    kv: new JsonFileKvStore(tokenStorePath),
    refresher,
    softTtlMs,
    hardTtlMs
  });

  const client = createFinancialJuiceClient({
    tokenManager,
    baseUrl: process.env.FJ_BASE_URL?.trim() || undefined,
    timeOffset: process.env.FJ_TIME_OFFSET || '13',
    requestTimeoutMs: parsePositiveInteger(process.env.FJ_REQUEST_TIMEOUT_MS, 12_000),
    userAgent: process.env.FJ_USER_AGENT?.trim() || undefined
  });

  const staticToken = process.env.FJ_INFO_TOKEN?.trim();
  if (staticToken) {
    void client.setManualToken(staticToken, {
      softTtlMs,
      hardTtlMs,
      source: 'env-bootstrap'
    }).catch((error) => {
      newsLogger.warn('[FinancialJuice] Failed to bootstrap token from env', {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  newsLogger.info('[FinancialJuice] Runtime initialized', {
    refreshMode,
    tokenStorePath
  });

  return {
    client,
    refreshMode
  };
}

export function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function parsePositiveLimit(raw: string | undefined, fallback: number, max: number): number {
  const value = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(value, max);
}

export function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function parseFinancialJuiceCategory(raw: string | undefined): FinancialJuiceCategory {
  const normalized = (raw || 'macro').trim().toLowerCase();
  if (DEFAULT_NEWS_CATEGORIES.includes(normalized as FinancialJuiceCategory)) {
    return normalized as FinancialJuiceCategory;
  }
  return 'macro';
}

export function parseFinancialJuiceCategories(raw: string | undefined): FinancialJuiceCategory[] {
  const input = (raw || 'macro').trim();
  if (!input) {
    return ['macro'];
  }

  const categories = input
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is FinancialJuiceCategory => (
      item === 'macro' || item === 'indices' || item === 'equities' || item === 'crypto'
    ));

  return categories.length > 0 ? Array.from(new Set(categories)) : ['macro'];
}

export function buildTokenStatus(state: FinancialJuiceTokenState | null) {
  if (!state) {
    return {
      configured: false,
      hasToken: false
    };
  }

  const now = Date.now();
  return {
    configured: true,
    hasToken: true,
    obtainedAt: state.obtainedAt,
    softExpireAt: state.softExpireAt,
    hardExpireAt: state.hardExpireAt,
    refreshFailures: state.refreshFailures,
    lastRefreshReason: state.lastRefreshReason,
    refreshedBy: state.refreshedBy,
    msToSoftExpire: Math.max(0, state.softExpireAt - now),
    msToHardExpire: Math.max(0, state.hardExpireAt - now),
    likelyExpired: now >= state.hardExpireAt
  };
}

function resolveFinancialJuiceRefreshMode(): FinancialJuiceRefreshMode {
  const configuredMode = process.env.FJ_REFRESH_MODE?.trim().toLowerCase();
  if (configuredMode === 'browser' || configuredMode === 'command' || configuredMode === 'env' || configuredMode === 'manual') {
    return configuredMode;
  }

  const hasCredentials = !!(process.env.FJ_EMAIL?.trim() && process.env.FJ_PASSWORD?.trim());
  if (hasCredentials) {
    return 'browser';
  }
  if (process.env.FJ_TOKEN_REFRESH_COMMAND?.trim()) {
    return 'command';
  }
  if (process.env.FJ_INFO_TOKEN?.trim()) {
    return 'env';
  }
  return 'manual';
}

function buildRefresher(mode: FinancialJuiceRefreshMode, softTtlMs: number, hardTtlMs: number) {
  if (mode === 'browser') {
    return createFinancialJuiceBrowserTokenRefresher({
      getEmail: () => process.env.FJ_EMAIL,
      getPassword: () => process.env.FJ_PASSWORD,
      timeoutMs: parsePositiveInteger(process.env.FJ_LOGIN_TIMEOUT_MS, 75_000),
      settleMs: parsePositiveInteger(process.env.FJ_TOKEN_CAPTURE_TIMEOUT_MS, 20_000),
      headless: (process.env.FJ_BROWSER_HEADLESS || 'true').toLowerCase() !== 'false',
      softTtlMs,
      hardTtlMs,
      name: 'financialjuice-browser'
    });
  }

  if (mode === 'command') {
    const refreshCommand = process.env.FJ_TOKEN_REFRESH_COMMAND?.trim();
    if (!refreshCommand) {
      throw new Error('FJ_TOKEN_REFRESH_COMMAND is required when FJ_REFRESH_MODE=command');
    }
    return createCommandTokenRefresher({
      command: 'sh',
      args: ['-lc', refreshCommand],
      output: (process.env.FJ_TOKEN_REFRESH_OUTPUT || 'plain').trim().toLowerCase() === 'json' ? 'json' : 'plain',
      tokenField: process.env.FJ_TOKEN_JSON_FIELD?.trim() || 'token',
      timeoutMs: parsePositiveInteger(process.env.FJ_TOKEN_REFRESH_TIMEOUT_MS, 90_000),
      softTtlMs,
      hardTtlMs,
      name: 'financialjuice-command'
    });
  }

  if (mode === 'env') {
    return createEnvTokenRefresher({
      getToken: () => process.env.FJ_INFO_TOKEN,
      softTtlMs,
      hardTtlMs,
      name: 'financialjuice-env'
    });
  }

  return createDisabledTokenRefresher({
    name: 'financialjuice-manual',
    message: 'FinancialJuice auto refresh is disabled. Please set token via /api/news/token.'
  });
}
