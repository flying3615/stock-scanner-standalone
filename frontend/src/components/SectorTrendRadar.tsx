
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { EnhancedSectorTrends, EnhancedSectorData, SectorSignal } from '../types';

interface TrendProps {
    apiUrl: string;
}

const SIGNAL_CONFIG: Record<SectorSignal['type'], { icon: string; label: string }> = {
    volume_divergence: { icon: '⚠️', label: 'Volume Divergence' },
    momentum_decay: { icon: '📉', label: 'Momentum Decay' },
    sector_exhaustion: { icon: '🫠', label: 'Breadth Weakness' },
    rank_breakout: { icon: '🚀', label: 'Rank Breakout' },
    emerging_sector: { icon: '🌱', label: 'Emerging Sector' }
};

const SEVERITY_STYLES: Record<SectorSignal['severity'], string> = {
    alert: 'border-red-500/60 bg-red-950/40 text-red-300',
    warning: 'border-amber-500/50 bg-amber-950/30 text-amber-300',
    info: 'border-blue-500/40 bg-blue-950/30 text-blue-300'
};

function formatVolume(v: number): string {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toFixed(0);
}

function SignalBadge({ signal }: { signal: SectorSignal }) {
    const config = SIGNAL_CONFIG[signal.type];
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${SEVERITY_STYLES[signal.severity]}`}
            title={signal.detail}
        >
            {config.icon} {config.label}
        </span>
    );
}

function MiniSparkline({ history }: { history: EnhancedSectorData['history'] }) {
    const reversed = [...history].reverse();
    if (reversed.length < 2) return null;

    const ranks = reversed.map(h => h.rank);
    const maxRank = Math.max(...ranks, 10);
    const w = 100;
    const h = 24;
    const stepX = w / (ranks.length - 1);

    const points = ranks.map((r, i) => `${i * stepX},${(r / maxRank) * h}`);
    const polyline = points.join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6" preserveAspectRatio="none">
            <polyline
                points={polyline}
                fill="none"
                stroke="url(#sparkGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <defs>
                <linearGradient id="sparkGrad" x1="0" x2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
            </defs>
        </svg>
    );
}

function SectorCard({ item, signals }: { item: EnhancedSectorData; signals: SectorSignal[] }) {
    const sectorSignals = signals.filter(s => s.sector === item.sector);

    return (
        <div
            className={`
                relative p-4 rounded-xl border transition-all group
                ${item.isHot
                    ? 'bg-gradient-to-br from-red-900/20 to-orange-900/10 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                    : 'bg-neutral-800/40 border-neutral-700/40 hover:border-neutral-600'}
            `}
        >
            {/* Header Row */}
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-gray-200 flex items-center gap-1.5 truncate">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-mono font-bold shrink-0
                            ${item.currentRank <= 3 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-neutral-700/60 text-gray-500 border border-neutral-600/50'}`}>
                            {item.currentRank}
                        </span>
                        <span className="truncate">{item.sector}</span>
                        {item.isHot && <span className="text-xs shrink-0" title={`Hot streak: ${item.consecutiveTop3} days in Top 3`}>🔥</span>}
                    </h3>
                </div>
                <div className={`text-right shrink-0 ml-3 ${item.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <div className="text-base font-mono font-bold leading-tight">
                        {item.avgChange > 0 ? '+' : ''}{item.avgChange.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Stocks</div>
                    <div className="text-sm font-mono font-semibold text-gray-300">{item.stockCount}</div>
                </div>
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Volume</div>
                    <div className="text-sm font-mono font-semibold text-gray-300">{formatVolume(item.totalVolume)}</div>
                </div>
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Vol Δ</div>
                    <div className={`text-sm font-mono font-semibold ${
                        item.volumeChangeRate == null ? 'text-gray-500' :
                        item.volumeChangeRate > 20 ? 'text-emerald-400' :
                        item.volumeChangeRate < -20 ? 'text-red-400' : 'text-gray-300'
                    }`}>
                        {item.volumeChangeRate != null
                            ? `${item.volumeChangeRate > 0 ? '+' : ''}${item.volumeChangeRate.toFixed(0)}%`
                            : '—'}
                    </div>
                </div>
            </div>

            {/* Leader */}
            {item.leader && (
                <div className="flex items-center justify-between bg-neutral-900/40 rounded-lg px-2.5 py-1.5 mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">🏆 LEADER</span>
                        <span className="font-bold text-sm text-blue-300">{item.leader}</span>
                    </div>
                    <span className={`font-mono text-xs font-semibold ${
                        (item.leaderChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                        {item.leaderChange != null && item.leaderChange > 0 ? '+' : ''}
                        {item.leaderChange?.toFixed(2)}%
                    </span>
                </div>
            )}

            {/* Momentum Indicators */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                {item.consecutiveTop3 > 1 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                        ${item.consecutiveTop3 >= 5 ? 'border-red-500/40 bg-red-900/20 text-red-300' :
                          item.consecutiveTop3 >= 3 ? 'border-orange-500/40 bg-orange-900/20 text-orange-300' :
                          'border-neutral-600 bg-neutral-800 text-gray-400'}`}>
                        🔄 {item.consecutiveTop3}d Top 3
                    </span>
                )}
                {item.rankDelta != null && item.rankDelta !== 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                        ${item.rankDelta > 0 ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-300' :
                          'border-red-500/40 bg-red-900/20 text-red-300'}`}>
                        {item.rankDelta > 0 ? '↑' : '↓'}{Math.abs(item.rankDelta)} rank
                    </span>
                )}
                {item.leaderGap != null && item.leaderGap > 2 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-900/20 text-amber-300"
                        title="Gap between leader and sector avg — high gap means weak breadth">
                        Gap {item.leaderGap.toFixed(1)}%
                    </span>
                )}
            </div>

            {/* Signal Badges */}
            {sectorSignals.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                    {sectorSignals.map((sig, i) => <SignalBadge key={i} signal={sig} />)}
                </div>
            )}

            {/* Rank History Sparkline + Heatmap */}
            <div className="space-y-1">
                <div className="text-[10px] text-gray-500 flex justify-between">
                    <span>Rank trend (lower = better)</span>
                    <span>{item.history.length}d</span>
                </div>
                <MiniSparkline history={item.history} />
                <div className="flex gap-0.5 h-1.5">
                    {[...item.history].reverse().map((h, i) => (
                        <div
                            key={i}
                            className={`flex-1 rounded-sm transition-colors ${
                                h.rank <= 3 ? 'bg-red-500' :
                                h.rank <= 5 ? 'bg-orange-500/60' :
                                h.rank <= 7 ? 'bg-yellow-500/30' :
                                'bg-neutral-700/50'}`}
                            title={`${h.date}: Rank #${h.rank} | Avg ${h.avgChange > 0 ? '+' : ''}${h.avgChange.toFixed(2)}%`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SignalPanel({ signals }: { signals: SectorSignal[] }) {
    if (signals.length === 0) return null;

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Rotation Signals
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {signals.map((sig, i) => {
                    const config = SIGNAL_CONFIG[sig.type];
                    return (
                        <div
                            key={i}
                            className={`rounded-lg border px-3 py-2.5 ${SEVERITY_STYLES[sig.severity]}`}
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-base shrink-0 mt-0.5">{config.icon}</span>
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold leading-tight">{sig.message}</div>
                                    <div className="text-[11px] opacity-70 mt-0.5 leading-snug">{sig.detail}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function SectorTrendRadar({ apiUrl }: TrendProps) {
    const [data, setData] = useState<EnhancedSectorTrends | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${apiUrl}/trends/sectors/enhanced`)
            .then(res => setData(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [apiUrl]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 text-sm animate-pulse py-8 justify-center">
                <div className="w-4 h-4 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
                Loading Radar...
            </div>
        );
    }

    if (!data || data.sectors.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500 bg-neutral-800/30 rounded-xl border border-neutral-700/50">
                <h3 className="text-lg font-bold mb-2">No Radar Data Yet</h3>
                <p className="text-sm">Sector trends will appear here after the first daily close scan.</p>
                <div className="mt-4 text-xs bg-blue-900/20 text-blue-400 inline-block px-3 py-1 rounded">
                    Tip: Data is collected automatically every day at 4:30 PM.
                </div>
            </div>
        );
    }

    const { sectors, signals } = data;

    return (
        <div className="space-y-6">
            {/* Signal Panel */}
            <SignalPanel signals={signals} />

            {/* Sector Cards Grid */}
            <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                    Sector Rankings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sectors.map((item) => (
                        <SectorCard key={item.sector} item={item} signals={signals} />
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-gray-500 pt-2 border-t border-neutral-800">
                <span>🔥 <span className="text-gray-400">Hot Streak</span> (Top 3 for 3+ days)</span>
                <span>🌱 <span className="text-gray-400">Emerging</span> (new entrant to Top 3)</span>
                <span>⚠️ <span className="text-gray-400">Divergence</span> (price + volume declining)</span>
                <span>📉 <span className="text-gray-400">Decay</span> (extended streak, rotation risk)</span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-red-500" /> Top 3
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-orange-500/60" /> Top 5
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-yellow-500/30" /> Top 7
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-neutral-700/50" /> Other
                </span>
            </div>
        </div>
    );
}
