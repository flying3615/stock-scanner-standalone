import {
  DEFAULT_DTE_MAX,
  DEFAULT_DTE_MIN,
  DEFAULT_STRIKES_EACH_SIDE,
  type NearbyOptionRow,
  type NearbyOptionsChainSnapshot,
  type NearbyOptionsExpiryBucket,
} from './contracts.js';
import { fetchOptionsData } from '../options/fetch.js';

export interface BuildNearbyOptionsChainSnapshotInput {
  symbol: string;
  spot: number | null;
  asOf?: Date | string;
  chain: any;
  dteMin?: number;
  dteMax?: number;
  strikesEachSide?: number;
  now?: Date;
}

export interface GetNearbyOptionsChainSnapshotOptions {
  dteMin?: number;
  dteMax?: number;
  strikesEachSide?: number;
  polygonApiKey?: string;
}

export async function getNearbyOptionsChainSnapshot(
  symbol: string,
  options: GetNearbyOptionsChainSnapshotOptions = {},
): Promise<NearbyOptionsChainSnapshot> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const chain = await fetchOptionsData(normalizedSymbol, {
    polygonApiKey: options.polygonApiKey,
    includeQuote: true,
  });

  return buildNearbyOptionsChainSnapshot({
    symbol: normalizedSymbol,
    spot: chain.rmp || normalizeOptionalNumber(chain.base?.quote?.regularMarketPrice),
    asOf: chain.base?.quote?.regularMarketTime instanceof Date
      ? chain.base.quote.regularMarketTime
      : new Date(),
    chain: chain.base,
    dteMin: options.dteMin,
    dteMax: options.dteMax,
    strikesEachSide: options.strikesEachSide,
  });
}

export function buildNearbyOptionsChainSnapshot(
  input: BuildNearbyOptionsChainSnapshotInput,
): NearbyOptionsChainSnapshot {
  const asOf = normalizeAsOf(input.asOf);
  const now = input.now ?? new Date(asOf);
  const dteMin = input.dteMin ?? DEFAULT_DTE_MIN;
  const dteMax = input.dteMax ?? DEFAULT_DTE_MAX;
  const strikesEachSide = input.strikesEachSide ?? DEFAULT_STRIKES_EACH_SIDE;

  const expiries = normalizeExpiryBuckets(input.chain?.options ?? [], input.spot, strikesEachSide, now)
    .filter((bucket) => bucket.dte >= dteMin && bucket.dte <= dteMax);

  return {
    symbol: input.symbol.toUpperCase(),
    spot: normalizeOptionalNumber(input.spot),
    asOf,
    requested: {
      dteMin,
      dteMax,
      strikesEachSide,
    },
    summary: {
      selectedExpiryCount: expiries.length,
      availableExpiries: expiries.map((bucket) => bucket.expiryISO),
      atmStrike: expiries[0]?.atmStrike ?? null,
      strikeWindow: {
        belowSpot: strikesEachSide,
        aboveSpot: strikesEachSide,
      },
    },
    expiries,
  };
}

function normalizeExpiryBuckets(
  options: any[],
  spot: number | null,
  strikesEachSide: number,
  now: Date,
): NearbyOptionsExpiryBucket[] {
  return options
    .map((option) => normalizeExpiryBucket(option, spot, strikesEachSide, now))
    .filter((option): option is NearbyOptionsExpiryBucket => option !== null)
    .sort((left, right) => left.expiryISO.localeCompare(right.expiryISO));
}

function normalizeExpiryBucket(
  option: any,
  spot: number | null,
  strikesEachSide: number,
  now: Date,
): NearbyOptionsExpiryBucket | null {
  const expirationDate = normalizeDate(option?.expirationDate);
  if (!expirationDate) {
    return null;
  }

  const calls = normalizeOptionRows(option?.calls ?? []);
  const puts = normalizeOptionRows(option?.puts ?? []);
  const selectedStrikes = selectNearbyStrikes(
    dedupeSortedStrikes([
      ...calls.map((row) => row.strike),
      ...puts.map((row) => row.strike),
    ]),
    spot,
    strikesEachSide,
  );
  const strikeSet = new Set(selectedStrikes);
  const atmStrike = selectedStrikes.length > 0 ? selectAtmStrike(selectedStrikes, spot) : null;

  return {
    expiryISO: expirationDate.toISOString().slice(0, 10),
    dte: diffCalendarDays(expirationDate, now),
    atmStrike,
    calls: calls.filter((row) => strikeSet.has(row.strike)),
    puts: puts.filter((row) => strikeSet.has(row.strike)),
  };
}

function normalizeOptionRows(rows: any[]): NearbyOptionRow[] {
  return rows
    .map((row) => normalizeOptionRow(row))
    .filter((row): row is NearbyOptionRow => row !== null)
    .sort((left, right) => left.strike - right.strike);
}

function normalizeOptionRow(row: any): NearbyOptionRow | null {
  const strike = normalizeOptionalNumber(row?.strike);
  if (strike === null) {
    return null;
  }

  const bid = normalizeOptionalPrice(row?.bid);
  const ask = normalizeOptionalPrice(row?.ask);

  return {
    contractSymbol: typeof row?.contractSymbol === 'string' ? row.contractSymbol : null,
    strike,
    bid,
    ask,
    mid: deriveMid(bid, ask),
    last: normalizeOptionalPrice(row?.lastPrice ?? row?.last),
    delta: normalizeOptionalNumber(row?.delta),
    impliedVolatility: normalizeOptionalNumber(row?.impliedVolatility),
    openInterest: normalizeOptionalCount(row?.openInterest),
    volume: normalizeOptionalCount(row?.volume),
    inTheMoney: typeof row?.inTheMoney === 'boolean' ? row.inTheMoney : null,
    lastTradeDate: normalizeDate(row?.lastTradeDate)?.toISOString() ?? null,
  };
}

function selectNearbyStrikes(strikes: number[], spot: number | null, strikesEachSide: number): number[] {
  if (strikes.length === 0) {
    return [];
  }

  const atmStrike = selectAtmStrike(strikes, spot);
  const atmIndex = strikes.findIndex((strike) => strike === atmStrike);
  const start = Math.max(0, atmIndex - strikesEachSide);
  const end = Math.min(strikes.length, atmIndex + strikesEachSide + 1);

  return strikes.slice(start, end);
}

function selectAtmStrike(strikes: number[], spot: number | null): number | null {
  if (strikes.length === 0) {
    return null;
  }

  if (spot === null) {
    return strikes[Math.floor(strikes.length / 2)] ?? null;
  }

  let bestStrike = strikes[0];
  let bestDistance = Math.abs(strikes[0] - spot);
  for (const strike of strikes.slice(1)) {
    const distance = Math.abs(strike - spot);
    if (distance < bestDistance) {
      bestStrike = strike;
      bestDistance = distance;
    }
  }

  return bestStrike;
}

function dedupeSortedStrikes(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function diffCalendarDays(date: Date, now: Date): number {
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function deriveMid(bid: number | null, ask: number | null): number | null {
  if (bid !== null && ask !== null) {
    return round4((bid + ask) / 2);
  }

  if (bid !== null) {
    return bid;
  }

  if (ask !== null) {
    return ask;
  }

  return null;
}

function normalizeOptionalPrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return round4(value);
}

function normalizeOptionalCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return round4(value);
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function normalizeAsOf(value?: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
