import prisma from './client.js';
import { OptionSignalLite } from '../worker/shared.js';
import { detectMarketFromSymbol } from '../worker/markets.js';

interface ScanResult {
    moneyFlowStrength: number;
    signals: OptionSignalLite[];
    sentiment: {
        symbol: string;
        sentiment: number;
        // other fields...
    };
    // other fields...
}

/**
 * Saves a scan snapshot including signals and combos to the database.
 */
export async function saveScanResult(symbol: string, result: any, valueAnalysis?: any) {
    try {
        const { moneyFlowStrength, signals, sentiment } = result;
        const price = result.rmp || 0;

        // Extract combos
        const comboMap = new Map<string, OptionSignalLite[]>();
        const combos: any[] = [];

        for (const s of signals) {
            if (s.comboId) {
                if (!comboMap.has(s.comboId)) {
                    comboMap.set(s.comboId, []);

                    // Clean up strategy name: remove ID suffix (e.g. "-a2f3") and format camelCase
                    let cleanStrategy = s.comboType || 'Unknown';
                    // Remove suffix starting with dash followed by alphanumeric
                    cleanStrategy = cleanStrategy.replace(/-[a-z0-9]+$/i, '');
                    // Convert camelCase to Space Case (e.g. bearPutVertical -> Bear Put Vertical)
                    cleanStrategy = cleanStrategy.replace(/([A-Z])/g, ' $1').trim();
                    // Capitalize first letter if needed
                    cleanStrategy = cleanStrategy.charAt(0).toUpperCase() + cleanStrategy.slice(1);

                    const description = `${cleanStrategy} ${s.expiryISO.split('T')[0]}`;

                    if (!combos.find(c => c.comboId === s.comboId)) {
                        combos.push({
                            strategy: cleanStrategy,
                            description,
                            notional: 0,
                            riskProfile: 'Unknown',
                            comboId: s.comboId
                        });
                    }
                }
                comboMap.get(s.comboId)?.push(s);
            }
        }

        for (const c of combos) {
            const legs = comboMap.get(c.comboId) || [];
            c.notional = legs.reduce((sum, leg) => sum + leg.notional, 0);
            if (c.strategy.toLowerCase().includes('bull')) c.riskProfile = 'Bullish';
            else if (c.strategy.toLowerCase().includes('bear')) c.riskProfile = 'Bearish';
            else c.riskProfile = 'Hedge/Neutral';
        }

        await prisma.$transaction(async (tx) => {
            const snapshot = await tx.stockSnapshot.create({
                data: {
                    symbol: symbol.toUpperCase(),
                    market: detectMarketFromSymbol(symbol),
                    price,
                    valueScore: valueAnalysis ? valueAnalysis.score : 0,
                    sentimentScore: sentiment.sentiment,
                    moneyFlowStrength,
                },
            });

            if (signals.length > 0) {
                await tx.optionSignal.createMany({
                    data: signals.map((s: any) => ({
                        snapshotId: snapshot.id,
                        type: s.type,
                        strike: s.strike,
                        expiry: new Date(s.expiryISO),
                        notional: s.notional,
                        direction: s.direction
                    }))
                });
            }

            if (combos.length > 0) {
                await tx.optionCombo.createMany({
                    data: combos.map((c: any) => ({
                        snapshotId: snapshot.id,
                        strategy: c.strategy,
                        description: c.description,
                        notional: c.notional,
                        riskProfile: c.riskProfile
                    }))
                });
            }
        });

        console.log(`[Persistence] Saved snapshot for ${symbol}`);
    } catch (error) {
        console.error(`[Persistence] Failed to save snapshot for ${symbol}:`, error);
    }
}

/**
 * Retrieves historical snapshots for a symbol.
 */
export async function getHistory(symbol: string) {
    try {
        const snapshots = await prisma.stockSnapshot.findMany({
            where: { symbol: symbol.toUpperCase() },
            orderBy: { date: 'asc' },
            include: {
                combos: true // Include combos for details if needed
            }
        });
        return snapshots;
    } catch (error) {
        console.error(`[Persistence] Failed to get history for ${symbol}:`, error);
        return [];
    }
}
