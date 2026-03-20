import type { OptionsScanResult, SupportResistanceResult, OptionSignalLite } from '../shared.js';
import {
  type CreditSpreadAnchorType,
  type CreditSpreadDirection,
  type CreditSpreadStrategyType,
  type CreditSpreadLeg,
  type CreditSpreadSetupState,
} from './credit-spread-types.js';
import { type CreditSpreadLegAction, type OptionContractSide } from './credit-spread-types.js';
import type { CreditSpreadCandidate } from '../execution/types.js';

export type CreditSpreadPlannerConfig = {
  widthLadder?: number[];
  minCreditPctWidth?: number;
  minDaysToExpiry?: number;
  maxDaysToExpiry?: number;
};

export type CreditSpreadPlannerInput = {
  scan: OptionsScanResult;
  structure: SupportResistanceResult;
  config?: CreditSpreadPlannerConfig;
};

export type PlannedCreditSpreadCandidate = CreditSpreadCandidate & {
  invalidationPrice: number;
  entryReason: string;
};

const DEFAULT_WIDTH_LADDER = [1, 2, 5];
const DEFAULT_MIN_CREDIT_PCT_WIDTH = 0.2;
const DEFAULT_MIN_DTE = 3;
const DEFAULT_MAX_DTE = 7;
const STRATEGY_ORDER: CreditSpreadStrategyType[] = ['BEAR_CALL_CREDIT', 'BULL_PUT_CREDIT'];

export function planCreditSpreadCandidates(
  scan: OptionsScanResult,
  structure: SupportResistanceResult,
  config?: CreditSpreadPlannerConfig
): PlannedCreditSpreadCandidate[] {
  const widths = normalizeWidths(config?.widthLadder ?? DEFAULT_WIDTH_LADDER);
  if (widths.length === 0) return [];

  const minCreditPctWidth = config?.minCreditPctWidth ?? DEFAULT_MIN_CREDIT_PCT_WIDTH;
  const minDaysToExpiry = config?.minDaysToExpiry ?? DEFAULT_MIN_DTE;
  const maxDaysToExpiry = config?.maxDaysToExpiry ?? DEFAULT_MAX_DTE;

  return STRATEGY_ORDER.flatMap((strategyType) => {
    const candidate = selectCandidateForStrategy(strategyType, scan, structure, widths, {
      minCreditPctWidth,
      minDaysToExpiry,
      maxDaysToExpiry,
    });
    return candidate ? [candidate] : [];
  });
}

function selectCandidateForStrategy(
  strategyType: CreditSpreadStrategyType,
  scan: OptionsScanResult,
  structure: SupportResistanceResult,
  widths: number[],
  thresholds: {
    minCreditPctWidth: number;
    minDaysToExpiry: number;
    maxDaysToExpiry: number;
  }
): PlannedCreditSpreadCandidate | null {
  const side: OptionContractSide = strategyType === 'BEAR_CALL_CREDIT' ? 'CALL' : 'PUT';
  const reference = resolveStructureReference(strategyType, structure);
  if (!Number.isFinite(reference)) return null;

  const expiryGroups = groupSignalsByExpiry(
    scan.signals.filter(
      (signal) =>
        typeof signal.daysToExpiry === 'number' &&
        Number.isFinite(signal.daysToExpiry) &&
        signal.type === side.toLowerCase() &&
        signal.daysToExpiry >= thresholds.minDaysToExpiry &&
        signal.daysToExpiry <= thresholds.maxDaysToExpiry
    )
  );

  const expiries = Object.keys(expiryGroups).sort();
  for (const expiryISO of expiries) {
    const shortList = sortLegCandidates(expiryGroups[expiryISO], side);
    const candidate = buildCandidateForExpiry(
      strategyType,
      scan.symbol,
      expiryISO,
      reference,
      shortList,
      widths,
      thresholds.minCreditPctWidth
    );
    if (candidate) return candidate;
  }

  return null;
}

function buildCandidateForExpiry(
  strategyType: CreditSpreadStrategyType,
  symbol: string,
  expiryISO: string,
  reference: number,
  shortList: OptionSignalLite[],
  widths: number[],
  minCreditPctWidth: number
): PlannedCreditSpreadCandidate | null {
  const signalsByStrikeKey = buildStrikeIndex(shortList);

  for (const shortLeg of shortList) {
    if (!isEligibleShortLeg(strategyType, shortLeg, reference)) continue;

    for (const width of widths) {
      const longStrike = strategyType === 'BEAR_CALL_CREDIT'
        ? shortLeg.strike + width
        : shortLeg.strike - width;
      const longLeg = signalsByStrikeKey.get(strikeKey(longStrike))?.find(
        (signal) => normalizedStrike(signal.strike) === normalizedStrike(longStrike)
      );
      if (!longLeg) continue;

      const creditMid = roundTo(shortLeg.mid - longLeg.mid, 2);
      if (creditMid <= 0) continue;

      const creditPctWidth = creditMid / width;
      if (creditPctWidth < minCreditPctWidth) continue;

      const normalizedCredit = roundTo(creditMid, 2);
      const direction: CreditSpreadDirection =
        strategyType === 'BEAR_CALL_CREDIT' ? 'BEARISH' : 'BULLISH';
      const anchorType: CreditSpreadAnchorType =
        strategyType === 'BEAR_CALL_CREDIT' ? 'RESISTANCE' : 'SUPPORT';
      const setupState: CreditSpreadSetupState = 'ACTIONABLE';
      const candidate = {
        strategyType,
        symbol,
        expiryISO,
        quantity: 1,
        width,
        targetNetCredit: normalizedCredit,
        minAcceptableNetCredit: roundTo(width * minCreditPctWidth, 2),
        maxLoss: roundTo((width - normalizedCredit) * 100, 2),
        shortLeg: buildOptionLeg(shortLeg, 'SELL'),
        longLeg: buildOptionLeg(longLeg, 'BUY'),
        idempotencyKey: `${symbol}:${strategyType}:${expiryISO}:${strikeKey(shortLeg.strike)}:${strikeKey(longLeg.strike)}`,
        direction,
        anchorType,
        setupState,
        blockers: [],
        invalidationPrice:
          strategyType === 'BEAR_CALL_CREDIT'
            ? shortLeg.strike
            : reference,
        entryReason:
          strategyType === 'BEAR_CALL_CREDIT'
            ? `Short call ${shortLeg.strike} is above resistance ${reference} with ${width}-wide credit spread`
            : `Short put ${shortLeg.strike} is below support ${reference} with ${width}-wide credit spread`,
      } satisfies PlannedCreditSpreadCandidate;

      return candidate;
    }
  }

  return null;
}

function isEligibleShortLeg(
  strategyType: CreditSpreadStrategyType,
  leg: OptionSignalLite,
  reference: number
): boolean {
  return strategyType === 'BEAR_CALL_CREDIT' ? leg.strike > reference : leg.strike < reference;
}

function resolveStructureReference(
  strategyType: CreditSpreadStrategyType,
  structure: SupportResistanceResult
): number {
  if (strategyType === 'BEAR_CALL_CREDIT') {
    return structure.dynamicResistance ?? maxOrNull(structure.resistanceLevels) ?? Number.NaN;
  }

  return structure.dynamicSupport ?? minOrNull(structure.supportLevels) ?? Number.NaN;
}

function groupSignalsByExpiry(signals: OptionSignalLite[]): Record<string, OptionSignalLite[]> {
  const grouped: Record<string, OptionSignalLite[]> = {};
  for (const signal of signals) {
    if (!grouped[signal.expiryISO]) grouped[signal.expiryISO] = [];
    grouped[signal.expiryISO].push(signal);
  }
  return grouped;
}

function sortLegCandidates(signals: OptionSignalLite[], side: OptionContractSide): OptionSignalLite[] {
  return [...signals].sort((a, b) =>
    side === 'CALL' ? a.strike - b.strike : b.strike - a.strike
  );
}

function buildOptionLeg(signal: OptionSignalLite, action: CreditSpreadLegAction): CreditSpreadLeg {
  return {
    symbol: signal.symbol,
    expiry: canonicalExpiry(signal.expiryISO),
    strike: normalizedStrike(signal.strike),
    putCall: signal.type === 'call' ? 'CALL' : 'PUT',
    action,
    multiplier: 100,
  };
}

function normalizeWidths(widths: number[]): number[] {
  return [...new Set(widths.filter((width) => Number.isFinite(width) && width > 0))]
    .map((width) => roundTo(width, 2))
    .sort((a, b) => a - b);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizedStrike(value: number): number {
  return roundTo(value, 4);
}

function strikeKey(value: number): string {
  return normalizedStrike(value).toFixed(4);
}

function canonicalExpiry(expiryISO: string): string {
  const date = new Date(expiryISO);
  if (Number.isNaN(date.getTime())) {
    return expiryISO;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildStrikeIndex(signals: OptionSignalLite[]): Map<string, OptionSignalLite[]> {
  const grouped = new Map<string, OptionSignalLite[]>();
  for (const signal of signals) {
    const key = strikeKey(signal.strike);
    const list = grouped.get(key);
    if (list) {
      list.push(signal);
    } else {
      grouped.set(key, [signal]);
    }
  }

  return grouped;
}

function maxOrNull(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length > 0 ? Math.max(...filtered) : null;
}

function minOrNull(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length > 0 ? Math.min(...filtered) : null;
}
