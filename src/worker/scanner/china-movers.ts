import YahooFinance from 'yahoo-finance2';
import type { MarketMover } from './market-movers.js';

const yahooFinance = new YahooFinance();

export const CHINA_SEEDS: string[] = [
  '600519.SS', // Kweichow Moutai
  '000858.SZ', // Wuliangye
  '601318.SS', // Ping An Insurance
  '300750.SZ', // CATL
  '601888.SS', // China Duty Free
  '600036.SS', // China Merchants Bank
  '600887.SS', // Yili
  '601166.SS', // Industrial Bank
  '002594.SZ', // BYD
  '000333.SZ', // Midea
  '600438.SS', // Tongwei
  '601012.SS', // LONGi
  '600900.SS', // China Yangtze Power
  '601601.SS', // China Pacific Insurance
  '000568.SZ', // Luzhou Laojiao
  '600030.SS', // CITIC Securities
  '601628.SS', // China Life
  '000651.SZ', // Gree Electric
  '000725.SZ', // BOE Technology
  '601688.SS', // Huatai Securities
];

export async function fetchChinaMovers(limit = 20): Promise<MarketMover[]> {
  try {
    const targets = CHINA_SEEDS.slice(0, Math.max(1, Math.min(limit, CHINA_SEEDS.length)));
    const quotes = await yahooFinance.quote(targets);
    const rows = Array.isArray(quotes) ? quotes : [quotes];

    return rows
      .filter((q) => !!q)
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || 'N/A',
        price: q.regularMarketPrice || 0,
        changePercent: q.regularMarketChangePercent || 0,
        volume: q.regularMarketVolume || 0,
      }));
  } catch (error) {
    console.error('[ChinaMovers] Failed to fetch China movers:', error);
    return [];
  }
}
