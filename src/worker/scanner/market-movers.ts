
export type MoverType = 'gainers' | 'losers' | 'active';

export interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
}

const CATEGORY_MAP: Record<MoverType, string> = {
  gainers: 'day_gainers',
  losers: 'day_losers',
  active: 'most_actives'
};

export async function fetchMarketMovers(type: MoverType = 'active', limit: number = 10): Promise<MarketMover[]> {
  const category = CATEGORY_MAP[type];
  const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${category}&count=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "*/*",
        "Origin": "https://finance.yahoo.com",
        "Referer": "https://finance.yahoo.com/markets/stocks/gainers/"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch market movers: ${response.statusText}`);
    }

    const data = await response.json();
    const result = data?.finance?.result?.[0];
    const quotes = result?.quotes || [];

    return quotes.map((q: any) => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || 'N/A',
      price: q.regularMarketPrice || 0,
      changePercent: q.regularMarketChangePercent || 0,
      volume: q.regularMarketVolume || 0
    }));

  } catch (error) {
    console.error(`Error fetching market movers (${type}):`, error);
    return [];
  }
}
