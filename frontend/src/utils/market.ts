import type { MarketRegion } from '../types';

const CHINA_SUFFIX_REGEX = /\.(SS|SZ)$/i;

export function stripMarketSuffix(symbol: string): string {
  return symbol.replace(CHINA_SUFFIX_REGEX, '');
}

export function formatDisplaySymbol(symbol: string, market?: MarketRegion): string {
  if (market === 'CN' || CHINA_SUFFIX_REGEX.test(symbol)) {
    return stripMarketSuffix(symbol);
  }
  return symbol;
}

export function normalizeSymbolForMarket(input: string, market: MarketRegion): string {
  const trimmed = input.trim().toUpperCase();
  if (market !== 'CN') {
    return trimmed;
  }

  if (trimmed.includes('.')) {
    return trimmed;
  }

  if (/^\d{6}$/.test(trimmed)) {
    const suffix = trimmed.startsWith('6') ? '.SS' : '.SZ';
    return `${trimmed}${suffix}`;
  }

  return trimmed;
}
