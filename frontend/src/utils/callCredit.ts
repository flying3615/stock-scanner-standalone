import type { CreditSpreadCandidate, CreditSpreadStrategyType } from '../types';

const EXPIRY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function hasActionableCreditSpreadCandidates(
  candidates: CreditSpreadCandidate[],
): boolean {
  return candidates.some((candidate) => candidate.setupState === 'ACTIONABLE');
}

export function getVisibleCreditSpreadCandidates(
  candidates: CreditSpreadCandidate[],
  showWatchlist: boolean,
): CreditSpreadCandidate[] {
  if (showWatchlist || !hasActionableCreditSpreadCandidates(candidates)) {
    return candidates;
  }

  return candidates.filter((candidate) => candidate.setupState === 'ACTIONABLE');
}

export function getDefaultSelectedCreditSpreadSymbol(
  candidates: CreditSpreadCandidate[],
  showWatchlist: boolean,
): string | null {
  return getVisibleCreditSpreadCandidates(candidates, showWatchlist)[0]?.symbol ?? null;
}

export function formatCreditSpreadTemplateHorizon(
  expiryISO: string | null | undefined,
  dte: number,
): string {
  if (!expiryISO) {
    return `${dte} DTE`;
  }

  const parsed = new Date(`${expiryISO}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return `${expiryISO} · ${dte} DTE`;
  }

  return `${EXPIRY_FORMATTER.format(parsed)} · ${dte} DTE`;
}

export function getCreditSpreadStrategyLabel(strategyType: CreditSpreadStrategyType): string {
  return strategyType === 'BEAR_CALL_CREDIT' ? 'Bear Call Credit' : 'Bull Put Credit';
}

export function getCreditSpreadAnchorLabel(candidate: CreditSpreadCandidate): string {
  return candidate.anchorType === 'RESISTANCE' ? 'Resistance' : 'Support';
}

export const hasActionableCallCreditCandidates = hasActionableCreditSpreadCandidates;
export const getVisibleCallCreditCandidates = getVisibleCreditSpreadCandidates;
export const getDefaultSelectedCallCreditSymbol = getDefaultSelectedCreditSpreadSymbol;
export const formatCallCreditTemplateHorizon = formatCreditSpreadTemplateHorizon;
