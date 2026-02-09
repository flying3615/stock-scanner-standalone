import type { KvStore } from './kv-store.js';
import { newsLogger } from './utils.js';
import type {
  FinancialJuiceRefreshReason,
  FinancialJuiceTokenRefresher,
  FinancialJuiceTokenState
} from './types.js';

const DEFAULT_STORE_KEY = 'news:financialjuice:token';
const DEFAULT_SOFT_TTL_MS = 6 * 24 * 60 * 60 * 1000;
const DEFAULT_HARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MIN_REFRESH_INTERVAL_MS = 60 * 1000;

interface TokenManagerConfig {
  kv: KvStore;
  refresher: FinancialJuiceTokenRefresher;
  storeKey?: string;
  softTtlMs?: number;
  hardTtlMs?: number;
  minRefreshIntervalMs?: number;
}

interface GetValidTokenOptions {
  forceRefresh?: boolean;
  reason?: FinancialJuiceRefreshReason;
}

interface SetTokenOptions {
  softTtlMs?: number;
  hardTtlMs?: number;
  source?: string;
}

export class FinancialJuiceTokenManager {
  private readonly kv: KvStore;
  private readonly refresher: FinancialJuiceTokenRefresher;
  private readonly storeKey: string;
  private readonly softTtlMs: number;
  private readonly hardTtlMs: number;
  private readonly minRefreshIntervalMs: number;
  private refreshPromise: Promise<FinancialJuiceTokenState> | null = null;

  constructor(config: TokenManagerConfig) {
    this.kv = config.kv;
    this.refresher = config.refresher;
    this.storeKey = config.storeKey || DEFAULT_STORE_KEY;
    this.softTtlMs = Math.max(config.softTtlMs ?? DEFAULT_SOFT_TTL_MS, 60_000);
    this.hardTtlMs = Math.max(config.hardTtlMs ?? DEFAULT_HARD_TTL_MS, this.softTtlMs + 60_000);
    this.minRefreshIntervalMs = Math.max(config.minRefreshIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS, 1_000);
  }

  async getValidToken(options: GetValidTokenOptions = {}): Promise<string> {
    const state = await this.loadState();
    const now = Date.now();

    if (options.forceRefresh) {
      const refreshed = await this.refreshToken(options.reason || 'forced');
      return refreshed.token;
    }

    if (!state?.token) {
      const refreshed = await this.refreshToken('missing');
      return refreshed.token;
    }

    if (now >= state.hardExpireAt) {
      const refreshed = await this.refreshToken('hard-expired');
      return refreshed.token;
    }

    if (now >= state.softExpireAt) {
      if (!this.refreshPromise && now - state.lastRefreshAt >= this.minRefreshIntervalMs) {
        void this.refreshToken('soft-expired').catch((error) => {
          newsLogger.warn('[FinancialJuice] Background token refresh failed', {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }
    }

    return state.token;
  }

  async refreshToken(reason: FinancialJuiceRefreshReason = 'forced'): Promise<FinancialJuiceTokenState> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh(reason).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  async getState(): Promise<FinancialJuiceTokenState | null> {
    return this.loadState();
  }

  async setToken(token: string, options: SetTokenOptions = {}): Promise<FinancialJuiceTokenState> {
    const normalized = normalizeTokenValue(token);
    if (!normalized) {
      throw new Error('Token cannot be empty');
    }

    const now = Date.now();
    const softTtlMs = Math.max(options.softTtlMs ?? this.softTtlMs, 60_000);
    const hardTtlMs = Math.max(options.hardTtlMs ?? this.hardTtlMs, softTtlMs + 60_000);

    const nextState: FinancialJuiceTokenState = {
      token: normalized,
      obtainedAt: now,
      softExpireAt: now + softTtlMs,
      hardExpireAt: now + hardTtlMs,
      lastRefreshAt: now,
      refreshFailures: 0,
      lastRefreshReason: 'forced',
      refreshedBy: options.source || 'manual'
    };

    await this.saveState(nextState);
    return nextState;
  }

  async clearToken(): Promise<void> {
    await this.kv.delete(this.storeKey);
  }

  private async performRefresh(reason: FinancialJuiceRefreshReason): Promise<FinancialJuiceTokenState> {
    const previous = await this.loadState();
    const now = Date.now();

    const forcedReasons: FinancialJuiceRefreshReason[] = ['forced', 'hard-expired', 'auth-failed', 'missing'];
    const isForced = forcedReasons.includes(reason);
    if (!isForced && previous?.token && now - previous.lastRefreshAt < this.minRefreshIntervalMs) {
      return previous;
    }

    newsLogger.info('[FinancialJuice] Refreshing token', {
      reason,
      refresher: this.refresher.name
    });

    try {
      const refreshed = await this.refresher.refreshToken({
        previousToken: previous?.token,
        reason
      });

      const token = normalizeTokenValue(refreshed.token || '');
      if (!token) {
        throw new Error('Refresher returned an empty token');
      }

      const obtainedAt = refreshed.obtainedAt ?? now;
      const softTtlMs = Math.max(refreshed.softTtlMs ?? this.softTtlMs, 60_000);
      const hardTtlMs = Math.max(refreshed.hardTtlMs ?? this.hardTtlMs, softTtlMs + 60_000);

      const nextState: FinancialJuiceTokenState = {
        token,
        obtainedAt,
        softExpireAt: obtainedAt + softTtlMs,
        hardExpireAt: obtainedAt + hardTtlMs,
        lastRefreshAt: now,
        refreshFailures: 0,
        lastRefreshReason: reason,
        refreshedBy: this.refresher.name
      };

      await this.saveState(nextState);
      newsLogger.info('[FinancialJuice] Token refresh succeeded', {
        reason,
        refresher: this.refresher.name,
        softExpireAt: nextState.softExpireAt,
        hardExpireAt: nextState.hardExpireAt
      });

      return nextState;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      newsLogger.error('[FinancialJuice] Token refresh failed', {
        reason,
        refresher: this.refresher.name,
        error: message
      });

      if (previous?.token && now < previous.hardExpireAt) {
        const degradedState: FinancialJuiceTokenState = {
          ...previous,
          lastRefreshAt: now,
          refreshFailures: previous.refreshFailures + 1,
          lastRefreshReason: reason
        };
        await this.saveState(degradedState);
        return degradedState;
      }

      throw error;
    }
  }

  private async loadState(): Promise<FinancialJuiceTokenState | null> {
    const raw = await this.kv.get(this.storeKey, 'json');
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const data = raw as Partial<FinancialJuiceTokenState>;
    if (
      typeof data.token !== 'string' ||
      typeof data.obtainedAt !== 'number' ||
      typeof data.softExpireAt !== 'number' ||
      typeof data.hardExpireAt !== 'number' ||
      typeof data.lastRefreshAt !== 'number'
    ) {
      return null;
    }

    const token = normalizeTokenValue(data.token);
    if (!token) {
      return null;
    }

    return {
      token,
      obtainedAt: data.obtainedAt,
      softExpireAt: data.softExpireAt,
      hardExpireAt: data.hardExpireAt,
      lastRefreshAt: data.lastRefreshAt,
      refreshFailures: typeof data.refreshFailures === 'number' ? data.refreshFailures : 0,
      lastRefreshReason: data.lastRefreshReason,
      refreshedBy: data.refreshedBy
    };
  }

  private async saveState(state: FinancialJuiceTokenState): Promise<void> {
    await this.kv.put(this.storeKey, JSON.stringify(state));
  }
}

export function createFinancialJuiceTokenManager(config: TokenManagerConfig): FinancialJuiceTokenManager {
  return new FinancialJuiceTokenManager(config);
}

function normalizeTokenValue(raw: string): string {
  let token = String(raw || '').trim();
  if (!token) {
    return '';
  }

  for (let i = 0; i < 2; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(token)) {
      break;
    }
    try {
      const decoded = decodeURIComponent(token);
      if (decoded === token) {
        break;
      }
      token = decoded.trim();
    } catch {
      break;
    }
  }

  token = token.replace(/^"+|"+$/g, '').trim();
  return token;
}
