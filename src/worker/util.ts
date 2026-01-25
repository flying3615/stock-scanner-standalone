// Helper function to adjust weekend dates to trading days
import { fetchDirectChart, fetchDirectQuote } from './yahoo-direct.js';
import { TechnicalIndicatorsResult } from './shared.js';

export const adjustToTradingDay = (dateStr: string): string => {
  try {
    const date = new Date(dateStr + 'T12:00:00Z'); // Use UTC noon to avoid timezone issues
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // If it's already a weekday (Monday-Friday), return as is
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return dateStr;
    }

    // If it's Saturday (6), go back 1 day to Friday
    if (dayOfWeek === 6) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    // If it's Sunday (0), go back 2 days to Friday
    else if (dayOfWeek === 0) {
      date.setUTCDate(date.getUTCDate() - 2);
    }

    // Return adjusted date in YYYY-MM-DD format
    return date.toISOString().slice(0, 10);
  } catch (error) {
    console.warn('Error adjusting date to trading day:', error);
    return dateStr; // Return original if there's an error
  }
};

// Helpers
export const toNum = (x: any, def = 0) => {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : def;
};
export const withinDays = (d: Date, maxDays: number) => {
  const now = Date.now();
  const t = d.getTime();
  if (!Number.isFinite(t)) return false;
  const days = (t - now) / 86400000;
  return days >= 0 && days <= maxDays;
};
export const minutesSince = (val: any) => {
  if (!val) return Infinity;
  const t = val instanceof Date ? val.getTime() : new Date(val).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60000;
};
export const computePos = (last: number, bid: number, ask: number) => {
  const denom = Math.max(ask - bid, 0.01);
  return (last - bid) / denom;
};
export const classify = (pos: number): 'buy' | 'sell' | 'neutral' => {
  if (pos >= 0.66) return 'buy';
  if (pos <= 0.33) return 'sell';
  return 'neutral';
};

/**
 * Calculates money flow strength over a specified period (e.g., 14 days).
 * @param symbol The stock symbol.
 * @param periodDays The number of days for the calculation period (default: 14).
 * @returns A strength value between -1 (strong outflow) and 1 (strong inflow).
 */
export async function calculateMoneyFlowStrength(
  symbol: string,
  periodDays = 7
): Promise<number> {
  try {
    // We need periodDays + 1 days of data to have a starting point for comparison.
    const historyResult = await fetchDirectChart(symbol,
      new Date(Date.now() - (periodDays + 10) * 24 * 60 * 60 * 1000),
      new Date(),
      '1d'
    );
    const history = historyResult?.quotes;

    if (!history || history.length < periodDays + 1) {
      console.warn(
        `[calculateMoneyFlowStrength] Not enough historical data for ${symbol} to calculate MFI.`,
        history.length
      );
      return 0; // Return neutral if data is insufficient
    }

    // Take the most recent (periodDays + 1) records
    const recentHistory = history.slice(-1 * (periodDays + 1));

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      const today = recentHistory[i];
      const yesterday = recentHistory[i - 1];

      const todayTypicalPrice =
        (toNum(today.high) + toNum(today.low) + toNum(today.close)) / 3;
      const yesterdayTypicalPrice =
        (toNum(yesterday.high) +
          toNum(yesterday.low) +
          toNum(yesterday.close)) /
        3;

      if (isNaN(todayTypicalPrice) || isNaN(yesterdayTypicalPrice)) {
        continue;
      }

      const moneyFlow = todayTypicalPrice * toNum(today.volume);

      if (todayTypicalPrice > yesterdayTypicalPrice) {
        positiveFlow += moneyFlow;
      } else if (todayTypicalPrice < yesterdayTypicalPrice) {
        negativeFlow += moneyFlow;
      }
    }

    const totalFlow = positiveFlow + negativeFlow;
    if (totalFlow === 0) {
      return 0; // Avoid division by zero
    }

    const netFlow = positiveFlow - negativeFlow;
    const strength = netFlow / totalFlow;

    // Ensure the result is within the [-1, 1] range
    return Math.max(-1, Math.min(1, strength));
  } catch (error: any) {
    console.warn(
      `[calculateMoneyFlowStrength] Failed to fetch or process historical data for ${symbol}. Error: ${error?.message || error
      }`
    );
    return 0; // Return neutral on any error
  }
}

// Calculate moving averages
const calculateMA = (data: number[], period: number): number[] => {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
};

// Calculate EMA
const calculateEMA = (data: number[], period: number): number[] => {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  // Start with SMA for first value
  if (data.length >= period) {
    const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(sma);

    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
      const ema =
        (data[i] - result[result.length - 1]) * multiplier +
        result[result.length - 1];
      result.push(ema);
    }
  }
  return result;
};

/**
 * Calculate technical indicators for breakout and moving average analysis
 */
export async function calculateTechnicalIndicators(
  symbol: string
): Promise<TechnicalIndicatorsResult> {
  try {
    // Get 1 year of daily data for analysis
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1);

    const chart = await fetchDirectChart(symbol,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      '1d'
    );

    if (!chart?.quotes || chart.quotes.length < 50) {
      return {
        breakoutHigh: false,
        maBullish: false,
        error: 'Insufficient data',
      };
    }

    const quotes = chart.quotes;
    const prices = quotes
      .map((q: any) => q.close)
      .filter((p: any) => p != null) as number[];

    if (prices.length < 50) {
      return {
        breakoutHigh: false,
        maBullish: false,
        error: 'Insufficient price data',
      };
    }

    // Calculate 52-week high (approximately 250 trading days, excluding current price)
    const recentPrices = prices.slice(-251, -1); // Last ~1 year excluding current
    const week52High = recentPrices.length > 0 ? Math.max(...recentPrices) : 0;

    // Current price is the latest close
    const currentPrice = prices[prices.length - 1];

    // Check breakout: current price > 52-week high
    const breakoutHigh = currentPrice > week52High;

    const ma5 = calculateMA(prices, 5);
    const ma10 = calculateMA(prices, 10);
    const ma20 = calculateMA(prices, 20);
    const ma50 = calculateMA(prices, 50);

    const ema5 = calculateEMA(prices, 5);
    const ema10 = calculateEMA(prices, 10);
    const ema20 = calculateEMA(prices, 20);
    const ema30 = calculateEMA(prices, 30);
    const ema60 = calculateEMA(prices, 60);
    const ema120 = calculateEMA(prices, 120);

    // Check if we have enough data for all MAs
    if (
      ma5.length === 0 ||
      ma10.length === 0 ||
      ma20.length === 0 ||
      ma50.length === 0
    ) {
      return {
        breakoutHigh,
        maBullish: false,
        error: 'Insufficient data for moving averages',
      };
    }

    // Get latest MAs
    const latestMA5 = ma5[ma5.length - 1];
    const latestMA10 = ma10[ma10.length - 1];
    const latestMA20 = ma20[ma20.length - 1];
    const latestMA50 = ma50[ma50.length - 1];

    // Bullish alignment: 5 > 10 > 20 > 50
    const maBullish =
      latestMA5 > latestMA10 &&
      latestMA10 > latestMA20 &&
      latestMA20 > latestMA50;

    // Get latest EMAs
    const latestEMA5 = ema5.length > 0 ? ema5[ema5.length - 1] : undefined;
    const latestEMA10 = ema10.length > 0 ? ema10[ema10.length - 1] : undefined;
    const latestEMA20 = ema20.length > 0 ? ema20[ema20.length - 1] : undefined;
    const latestEMA30 = ema30.length > 0 ? ema30[ema30.length - 1] : undefined;
    const latestEMA60 = ema60.length > 0 ? ema60[ema60.length - 1] : undefined;
    const latestEMA120 =
      ema120.length > 0 ? ema120[ema120.length - 1] : undefined;

    // Volume breakout: current volume > avg volume of last 5 days * 1.5
    let volumeBreakout = false;
    if (quotes.length >= 6) {
      const volumes = quotes
        .slice(-6, -1)
        .map((q: any) => q.volume)
        .filter((v: any) => v != null) as number[];
      if (volumes.length >= 5) {
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const currentVolume = quotes[quotes.length - 1].volume;
        if (currentVolume && currentVolume > avgVolume * 1.5) {
          volumeBreakout = true;
        }
      }
    }

    // Turnover rate (simplified as volume / market cap ratio, normalized)
    let turnoverRate = 0;
    if (quotes.length > 0) {
      const currentVolume = quotes[quotes.length - 1].volume || 0;
      // This is a simplified calculation - in reality you'd need shares outstanding
      // For now, we'll use a proxy based on volume relative to price
      turnoverRate = (currentVolume * currentPrice) / (currentPrice * 1000000); // Simplified
    }

    return {
      breakoutHigh,
      maBullish,
      ema5: latestEMA5,
      ema10: latestEMA10,
      ema20: latestEMA20,
      ema30: latestEMA30,
      ema60: latestEMA60,
      ema120: latestEMA120,
      volumeBreakout,
      turnoverRate,
    };
  } catch (error) {
    console.error(
      `Error calculating technical indicators for ${symbol}:`,
      error
    );
    return {
      breakoutHigh: false,
      maBullish: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 预热 yahoo-finance2（获取 crumb/cookie 等），降低首次高并发时的卡顿概率
 * 不抛错，超时与失败直接忽略
 */
export async function prewarmYahoo(debug = false): Promise<void> {
  try {
    if (debug) console.log('[prewarmYahoo] warming up with AAPL quote');
    await timeout(
      5_000,
      fetchDirectQuote('AAPL')
    );
    if (debug) console.log('[prewarmYahoo] done');
  } catch (e: any) {
    if (debug) console.warn('[prewarmYahoo] ignored error', e?.message || e);
  }
}

/**
 * 检查价格是否在某个水平附近
 * @param price 当前价格
 * @param level 价格水平
 * @param threshold 阈值（百分比）
 * @returns 是否在水平附近
 */
export function isNearLevel(
  price: number,
  level: number,
  threshold: number
): boolean {
  const diff = Math.abs(price - level) / level;
  return diff <= threshold;
}

/**
 * Generic batched concurrency map helper.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const partial = await Promise.all(
      batch.map((item, j) => task(item, i + j))
    );
    results.push(...partial);
  }
  return results;
}

/**
 * Stable lightweight hash for cache key signatures.
 */
export function simpleHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/**
 * A utility function to add a timeout to any promise.
 */
export function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Promise timed out'));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((reason) => {
        clearTimeout(timer);
        reject(reason);
      });
  });
}

/**
 * Retries a function with exponential backoff.
 */
export async function retry<T>(
  retries: number,
  fn: () => Promise<T>,
  delayMs = 1000,
  backoff = 2
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      // Log warning but continue
      if (i < retries - 1) {
        console.warn(
          `[retry] Attempt ${i + 1}/${retries} failed: ${e?.message || e
          }. Retrying in ${delayMs}ms...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= backoff;
      }
    }
  }
  throw lastError;
}
