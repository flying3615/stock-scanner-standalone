import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    AlertTriangle,
    Flame,
    Leaf,
    LineChart,
    Rocket,
    RotateCcw,
    Trophy,
    TrendingDown,
} from 'lucide-react';
import { translate, translateSectorName, type Language, type TranslationKey } from '../i18n';
import type { EnhancedSectorTrends, EnhancedSectorData, SectorSignal } from '../types';

interface TrendProps {
    apiUrl: string;
    language: Language;
}

const SIGNAL_CONFIG: Record<SectorSignal['type'], { Icon: typeof TrendingDown; labelKey: TranslationKey }> = {
    volume_divergence: { Icon: AlertTriangle, labelKey: 'signalVolumeDivergence' },
    momentum_decay: { Icon: TrendingDown, labelKey: 'signalMomentumDecay' },
    sector_exhaustion: { Icon: LineChart, labelKey: 'signalBreadthWeakness' },
    rank_breakout: { Icon: Rocket, labelKey: 'signalRankBreakout' },
    emerging_sector: { Icon: Leaf, labelKey: 'signalEmergingSector' },
};

const SEVERITY_STYLES: Record<SectorSignal['severity'], string> = {
    alert: 'border-red-500/60 bg-red-950/40 text-red-300',
    warning: 'border-amber-500/50 bg-amber-950/30 text-amber-300',
    info: 'border-blue-500/40 bg-blue-950/30 text-blue-300',
};

function formatVolume(v: number): string {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toFixed(0);
}

function getSignalCopy(signal: SectorSignal, sector: EnhancedSectorData | undefined, language: Language) {
    const sectorName = translateSectorName(language, signal.sector);
    const rankDelta = sector?.rankDelta ?? 0;
    const currentRank = sector?.currentRank ?? 0;
    const previousRank = rankDelta > 0 && currentRank > 0 ? currentRank + rankDelta : null;
    const leaderGap = sector?.leaderGap ?? null;
    const leader = sector?.leader ?? '';
    const consecutiveTop3 = sector?.consecutiveTop3 ?? 0;

    if (language === 'en') {
        return {
            message: signal.message,
            detail: signal.detail,
        };
    }

    switch (signal.type) {
        case 'momentum_decay':
            return {
                message: `${sectorName} 已连续 ${consecutiveTop3} 天位于前三`,
                detail: '强势持续过久后，往往更容易出现板块轮动。可以考虑降低追高暴露。',
            };
        case 'volume_divergence':
            return {
                message: `${sectorName}：价格走弱且成交量下降`,
                detail: '板块均值和成交量同时下降，但排名仍靠前，可能是阶段性见顶信号。',
            };
        case 'rank_breakout':
            return {
                message: previousRank ? `${sectorName} 从第 ${previousRank} 名升至第 ${currentRank} 名` : `${sectorName} 排名明显改善`,
                detail: '排名大幅改善可能代表资金开始向该板块轮动。',
            };
        case 'emerging_sector':
            return {
                message: `${sectorName} 新进入前三`,
                detail: '此前相对沉寂的板块开始进入焦点，可能成为新的轮动目标。',
            };
        case 'sector_exhaustion':
            return {
                message: `${sectorName}：领涨差距 ${leaderGap == null ? '-' : leaderGap.toFixed(1)}%${leader ? `（${leader}）` : ''}`,
                detail: '如果只有领涨股表现突出，说明板块广度偏弱，后续轮动风险更高。',
            };
    }
}

function SignalBadge({ signal, language }: { signal: SectorSignal; language: Language }) {
    const config = SIGNAL_CONFIG[signal.type];
    const Icon = config.Icon;
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${SEVERITY_STYLES[signal.severity]}`}
            title={signal.detail}
        >
            <Icon size={11} aria-hidden="true" />
            {translate(language, config.labelKey)}
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
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6" preserveAspectRatio="none" aria-hidden="true">
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

function SectorCard({ item, signals, language }: { item: EnhancedSectorData; signals: SectorSignal[]; language: Language }) {
    const tx = (key: TranslationKey) => translate(language, key);
    const sectorSignals = signals.filter(s => s.sector === item.sector);
    const sectorName = translateSectorName(language, item.sector);

    return (
        <div
            className={`
                relative p-4 rounded-xl border transition-all group
                ${item.isHot
                    ? 'bg-gradient-to-br from-red-900/20 to-orange-900/10 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                    : 'bg-neutral-800/40 border-neutral-700/40 hover:border-neutral-600'}
            `}
        >
            <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-gray-200 flex items-center gap-1.5 truncate">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-mono font-bold shrink-0
                            ${item.currentRank <= 3 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-neutral-700/60 text-gray-500 border border-neutral-600/50'}`}>
                            {item.currentRank}
                        </span>
                        <span className="truncate" title={item.sector}>{sectorName}</span>
                        {item.isHot && (
                            <Flame
                                size={14}
                                className="shrink-0 text-orange-300"
                                aria-label={`${tx('hotStreakTitle')}: ${item.consecutiveTop3} ${tx('daysInTop3')}`}
                            />
                        )}
                    </h3>
                </div>
                <div className={`text-right shrink-0 ml-3 ${item.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <div className="text-base font-mono font-bold leading-tight">
                        {item.avgChange > 0 ? '+' : ''}{item.avgChange.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{tx('stocks')}</div>
                    <div className="text-sm font-mono font-semibold text-gray-300">{item.stockCount}</div>
                </div>
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{tx('volume')}</div>
                    <div className="text-sm font-mono font-semibold text-gray-300">{formatVolume(item.totalVolume)}</div>
                </div>
                <div className="bg-neutral-900/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">{tx('volDelta')}</div>
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

            {item.leader && (
                <div className="flex items-center justify-between bg-neutral-900/40 rounded-lg px-2.5 py-1.5 mb-3">
                    <div className="flex items-center gap-1.5">
                        <Trophy size={12} className="text-yellow-400" aria-hidden="true" />
                        <span className="text-[10px] text-gray-500 uppercase">{tx('leader')}</span>
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

            <div className="flex items-center gap-2 mb-3 flex-wrap">
                {item.consecutiveTop3 > 1 && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border
                        ${item.consecutiveTop3 >= 5 ? 'border-red-500/40 bg-red-900/20 text-red-300' :
                          item.consecutiveTop3 >= 3 ? 'border-orange-500/40 bg-orange-900/20 text-orange-300' :
                          'border-neutral-600 bg-neutral-800 text-gray-400'}`}>
                        <RotateCcw size={10} aria-hidden="true" />
                        {item.consecutiveTop3}{tx('dayTop3')}
                    </span>
                )}
                {item.rankDelta != null && item.rankDelta !== 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                        ${item.rankDelta > 0 ? 'border-emerald-500/40 bg-emerald-900/20 text-emerald-300' :
                          'border-red-500/40 bg-red-900/20 text-red-300'}`}>
                        {item.rankDelta > 0 ? '↑' : '↓'}{Math.abs(item.rankDelta)} {tx('rank')}
                    </span>
                )}
                {item.leaderGap != null && item.leaderGap > 2 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-900/20 text-amber-300"
                        title={tx('leaderGapHelp')}>
                        {tx('gap')} {item.leaderGap.toFixed(1)}%
                    </span>
                )}
            </div>

            {sectorSignals.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                    {sectorSignals.map((sig, i) => <SignalBadge key={i} signal={sig} language={language} />)}
                </div>
            )}

            <div className="space-y-1">
                <div className="text-[10px] text-gray-500 flex justify-between">
                    <span>{tx('rankTrend')} ({tx('lowerBetter')})</span>
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
                            title={`${h.date}: ${tx('rank')} #${h.rank} | ${tx('average')} ${h.avgChange > 0 ? '+' : ''}${h.avgChange.toFixed(2)}%`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SignalPanel({ signals, sectors, language }: { signals: SectorSignal[]; sectors: EnhancedSectorData[]; language: Language }) {
    const tx = (key: TranslationKey) => translate(language, key);
    if (signals.length === 0) return null;

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                {tx('rotationSignals')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {signals.map((sig, i) => {
                    const config = SIGNAL_CONFIG[sig.type];
                    const Icon = config.Icon;
                    const sector = sectors.find((item) => item.sector === sig.sector);
                    const copy = getSignalCopy(sig, sector, language);
                    return (
                        <div
                            key={i}
                            className={`rounded-lg border px-3 py-2.5 ${SEVERITY_STYLES[sig.severity]}`}
                        >
                            <div className="flex items-start gap-2">
                                <Icon size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold leading-tight">{copy.message}</div>
                                    <div className="text-[11px] opacity-70 mt-0.5 leading-snug">{copy.detail}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function SectorTrendRadar({ apiUrl, language }: TrendProps) {
    const [data, setData] = useState<EnhancedSectorTrends | null>(null);
    const [loading, setLoading] = useState(true);
    const tx = (key: TranslationKey) => translate(language, key);

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
                {tx('loadingRadar')}
            </div>
        );
    }

    if (!data || data.sectors.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500 bg-neutral-800/30 rounded-xl border border-neutral-700/50">
                <h3 className="text-lg font-bold mb-2">{tx('noRadarDataYet')}</h3>
                <p className="text-sm">{tx('radarDataHelp')}</p>
                <div className="mt-4 text-xs bg-blue-900/20 text-blue-400 inline-block px-3 py-1 rounded">
                    {tx('radarTip')}
                </div>
            </div>
        );
    }

    const { sectors, signals } = data;

    return (
        <div className="space-y-6">
            <SignalPanel signals={signals} sectors={sectors} language={language} />

            <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                    {tx('sectorRankings')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sectors.map((item) => (
                        <SectorCard key={item.sector} item={item} signals={signals} language={language} />
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-gray-500 pt-2 border-t border-neutral-800">
                <span className="inline-flex items-center gap-1">
                    <Flame size={12} className="text-orange-300" aria-hidden="true" />
                    <span className="text-gray-400">{tx('hotStreak')}</span> ({tx('legendHotStreak')})
                </span>
                <span className="inline-flex items-center gap-1">
                    <Leaf size={12} className="text-blue-300" aria-hidden="true" />
                    <span className="text-gray-400">{tx('emerging')}</span> ({tx('legendEmerging')})
                </span>
                <span className="inline-flex items-center gap-1">
                    <AlertTriangle size={12} className="text-amber-300" aria-hidden="true" />
                    <span className="text-gray-400">{tx('divergence')}</span> ({tx('legendDivergence')})
                </span>
                <span className="inline-flex items-center gap-1">
                    <TrendingDown size={12} className="text-red-300" aria-hidden="true" />
                    <span className="text-gray-400">{tx('decay')}</span> ({tx('legendDecay')})
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-red-500" /> {tx('top3')}
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-orange-500/60" /> {tx('top5')}
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-yellow-500/30" /> {tx('top7')}
                    <span className="inline-block w-3 h-1.5 rounded-sm bg-neutral-700/50" /> {tx('other')}
                </span>
            </div>
        </div>
    );
}
