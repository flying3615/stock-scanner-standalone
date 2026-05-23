import type { Dispatch, SetStateAction } from 'react';
import { Activity, BarChart2 } from 'lucide-react';
import type { Stock, OptionSignal, StockSnapshot, NewsItem, ShortTermSignalScore } from '../types';
import { MoneyFlowGauge } from './MoneyFlowGauge';
import { getSectorColorClass } from '../utils/sectorColors';
import { translate, type Language } from '../i18n';

type MetricStatus = 'good' | 'bad' | 'neutral';

interface StockDetailModalProps {
    selectedStock: Stock;
    language: Language;
    onClose: () => void;
    viewMode: 'analysis' | 'history';
    setViewMode: Dispatch<SetStateAction<'analysis' | 'history'>>;
    optionsLoading: boolean;
    optionsData: { signals: OptionSignal[], moneyFlowStrength: number, shortTermSignal?: ShortTermSignalScore } | null;
    historyLoading: boolean;
    historyData: StockSnapshot[];
    newsLoading: boolean;
    newsData: NewsItem[];
    newsError: string | null;
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

function ScoreCard({
    label,
    score,
    tone,
    sub,
    reasons
}: {
    label: string;
    score: string | number;
    tone: 'green' | 'cyan' | 'neutral';
    sub: string;
    reasons: string[];
}) {
    const toneClass = tone === 'green'
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : tone === 'cyan'
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
            : 'border-neutral-700 bg-neutral-800/60 text-gray-300';

    return (
        <div className={`rounded-xl border p-4 ${toneClass}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
                    <div className="mt-1 text-sm text-gray-300">{sub}</div>
                </div>
                <div className="text-3xl font-bold text-white">{score}</div>
            </div>
            {reasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-gray-200">
                            {reason}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

const isFiniteNumber = (value?: number | null): value is number => typeof value === 'number' && Number.isFinite(value);
const formatNumber = (value?: number | null, decimals = 2, suffix = '') => isFiniteNumber(value) ? `${value.toFixed(decimals)}${suffix}` : 'N/A';
const formatPercent = (value?: number | null, decimals = 1) => formatNumber(value, decimals, '%');



export function StockDetailModal({
    selectedStock,
    language,
    onClose,
    viewMode,
    setViewMode,
    optionsLoading,
    optionsData,
    historyLoading,
    historyData,
    newsLoading,
    newsData,
    newsError
}: StockDetailModalProps) {
    const tx = (key: Parameters<typeof translate>[1]) => translate(language, key);
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
                                {tx('analysis')}
                            </button>
                            <button
                                onClick={() => setViewMode('history')}
                                className={`px-3 py-1 rounded-md text-sm transition-all ${viewMode === 'history' ? 'bg-neutral-700 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                {tx('history')}
                            </button>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white"
                        >
                            {tx('close')}
                        </button>
                    </div>
                </div>

                {viewMode === 'analysis' ? (
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ScoreCard
                                label={tx('stockQuality')}
                                score={selectedStock.stockQuality ? `${selectedStock.stockQuality.score} ${selectedStock.stockQuality.grade}` : 'N/A'}
                                tone={selectedStock.stockQuality && selectedStock.stockQuality.score >= 70 ? 'green' : 'neutral'}
                                sub={tx('stockQualitySub')}
                                reasons={selectedStock.stockQuality?.reasons ?? []}
                            />
                            <ScoreCard
                                label={tx('shortTermSignal')}
                                score={optionsData?.shortTermSignal ? optionsData.shortTermSignal.score : selectedStock.shortTermSignal?.score ?? 'N/A'}
                                tone={(optionsData?.shortTermSignal?.score ?? selectedStock.shortTermSignal?.score ?? 0) >= 70 ? 'cyan' : 'neutral'}
                                sub={`${tx('currentSetup')}: ${(optionsData?.shortTermSignal?.direction ?? selectedStock.shortTermSignal?.direction ?? 'neutral').toUpperCase()}`}
                                reasons={optionsData?.shortTermSignal?.reasons ?? selectedStock.shortTermSignal?.reasons ?? []}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left: Fundamentals */}
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Activity size={18} className="text-purple-400" /> {tx('fundamentals')}
                            </h3>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <MetricCard
                                    label={tx('peRatio')}
                                    value={formatNumber(metrics?.pe)}
                                    sub={`${tx('targetBelow')} ${peMax}${!isFiniteNumber(metrics?.pe) ? '' : metrics!.pe > peMax && metrics!.pe < peOver ? ' (fair)' : ''}`}
                                    status={peStatus}
                                />
                                <MetricCard
                                    label={tx('pbRatio')}
                                    value={formatNumber(metrics?.pb)}
                                    sub={`${tx('targetBelow')} ${pbMax}`}
                                    status={pbStatus}
                                />
                                <MetricCard
                                    label={tx('roe')}
                                    value={formatPercent(metrics?.roe)}
                                    sub={`${tx('targetAbove')} ${roeMin}%`}
                                    status={roeStatus}
                                />
                                <MetricCard
                                    label={tx('debtEquity')}
                                    value={formatPercent(metrics?.debtToEquity)}
                                    sub={`${tx('targetBelow')} ${debtMax}%`}
                                    status={debtStatus}
                                />
                                <MetricCard
                                    label={tx('profitMargin')}
                                    value={formatPercent(metrics?.profitMargin)}
                                    sub={`${tx('healthyAbove')} ${marginHealthy}%`}
                                    status={marginStatus}
                                />
                                <MetricCard
                                    label={tx('growth')}
                                    value={formatPercent(metrics?.growth)}
                                    sub={tx('growthTrend')}
                                    status={growthStatus}
                                />
                            </div>

                            {selectedStock.reasons && selectedStock.reasons.length > 0 && (
                                <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700">
                                    <h4 className="text-sm font-medium text-gray-300 mb-2">{tx('highlights')}</h4>
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
                                <BarChart2 size={18} className="text-orange-400" /> {tx('institutionalFlow')}
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
                                            <div className="text-gray-500 text-sm italic">{tx('noSignals')}</div>
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
                                                    {tx('expiry')}: {sig.expiryISO.split('T')[0]}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-white font-medium">${(sig.notional / 1000).toFixed(0)}k</div>
                                                    <div className="text-[10px] text-gray-500">{tx('notional')}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-red-400 text-sm">{tx('failedOptions')}</div>
                            )}

                            <div className="mt-6">
                                <h4 className="text-sm font-semibold text-gray-200 mb-3">{tx('relatedNews')}</h4>
                                {newsLoading ? (
                                    <div className="flex justify-center py-6">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                                    </div>
                                ) : newsError ? (
                                    <div className="text-red-400 text-sm">{newsError}</div>
                                ) : newsData.length === 0 ? (
                                    <div className="text-gray-500 text-sm italic">{tx('noNews')}</div>
                                ) : (
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {newsData.slice(0, 12).map((item) => (
                                            <div
                                                key={item.id}
                                                className="bg-neutral-800/70 border border-neutral-700 rounded-lg p-3"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="text-sm text-gray-100 leading-snug">{item.headline}</p>
                                                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded border ${item.urgency >= 5
                                                        ? 'border-red-500/40 text-red-400'
                                                        : 'border-neutral-500/40 text-gray-400'
                                                        }`}>
                                                        {item.category}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[10px] text-gray-500">
                                                    {item.source} · {new Date(item.timestamp).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-6">
                        {historyLoading ? (
                            <div className="flex justify-center py-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                            </div>
                        ) : historyData.length === 0 ? (
                            <div className="text-center text-gray-500 py-10">{tx('noHistory')} {selectedStock.symbol}</div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-white mb-4">{tx('historicalScans')}</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-gray-400">
                                        <thead className="bg-neutral-800 text-gray-200 uppercase">
                                            <tr>
                                                <th className="px-4 py-3">{tx('date')}</th>
                                                <th className="px-4 py-3">{tx('price')}</th>
                                                <th className="px-4 py-3">{tx('sentiment')}</th>
                                                <th className="px-4 py-3">{tx('moneyFlow')}</th>
                                                <th className="px-4 py-3">{tx('strategiesDetected')}</th>
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
