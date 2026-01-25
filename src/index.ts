
import { scanSymbolOptions } from './worker/options/options.js';
import { fetchMarketMovers, MoverType } from './worker/scanner/market-movers.js';
import { analyzeStockValue } from './worker/scanner/value-analyzer.js';
import { saveScanResult } from './db/persistence.js';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

dotenv.config();

async function runOptionsScan(symbol: string, valueAnalysis?: any) {
  console.log(`\n🔍 Scanning options for ${symbol}...`);
  try {
    const result = await scanSymbolOptions(symbol, true, {
      regularFreshWindowMins: 60,
      nonRegularFreshWindowMins: 4320, // 72 hours to cover weekends
      polygonApiKey: process.env.POLYGON_API_KEY,
      minVolume: 10,
      minNotional: 5000,
      minRatio: 0.01,
      callOTMMin: 0.85,  // Allow slightly ITM
      putOTMMax: 1.15    // Allow slightly ITM
    });

    // Save snapshot to database
    await saveScanResult(symbol, result, valueAnalysis);

    console.log(`   Signal Strength: ${result.moneyFlowStrength.toFixed(2)}`);
    if (result.signals.length > 0) {
      console.log(`   Signals: ${result.signals.length}`);
      result.signals.slice(0, 3).forEach(sig => {
        console.log(`   - [${sig.type.toUpperCase()}] ${sig.strike} @ ${sig.expiryISO} (Conf: ${sig.directionConfidence?.toFixed(2)})`);
      });
    } else {
      console.log(`   No significant options signals.`);
    }
  } catch (error) {
    console.error(`   ❌ Options scan failed for ${symbol}:`, error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--market') {
    const type = (args[1] || 'active') as MoverType;
    console.log(`🚀 Fetching ${type} market movers...`);
    const movers = await fetchMarketMovers(type);

    console.log(`\nFound ${movers.length} movers. Analyzing value...`);
    const results = [];

    for (const mover of movers) {
      //   console.log(`Analyzing ${mover.symbol}...`);
      const value = await analyzeStockValue(mover.symbol);
      if (value) {
        results.push(value);
      }
      // Small delay to be polite to API
      await setTimeout(500);
    }

    // Sort by value score
    results.sort((a, b) => b.score - a.score);

    console.log('\n🏆 Top Value Picks from Market Movers:');
    console.log('----------------------------------------------------------------');
    console.log(`${'Symbol'.padEnd(8)} ${'Score'.padEnd(6)} ${'Price'.padEnd(10)} ${'P/B'.padEnd(8)} ${'ROE'.padEnd(8)} ${'Reasons'}`);
    console.log('----------------------------------------------------------------');

    for (const res of results) {
      console.log(`${res.symbol.padEnd(8)} ${res.score.toString().padEnd(6)} $${res.price.toFixed(2).padEnd(9)} ${res.metrics.pb.toFixed(2).padEnd(8)} ${res.metrics.roe.toFixed(1)}%   ${res.reasons.join(', ')}`);
    }

    // Automatically scan options for top 3 high-value stocks
    const topPicks = results.filter(r => r.score >= 3).slice(0, 3);
    if (topPicks.length > 0) {
      console.log('\n👀 Checking Options Flow for Top Picks...');
      for (const pick of topPicks) {
        await runOptionsScan(pick.symbol, pick);
      }
    }

  } else if (mode === '--value') {
    const symbol = args[1];
    if (!symbol) {
      console.error('Please specify a symbol: --value AAPL');
      return;
    }
    const value = await analyzeStockValue(symbol);
    if (value) {
      console.log('\n📊 Value Analysis:', symbol);
      console.log(`   Score: ${value.score}/6`);
      console.log(`   P/E: ${value.metrics.pe.toFixed(2)}, P/B: ${value.metrics.pb.toFixed(2)}, ROE: ${value.metrics.roe.toFixed(2)}%`);
      console.log(`   Reasons: ${value.reasons.join(', ')}`);

      await runOptionsScan(symbol, value);
    }

  } else {
    // Default mode: Options Scan only
    const symbol = mode || 'AAPL';
    await runOptionsScan(symbol);
  }
}

main();
