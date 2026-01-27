import { useMemo } from 'react';
import type { Stock } from '../types';
import { getSectorColorClass } from '../utils/sectorColors';

interface SectorStatsProps {
    stocks: Stock[];
}

export function SectorStats({ stocks }: SectorStatsProps) {
    const stats = useMemo(() => {
        const sectorCounts: Record<string, number> = {};
        const industryCounts: Record<string, number> = {};

        stocks.forEach(s => {
            if (s.sector) {
                sectorCounts[s.sector] = (sectorCounts[s.sector] || 0) + 1;
            }
            if (s.industry) {
                industryCounts[s.industry] = (industryCounts[s.industry] || 0) + 1;
            }
        });

        const sortedSectors = Object.entries(sectorCounts)
            .sort((a, b) => b[1] - a[1]);

        // Only show industries appearing more than once, or top 5 if many
        const sortedIndustries = Object.entries(industryCounts)
            .filter(([_, count]) => count > 1) // Only interesting ones
            .sort((a, b) => b[1] - a[1]);

        return { sectors: sortedSectors, industries: sortedIndustries };
    }, [stocks]);

    if (stats.sectors.length === 0) return null;

    return (
        <div className="mb-6 bg-neutral-800/30 border border-neutral-700/30 rounded-xl p-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Market Composition</h3>

            {/* Sectors */}
            <div className="mb-4">
                <div className="flex flex-wrap gap-2">
                    {stats.sectors.map(([sector, count]) => (
                        <div key={sector} className={`flex items-center border rounded-md px-2 py-1 ${getSectorColorClass(sector)}`}>
                            <span className="text-xs font-medium mr-2">{sector}</span>
                            <span className="text-xs font-mono font-bold bg-white/10 px-1.5 rounded">
                                {count}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Hot Industries (if any repeated) */}
            {stats.industries.length > 0 && (
                <div className="border-t border-neutral-700/50 pt-3 flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 uppercase shrink-0">Hot Industries:</span>
                    <div className="flex flex-wrap gap-2">
                        {stats.industries.map(([industry, count]) => (
                            <span key={industry} className="text-[10px] text-gray-400 flex items-center gap-1">
                                {industry}
                                <span className="text-gray-500">({count})</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
