export type CreditSpreadStrategyType = 'BEAR_CALL_CREDIT' | 'BULL_PUT_CREDIT';

export type CreditSpreadDirection = 'BULLISH' | 'BEARISH';

export type CreditSpreadAnchorType = 'SUPPORT' | 'RESISTANCE';

export type CreditSpreadSetupState = 'ACTIONABLE' | 'WATCHLIST';

export type CreditSpreadBlockerCode =
  | 'NO_LIQUID_TEMPLATE'
  | 'INSUFFICIENT_CREDIT'
  | 'WIDE_SPREAD'
  | 'EVENT_RISK'
  | 'RISK_LIMIT'
  | 'BROKER_REJECT';

export type CreditSpreadLegAction = 'BUY' | 'SELL';

export type OptionContractSide = 'CALL' | 'PUT';

export type CreditSpreadLeg = {
  symbol: string;
  expiry: string;
  strike: number;
  putCall: OptionContractSide;
  action: CreditSpreadLegAction;
  multiplier: number;
  contractId?: string | number;
};

export function isCreditSpreadLeg(value: unknown): value is CreditSpreadLeg {
  if (!value || typeof value !== 'object') return false;

  const leg = value as Partial<CreditSpreadLeg>;
  return (
    typeof leg.symbol === 'string' &&
    typeof leg.expiry === 'string' &&
    typeof leg.strike === 'number' &&
    (leg.putCall === 'CALL' || leg.putCall === 'PUT') &&
    (leg.action === 'BUY' || leg.action === 'SELL') &&
    typeof leg.multiplier === 'number'
  );
}
