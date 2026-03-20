export type RiskConfig = {
  maxRiskPctPerTrade: number;
  maxPortfolioRiskPct: number;
  cooldownMinutes: number;
};

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPctPerTrade: 0.02,
  maxPortfolioRiskPct: 0.1,
  cooldownMinutes: 60,
};

const ENV_KEYS = {
  maxRiskPctPerTrade: 'AUTO_CREDIT_SPREAD_MAX_RISK_PCT_PER_TRADE',
  maxPortfolioRiskPct: 'AUTO_CREDIT_SPREAD_MAX_PORTFOLIO_RISK_PCT',
  cooldownMinutes: 'AUTO_CREDIT_SPREAD_COOLDOWN_MINUTES',
} as const;

export function loadRiskConfig(
  env: Record<string, string | undefined> = process.env
): RiskConfig {
  return {
    maxRiskPctPerTrade: parsePositiveNumber(
      env[ENV_KEYS.maxRiskPctPerTrade],
      DEFAULT_RISK_CONFIG.maxRiskPctPerTrade
    ),
    maxPortfolioRiskPct: parsePositiveNumber(
      env[ENV_KEYS.maxPortfolioRiskPct],
      DEFAULT_RISK_CONFIG.maxPortfolioRiskPct
    ),
    cooldownMinutes: parsePositiveInteger(
      env[ENV_KEYS.cooldownMinutes],
      DEFAULT_RISK_CONFIG.cooldownMinutes
    ),
  };
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = parsePositiveNumber(value, fallback);
  return Math.max(1, Math.floor(parsed));
}
