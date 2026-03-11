import type { CallCreditCandidate } from '../types';

const EXPIRY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function hasActionableCallCreditCandidates(
  candidates: CallCreditCandidate[],
): boolean {
  return candidates.some((candidate) => candidate.setupState === 'ACTIONABLE');
}

export function getVisibleCallCreditCandidates(
  candidates: CallCreditCandidate[],
  showWatchlist: boolean,
): CallCreditCandidate[] {
  if (showWatchlist || !hasActionableCallCreditCandidates(candidates)) {
    return candidates;
  }

  return candidates.filter((candidate) => candidate.setupState === 'ACTIONABLE');
}

export function getDefaultSelectedCallCreditSymbol(
  candidates: CallCreditCandidate[],
  showWatchlist: boolean,
): string | null {
  return getVisibleCallCreditCandidates(candidates, showWatchlist)[0]?.symbol ?? null;
}

export function formatCallCreditTemplateHorizon(
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
