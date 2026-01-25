import { useEffect, useState } from 'react';
import axios from 'axios';
import type { Stock, OptionSignal, StockSnapshot } from './types';
import { StockDetailModal } from './components/StockDetailModal';
import { MoneyFlowGauge } from './components/MoneyFlowGauge';

// API Base URL
const API_URL = 'http://localhost:3000/api';

function App() {
  const [moversType, setMoversType] = useState<'active' | 'gainers' | 'losers'>('active');
  const [movers, setMovers] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [optionsData, setOptionsData] = useState<{ signals: OptionSignal[], moneyFlowStrength: number } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // History State
  const [viewMode, setViewMode] = useState<'analysis' | 'history'>('analysis');
  const [historyData, setHistoryData] = useState<StockSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load movers on mount or type change
  useEffect(() => {
    fetchMovers();
  }, [moversType]);

  const fetchMovers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/movers`, {
        params: { type: moversType, limit: 12 }
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
      </header>

      {/* Main Grid */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
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
                </div>
                <div className={`text-right ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  <div className="text-lg font-mono font-semibold">${stock.price.toFixed(2)}</div>
                  <div className="text-xs">{stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</div>
                </div>
              </div>

              {/* Value Badge */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`
                                px-2 py-1 rounded text-xs font-bold
                                ${stock.valueScore && stock.valueScore >= 5 ? 'bg-green-500/20 text-green-400' :
                      stock.valueScore && stock.valueScore >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'}
                             `}>
                    Score: {stock.valueScore ?? 'N/A'}/6
                  </div>
                </div>
                <span className="text-xs text-neutral-500">
                  Vol: {(stock.volume / 1000000).toFixed(1)}M
                </span>
              </div>

              {/* Money Flow Gauge */}
              {stock.moneyFlowStrength !== undefined && (
                <div className="mt-3 max-w-[60%]">
                  <MoneyFlowGauge value={stock.moneyFlowStrength ?? 0} small />
                </div>
              )}
            </div>
          ))}
        </div>
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
