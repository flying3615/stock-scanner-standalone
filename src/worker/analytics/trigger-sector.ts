import { captureDailySectorStats } from './sector-trend.js';

async function main() {
  try {
    await captureDailySectorStats();
    console.log('[Manual] Sector stats capture complete.');
  } catch (error) {
    console.error('[Manual] Sector stats capture failed:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

main();
