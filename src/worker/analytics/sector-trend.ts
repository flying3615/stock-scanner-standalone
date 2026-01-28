
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
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);

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
