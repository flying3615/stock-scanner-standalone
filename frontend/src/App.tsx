import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import axios from 'axios';
import type { Stock, OptionSignal, StockSnapshot } from './types';
import { StockDetailModal } from './components/StockDetailModal';
import { MoneyFlowGauge } from './components/MoneyFlowGauge';
import { SectorStats } from './components/SectorStats';
import { SectorTrendRadar } from './components/SectorTrendRadar';
import { getSectorColorClass } from './utils/sectorColors';

// API Base URL
const API_URL = 'http://localhost:3000/api';

function App() {
  const [moversType, setMoversType] = useState<'active' | 'gainers' | 'losers'>('active');
  const [dashboardView, setDashboardView] = useState<'scanner' | 'radar'>('scanner');
  const [movers, setMovers] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [optionsData, setOptionsData] = useState<{ signals: OptionSignal[], moneyFlowStrength: number } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // History State
  const [viewMode, setViewMode] = useState<'analysis' | 'history'>('analysis');
  const [historyData, setHistoryData] = useState<StockSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

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
      console.error("Search failed", err);
      alert(`Could not find stock: ${symbol}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Load movers on mount or type change
  useEffect(() => {
    fetchMovers();
  }, [moversType]);

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

  const handleStockClick = async (stock: Stock) => {
    setSelectedStock(stock);
    setOptionsData(null);
    setHistoryData([]); // Reset history data to avoid flashing old data from previous stock
    setViewMode('analysis'); // Reset to analysis view
    setOptionsLoading(true);

    // Fetch current options data
    try {
      const { data } = await axios.get(`${API_URL}/options/${stock.symbol}`);
      setOptionsData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setOptionsLoading(false);
    }

    // Fetch history in background
    setHistoryLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/history/${stock.symbol}`);
      setHistoryData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-neutral-900 text-gray-100 font-sans p-6">
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

                  {/* Value Badge */}
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

      {/* Detail Modal Component */}
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
        />
      )}
    </div>
  );
}

export default App;
