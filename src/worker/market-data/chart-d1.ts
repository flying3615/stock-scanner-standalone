import { DEFAULT_CHART_D1_LOOKBACK, type DailyChartBar, type DailyChartSnapshot } from './contracts.js';
import {
  averageNumbers,
  calculateCloseLocationValue,
  calculateLastEma,
  calculateLowerWickRatio,
  calculateUpperWickRatio,
} from '../strategies/call-credit-helpers.js';
import { fetchDirectChart } from '../yahoo-direct.js';

export interface BuildDailyChartSnapshotInput {
  symbol: string;
  quotes: any[];
  lookback?: number;
  asOf?: Date | string;
}

export interface GetDailyChartSnapshotOptions {
  lookback?: number;
  endDate?: Date;
}

const MIN_EMA_HISTORY_BARS = 260;
const MIN_FETCH_CALENDAR_DAYS = 420;

export async function getDailyChartSnapshot(
  symbol: string,
  options: GetDailyChartSnapshotOptions = {},
): Promise<DailyChartSnapshot> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const lookback = options.lookback ?? DEFAULT_CHART_D1_LOOKBACK;
  const endDate = options.endDate ?? new Date();
  const lookbackBars = Math.max(lookback, MIN_EMA_HISTORY_BARS);
  const calendarDays = Math.max(Math.ceil(lookbackBars * 1.6), MIN_FETCH_CALENDAR_DAYS);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - calendarDays);

  const chart = await fetchDirectChart(normalizedSymbol, startDate, endDate, '1d');

  return buildDailyChartSnapshot({
    symbol: normalizedSymbol,
    quotes: Array.isArray(chart?.quotes) ? chart.quotes : [],
    lookback,
    asOf: endDate,
  });
}

export function buildDailyChartSnapshot(input: BuildDailyChartSnapshotInput): DailyChartSnapshot {
  const bars = normalizeBars(input.quotes);
  const lookback = input.lookback ?? DEFAULT_CHART_D1_LOOKBACK;
  const visibleBars = bars.slice(-lookback);
  const latest = bars.at(-1) ?? null;
  const priorBars = bars.slice(0, -1);
  const closes = bars.map((bar) => bar.close);
  const ema20 = calculateLastEma(closes, 20);
  const ema50 = calculateLastEma(closes, 50);
  const ema200 = calculateLastEma(closes, 200);
  const prior20 = priorBars.slice(-20);
  const prior10 = priorBars.slice(-10);
  const prior20Low = prior20.length > 0 ? Math.min(...prior20.map((bar) => bar.low)) : null;
  const prior10High = prior10.length > 0 ? Math.max(...prior10.map((bar) => bar.high)) : null;
  const averageVolume20 = averageNumbers(prior20.map((bar) => bar.volume).filter((volume) => volume > 0));
  const periodHigh = visibleBars.length > 0 ? Math.max(...visibleBars.map((bar) => bar.high)) : null;
  const periodLow = visibleBars.length > 0 ? Math.min(...visibleBars.map((bar) => bar.low)) : null;
  const firstVisible = visibleBars[0] ?? null;
  const percentChange = latest && firstVisible && firstVisible.close > 0
    ? round2(((latest.close - firstVisible.close) / firstVisible.close) * 100)
    : null;

  return {
    symbol: input.symbol.toUpperCase(),
    interval: '1d',
    asOf: normalizeAsOf(input.asOf),
    requested: {
      lookback,
    },
    summary: {
      latestClose: latest?.close ?? null,
      periodHigh,
      periodLow,
      percentChange,
      averageVolume20: averageVolume20 > 0 ? round2(averageVolume20) : null,
    },
    indicators: {
      ema20: roundNullable(ema20),
      ema50: roundNullable(ema50),
      ema200: roundNullable(ema200),
      volumeRatio20: latest && averageVolume20 > 0 ? round2(latest.volume / averageVolume20) : null,
      closeLocationValue: latest ? round2(calculateCloseLocationValue(latest)) : null,
      upperWickRatio: latest ? round2(calculateUpperWickRatio(latest)) : null,
      lowerWickRatio: latest ? round2(calculateLowerWickRatio(latest)) : null,
      support: roundNullable(coalesceSupport(ema20, ema50, prior20Low)),
      resistance: roundNullable(coalesceResistance(ema20, ema50, prior10High)),
    },
    bars: visibleBars,
  };
}

function normalizeBars(quotes: any[]): DailyChartBar[] {
  return quotes
    .map((quote) => normalizeBar(quote))
    .filter((bar): bar is DailyChartBar => bar !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizeBar(quote: any): DailyChartBar | null {
  const date = normalizeDate(quote?.date ?? quote?.datetime ?? quote?.timestamp);
  const open = normalizeNumber(quote?.open);
  const high = normalizeNumber(quote?.high);
  const low = normalizeNumber(quote?.low);
  const close = normalizeNumber(quote?.close);
  const volume = normalizeVolume(quote?.volume);

  if (!date || open === null || high === null || low === null || close === null || volume === null) {
    return null;
  }

  return {
    date: date.toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
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

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
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

function coalesceSupport(...values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : null;
}

function coalesceResistance(...values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round2(value);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
