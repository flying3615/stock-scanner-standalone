import test from 'node:test';
import assert from 'node:assert/strict';

import type { OptionSignalLite, SupportResistanceResult } from '../shared.js';
import { planCreditSpreadCandidates } from './credit-spread-planner.js';

function makeSignal(overrides: Partial<OptionSignalLite> & Pick<OptionSignalLite, 'type' | 'strike' | 'expiryISO' | 'mid'>): OptionSignalLite {
  return {
    symbol: 'AAPL',
    volume: 1000,
    openInterest: 2000,
    notional: 100000,
    pos: 0,
    direction: 'neutral',
    lastTradeISO: '2026-03-20T12:00:00Z',
    ageMin: 5,
    rmp: 100,
    moneyness: 1,
    daysToExpiry: 5,
    marketCap: 1000000000,
    notionalToMarketCap: 0.0001,
    isDeepOTMPut: false,
    tenorBucket: 'short',
    isShortTermSpec: true,
    isLongTermHedge: false,
    comboId: '',
    comboType: 'single',
    isComboHedge: false,
    isLargeOTMCall: false,
    hedgeScore: 0,
    hedgeTags: [],
    iv: 0.3,
    spreadPct: 0.02,
    traderType: 'institutional',
    spotConfirmation: 'weak',
    daysToEarnings: null,
    directionConfidence: 0.8,
    signalQuality: 0.8,
    ...overrides,
    last: overrides.mid,
    bid: overrides.mid - 0.1,
    ask: overrides.mid + 0.1,
    mid: overrides.mid,
  };
}

function makeStructure(): SupportResistanceResult {
  return {
    symbol: 'AAPL',
    supportLevels: [95],
    resistanceLevels: [100],
    dynamicSupport: 95,
    dynamicResistance: 100,
    breakSignals: [],
  };
}

test('bear call selection chooses short and long calls above resistance', () => {
  const scan = {
    symbol: 'AAPL',
    rmp: 102,
    moneyFlowStrength: -0.4,
    marketState: 'REGULAR',
    signals: [
      makeSignal({ type: 'call', strike: 107, expiryISO: '2026-03-27T00:00:00Z', mid: 1.5, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 105, expiryISO: '2026-03-27T00:00:00Z', mid: 2.4, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 107.499999999, expiryISO: '2026-03-27T00:00:00Z', mid: 0.8, daysToExpiry: 7 }),
    ],
  } as any;

  const candidates = planCreditSpreadCandidates(scan, makeStructure(), {
    widthLadder: [2.5],
    minCreditPctWidth: 0.2,
  });

  const candidate = candidates.find((item) => item.strategyType === 'BEAR_CALL_CREDIT');
  assert.ok(candidate);
  assert.equal(candidate?.shortLeg.putCall, 'CALL');
  assert.equal(candidate?.longLeg.putCall, 'CALL');
  assert.ok((candidate?.shortLeg.strike ?? 0) > 100);
  assert.ok((candidate?.longLeg.strike ?? 0) > (candidate?.shortLeg.strike ?? 0));
  assert.equal(candidate?.shortLeg.expiry, '20260327');
  assert.equal(candidate?.longLeg.expiry, '20260327');
  assert.equal(candidate?.invalidationPrice, 105);
  assert.match(candidate?.entryReason ?? '', /resistance/i);
});

test('bull put selection chooses short and long puts below support', () => {
  const scan = {
    symbol: 'AAPL',
    rmp: 98,
    moneyFlowStrength: 0.35,
    marketState: 'REGULAR',
    signals: [
      makeSignal({ type: 'put', strike: 93, expiryISO: '2026-03-27T00:00:00Z', mid: 2.2, daysToExpiry: 7 }),
      makeSignal({ type: 'put', strike: 91, expiryISO: '2026-03-27T00:00:00Z', mid: 1.3, daysToExpiry: 7 }),
    ],
  } as any;

  const candidates = planCreditSpreadCandidates(scan, makeStructure(), {
    widthLadder: [2, 5],
    minCreditPctWidth: 0.2,
  });

  const candidate = candidates.find((item) => item.strategyType === 'BULL_PUT_CREDIT');
  assert.ok(candidate);
  assert.equal(candidate?.shortLeg.putCall, 'PUT');
  assert.equal(candidate?.longLeg.putCall, 'PUT');
  assert.ok((candidate?.shortLeg.strike ?? 0) < 95);
  assert.ok((candidate?.longLeg.strike ?? 0) < (candidate?.shortLeg.strike ?? 0));
  assert.equal(candidate?.invalidationPrice, 95);
  assert.match(candidate?.entryReason ?? '', /support/i);
});

test('planner rejects candidates when width or credit thresholds fail', () => {
  const widthRejected = planCreditSpreadCandidates(
    {
      symbol: 'AAPL',
      rmp: 102,
      moneyFlowStrength: -0.4,
      marketState: 'REGULAR',
      signals: [
        makeSignal({ type: 'call', strike: 105, expiryISO: '2026-03-27T00:00:00Z', mid: 2.2, daysToExpiry: 7 }),
        makeSignal({ type: 'call', strike: 108, expiryISO: '2026-03-27T00:00:00Z', mid: 1.1, daysToExpiry: 7 }),
      ],
    } as any,
    makeStructure(),
    {
      widthLadder: [1, 2],
      minCreditPctWidth: 0.2,
    }
  );

  const creditRejected = planCreditSpreadCandidates(
    {
      symbol: 'AAPL',
      rmp: 102,
      moneyFlowStrength: -0.4,
      marketState: 'REGULAR',
      signals: [
        makeSignal({ type: 'call', strike: 105, expiryISO: '2026-03-27T00:00:00Z', mid: 1.15, daysToExpiry: 7 }),
        makeSignal({ type: 'call', strike: 107, expiryISO: '2026-03-27T00:00:00Z', mid: 1.0, daysToExpiry: 7 }),
      ],
    } as any,
    makeStructure(),
    {
      widthLadder: [2],
      minCreditPctWidth: 0.2,
    }
  );

  assert.equal(widthRejected.length, 0);
  assert.equal(creditRejected.length, 0);
});

test('planner emits a stable idempotencyKey', () => {
  const scan = {
    symbol: 'AAPL',
    rmp: 102,
    moneyFlowStrength: -0.4,
    marketState: 'REGULAR',
    signals: [
      makeSignal({ type: 'call', strike: 110, expiryISO: '2026-03-27T00:00:00Z', mid: 0.8, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 105, expiryISO: '2026-03-27T00:00:00Z', mid: 2.4, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 107, expiryISO: '2026-03-27T00:00:00Z', mid: 1.5, daysToExpiry: 7 }),
    ],
  } as any;

  const structure = makeStructure();
  const first = planCreditSpreadCandidates(scan, structure, {
    widthLadder: [2, 5],
    minCreditPctWidth: 0.2,
  });

  const noisyScan = {
    ...scan,
    signals: [
      makeSignal({ type: 'call', strike: 110.000000001, expiryISO: '2026-03-27T00:00:00Z', mid: 0.8, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 105.000000001, expiryISO: '2026-03-27T00:00:00Z', mid: 2.4, daysToExpiry: 7 }),
      makeSignal({ type: 'call', strike: 107.000000002, expiryISO: '2026-03-27T00:00:00Z', mid: 1.5, daysToExpiry: 7 }),
    ],
  } as any;

  const second = planCreditSpreadCandidates(
    noisyScan,
    structure,
    {
      widthLadder: [2, 5],
      minCreditPctWidth: 0.2,
    }
  );

  assert.equal(first[0]?.idempotencyKey, second[0]?.idempotencyKey);
  assert.equal(first[0]?.idempotencyKey, 'AAPL:BEAR_CALL_CREDIT:2026-03-27T00:00:00Z:105.0000:107.0000');
});
