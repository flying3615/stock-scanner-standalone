import NodeCache from 'node-cache';
import { fetchDirectChart, fetchDirectQuote } from '../yahoo-direct.js';
import { calculateMoneyFlowStrength } from '../util.js';

const CACHE_TTL_SECONDS = 300;
const macroCache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS });

const INDEX_SYMBOLS = [
  { symbol: '^IXIC', label: 'Nasdaq Composite' },
  { symbol: '^GSPC', label: 'S&P 500' }
];

const DXY_SYMBOL = 'DX-Y.NYB';
const VIX_SYMBOL = '^VIX';

export type MacroIndexSnapshot = {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
  mfi: number;
  score: number;
  regime: string;
};

export type MacroTickerSnapshot = {
  symbol: string;
  price: number;
  changePercent: number;
  trend?: string;
  status?: string;
};

export type MacroSnapshot = {
  indices: MacroIndexSnapshot[];
  dxy: MacroTickerSnapshot;
  vix: MacroTickerSnapshot;
  overallRegime: 'RISK_ON' | 'RISK_OFF' | 'CHOPPY';
};

export async function getMacroSnapshot(force = false): Promise<MacroSnapshot> {
  if (!force) {
    const cached = macroCache.get<MacroSnapshot>('macro');
    if (cached) {
      return cached;
    }
  }

  const indices = await Promise.all(INDEX_SYMBOLS.map((cfg) => buildIndexSnapshot(cfg.symbol, cfg.label)));
  const [dxy, vix] = await Promise.all([
    buildTickerSnapshot(DXY_SYMBOL),
    buildTickerSnapshot(VIX_SYMBOL, true)
  ]);

  const overallRegime = determineOverallRegime(indices, dxy.trend || 'FLAT', vix.status || 'FLAT');

  const snapshot: MacroSnapshot = {
    indices,
    dxy,
    vix,
    overallRegime
  };

  macroCache.set('macro', snapshot);
  return snapshot;
}

async function buildIndexSnapshot(symbol: string, label: string): Promise<MacroIndexSnapshot> {
  const [quote, chart, mfi] = await Promise.all([
    fetchDirectQuote(symbol),
    fetchIndexChart(symbol),
    calculateMoneyFlowStrength(symbol, 7)
  ]);

  const price = Number(quote?.regularMarketPrice) || 0;
  const changePercent = Number(quote?.regularMarketChangePercent) || 0;

  const closes = (chart?.quotes || [])
    .map((q: any) => Number(q.close))
    .filter((value: number) => Number.isFinite(value));

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);

  let score = 0;
  if (price && ema20 && price > ema20) score += 1;
  if (price && ema50 && price > ema50) score += 1;
  if (rsi !== null) {
    if (rsi < 30) score += 1; // Oversold bounce potential
    else if (rsi > 60) score += 1; // Momentum run
  }
  if (mfi > 0) score += 1;
  if (changePercent > 0.5) score += 1;
  score = Math.min(score, 6);

  const regime = determineIndexRegime(score, changePercent);

  return {
    symbol,
    label,
    price,
    changePercent,
    mfi,
    score,
    regime
  };
}

async function buildTickerSnapshot(symbol: string, isVix = false): Promise<MacroTickerSnapshot> {
  const quote = await fetchDirectQuote(symbol);
  const price = Number(quote?.regularMarketPrice) || 0;
  const changePercent = Number(quote?.regularMarketChangePercent) || 0;
  const trend = changePercent > 0 ? 'UP' : changePercent < 0 ? 'DOWN' : 'FLAT';
  const status = isVix ? (changePercent > 0.5 ? 'RISING' : changePercent < -0.5 ? 'FALLING' : 'STABLE') : undefined;

  return {
    symbol,
    price,
    changePercent,
    trend,
    status
  };
}

async function fetchIndexChart(symbol: string) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - 3);
  return fetchDirectChart(symbol, startDate, endDate, '1d');
}

function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(values: number[], period: number): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) {
      avgGain = (avgGain * (period - 1) + delta) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - delta) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function determineIndexRegime(score: number, changePercent: number): string {
  if (score >= 4) {
    return changePercent >= 0 ? 'BULLISH_MOMENTUM' : 'BULLISH_PULLBACK';
  }
  if (score >= 2) {
    return changePercent >= 0 ? 'NEUTRAL_ACCUMULATION' : 'CHOPPY_RANGE';
  }
  return 'BEARISH_PULLBACK';
}

function determineOverallRegime(
  indices: MacroIndexSnapshot[],
  dxyTrend: string,
  vixStatus: string
): 'RISK_ON' | 'RISK_OFF' | 'CHOPPY' {
  const nasdaq = indices.find((idx) => idx.symbol === '^IXIC');
  const sp = indices.find((idx) => idx.symbol === '^GSPC');

  if (nasdaq && sp && nasdaq.score > 4 && sp.score > 4) {
    return 'RISK_ON';
  }

  if (dxyTrend === 'UP' && (vixStatus === 'RISING' || vixStatus === 'UP') && nasdaq && nasdaq.score < 2) {
    return 'RISK_OFF';
  }

  return 'CHOPPY';
}
