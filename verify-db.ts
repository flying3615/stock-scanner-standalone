
import prisma from './src/db/client.js';

async function main() {
    console.log('🔍 Verifying Database Content...');

    const snapshots = await prisma.stockSnapshot.findMany({
        where: { symbol: 'TMC' },
        include: {
            signals: true,
            combos: true
        },
        orderBy: { date: 'desc' },
        take: 1
    });

    if (snapshots.length === 0) {
        console.error('❌ No snapshots found for TMC');
        return;
    }

    const snap = snapshots[0];
    console.log(`✅ Snapshot found for ${snap.symbol} at ${snap.date.toISOString()}`);
    console.log(`   Price: $${snap.price}, Sentiment: ${snap.sentimentScore}`);
    console.log(`   Signals Count: ${snap.signals.length}`);
    console.log(`   Combos Count: ${snap.combos.length}`);

    if (snap.combos.length > 0) {
        console.log('\n🧩 Detected Combos:');
        snap.combos.forEach(c => {
            console.log(`   - [${c.strategy}] ${c.description} (Risk: ${c.riskProfile})`);
        });
    } else {
        console.warn('⚠️ No combos found in snapshot.');
    }

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
