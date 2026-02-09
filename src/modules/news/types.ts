export type FinancialJuiceCategory = 'macro' | 'indices' | 'equities' | 'crypto';

export type FinancialJuiceRefreshReason =
  | 'startup'
  | 'missing'
  | 'soft-expired'
  | 'hard-expired'
  | 'auth-failed'
  | 'forced';

export interface FinancialJuiceNewsItem {
  id: string;
  timestamp: string;
  headline: string;
  category: string;
  urgency: number;
  source: string;
}

export interface FinancialJuiceTokenState {
  token: string;
  obtainedAt: number;
  softExpireAt: number;
  hardExpireAt: number;
  lastRefreshAt: number;
  refreshFailures: number;
  lastRefreshReason?: FinancialJuiceRefreshReason;
  refreshedBy?: string;
}

export interface FinancialJuiceRefreshedToken {
  token: string;
  obtainedAt?: number;
  softTtlMs?: number;
  hardTtlMs?: number;
}

export interface FinancialJuiceTokenRefresherContext {
  previousToken?: string;
  reason: FinancialJuiceRefreshReason;
}

export interface FinancialJuiceTokenRefresher {
  name: string;
  refreshToken(ctx: FinancialJuiceTokenRefresherContext): Promise<FinancialJuiceRefreshedToken>;
}
