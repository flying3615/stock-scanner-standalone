import type { RiskConfig } from './config.js';
import type {
  CreditSpreadCandidate,
  RiskCheckReasonCode,
  RiskCheckResult,
} from './types.js';

export type CreditSpreadRiskConfig = RiskConfig;

export type CreditSpreadRiskContext = {
  accountNetValue?: number | null;
  currentOpenRisk: number;
  existingPositionKeys?: Iterable<string>;
  cooldownUntilByKey?: Map<string, number> | Record<string, number>;
  nowMs?: number;
};

export type CreditSpreadRiskDecision = {
  accepted: boolean;
  quantity: number;
  candidate: CreditSpreadCandidate;
  sizedCandidate: CreditSpreadCandidate;
  riskCheck: RiskCheckResult;
};

export function evaluateCreditSpreadCandidateRisk(
  candidate: CreditSpreadCandidate,
  context: CreditSpreadRiskContext,
  config: CreditSpreadRiskConfig
): CreditSpreadRiskDecision {
  const nowMs = context.nowMs ?? Date.now();
  const accountNetValue = context.accountNetValue;

  const reasonCodes: RiskCheckReasonCode[] = [];

  if (!hasFinitePositiveNumber(accountNetValue)) {
    reasonCodes.push('ACCOUNT_NET_VALUE_MISSING');
    return buildDecision(candidate, 0, false, reasonCodes);
  }

  if (isDuplicatePositionKey(candidate.idempotencyKey, context.existingPositionKeys)) {
    reasonCodes.push('DUPLICATE_POSITION_KEY');
    return buildDecision(candidate, 0, false, reasonCodes, accountNetValue, 0, 0);
  }

  if (isCooldownActive(candidate.idempotencyKey, context.cooldownUntilByKey, nowMs)) {
    reasonCodes.push('COOLDOWN_ACTIVE');
    return buildDecision(candidate, 0, false, reasonCodes, accountNetValue, 0, 0);
  }

  const perTradeBudget = accountNetValue * config.maxRiskPctPerTrade;
  const maxAllowedRisk = roundTo(accountNetValue * config.maxPortfolioRiskPct, 2);
  const currentOpenRisk = Math.max(0, context.currentOpenRisk || 0);
  const remainingPortfolioBudget = Math.max(0, maxAllowedRisk - currentOpenRisk);
  const quantity = calculateRiskSizedQuantity(
    candidate.maxLoss,
    perTradeBudget,
    remainingPortfolioBudget
  );

  if (quantity < 1) {
    reasonCodes.push('TRADE_SIZE_TOO_SMALL');
    return buildDecision(candidate, 0, false, reasonCodes, accountNetValue, 0, maxAllowedRisk);
  }

  const reservedRisk = roundTo(candidate.maxLoss * quantity, 2);

  return buildDecision(
    candidate,
    quantity,
    true,
    [],
    accountNetValue,
    reservedRisk,
    maxAllowedRisk
  );
}

export function calculateRiskSizedQuantity(
  maxLossPerContract: number,
  perTradeBudget: number,
  remainingPortfolioBudget: number
): number {
  if (
    !hasFinitePositiveNumber(maxLossPerContract) ||
    !hasFinitePositiveNumber(perTradeBudget) ||
    !hasFinitePositiveNumber(remainingPortfolioBudget)
  ) {
    return 0;
  }

  const budget = Math.min(perTradeBudget, remainingPortfolioBudget);
  return Math.floor(budget / maxLossPerContract);
}

function buildDecision(
  candidate: CreditSpreadCandidate,
  quantity: number,
  accepted: boolean,
  reasonCodes: RiskCheckReasonCode[],
  accountNetValue?: number,
  reservedRisk?: number,
  maxAllowedRisk?: number
): CreditSpreadRiskDecision {
  const sizedCandidate = {
    ...candidate,
    quantity,
  };

  return {
    accepted,
    quantity,
    candidate,
    sizedCandidate,
    riskCheck: {
      passed: accepted,
      reasonCodes,
      accountNetValue,
      reservedRisk,
      requiredBuyingPower: reservedRisk,
      maxAllowedRisk,
    },
  };
}

function hasFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isDuplicatePositionKey(
  key: string,
  existingPositionKeys?: Iterable<string>
): boolean {
  if (!existingPositionKeys) return false;
  for (const existingKey of existingPositionKeys) {
    if (existingKey === key) return true;
  }
  return false;
}

function isCooldownActive(
  key: string,
  cooldownUntilByKey: Map<string, number> | Record<string, number> | undefined,
  nowMs: number
): boolean {
  if (!cooldownUntilByKey) return false;

  const cooldownUntil =
    cooldownUntilByKey instanceof Map
      ? cooldownUntilByKey.get(key)
      : cooldownUntilByKey[key];

  return typeof cooldownUntil === 'number' && Number.isFinite(cooldownUntil) && cooldownUntil > nowMs;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
