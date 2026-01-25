
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { SectorStat } from '../types';

interface TrendProps {
    apiUrl: string;
}

export function SectorTrendRadar({ apiUrl }: TrendProps) {
    const [stats, setStats] = useState<SectorStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${apiUrl}/trends/sectors`)
            .then(res => setStats(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [apiUrl]);

    // Process Data: Group by Sector and Calculate Momentum
    const sectorAnalysis = useMemo(() => {
        if (stats.length === 0) return [];

        const sectors = Array.from(new Set(stats.map(s => s.sector)));
        const dates = Array.from(new Set(stats.map(s => s.date))).sort();

        // We only care about the latest N days
        const latestDate = dates[dates.length - 1];

        return sectors.map(sector => {
            const history = stats
                .filter(s => s.sector === sector)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const current = history.find(s => s.date === latestDate);

            // Calculate Consecutive Days in Top 3
            let consecutiveTop3 = 0;
            for (const rec of history) {
                if (rec.rank <= 3) consecutiveTop3++;
                else break;
            }

            return {
                sector,
                currentRank: current?.rank ?? 999,
                avgChange: current?.avgChange ?? 0,
                consecutiveTop3,
                leader: current?.leaderSymbol,
                history, // Full history for sparkline or grid
                isHot: consecutiveTop3 >= 3
            };
        }).sort((a, b) => a.currentRank - b.currentRank); // Sort by current rank
    }, [stats]);


    if (loading) return <div className="text-gray-500 text-sm animate-pulse">Loading Radar...</div>;

    if (stats.length === 0) {
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

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sectorAnalysis.map((item) => (
                    <div
                        key={item.sector}
                        className={`
                            relative p-4 rounded-xl border transition-all
                            ${item.isHot
                                ? 'bg-gradient-to-br from-red-900/20 to-orange-900/10 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                                : 'bg-neutral-800/40 border-neutral-700/50 hover:border-neutral-600'}
                        `}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                    {item.sector}
                                    {item.isHot && <span className="text-xs">🔥</span>}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${item.currentRank <= 3 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-neutral-700 text-gray-500'}`}>
                                        #{item.currentRank}
                                    </span>
                                    {item.consecutiveTop3 > 1 && (
                                        <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wide">
                                            {item.consecutiveTop3} Days Top 3
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className={`text-right ${item.avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                <div className="text-lg font-mono font-bold">{item.avgChange > 0 ? '+' : ''}{item.avgChange.toFixed(2)}%</div>
                                <div className="text-[10px] text-gray-500">Avg Change</div>
                            </div>
                        </div>

                        {/* Leader Info */}
                        {item.leader && (
                            <div className="bg-neutral-900/50 rounded p-2 flex justify-between items-center mb-3">
                                <span className="text-[10px] text-gray-500 uppercase">Leader</span>
                                <span className="font-bold text-sm text-blue-300">{item.leader}</span>
                            </div>
                        )}

                        {/* Mini Heatmap History (Last 5 days) */}
                        <div className="flex gap-1 h-1.5 mt-auto">
                            {item.history.slice(0, 7).reverse().map((h, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 rounded-sm ${h.rank <= 3 ? 'bg-red-500' :
                                        h.rank <= 5 ? 'bg-orange-500/50' :
                                            'bg-neutral-700'
                                        }`}
                                    title={`${new Date(h.date).toLocaleDateString()}: Rank #${h.rank}`}
                                ></div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-center text-xs text-gray-500 mt-8">
                🔥 <span className="text-gray-400">Main Line Theme</span> (Top 3 for 3+ days) &nbsp;|&nbsp;
                🟦 <span className="text-gray-400">Rotation</span> (Watch for high rank shifts)
            </div>
        </div>
    );
}
