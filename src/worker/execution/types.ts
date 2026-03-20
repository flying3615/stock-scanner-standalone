import {
  type CreditSpreadBlockerCode,
  type CreditSpreadAnchorType,
  type CreditSpreadDirection,
  type CreditSpreadLeg,
  type CreditSpreadSetupState,
  type CreditSpreadStrategyType,
  isCreditSpreadLeg,
} from '../strategies/credit-spread-types.js';

export type TradeIntentStatus =
  | 'DRAFT'
  | 'PENDING_PREVIEW'
  | 'PREVIEW_REJECTED'
  | 'PENDING_ENTRY'
  | 'OPEN'
  | 'PENDING_EXIT'
  | 'CANCELLED'
  | 'FAILED';

export type ManagedPositionStatus =
  | 'PENDING_ENTRY'
  | 'OPEN'
  | 'PENDING_EXIT'
  | 'CLOSED'
  | 'FAILED'
  | 'MANUAL_INTERVENTION_REQUIRED';

export type ExitPolicy = {
  takeProfitCreditPct: number;
  stopLossMultiple: number;
  forceCloseDte: number;
  maxHoldMinutes?: number;
};

export type RiskCheckReasonCode =
  | 'ACCOUNT_NET_VALUE_MISSING'
  | 'RISK_BUDGET_EXCEEDED'
  | 'BROKER_PREVIEW_REJECTED'
  | 'TRADE_SIZE_TOO_SMALL'
  | 'DUPLICATE_POSITION_KEY'
  | 'COOLDOWN_ACTIVE';

export type RiskCheckResult = {
  passed: boolean;
  reasonCodes: RiskCheckReasonCode[];
  accountNetValue?: number;
  reservedRisk?: number;
  requiredBuyingPower?: number;
  maxAllowedRisk?: number;
};

export type CreditSpreadCandidate = {
  strategyType: CreditSpreadStrategyType;
  symbol: string;
  expiryISO: string;
  quantity: number;
  width: number;
  targetNetCredit: number;
  minAcceptableNetCredit: number;
  maxLoss: number;
  shortLeg: CreditSpreadLeg;
  longLeg: CreditSpreadLeg;
  idempotencyKey: string;
  direction?: CreditSpreadDirection;
  anchorType?: CreditSpreadAnchorType;
  setupState?: CreditSpreadSetupState;
  blockers?: CreditSpreadBlockerCode[];
  exitPolicy?: ExitPolicy;
  riskCheck?: RiskCheckResult;
};

export function isCreditSpreadCandidate(value: unknown): value is CreditSpreadCandidate {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<CreditSpreadCandidate>;
  return (
    (candidate.strategyType === 'BEAR_CALL_CREDIT' || candidate.strategyType === 'BULL_PUT_CREDIT') &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.expiryISO === 'string' &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.targetNetCredit === 'number' &&
    typeof candidate.minAcceptableNetCredit === 'number' &&
    typeof candidate.maxLoss === 'number' &&
    isCreditSpreadLeg(candidate.shortLeg) &&
    isCreditSpreadLeg(candidate.longLeg) &&
    typeof candidate.idempotencyKey === 'string'
  );
}
