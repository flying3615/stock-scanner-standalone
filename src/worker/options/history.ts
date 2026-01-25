import { fetchOptionsData } from './fetch.ts';

// Define a reusable type for daily aggregated data to fix type errors
export type DailyDataRecord = {
  totalVolume: number;
  totalOpenInterest: number;
  totalOiCount: number;
  callVolume: number;
  putVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callOiCount: number;
  putOiCount: number;
  ivSum: number; // Sum of (IV * Volume) for calculating weighted average
  volumeForIv: number; // Total volume of contracts with valid IV
};

// Define the structure of the data returned by our fetch functions
export type FetchedOptionsData = {
  date: string;
  totalVolume: number;
  totalOpenInterest: number;
  callVolume: number;
  putVolume: number;
  callOpenInterest: number;
  putOpenInterest: number;
  putCallRatio: number;
  weightedAverageIv: number; // Volume-weighted average Implied Volatility
};

/**
 * Fetch historical options volume and OI data for a symbol, focusing on near-term expirations.
 */
export async function fetchOptionsHistoryData(
  symbol: string,
  days: number
): Promise<Array<FetchedOptionsData>> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const { base } = await fetchOptionsData(symbol, {
    includeQuote: false,
    debug: false,
  });

  if (!base?.expirationDates) {
    throw new Error('No options data available for this symbol');
  }

  // Get all future expiration dates and select the nearest ones (e.g., up to 5)
  const now = new Date();
  const nearTermExpirations = base.expirationDates
    .map((d) => new Date(d))
    .filter((exp) => exp >= now) // Only look at future expirations
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, 5); // Select the 5 nearest-term expirations

  if (nearTermExpirations.length === 0) {
    // Fallback for symbols with no near-term future expirations, maybe search past ones.
    // For now, we'll throw an error as it's a clearer signal.
    throw new Error('No near-term future expiration dates found.');
  }

  console.log(
    `[fetchOptionsHistoryData] Focusing on ${nearTermExpirations.length} near-term expirations for ${symbol}`
  );

  // Directly call the helper function with the selected expirations
  return await fetchOptionsHistoryDataWithExpirations(
    symbol,
    startDate,
    endDate,
    nearTermExpirations
  );
}

/**
 * Helper function to process options contracts for historical data aggregation.
 */
export function processOptionsContracts(
  contracts: any[],
  startDate: Date,
  endDate: Date,
  dailyData: Record<string, DailyDataRecord>,
  type: 'call' | 'put'
): void {
  for (const contract of contracts) {
    const lastTradeDate = contract?.lastTradeDate;
    if (!lastTradeDate) continue;

    const tradeDate = new Date(lastTradeDate);
    const dateKey = tradeDate.toISOString().split('T')[0];

    if (tradeDate < startDate || tradeDate > endDate) continue;

    if (!dailyData[dateKey]) {
      dailyData[dateKey] = {
        totalVolume: 0,
        totalOpenInterest: 0,
        totalOiCount: 0,
        callVolume: 0,
        putVolume: 0,
        callOpenInterest: 0,
        putOpenInterest: 0,
        callOiCount: 0,
        putOiCount: 0,
        ivSum: 0,
        volumeForIv: 0,
      };
    }

    const volume = contract.volume || 0;
    const iv = contract.impliedVolatility || 0;

    if (type === 'call') {
      dailyData[dateKey].callVolume += volume;
      dailyData[dateKey].callOpenInterest += contract.openInterest || 0;
      dailyData[dateKey].callOiCount += 1;
    } else {
      dailyData[dateKey].putVolume += volume;
      dailyData[dateKey].putOpenInterest += contract.openInterest || 0;
      dailyData[dateKey].putOiCount += 1;
    }

    if (iv > 0 && volume > 0) {
      dailyData[dateKey].ivSum += iv * volume;
      dailyData[dateKey].volumeForIv += volume;
    }
  }
}

/**
 * Convert daily aggregated data to FetchedOptionsData format
 */
export function convertDailyDataToFetchedOptionsData(
  dailyData: Record<string, DailyDataRecord>
): FetchedOptionsData[] {
  // Convert to array and sort by date
  const result = Object.entries(dailyData)
    .map(([date, data]: [string, DailyDataRecord]) => {
      const totalVolume = data.callVolume + data.putVolume;
      const callOpenInterest =
        data.callOiCount > 0
          ? Math.round(data.callOpenInterest / data.callOiCount)
          : 0;
      const putOpenInterest =
        data.putOiCount > 0
          ? Math.round(data.putOpenInterest / data.putOiCount)
          : 0;
      const totalOpenInterest = callOpenInterest + putOpenInterest;
      const weightedAverageIv =
        data.volumeForIv > 0 ? data.ivSum / data.volumeForIv : 0;

      return {
        date,
        totalVolume,
        totalOpenInterest,
        callVolume: data.callVolume,
        putVolume: data.putVolume,
        callOpenInterest,
        putOpenInterest,
        putCallRatio:
          data.callVolume > 0 ? data.putVolume / data.callVolume : 0,
        weightedAverageIv,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Filter out today's data if it's incomplete (last day might be partial)
  const today = new Date().toISOString().split('T')[0];
  return result.filter((item) => item.date !== today);
}

/**
 * Helper function to fetch data with specific expirations
 */
async function fetchOptionsHistoryDataWithExpirations(
  symbol: string,
  startDate: Date,
  endDate: Date,
  expirations: Date[]
): Promise<Array<FetchedOptionsData>> {
  // Use the defined DailyDataRecord type to fix the type error
  const dailyData: Record<string, DailyDataRecord> = {};

  console.log(
    `[fetchOptionsHistoryDataWithExpirations] Processing ${expirations.length} expirations for ${symbol}`
  );

  for (const expDate of expirations) {
    try {
      const { options } = await fetchOptionsData(symbol, {
        date: expDate,
        includeQuote: false,
        debug: false,
      });

      if (!options) continue;

      for (const leg of options) {
        if (!Array.isArray(leg?.calls) || !Array.isArray(leg?.puts)) continue;

        // Process calls and puts using the unified helper
        processOptionsContracts(
          leg.calls,
          startDate,
          endDate,
          dailyData,
          'call'
        );
        processOptionsContracts(leg.puts, startDate, endDate, dailyData, 'put');
      }
    } catch (error) {
      console.warn(
        `Failed to fetch data for expiration ${expDate.toISOString()}:`,
        error
      );
      continue;
    }
  }

  const filteredResult = convertDailyDataToFetchedOptionsData(dailyData);

  console.log(
    `[fetchOptionsHistoryDataWithExpirations] Found ${filteredResult.length} data points`
  );

  if (filteredResult.length === 0) {
    throw new Error(
      'No historical options data found for the specified period'
    );
  }

  return filteredResult;
}

/**
 * Analyze options data for institutional activity signals
 */
export function analyzeOptionsSignals(data: Array<FetchedOptionsData>): {
  signals: Array<{
    date: string;
    signal: 'bullish' | 'bearish' | 'neutral' | 'exit';
    description: string;
    strength: number;
  }>;
  analysis: {
    trend: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    pcrTrend: 'increasing' | 'decreasing' | 'stable';
    ivTrend: 'increasing' | 'decreasing' | 'stable';
    recentActivity: string;
  };
} {
  if (data.length < 5) {
    return {
      signals: [],
      analysis: {
        trend: 'neutral',
        pcrTrend: 'stable',
        ivTrend: 'stable',
        recentActivity: '数据不足，无法分析',
      },
    };
  }

  const signals: Array<{
    date: string;
    signal: 'bullish' | 'bearish' | 'neutral' | 'exit';
    description: string;
    strength: number;
  }> = [];

  // Helper function to get percentile threshold
  function getPercentileThreshold(
    values: number[],
    percentile: number
  ): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
  }

  const totalVolumes = data.map((d) => d.totalVolume);
  const volumeThreshold = getPercentileThreshold(totalVolumes, 0.8); // 80th percentile for high volume

  // Analyze overall trends
  const recentPcr = data.slice(-5).map((d) => d.putCallRatio);
  const earlierPcr = data.slice(-10, -5).map((d) => d.putCallRatio);
  const avgRecentPcr = recentPcr.reduce((a, b) => a + b, 0) / recentPcr.length;
  const avgEarlierPcr =
    earlierPcr.length > 0
      ? earlierPcr.reduce((a, b) => a + b, 0) / earlierPcr.length
      : avgRecentPcr;

  let pcrTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (avgRecentPcr > avgEarlierPcr * 1.1) pcrTrend = 'increasing';
  if (avgRecentPcr < avgEarlierPcr * 0.9) pcrTrend = 'decreasing';

  // Analyze IV trend
  const recentIv = data.slice(-5).map((d) => d.weightedAverageIv);
  const earlierIv = data.slice(-10, -5).map((d) => d.weightedAverageIv);
  const avgRecentIv = recentIv.reduce((a, b) => a + b, 0) / recentIv.length;
  const avgEarlierIv =
    earlierIv.length > 0
      ? earlierIv.reduce((a, b) => a + b, 0) / earlierIv.length
      : avgRecentIv;

  let ivTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (avgRecentIv > avgEarlierIv * 1.1) ivTrend = 'increasing';
  if (avgRecentIv < avgEarlierIv * 0.9) ivTrend = 'decreasing';

  // Analyze each data point
  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    const isHighVolume = current.totalVolume > volumeThreshold;
    const ivIncreased =
      current.weightedAverageIv > previous.weightedAverageIv * 1.05; // IV increased by 5%

    const callOiChange =
      (current.callOpenInterest - previous.callOpenInterest) /
      (previous.callOpenInterest || 1);
    const putOiChange =
      (current.putOpenInterest - previous.putOpenInterest) /
      (previous.putOpenInterest || 1);

    let signal: 'bullish' | 'bearish' | 'neutral' | 'exit' = 'neutral';
    let description = '';
    let strength = 0;

    if (isHighVolume) {
      // Bullish: High call activity, OI increasing, especially if IV is also up
      if (current.callVolume > current.putVolume * 2.0 && callOiChange > 0.05) {
        signal = 'bullish';
        description = `看涨期权开仓显著${ivIncreased ? '，IV上升' : ''}`;
        strength = Math.min(
          1,
          callOiChange * 5 +
            (current.totalVolume / volumeThreshold) * 0.2 +
            (ivIncreased ? 0.2 : 0)
        );
      }
      // Bearish: High put activity, OI increasing, especially if IV is also up
      else if (
        current.putVolume > current.callVolume * 2.0 &&
        putOiChange > 0.05
      ) {
        signal = 'bearish';
        description = `看跌期权开仓显著${ivIncreased ? '，IV上升' : ''}`;
        strength = Math.min(
          1,
          putOiChange * 5 +
            (current.totalVolume / volumeThreshold) * 0.2 +
            (ivIncreased ? 0.2 : 0)
        );
      }
      // Exit: OI decreasing on high volume
      else if (callOiChange < -0.03 || putOiChange < -0.03) {
        signal = 'exit';
        description = '高成交量伴随OI下降，主力资金可能正在平仓离场';
        strength = Math.min(
          1,
          Math.abs(callOiChange + putOiChange) * 3 +
            (current.totalVolume / volumeThreshold) * 0.2
        );
      }
      // Neutral/Mixed: High volume but OI is flat or both sides increase
      else {
        signal = 'neutral';
        description = '成交量放大但方向不明，可能为多空换手或双边开仓';
        strength = 0.5;
      }
    }

    if (signal !== 'neutral' && strength > 0.3) {
      signals.push({
        date: current.date,
        signal,
        description,
        strength,
      });
    }
  }

  // Generate final analysis
  const lastSignal = signals[signals.length - 1];
  let trend: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
  let recentActivity = '近期无明显主力活动';

  if (lastSignal) {
    trend = lastSignal.signal === 'exit' ? 'neutral' : lastSignal.signal;
    recentActivity = lastSignal.description;
  } else if (pcrTrend === 'increasing') {
    trend = 'bearish';
    recentActivity = `近期PCR持续上升${
      ivTrend === 'increasing' ? '且IV同步走高' : ''
    }，市场情绪趋于谨慎`;
  } else if (pcrTrend === 'decreasing') {
    trend = 'bullish';
    recentActivity = `近期PCR持续下降${
      ivTrend === 'decreasing' ? '且IV同步回落' : ''
    }，市场情绪趋于乐观`;
  }

  return {
    signals,
    analysis: {
      trend,
      pcrTrend,
      ivTrend,
      recentActivity,
    },
  };
}
