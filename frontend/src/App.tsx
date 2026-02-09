import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import axios from 'axios';
import type { Stock, OptionSignal, StockSnapshot, MacroSnapshot, NewsItem } from './types';
import { StockDetailModal } from './components/StockDetailModal';
import { MoneyFlowGauge } from './components/MoneyFlowGauge';
import { SectorStats } from './components/SectorStats';
import { SectorTrendRadar } from './components/SectorTrendRadar';
import { getSectorColorClass } from './utils/sectorColors';

// API Base URL
const rawBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const API_URL = rawBase ? `${rawBase}/api` : '/api';

interface FinancialJuiceTokenStatus {
  configured: boolean;
  hasToken: boolean;
  obtainedAt?: number;
  softExpireAt?: number;
  hardExpireAt?: number;
  refreshFailures?: number;
  lastRefreshReason?: string;
  refreshedBy?: string;
  msToSoftExpire?: number;
  msToHardExpire?: number;
  likelyExpired?: boolean;
}

function App() {
  const [moversType, setMoversType] = useState<'active' | 'gainers' | 'losers'>('active');
  const [dashboardView, setDashboardView] = useState<'scanner' | 'radar'>('scanner');
  const [movers, setMovers] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [optionsData, setOptionsData] = useState<{ signals: OptionSignal[], moneyFlowStrength: number } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [macroData, setMacroData] = useState<MacroSnapshot | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);

  // History State
  const [viewMode, setViewMode] = useState<'analysis' | 'history'>('analysis');
  const [historyData, setHistoryData] = useState<StockSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [newsTokenInput, setNewsTokenInput] = useState('');
  const [newsTokenStatus, setNewsTokenStatus] = useState<FinancialJuiceTokenStatus | null>(null);
  const [newsTokenLoading, setNewsTokenLoading] = useState(false);
  const [newsTokenSubmitting, setNewsTokenSubmitting] = useState(false);
  const [newsTokenMessage, setNewsTokenMessage] = useState<string | null>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const symbol = searchQuery.toUpperCase();
    setIsSearching(true);

    try {
      const { data } = await axios.get(`${API_URL}/value/${symbol}`);

      // Map API response to Stock object
      // Note: The /value endpoint returns a ValueScore object which we enriched
      const stock: Stock = {
        symbol: data.symbol,
        name: data.name || data.symbol,
        price: data.price,
        changePercent: data.changePercent || 0,
        volume: data.volume || 0,
        valueScore: data.score,
        valueMetrics: data.metrics,
        sector: data.sector,
        industry: data.industry,
        thresholds: data.thresholds,
        reasons: data.reasons
      };

      handleStockClick(stock);
      setSearchQuery(''); // Clear search
    } catch (err) {
      console.error('Search failed', err);
      alert(`Could not find stock: ${symbol}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Load movers on mount or type change
  useEffect(() => {
    fetchMovers();
  }, [moversType]);

  useEffect(() => {
    fetchMacro();
    const interval = setInterval(fetchMacro, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchNewsTokenStatus();
  }, []);

  const fetchMovers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/movers`, {
        params: { type: moversType, limit: 20 }
      });
      setMovers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMacro = async () => {
    setMacroLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/macro`);
      setMacroData(data);
    } catch (err) {
      console.error('[Macro] Failed to load macro snapshot', err);
    } finally {
      setMacroLoading(false);
    }
  };

  const fetchNewsTokenStatus = async () => {
    setNewsTokenLoading(true);
    try {
      const { data } = await axios.get<FinancialJuiceTokenStatus>(`${API_URL}/news/token/status`);
      setNewsTokenStatus(data);
    } catch (err) {
      console.error('[News] Failed to load token status', err);
      setNewsTokenStatus(null);
    } finally {
      setNewsTokenLoading(false);
    }
  };

  const handleNewsTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const token = newsTokenInput.trim();
    if (!token) {
      return;
    }

    setNewsTokenSubmitting(true);
    setNewsTokenMessage(null);
    try {
      await axios.post(`${API_URL}/news/token`, { token });
      setNewsTokenInput('');
      setNewsTokenMessage('Token updated');
      await fetchNewsTokenStatus();
    } catch (err) {
      console.error('[News] Failed to set token', err);
      setNewsTokenMessage('Failed to set token');
    } finally {
      setNewsTokenSubmitting(false);
    }
  };

  const handleNewsTokenClear = async () => {
    setNewsTokenSubmitting(true);
    setNewsTokenMessage(null);
    try {
      await axios.delete(`${API_URL}/news/token`);
      setNewsTokenMessage('Token cleared');
      await fetchNewsTokenStatus();
    } catch (err) {
      console.error('[News] Failed to clear token', err);
      setNewsTokenMessage('Failed to clear token');
    } finally {
      setNewsTokenSubmitting(false);
    }
  };

  const handleStockClick = (stock: Stock) => {
    setSelectedStock(stock);
    setOptionsData(null);
    setHistoryData([]); // Reset history data to avoid flashing old data from previous stock
    setNewsData([]);
    setNewsError(null);
    setViewMode('analysis'); // Reset to analysis view

    setOptionsLoading(true);
    setHistoryLoading(true);
    setNewsLoading(true);

    // Fetch current options data
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/options/${stock.symbol}`);
        setOptionsData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setOptionsLoading(false);
      }
    })();

    // Fetch history in background
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/history/${stock.symbol}`);
        setHistoryData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setHistoryLoading(false);
      }
    })();

    // Fetch related news in background
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/news/search/${stock.symbol}`, {
          params: { limit: 20 }
        });
        const items = Array.isArray(data?.items) ? data.items as NewsItem[] : [];
        setNewsData(items);
      } catch (err) {
        console.error('[News] Failed to load symbol news', err);
        setNewsError('Failed to load symbol news');
      } finally {
        setNewsLoading(false);
      }
    })();
  };

  return (
    <div className="min-h-screen w-full bg-neutral-900 text-gray-100 font-sans p-6">
      {macroData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
          <div id="macro-dxy" className="bg-neutral-800/60 border border-neutral-700/40 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-500">US Dollar Index</p>
              <p className="text-2xl font-semibold">{macroData.dxy.price.toFixed(2)}</p>
            </div>
            <div className={`text-sm font-bold ${macroData.dxy.trend === 'UP' ? 'text-red-400' : macroData.dxy.trend === 'DOWN' ? 'text-green-400' : 'text-gray-400'}`}>
              {macroData.dxy.trend}
            </div>
          </div>
          <div id="macro-vix" className="bg-neutral-800/60 border border-neutral-700/40 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-500">VIX Fear Gauge</p>
              <p className="text-2xl font-semibold">{macroData.vix.price.toFixed(2)}</p>
            </div>
            <div className={`text-sm font-bold ${macroData.vix.status === 'RISING' ? 'text-red-400' : macroData.vix.status === 'FALLING' ? 'text-green-400' : 'text-gray-400'}`}>
              {macroData.vix.status}
            </div>
          </div>
          <div className="bg-neutral-800/60 border border-neutral-700/40 rounded-xl p-4 flex flex-col justify-center">
            <p className="text-xs uppercase text-gray-500">Macro Regime</p>
            <p className="text-2xl font-semibold text-white" id="macro-regime">
              {macroData.overallRegime.replace('_', ' ')}
            </p>
            {macroLoading && <span className="text-[10px] text-gray-500">Refreshing...</span>}
          </div>
        </div>
      )}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Stock Value Scanner
          </h1>
          <p className="text-gray-400 text-sm mt-1">Market Movers & Institutional Options Flow</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative mx-4">
          <input
            type="text"
            placeholder="Search Symbol (e.g. NVDA)..."
            className="bg-neutral-800 border border-neutral-700 text-gray-200 text-sm rounded-full pl-10 pr-4 py-2 w-64 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
          />
          <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
          {isSearching && (
            <div className="absolute right-3 top-2.5 animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
          )}
        </form>

        <div className="flex gap-4">
          <div className="flex bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setDashboardView('scanner')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${dashboardView === 'scanner' ? 'bg-neutral-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Scanner
            </button>
            <button
              onClick={() => setDashboardView('radar')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${dashboardView === 'radar' ? 'bg-neutral-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Market Radar 📡
            </button>
          </div>

          <div className="flex gap-2">
            {(['active', 'gainers', 'losers'] as const).map(type => (
              <button
                key={type}
                onClick={() => setMoversType(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${moversType === type
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'
                  }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mb-6 bg-neutral-800/40 border border-neutral-700/50 rounded-xl p-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">FinancialJuice Token</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded border ${newsTokenStatus?.hasToken ? 'border-green-500/40 text-green-400' : 'border-yellow-500/40 text-yellow-300'}`}>
                {newsTokenStatus?.hasToken ? 'Token Ready' : 'Token Missing'}
              </span>
              {newsTokenStatus?.hardExpireAt && (
                <span className="text-gray-400">
                  Hard Expire: {new Date(newsTokenStatus.hardExpireAt).toLocaleString()}
                </span>
              )}
              {newsTokenLoading && <span className="text-gray-500">Refreshing status...</span>}
            </div>
            {newsTokenMessage && (
              <p className="mt-1 text-xs text-blue-300">{newsTokenMessage}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 xl:min-w-[540px]">
            <form onSubmit={handleNewsTokenSubmit} className="flex-1 flex gap-2">
              <input
                type="password"
                placeholder="Paste FinancialJuice token..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                value={newsTokenInput}
                onChange={(e) => setNewsTokenInput(e.target.value)}
                disabled={newsTokenSubmitting}
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
                disabled={newsTokenSubmitting || !newsTokenInput.trim()}
              >
                Save
              </button>
            </form>
            <button
              onClick={() => void fetchNewsTokenStatus()}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-neutral-700 text-gray-100 hover:bg-neutral-600 disabled:opacity-60"
              disabled={newsTokenSubmitting || newsTokenLoading}
            >
              Refresh
            </button>
            <button
              onClick={handleNewsTokenClear}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-red-600/80 text-white hover:bg-red-500/80 disabled:opacity-60"
              disabled={newsTokenSubmitting}
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      {dashboardView === 'radar' ? (
        <div className="animate-in fade-in duration-500">
          <h2 className="text-xl font-bold mb-4 text-gray-300">Strategy: Sector Rotation & Momentum</h2>
          <SectorTrendRadar apiUrl={API_URL} />
        </div>
      ) : (
        loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {macroData && macroData.indices.length > 0 && (
              <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {macroData.indices.map((idx) => {
                  const scoreId = idx.symbol === '^IXIC' ? 'macro-ns-score' : idx.symbol === '^GSPC' ? 'macro-sp-score' : undefined;
                  return (
                    <div key={idx.symbol} className="bg-neutral-800/40 border border-neutral-700/40 rounded-xl p-4 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{idx.label}</h3>
                          <p className="text-xs text-gray-500">{idx.symbol}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${idx.regime.includes('BULLISH') ? 'border-green-500/40 text-green-400' : idx.regime.includes('BEARISH') ? 'border-red-500/40 text-red-400' : 'border-yellow-500/30 text-yellow-300'}`}>
                          {idx.regime.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-bold text-white">{idx.price.toFixed(2)}</p>
                          <p className={`text-sm ${idx.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
                          </p>
                        </div>
                        <div className="text-sm text-gray-400" id={scoreId}>
                          Score: {idx.score.toFixed(1)}/6
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <div className="flex-1">
                          <MoneyFlowGauge value={idx.mfi} small />
                        </div>
                        <div className="text-xs text-gray-500">
                          MFI
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <SectorStats stocks={movers} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {movers.map(stock => (
                <div
                  key={stock.symbol}
                  onClick={() => handleStockClick(stock)}
                  className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 p-4 rounded-xl cursor-pointer hover:bg-neutral-700/50 transition-all group relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{stock.symbol}</h3>
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">{stock.name}</p>
                      {stock.industry && (
                        <p className="text-[10px] text-gray-600 truncate max-w-[150px] mt-0.5" title={stock.industry}>
                          {stock.industry}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`text-right ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <div className="text-lg font-mono font-semibold">${stock.price.toFixed(2)}</div>
                        <div className="text-xs">{stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</div>
                      </div>
                      {stock.sector && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border truncate max-w-[120px] ${getSectorColorClass(stock.sector)}`} title={stock.sector}>
                          {stock.sector}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer Row: Score | MFI Gauge | Vol */}
                  <div className="mt-4 flex items-end gap-3 h-8">
                    {/* Score */}
                    <div className="shrink-0 flex items-center">
                      <div className={`
                                    px-2 py-0.5 rounded text-xs font-bold h-fit
                                    ${stock.valueScore && stock.valueScore >= 5 ? 'bg-green-500/20 text-green-400' :
                          stock.valueScore && stock.valueScore >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'}
                                 `}>
                        Score: {stock.valueScore ?? 'N/A'}/6
                      </div>
                    </div>

                    {/* MFI Gauge (Middle) */}
                    <div className="flex-1 min-w-0 pb-0.5">
                      {stock.moneyFlowStrength !== undefined && (
                        <MoneyFlowGauge value={stock.moneyFlowStrength ?? 0} small />
                      )}
                    </div>

                    {/* Vol */}
                    <div className="shrink-0 text-xs text-neutral-500 pb-0.5">
                      Vol: {(stock.volume / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {/* Detail Modal */}
      {selectedStock && (
        <StockDetailModal
          selectedStock={selectedStock}
          onClose={() => setSelectedStock(null)}
          viewMode={viewMode}
          setViewMode={setViewMode}
          optionsLoading={optionsLoading}
          optionsData={optionsData}
          historyLoading={historyLoading}
          historyData={historyData}
          newsLoading={newsLoading}
          newsData={newsData}
          newsError={newsError}
        />
      )}
    </div>
  );
}

export default App;
