
import { PrismaClient } from '@prisma/client';
import { fetchMarketMovers } from '../scanner/market-movers.js';
import { analyzeStockValue } from '../scanner/value-analyzer.js';

const prisma = new PrismaClient();

export async function captureDailySectorStats() {
    console.log('[Analytics] Starting daily sector stats capture...');

    try {
        // 1. Fetch Top 50 Active Stocks to get a good sample size
        // Using 'active' as a proxy for where the money is flowing
        const movers = await fetchMarketMovers('active', 50);

        // 2. Enrich with Sector Data
        // We need analyzeStockValue to get the sector
        const enriched = await Promise.all(movers.map(async (m) => {
            const val = await analyzeStockValue(m.symbol);
            return {
                ...m,
                sector: val?.sector || 'Unknown'
            };
        }));

        // 3. Group by Sector
        const sectorGroups: Record<string, typeof enriched> = {};

        enriched.forEach(stock => {
            if (stock.sector === 'Unknown') return;
            if (!sectorGroups[stock.sector]) {
                sectorGroups[stock.sector] = [];
            }
            sectorGroups[stock.sector].push(stock);
        });

        // 4. Calculate Stats & Prepare DB Records
        const now = new Date();
        const dayStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
        ));
        const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const statsToSave = Object.entries(sectorGroups).map(([sector, stocks]) => {
            const count = stocks.length;
            const totalVolume = stocks.reduce((sum, s) => sum + s.volume, 0);
            const avgChange = stocks.reduce((sum, s) => sum + s.changePercent, 0) / count;

            // Find Leader
            const leader = stocks.reduce((prev, current) =>
                (prev.changePercent > current.changePercent) ? prev : current
            );

            return {
                date: dayStart,
                sector,
                stockCount: count,
                avgChange,
                totalVolume,
                leaderSymbol: leader.symbol,
                leaderChange: leader.changePercent
            };
        });

        // 5. Sort by Count (Rank)
        statsToSave.sort((a, b) => b.stockCount - a.stockCount);

        // 6. Save to DB
        console.log(`[Analytics] Saving ${statsToSave.length} sector stats...`);

        await prisma.$transaction(async (tx) => {
            await tx.sectorStat.deleteMany({
                where: {
                    date: {
                        gte: dayStart,
                        lt: nextDay
                    }
                }
            });

            for (let i = 0; i < statsToSave.length; i++) {
                const stat = statsToSave[i];
                await tx.sectorStat.create({
                    data: {
                        ...stat,
                        rank: i + 1
                    }
                });
            }
        });

        console.log('[Analytics] Sector stats captured successfully.');
        return statsToSave;

    } catch (error) {
        console.error('[Analytics] Failed to capture sector stats:', error);
        throw error;
    }
}

export async function getSectorTrends(days = 7) {
    // Get last N days of stats
    const stats = await prisma.sectorStat.findMany({
        where: {
            date: {
                gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
            }
        },
        orderBy: {
            date: 'asc'
        }
    });
    return stats;
}

/** Enhanced sector analysis with prediction signals */
export async function getEnhancedSectorTrends(days = 14) {
    const stats = await getSectorTrends(days);
    if (stats.length === 0) return { sectors: [], signals: [] };

    const sectors = Array.from(new Set(stats.map(s => s.sector)));
    const dates = Array.from(new Set(stats.map(s =>
        new Date(s.date).toISOString().split('T')[0]
    ))).sort();

    const latestDate = dates[dates.length - 1];

    type Signal = {
        type: 'momentum_decay' | 'volume_divergence' | 'rank_breakout' | 'sector_exhaustion' | 'emerging_sector';
        sector: string;
        severity: 'info' | 'warning' | 'alert';
        message: string;
        detail: string;
    };

    const signals: Signal[] = [];

    const sectorAnalysis = sectors.map(sector => {
        const history = stats
            .filter(s => s.sector === sector)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const current = history.find(s =>
            new Date(s.date).toISOString().split('T')[0] === latestDate
        );

        // --- Consecutive Top 3 ---
        let consecutiveTop3 = 0;
        for (const rec of history) {
            if (rec.rank <= 3) consecutiveTop3++;
            else break;
        }

        // --- Volume Change Rate (latest vs avg of previous 3 days) ---
        let volumeChangeRate: number | null = null;
        if (history.length >= 2) {
            const currentVol = history[0]?.totalVolume ?? 0;
            const prevVols = history.slice(1, 4).map(h => h.totalVolume);
            const avgPrevVol = prevVols.reduce((a, b) => a + b, 0) / prevVols.length;
            if (avgPrevVol > 0) {
                volumeChangeRate = ((currentVol - avgPrevVol) / avgPrevVol) * 100;
            }
        }

        // --- Rank Jump Detection ---
        let rankDelta: number | null = null;
        if (history.length >= 2) {
            const prevRank = history[1]?.rank ?? history[0]?.rank ?? 0;
            const curRank = history[0]?.rank ?? 0;
            rankDelta = prevRank - curRank; // positive = improved
        }

        // --- Divergence: avg change trend vs volume trend ---
        let divergenceFlag = false;
        if (history.length >= 3) {
            const recentChanges = history.slice(0, 3).map(h => h.avgChange);
            const recentVolumes = history.slice(0, 3).map(h => h.totalVolume);
            const changeDecreasing = recentChanges[0] < recentChanges[1] && recentChanges[1] < recentChanges[2];
            const volumeDecreasing = recentVolumes[0] < recentVolumes[1];
            // Price weakening + volume dropping = bearish divergence
            if (changeDecreasing && volumeDecreasing && (current?.rank ?? 99) <= 3) {
                divergenceFlag = true;
            }
        }

        // --- Avg change standard deviation (intra-sector dispersion proxy) ---
        // We approximate with leader vs avg gap
        let leaderGap: number | null = null;
        if (current && current.leaderChange != null) {
            leaderGap = current.leaderChange - current.avgChange;
        }

        // --- Generate Signals ---
        const curRank = current?.rank ?? 999;

        // Momentum Decay: Top3 for 5+ days, watch for exhaustion
        if (consecutiveTop3 >= 5) {
            signals.push({
                type: 'momentum_decay',
                sector,
                severity: 'warning',
                message: `${sector} has been Top 3 for ${consecutiveTop3} days`,
                detail: 'Extended hot streaks often precede sector rotation. Consider reducing exposure.'
            });
        }

        // Volume Divergence
        if (divergenceFlag) {
            signals.push({
                type: 'volume_divergence',
                sector,
                severity: 'alert',
                message: `${sector}: price weakening with declining volume`,
                detail: 'Avg change and volume both declining while still ranked high — possible topping signal.'
            });
        }

        // Rank Breakout: jumped 4+ ranks
        if (rankDelta != null && rankDelta >= 4) {
            signals.push({
                type: 'rank_breakout',
                sector,
                severity: 'info',
                message: `${sector} surged from #${(curRank + rankDelta)} to #${curRank}`,
                detail: 'Large rank improvement may indicate early capital rotation into this sector.'
            });
        }

        // Emerging Sector: was below #5 for a while, now entering Top 3
        if (curRank <= 3 && history.length >= 3) {
            const prevAvgRank = history.slice(1, 4).reduce((s, h) => s + h.rank, 0) / Math.min(history.length - 1, 3);
            if (prevAvgRank > 5) {
                signals.push({
                    type: 'emerging_sector',
                    sector,
                    severity: 'info',
                    message: `${sector} emerging into Top 3 (prev avg rank: #${prevAvgRank.toFixed(0)})`,
                    detail: 'Previously dormant sector entering the spotlight — potential new rotation target.'
                });
            }
        }

        // Sector Exhaustion: high leader gap (leader carrying the sector alone)
        if (leaderGap != null && leaderGap > 3 && curRank <= 5) {
            signals.push({
                type: 'sector_exhaustion',
                sector,
                severity: 'warning',
                message: `${sector}: leader gap ${leaderGap.toFixed(1)}% (${current?.leaderSymbol})`,
                detail: 'When only the leader is performing, sector breadth is weak — rotation risk.'
            });
        }

        return {
            sector,
            currentRank: curRank,
            avgChange: current?.avgChange ?? 0,
            totalVolume: current?.totalVolume ?? 0,
            consecutiveTop3,
            leader: current?.leaderSymbol ?? null,
            leaderChange: current?.leaderChange ?? null,
            stockCount: current?.stockCount ?? 0,
            volumeChangeRate,
            rankDelta,
            divergenceFlag,
            leaderGap,
            isHot: consecutiveTop3 >= 3,
            history: history.slice(0, 10).map(h => ({
                date: new Date(h.date).toISOString().split('T')[0],
                rank: h.rank,
                avgChange: h.avgChange,
                totalVolume: h.totalVolume,
                stockCount: h.stockCount
            }))
        };
    }).sort((a, b) => a.currentRank - b.currentRank);

    // Sort signals: alerts first, then warnings, then info
    const severityOrder = { alert: 0, warning: 1, info: 2 };
    signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return { sectors: sectorAnalysis, signals };
}
