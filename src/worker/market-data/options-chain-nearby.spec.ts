import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNearbyOptionsChainSnapshot, getNearbyOptionsChainSnapshot } from './options-chain-nearby.js';

const now = new Date('2026-03-12T15:30:00.000Z');

test('buildNearbyOptionsChainSnapshot filters expiries and trims strikes around ATM', () => {
  const snapshot = buildNearbyOptionsChainSnapshot({
    symbol: 'NVDA',
    spot: 100,
    asOf: now,
    chain: {
      expirationDates: [
        new Date('2026-03-16T00:00:00.000Z'),
        new Date('2026-03-30T00:00:00.000Z'),
      ],
      options: [
        {
          expirationDate: new Date('2026-03-16T00:00:00.000Z'),
          calls: [
            { contractSymbol: 'NVDA260316C00090000', strike: 90, bid: 11, ask: 12, lastPrice: 11.5, delta: 0.75, impliedVolatility: 0.55, openInterest: 2000, volume: 400, inTheMoney: true, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316C00095000', strike: 95, bid: 6, ask: 7, lastPrice: 6.5, delta: 0.6, impliedVolatility: 0.5, openInterest: 2200, volume: 500, inTheMoney: true, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316C00100000', strike: 100, bid: 3, ask: 4, lastPrice: 3.5, delta: 0.5, impliedVolatility: 0.45, openInterest: 2600, volume: 800, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316C00105000', strike: 105, bid: 1.3, ask: 1.7, lastPrice: 1.5, delta: 0.32, impliedVolatility: 0.41, openInterest: 2400, volume: 700, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316C00110000', strike: 110, bid: 0.4, ask: 0.6, lastPrice: 0.5, delta: 0.18, impliedVolatility: 0.4, openInterest: 2100, volume: 600, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
          ],
          puts: [
            { contractSymbol: 'NVDA260316P00090000', strike: 90, bid: 0.3, ask: 0.5, lastPrice: 0.4, delta: -0.16, impliedVolatility: 0.44, openInterest: 1800, volume: 500, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316P00095000', strike: 95, bid: 0.9, ask: 1.1, lastPrice: 1, delta: -0.28, impliedVolatility: 0.45, openInterest: 1900, volume: 520, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316P00100000', strike: 100, bid: 2.8, ask: 3.2, lastPrice: 3, delta: -0.5, impliedVolatility: 0.47, openInterest: 2200, volume: 800, inTheMoney: true, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316P00105000', strike: 105, bid: 5.8, ask: 6.2, lastPrice: 6, delta: -0.68, impliedVolatility: 0.5, openInterest: 2100, volume: 700, inTheMoney: true, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
            { contractSymbol: 'NVDA260316P00110000', strike: 110, bid: 10.8, ask: 11.2, lastPrice: 11, delta: -0.82, impliedVolatility: 0.55, openInterest: 1700, volume: 600, inTheMoney: true, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
          ],
        },
        {
          expirationDate: new Date('2026-03-30T00:00:00.000Z'),
          calls: [
            { contractSymbol: 'NVDA260330C00100000', strike: 100, bid: 5, ask: 6, lastPrice: 5.5, delta: 0.5, impliedVolatility: 0.5, openInterest: 1000, volume: 200, inTheMoney: false, lastTradeDate: new Date('2026-03-12T15:00:00.000Z') },
          ],
          puts: [],
        },
      ],
    },
    dteMin: 3,
    dteMax: 7,
    strikesEachSide: 1,
    now,
  });

  assert.equal(snapshot.expiries.length, 1);
  assert.equal(snapshot.expiries[0]?.expiryISO, '2026-03-16');
  assert.equal(snapshot.expiries[0]?.dte, 4);
  assert.equal(snapshot.expiries[0]?.atmStrike, 100);
  assert.deepEqual(snapshot.expiries[0]?.calls.map((row) => row.strike), [95, 100, 105]);
  assert.deepEqual(snapshot.expiries[0]?.puts.map((row) => row.strike), [95, 100, 105]);
});

test('buildNearbyOptionsChainSnapshot normalizes nullable values and derived mid prices', () => {
  const snapshot = buildNearbyOptionsChainSnapshot({
    symbol: 'TSLA',
    spot: 250,
    asOf: now,
    chain: {
      expirationDates: [new Date('2026-03-17T00:00:00.000Z')],
      options: [
        {
          expirationDate: new Date('2026-03-17T00:00:00.000Z'),
          calls: [
            { contractSymbol: 'TSLA260317C00250000', strike: 250, bid: 1, ask: 3, openInterest: 300, volume: 80, lastTradeDate: null },
            { contractSymbol: 'TSLA260317C00255000', strike: 255, bid: 0, ask: 1.2, openInterest: 100, volume: 20, lastTradeDate: null, impliedVolatility: null, delta: null },
          ],
          puts: [],
        },
      ],
    },
    dteMin: 3,
    dteMax: 7,
    strikesEachSide: 1,
    now,
  });

  assert.equal(snapshot.expiries[0]?.calls[0]?.mid, 2);
  assert.equal(snapshot.expiries[0]?.calls[1]?.mid, 1.2);
  assert.equal(snapshot.expiries[0]?.calls[1]?.impliedVolatility, null);
  assert.ok((snapshot.expiries[0]?.calls[1]?.delta ?? 0) > 0);
  assert.equal(snapshot.expiries[0]?.calls[1]?.lastTradeDate, null);
});

test('buildNearbyOptionsChainSnapshot preserves empty nearby results with an explicit reason code', () => {
  const snapshot = buildNearbyOptionsChainSnapshot({
    symbol: 'NU',
    spot: 12.54,
    asOf: now,
    chain: {
      expirationDates: [
        new Date('2026-03-13T00:00:00.000Z'),
        new Date('2026-03-20T00:00:00.000Z'),
      ],
      options: [
        {
          expirationDate: new Date('2026-03-13T00:00:00.000Z'),
          calls: [
            { contractSymbol: 'NU260313C00012500', strike: 12.5, bid: 0.2, ask: 0.25, lastPrice: 0.22, openInterest: 400, volume: 90, inTheMoney: true, lastTradeDate: now },
          ],
          puts: [],
        },
      ],
    },
    dteMin: 3,
    dteMax: 7,
    strikesEachSide: 1,
    now,
  });

  assert.deepEqual(snapshot.expiries, []);
  assert.equal(snapshot.summary.selectedExpiryCount, 0);
  assert.equal(snapshot.summary.emptyReasonCode, 'NO_EXPIRIES_IN_RANGE');
});

test('getNearbyOptionsChainSnapshot fetches additional expiries inside the requested DTE window', async () => {
  const requestedDates: string[] = [];
  const snapshot = await getNearbyOptionsChainSnapshot('NVDA', {
    dteMin: 3,
    dteMax: 7,
    strikesEachSide: 1,
    now,
    fetchOptionsSnapshot: async (_symbol, options) => {
      const requestOptions = options ?? {};
      const requestedDate = requestOptions.date?.toISOString().slice(0, 10) ?? 'initial';
      requestedDates.push(requestedDate);

      if (!requestOptions.date) {
        return {
          base: {
            quote: { regularMarketPrice: 186.03 },
            expirationDates: [
              new Date('2026-03-13T00:00:00.000Z'),
              new Date('2026-03-16T00:00:00.000Z'),
              new Date('2026-03-18T00:00:00.000Z'),
            ],
            options: [
              {
                expirationDate: new Date('2026-03-13T00:00:00.000Z'),
                calls: [
                  { contractSymbol: 'NVDA260313C00185000', strike: 185, bid: 4, ask: 4.2, lastPrice: 4.1, delta: 0.5, impliedVolatility: 0.4, openInterest: 1000, volume: 200, inTheMoney: true, lastTradeDate: now },
                ],
                puts: [],
              },
            ],
          },
          rmp: 186.03,
          marketCap: 0,
          marketState: 'REGULAR',
          options: [],
        };
      }

      return {
        base: {
          options: [
            {
              expirationDate: requestOptions.date,
              calls: [
                { contractSymbol: `NVDA${requestedDate}C00185000`, strike: 185, bid: 3, ask: 3.4, lastPrice: 3.2, delta: 0.45, impliedVolatility: 0.39, openInterest: 900, volume: 180, inTheMoney: true, lastTradeDate: now },
              ],
              puts: [
                { contractSymbol: `NVDA${requestedDate}P00185000`, strike: 185, bid: 2.8, ask: 3.1, lastPrice: 2.9, delta: -0.47, impliedVolatility: 0.38, openInterest: 870, volume: 175, inTheMoney: false, lastTradeDate: now },
              ],
            },
          ],
        },
        rmp: 186.03,
        marketCap: 0,
        marketState: 'REGULAR',
        options: [],
      };
    },
  });

  assert.deepEqual(requestedDates, ['initial', '2026-03-16', '2026-03-18']);
  assert.deepEqual(snapshot.expiries.map((expiry) => expiry.expiryISO), ['2026-03-16', '2026-03-18']);
});
