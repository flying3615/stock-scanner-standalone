import type { Dispatch, SetStateAction } from 'react';
import { Activity, BarChart2 } from 'lucide-react';
import type { Stock, OptionSignal, StockSnapshot } from '../types';
import { MoneyFlowGauge } from './MoneyFlowGauge';
import { getSectorColorClass } from '../utils/sectorColors';

type MetricStatus = 'good' | 'bad' | 'neutral';

interface StockDetailModalProps {
    selectedStock: Stock;
    onClose: () => void;
    viewMode: 'analysis' | 'history';
    setViewMode: Dispatch<SetStateAction<'analysis' | 'history'>>;
    optionsLoading: boolean;
    optionsData: { signals: OptionSignal[], moneyFlowStrength: number } | null;
    historyLoading: boolean;
    historyData: StockSnapshot[];
}

function MetricCard({ label, value, sub, status = 'neutral' }: { label: string, value: string, sub: string, status?: MetricStatus }) {
    const color = status === 'good' ? 'text-green-400' : status === 'bad' ? 'text-red-400' : 'text-white';
    return (
        <div className="bg-neutral-800 p-3 rounded-lg border border-neutral-700">
            <div className="text-gray-500 text-xs mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-gray-600 mt-1">{sub}</div>
        </div>
    );
}

const isFiniteNumber = (value?: number | null): value is number => typeof value === 'number' && Number.isFinite(value);
const formatNumber = (value?: number | null, decimals = 2, suffix = '') => isFiniteNumber(value) ? `${value.toFixed(decimals)}${suffix}` : 'N/A';
const formatPercent = (value?: number | null, decimals = 1) => formatNumber(value, decimals, '%');



export function StockDetailModal({
    selectedStock,
    onClose,
    viewMode,
    setViewMode,
    optionsLoading,
    optionsData,
    historyLoading,
    historyData
}: StockDetailModalProps) {
    const metrics = selectedStock.valueMetrics;
    const thresholds = selectedStock.thresholds;

    const peMax = thresholds?.peMax ?? 20;
    const peOver = thresholds?.peOver ?? Math.max(peMax * 1.8, 40);
    const pbMax = thresholds?.pbMax ?? 3;
    const roeMin = thresholds?.roeMin ?? 12;
    const debtMax = thresholds?.debtMax ?? 200;
    const marginHealthy = thresholds?.marginHealthy ?? 10;
    const marginStrong = thresholds?.marginStrong ?? Math.max(marginHealthy + 10, 20);
    const lowDebtBonus = thresholds?.lowDebtBonus ?? 50;

    const peStatus: MetricStatus = isFiniteNumber(metrics?.pe)
        ? (metrics!.pe <= 0 || metrics!.pe >= peOver) ? 'bad'
            : metrics!.pe < peMax ? 'good'
                : 'neutral'
        : 'neutral';

    const pbStatus: MetricStatus = isFiniteNumber(metrics?.pb)
        ? metrics!.pb <= pbMax ? 'good'
            : metrics!.pb >= pbMax * 1.5 ? 'bad'
                : 'neutral'
        : 'neutral';

    const roeStatus: MetricStatus = isFiniteNumber(metrics?.roe)
        ? metrics!.roe >= roeMin ? 'good'
            : metrics!.roe < 2 ? 'bad'
                : 'neutral'
        : 'neutral';

    const debtStatus: MetricStatus = isFiniteNumber(metrics?.debtToEquity)
        ? metrics!.debtToEquity <= lowDebtBonus && selectedStock.sector !== 'Financial Services' ? 'good'
            : metrics!.debtToEquity > debtMax ? 'bad'
                : 'neutral'
        : 'neutral';

    const marginStatus: MetricStatus = isFiniteNumber(metrics?.profitMargin)
        ? metrics!.profitMargin >= marginStrong ? 'good'
            : metrics!.profitMargin < 0 ? 'bad'
                : metrics!.profitMargin >= marginHealthy ? 'neutral'
                    : 'neutral'
        : 'neutral';

    const growthStatus: MetricStatus = isFiniteNumber(metrics?.growth)
        ? metrics!.growth >= 15 ? 'good'
            : metrics!.growth < 0 ? 'bad'
                : metrics!.growth >= 5 ? 'neutral'
                    : 'neutral'
        : 'neutral';

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
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
                        {/* Sector Badge */}
                        {selectedStock.sector && (
                            <div className={`mt-2 text-xs font-semibold px-2 py-1 rounded inline-block border ${getSectorColorClass(selectedStock.sector)}`}>
                                {selectedStock.sector}
                            </div>
                        )}
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
                            onClick={onClose}
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
                                <MetricCard
                                    label="P/E Ratio"
                                    value={formatNumber(metrics?.pe)}
                                    sub={`Target < ${peMax}${!isFiniteNumber(metrics?.pe) ? '' : metrics!.pe > peMax && metrics!.pe < peOver ? ' (fair)' : ''}`}
                                    status={peStatus}
                                />
                                <MetricCard
                                    label="P/B Ratio"
                                    value={formatNumber(metrics?.pb)}
                                    sub={`Target < ${pbMax}`}
                                    status={pbStatus}
                                />
                                <MetricCard
                                    label="ROE"
                                    value={formatPercent(metrics?.roe)}
                                    sub={`Target > ${roeMin}%`}
                                    status={roeStatus}
                                />
                                <MetricCard
                                    label="Debt/Equity"
                                    value={formatPercent(metrics?.debtToEquity)}
                                    sub={`Target < ${debtMax}%`}
                                    status={debtStatus}
                                />
                                <MetricCard
                                    label="Profit Margin"
                                    value={formatPercent(metrics?.profitMargin)}
                                    sub={`Healthy > ${marginHealthy}%`}
                                    status={marginStatus}
                                />
                                <MetricCard
                                    label="Growth"
                                    value={formatPercent(metrics?.growth)}
                                    sub="Earnings/Revenue trend"
                                    status={growthStatus}
                                />
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
                                    <div className="mb-6 bg-neutral-800/40 p-4 rounded-xl border border-neutral-700/50">
                                        <MoneyFlowGauge value={optionsData.moneyFlowStrength} />
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
    );
}
