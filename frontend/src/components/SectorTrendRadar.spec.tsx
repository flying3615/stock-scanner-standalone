import test from 'node:test';
import assert from 'node:assert/strict';
import { getSectorSignalCopy } from './SectorTrendRadar';
import type { EnhancedSectorData, SectorSignal } from '../types';

const sector: EnhancedSectorData = {
  sector: 'Technology',
  currentRank: 1,
  avgChange: 5.92,
  totalVolume: 1_600_000_000,
  consecutiveTop3: 10,
  leader: 'NVTS',
  leaderChange: 19.98,
  stockCount: 27,
  volumeChangeRate: 54,
  rankDelta: 0,
  divergenceFlag: false,
  leaderGap: 14.1,
  isHot: true,
  history: [],
};

test('getSectorSignalCopy localizes backend sector signal text', () => {
  const signal: SectorSignal = {
    type: 'sector_exhaustion',
    sector: 'Technology',
    severity: 'warning',
    message: 'Technology: leader gap 14.1% (NVTS)',
    detail: 'When only the leader is performing, sector breadth is weak — rotation risk.',
  };

  assert.deepEqual(getSectorSignalCopy(signal, sector, 'zh'), {
    message: '科技：领涨差距 14.1%（NVTS）',
    detail: '如果只有领涨股表现突出，说明板块广度偏弱，后续轮动风险更高。',
  });
});

test('getSectorSignalCopy keeps backend English text in English mode', () => {
  const signal: SectorSignal = {
    type: 'momentum_decay',
    sector: 'Technology',
    severity: 'warning',
    message: 'Technology has been Top 3 for 10 days',
    detail: 'Extended hot streaks often precede sector rotation. Consider reducing exposure.',
  };

  assert.equal(getSectorSignalCopy(signal, sector, 'en').message, signal.message);
  assert.equal(getSectorSignalCopy(signal, sector, 'en').detail, signal.detail);
});
