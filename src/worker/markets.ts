export type MarketRegion = 'US' | 'CN';

const CHINA_SUFFIXES = ['.SS', '.SZ'];

export function detectMarketFromSymbol(symbol?: string | null): MarketRegion {
  if (!symbol) {
    return 'US';
  }
  const upper = symbol.toUpperCase();
  return CHINA_SUFFIXES.some((suffix) => upper.endsWith(suffix)) ? 'CN' : 'US';
}

export function isChinaSymbol(symbol?: string | null): boolean {
  return detectMarketFromSymbol(symbol) === 'CN';
}

export function stripMarketSuffix(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (isChinaSymbol(upper)) {
    return upper.replace(/\.(SS|SZ)$/i, '');
  }
  return upper;
}
