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
  now?: Date;
  fetchOptionsSnapshot?: typeof fetchOptionsData;
}

export async function getNearbyOptionsChainSnapshot(
  symbol: string,
  options: GetNearbyOptionsChainSnapshotOptions = {},
): Promise<NearbyOptionsChainSnapshot> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const fetchOptionsSnapshot = options.fetchOptionsSnapshot ?? fetchOptionsData;
  const initial = await fetchOptionsSnapshot(normalizedSymbol, {
    polygonApiKey: options.polygonApiKey,
    includeQuote: true,
  });
  const now = options.now ?? new Date();
  const dteMin = options.dteMin ?? DEFAULT_DTE_MIN;
  const dteMax = options.dteMax ?? DEFAULT_DTE_MAX;
  const targetExpiries = selectTargetExpiries(initial.base, now, dteMin, dteMax);
  const optionBuckets = await loadOptionBucketsByExpiry({
    symbol: normalizedSymbol,
    initialChain: initial.base,
    targetExpiries,
    polygonApiKey: options.polygonApiKey,
    fetchOptionsSnapshot,
  });

  return buildNearbyOptionsChainSnapshot({
    symbol: normalizedSymbol,
    spot: initial.rmp || normalizeOptionalNumber(initial.base?.quote?.regularMarketPrice),
    asOf: initial.base?.quote?.regularMarketTime instanceof Date
      ? initial.base.quote.regularMarketTime
      : now,
    chain: {
      ...initial.base,
      options: optionBuckets,
    },
    dteMin,
    dteMax,
    strikesEachSide: options.strikesEachSide,
    now,
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

async function loadOptionBucketsByExpiry(input: {
  symbol: string;
  initialChain: any;
  targetExpiries: Date[];
  polygonApiKey?: string;
  fetchOptionsSnapshot: typeof fetchOptionsData;
}): Promise<any[]> {
  const bucketsByExpiry = new Map<string, any>();

  for (const option of input.initialChain?.options ?? []) {
    const expirationDate = normalizeDate(option?.expirationDate);
    if (!expirationDate) {
      continue;
    }

    bucketsByExpiry.set(expirationDate.toISOString().slice(0, 10), option);
  }

  for (const expiry of input.targetExpiries) {
    const expiryISO = expiry.toISOString().slice(0, 10);
    if (bucketsByExpiry.has(expiryISO)) {
      continue;
    }

    const fetched = await input.fetchOptionsSnapshot(input.symbol, {
      date: expiry,
      includeQuote: false,
      polygonApiKey: input.polygonApiKey,
    });
    for (const option of fetched.base?.options ?? []) {
      const expirationDate = normalizeDate(option?.expirationDate);
      if (!expirationDate) {
        continue;
      }

      bucketsByExpiry.set(expirationDate.toISOString().slice(0, 10), option);
    }
  }

  return [...bucketsByExpiry.values()];
}

function selectTargetExpiries(chain: any, now: Date, dteMin: number, dteMax: number): Date[] {
  return normalizeExpiryDates(chain?.expirationDates ?? [])
    .filter((expiry) => {
      const dte = diffCalendarDays(expiry, now);
      return dte >= dteMin && dte <= dteMax;
    })
    .sort((left, right) => left.getTime() - right.getTime());
}

function normalizeExpiryDates(values: unknown[]): Date[] {
  const expiries = values
    .map((value) => normalizeDate(value))
    .filter((value): value is Date => value !== null)
    .map((value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())));

  return [...new Map(expiries.map((value) => [value.toISOString().slice(0, 10), value])).values()];
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
