
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  AlertCircle,
  ChevronRight,
  DollarSign,
  BarChart2
} from 'lucide-react';

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Types matching backend
interface ValueMetrics {
  pb: number;
  pe: number;
  roe: number;
  profitMargin: number;
  debtToEquity: number;
}

interface Stock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  valueScore?: number | null;
  valueMetrics?: ValueMetrics | null;
  reasons?: string[];
}

interface OptionSignal {
  type: string;
  strike: number;
  expiryISO: string;
  direction: string;
  notional: number;
  directionConfidence: number;
  spotConfirmation: string | null;
}

interface StockSnapshot {
  id: number;
  date: string;
  price: number;
  sentimentScore: number;
  moneyFlowStrength: number;
  combos: OptionCombo[];
}

interface OptionCombo {
  strategy: string;
  description: string;
  notional: number;
  riskProfile: string;
}

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
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedStock && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedStock(null)}>
          <div className="bg-neutral-900 border border-neutral-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-neutral-800 flex justify-between items-start sticky top-0 bg-neutral-900 z-10">
              <div>
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                  {selectedStock.symbol}
                  <span className="text-lg font-normal text-gray-400">{selectedStock.name}</span>
                </h2>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                  <span className="font-mono text-white text-lg">${selectedStock.price}</span>
                  <span className={selectedStock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {selectedStock.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex bg-neutral-800 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('analysis')}
                    className={`px-3 py-1 rounded-md text-sm transition-all ${viewMode === 'analysis' ? 'bg-neutral-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Analysis
                  </button>
                  <button
                    onClick={() => setViewMode('history')}
                    className={`px-3 py-1 rounded-md text-sm transition-all ${viewMode === 'history' ? 'bg-neutral-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    History
                  </button>
                </div>
                <button
                  onClick={() => setSelectedStock(null)}
                  className="text-gray-500 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            {viewMode === 'analysis' ? (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left: Fundamentals */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-purple-400" /> Fundamental Analysis
                  </h3>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <MetricCard label="P/E Ratio" value={selectedStock.valueMetrics?.pe?.toFixed(2) ?? 'N/A'} sub="Target < 15" good={selectedStock.valueMetrics?.pe ? selectedStock.valueMetrics.pe < 15 : false} />
                    <MetricCard label="P/B Ratio" value={selectedStock.valueMetrics?.pb?.toFixed(2) ?? 'N/A'} sub="Target < 1.5" good={selectedStock.valueMetrics?.pb ? selectedStock.valueMetrics.pb < 1.5 : false} />
                    <MetricCard label="ROE" value={selectedStock.valueMetrics?.roe ? selectedStock.valueMetrics.roe.toFixed(1) + '%' : 'N/A'} sub="Target > 15%" good={selectedStock.valueMetrics?.roe ? selectedStock.valueMetrics.roe > 15 : false} />
                    <MetricCard label="Debt/Equity" value={selectedStock.valueMetrics?.debtToEquity?.toFixed(1) + '%' ?? 'N/A'} sub="Target < 50%" good={selectedStock.valueMetrics?.debtToEquity ? selectedStock.valueMetrics.debtToEquity < 50 : false} />
                  </div>

                  {selectedStock.reasons && selectedStock.reasons.length > 0 && (
                    <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                      <h4 className="text-sm font-medium text-gray-300 mb-2">Highlights</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedStock.reasons.map(r => (
                          <span key={r} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded border border-blue-500/20">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Options Flow */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart2 size={18} className="text-orange-400" /> Institutional Flow
                  </h3>

                  {optionsLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                    </div>
                  ) : optionsData ? (
                    <div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="text-sm font-medium text-gray-400">Money Flow Strength</div>
                        <div className={`text-xl font-bold ${optionsData.moneyFlowStrength > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {optionsData.moneyFlowStrength.toFixed(2)}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {optionsData.signals.length === 0 && (
                          <div className="text-gray-500 text-sm italic">No significant active signals found.</div>
                        )}
                        {optionsData.signals.slice(0, 5).map((sig, idx) => (
                          <div key={idx} className="bg-neutral-800 p-3 rounded-lg border border-neutral-700 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${sig.type === 'call' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                {sig.type}
                              </span>
                              <span className="font-mono text-white">${sig.strike}</span>
                            </div>
                            <div className="text-gray-400 text-xs">
                              Exp: {sig.expiryISO.split('T')[0]}
                            </div>
                            <div className="text-right">
                              <div className="text-white font-medium">${(sig.notional / 1000).toFixed(0)}k</div>
                              <div className="text-[10px] text-gray-500">Notional</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-red-400 text-sm">Failed to load options data.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6">
                {historyLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : historyData.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">No history found for {selectedStock.symbol}</div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-white mb-4">Historical Scans</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-neutral-800 text-gray-200 uppercase">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Sentiment</th>
                            <th className="px-4 py-3">Money Flow</th>
                            <th className="px-4 py-3">Strategies Detected</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          {historyData.map((snap) => (
                            <tr key={snap.id} className="hover:bg-neutral-800/50 transition-colors">
                              <td className="px-4 py-3">{new Date(snap.date).toLocaleString()}</td>
                              <td className="px-4 py-3 font-mono text-white">${snap.price.toFixed(2)}</td>
                              <td className={`px-4 py-3 font-bold ${snap.sentimentScore > 0 ? 'text-green-400' : snap.sentimentScore < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {snap.sentimentScore.toFixed(1)}
                              </td>
                              <td className={`px-4 py-3 ${snap.moneyFlowStrength > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {snap.moneyFlowStrength.toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                {snap.combos && snap.combos.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {snap.combos.map((c, i) => (
                                      <span key={i} className={`px-2 py-0.5 rounded text-[10px] border ${c.riskProfile === 'Bullish' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                                        c.riskProfile === 'Bearish' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                          'border-gray-500/30 text-gray-400'
                                        }`}>
                                        {c.strategy}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )
      }
    </div >
  );
}

function MetricCard({ label, value, sub, good }: { label: string, value: string, sub: string, good: boolean }) {
  return (
    <div className="bg-neutral-800 p-3 rounded-lg border border-neutral-700">
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div className={`text-lg font-bold ${good ? 'text-green-400' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-1">{sub}</div>
    </div>
  )
}

export default App;
