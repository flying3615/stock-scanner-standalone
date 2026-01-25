import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { OptionSignalLite } from '../shared.ts';
import { timeout, toNum, minutesSince, computePos, classify } from '../util.ts';
import { identifyCombos } from './combos.ts';

// Timeouts (ms) to guard yahooFinance.options() calls
const CHAIN_TIMEOUT_MS = 15_000; // per-expiration options chain fetch

/**
 * Enhanced direction detection using multiple factors.
 * Returns direction and confidence score (0-1).
 */
function calculateEnhancedDirection(
  last: number,
  bid: number,
  ask: number,
  volume: number,
  openInterest: number,
  spreadPct: number
): { direction: 'buy' | 'sell' | 'neutral'; confidence: number } {
  // 1. Base position score (-1 to 1)
  const mid = (bid + ask) / 2;
  const halfSpread = (ask - bid) / 2 || 0.01;
  const posScore = mid > 0 ? Math.max(-1, Math.min(1, (last - mid) / halfSpread)) : 0;

  // 2. Volume/OI ratio bonus (new position likelihood)
  const volOIRatio = openInterest > 0 ? volume / openInterest : 2;
  const isNewPosition = volOIRatio > 1;

  // 3. Spread penalty (wide spread reduces confidence)
  const spreadPenalty = Math.min(1, spreadPct / 0.15);

  // 4. Calculate confidence
  let confidence = Math.max(0, 1 - spreadPenalty * 0.6);

  // 5. Edge cases that force neutral
  if (last === ask || last === bid) {
    // Exactly at bid/ask is ambiguous
    confidence *= 0.5;
  }

  // Boost confidence for new positions with clear direction
  if (isNewPosition && Math.abs(posScore) > 0.5) {
    confidence = Math.min(1, confidence * 1.2);
  }

  // 6. Direction determination
  const threshold = 0.3;
  if (confidence < 0.25 || Math.abs(posScore) < threshold) {
    return { direction: 'neutral', confidence: confidence * 0.5 };
  }

  return {
    direction: posScore > 0 ? 'buy' : 'sell',
    confidence: confidence * (0.5 + 0.5 * Math.abs(posScore))
  };
}

/**
 * Classify trader type based on relative contract size, not fixed dollar amounts.
 * This accounts for different stock prices.
 */
function classifyTraderType(
  notional: number,
  rmp: number,
  volume: number
): 'institutional' | 'retail' | 'mixed' {
  // Contract value = stock price × 100
  const contractValue = rmp * 100;
  // Equivalent contracts = notional / contract value
  const equivalentContracts = contractValue > 0 ? notional / contractValue : 0;

  // Institutional threshold: 500 contracts (≈ $5M at $100 stock)
  // Also use absolute floor for very low-priced stocks
  if (equivalentContracts >= 500 || notional >= 2_000_000) {
    return 'institutional';
  }

  // Retail threshold: < 20 contracts (≈ $200K at $100 stock)
  // Also use absolute ceiling for very high-priced stocks
  if (equivalentContracts < 20 && notional < 100_000) {
    return 'retail';
  }

  return 'mixed';
}

/**
 * Calculate overall signal quality score (0-1).
 */
function calculateSignalQuality(
  directionConfidence: number,
  spreadPct: number,
  spotConfirmation: 'strong' | 'weak' | 'contradiction' | null,
  traderType: 'institutional' | 'retail' | 'mixed',
  hedgeScore: number
): number {
  // Weighted factors
  const directionWeight = 0.30;
  const spreadWeight = 0.20;
  const confirmWeight = 0.20;
  const traderWeight = 0.15;
  const hedgeWeight = 0.15;

  // Calculate individual scores
  const spreadScore = Math.max(0, 1 - spreadPct / 0.20);
  const confirmScore = spotConfirmation === 'strong' ? 1.0 :
    spotConfirmation === 'weak' ? 0.5 :
      spotConfirmation === 'contradiction' ? 0.2 : 0.5;
  const traderScore = traderType === 'institutional' ? 1.0 :
    traderType === 'mixed' ? 0.7 : 0.5;
  const directionalScore = 1 - hedgeScore; // Lower hedge = more directional

  return (
    directionConfidence * directionWeight +
    spreadScore * spreadWeight +
    confirmScore * confirmWeight +
    traderScore * traderWeight +
    directionalScore * hedgeWeight
  );
}

/**
 * Processes all expiration dates for a symbol and collects signals.
 */
export async function processExpirations(
  symbol: string,
  targetDates: Date[],
  rmp: number,
  marketCap: number,
  freshWindowMins: number,
  scanCfg: any,
  debug: boolean,
  dbg: any
): Promise<OptionSignalLite[]> {
  const signals: OptionSignalLite[] = [];
  // Collect all valid candidates (without OTM-band gating) for combo detection
  const candidates: OptionSignalLite[] = [];

  for (const expDate of targetDates) {
    if (debug)
      console.log(
        `[processExpirations] Processing expiration date: ${expDate.toISOString()} for ${symbol}`
      );
    const chain = await timeout(
      CHAIN_TIMEOUT_MS,
      yahooFinance.options(symbol, { date: expDate }, { validateResult: false })
    );
    if (debug)
      console.log(
        `[processExpirations] Options chain fetched for ${symbol} at ${expDate.toISOString()}`
      );

    const legs = Array.isArray(chain?.options) ? chain.options : [];
    for (const leg of legs) {
      const expISO =
        leg?.expirationDate instanceof Date
          ? leg.expirationDate.toISOString()
          : typeof leg?.expirationDate === 'string'
            ? leg.expirationDate
            : expDate.toISOString();

      const processSide = (arr: any[], type: 'call' | 'put') => {
        if (debug)
          console.log(
            `[processExpirations] Processing ${type}s for ${symbol} at ${expISO}`
          );
        if (!Array.isArray(arr)) return;
        for (const c of arr) {
          if (debug) dbg.totalContracts++;
          const strike = toNum(c?.strike);
          if (type === 'call' && !(rmp > 0)) {
            if (debug) {
              dbg.skippedPriceBand++;
              console.log(
                `[processExpirations] Skipped CALL due to invalid rmp: rmp=${rmp}`
              );
            }
            continue;
          }

          const callOTMMin = Number.isFinite(scanCfg?.callOTMMin)
            ? scanCfg.callOTMMin
            : 1.05;
          const callBandMax = Number.isFinite(scanCfg?.callBandMax)
            ? scanCfg.callBandMax
            : 1.6;
          const putOTMMax = Number.isFinite(scanCfg?.putOTMMax)
            ? scanCfg.putOTMMax
            : 0.95;
          const putBandMin = Number.isFinite(scanCfg?.putBandMin)
            ? Math.max(0.1, Math.min(putOTMMax, scanCfg.putBandMin))
            : 0.4;

          // Determine OTM band membership but do not early-continue; we want to keep candidates for combo detection.
          let withinBand = true;
          let mn = 0;
          let callMinStrike = 0;
          let callMaxStrike = 0;
          let putMaxStrike = 0;
          let putMinStrike = 0;
          if (rmp > 0) {
            mn = strike / rmp;
            if (type === 'call') {
              callMinStrike = rmp * callOTMMin;
              callMaxStrike = rmp * callBandMax;
              withinBand = mn >= callOTMMin && strike <= callMaxStrike;
              if (!withinBand && debug) {
                dbg.skippedPriceBand++;
                console.log(
                  `[processExpirations] Outside CALL OTM band (kept as candidate for combos): strike=${strike}, moneyness=${Number.isFinite(mn) ? mn.toFixed(3) : 'NA'
                  }, min=${callMinStrike.toFixed(
                    2
                  )}, max=${callMaxStrike.toFixed(2)}`
                );
              }
            } else {
              putMaxStrike = rmp * putOTMMax;
              putMinStrike = rmp * putBandMin;
              withinBand = mn <= putOTMMax && strike >= putMinStrike;
              if (!withinBand && debug) {
                dbg.skippedPriceBand++;
                console.log(
                  `[processExpirations] Outside PUT OTM band (kept as candidate for combos): strike=${strike}, moneyness=${Number.isFinite(mn) ? mn.toFixed(3) : 'NA'
                  }, max=${putMaxStrike.toFixed(2)}, min=${putMinStrike.toFixed(
                    2
                  )}`
                );
              }
            }
          }

          const volume = toNum(c?.volume);
          const openInterest = toNum(c?.openInterest);
          const last = toNum(c?.lastPrice);
          const bid = toNum(c?.bid);
          const ask = toNum(c?.ask);
          // Extract implied volatility from Yahoo Finance data
          const iv = toNum(c?.impliedVolatility, 0);

          let mid = (bid + ask) / 2;
          if (!Number.isFinite(mid) || mid <= 0) {
            mid = last > 0 ? last : bid > 0 ? bid : ask;
          }
          if (!Number.isFinite(mid) || mid <= 0) {
            if (debug) {
              dbg.invalidMid++;
              console.log(
                `[processExpirations] Invalid mid price for contract: strike=${strike}`
              );
            }
            continue;
          }
          // Calculate spread percentage for direction reliability
          const spreadPct = mid > 0 ? (ask - bid) / mid : 1;

          const notional = volume * mid * 100;
          const minVol = Number.isFinite(scanCfg?.minVolume) ? scanCfg.minVolume : 1000;
          const minNotional = Number.isFinite(scanCfg?.minNotional) ? scanCfg.minNotional : 200000;
          const minNotionalNoRatio = Number.isFinite(scanCfg?.minNotionalNoRatio) ? scanCfg.minNotionalNoRatio : 400000;

          const volOrNotional = volume >= minVol || notional >= minNotional;
          const ratio = openInterest > 0 ? volume / openInterest : null;
          const volOrNotionalAdj =
            ratio === null
              ? volume >= minVol || notional >= minNotionalNoRatio
              : volOrNotional;

          const lastTradeRefRaw =
            c?.lastTradeDate ?? c?.lastTrade ?? c?.lastTradeTimestamp;
          const lastTradeRef =
            typeof lastTradeRefRaw === 'number'
              ? new Date(
                lastTradeRefRaw > 1e12
                  ? lastTradeRefRaw
                  : lastTradeRefRaw * 1000
              )
              : lastTradeRefRaw;
          const minRatio = Number.isFinite(scanCfg?.minRatio) ? scanCfg.minRatio : 1;
          const fresh = minutesSince(lastTradeRef) <= freshWindowMins;
          const ratioOk = ratio === null ? true : ratio >= minRatio;
          const valid = volOrNotionalAdj && ratioOk && fresh;

          if (!valid) {
            if (debug) {
              if (!volOrNotionalAdj) {
                dbg.belowThreshold++;
                console.log(
                  `[processExpirations] Below threshold: volume=${volume}, notional=${notional}, oi=${openInterest}`
                );
              } else if (ratio !== null && ratio < minRatio) {
                dbg.ratioLow++;
                console.log(
                  `[processExpirations] Ratio low: volume=${volume}, openInterest=${openInterest}, ratio=${ratio}`
                );
              } else if (!fresh) {
                dbg.stale++;
                console.log(
                  `[processExpirations] Stale contract: ageMin=${minutesSince(
                    lastTradeRef
                  )}`
                );
              }
            }
            continue;
          }

          // Enhanced direction detection
          const { direction, confidence: directionConfidence } = calculateEnhancedDirection(
            last, bid, ask, volume, openInterest, spreadPct
          );
          const pos = computePos(last, bid, ask);

          // Enhanced trader type classification (relative to stock price)
          const traderType = classifyTraderType(notional, rmp, volume);

          const lastTradeISO = lastTradeRef
            ? lastTradeRef instanceof Date
              ? lastTradeRef.toISOString()
              : typeof lastTradeRef === 'number'
                ? new Date(
                  lastTradeRef > 1e12 ? lastTradeRef : lastTradeRef * 1000
                ).toISOString()
                : new Date(lastTradeRef).toISOString()
            : '';
          const ageMin = minutesSince(lastTradeRef);

          const expDateObj = new Date(expISO);
          const daysToExpiry = Math.ceil(
            (expDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const moneyness = rmp > 0 ? strike / rmp : 0;
          const notionalToMarketCap = marketCap > 0 ? notional / marketCap : 0;

          const deepOTMPutCut = Number.isFinite(scanCfg?.deepOTMPutCut)
            ? scanCfg.deepOTMPutCut
            : 0.85;
          const shortTermDays = Number.isFinite(scanCfg?.shortTermDays)
            ? scanCfg.shortTermDays
            : 14;
          const longTermDays = Number.isFinite(scanCfg?.longTermDays)
            ? scanCfg.longTermDays
            : 90;
          const largeOTMCallThreshold = Number.isFinite(
            scanCfg?.largeOTMCallThreshold
          )
            ? scanCfg.largeOTMCallThreshold
            : 1000000; // 默认100万美元名义价值

          const isDeepOTMPut = type === 'put' && moneyness <= deepOTMPutCut;
          const isShortTermSpec = daysToExpiry <= shortTermDays;
          const isLongTermHedge = daysToExpiry >= longTermDays;
          const tenorBucket =
            daysToExpiry <= 7
              ? 'ultraShort'
              : daysToExpiry <= 30
                ? 'short'
                : daysToExpiry <= 90
                  ? 'medium'
                  : daysToExpiry <= 180
                    ? 'long'
                    : 'ultraLong';

          const isLargeOTMCall =
            type === 'call' &&
            moneyness >= 1.05 && // 至少5% OTM
            direction === 'buy' &&
            notional >= largeOTMCallThreshold &&
            daysToExpiry <= 45; // 短期到期

          if (debug) dbg.added++;
          const sig: OptionSignalLite = {
            symbol,
            type,
            strike,
            expiryISO: expISO,
            volume,
            openInterest,
            last,
            bid,
            ask,
            mid,
            notional,
            pos,
            direction,
            lastTradeISO,
            ageMin,
            rmp,
            moneyness,
            daysToExpiry,
            marketCap,
            notionalToMarketCap,
            isDeepOTMPut,
            tenorBucket,
            isShortTermSpec,
            isLongTermHedge,
            comboId: '',
            comboType: '',
            isComboHedge: false,
            hedgeScore: 0,
            hedgeTags: [],
            isLargeOTMCall, // 添加大笔OTM看涨期权标识
            // New enhanced fields
            iv,
            spreadPct,
            traderType,
            spotConfirmation: null, // Will be set later in options.ts
            daysToEarnings: null, // Will be set later in options.ts
            // Accuracy enhancement fields
            directionConfidence,
            signalQuality: 0, // Will be calculated after hedge score is set
          };
          // Always collect as candidate for combo detection
          candidates.push(sig);
          // Only include in primary signals if within OTM band
          if (withinBand) {
            signals.push(sig);
          }
        }
      };

      processSide(leg?.calls || [], 'call');
      processSide(leg?.puts || [], 'put');
    }
  }

  // Pass 2: detect combos on all candidates, then add combo legs that were outside OTM band
  try {
    identifyCombos(candidates, scanCfg, debug);
  } catch (e) {
    if (debug) console.warn('[processExpirations] identifyCombos failed:', e);
  }
  // Merge combo-tagged legs not already present
  const makeKey = (s: OptionSignalLite) =>
    `${s.type}|${s.strike}|${s.expiryISO}|${s.lastTradeISO}`;
  const existing = new Set(signals.map(makeKey));
  for (const s of candidates) {
    if (s.isComboHedge) {
      const k = makeKey(s);
      if (!existing.has(k)) {
        signals.push(s);
        existing.add(k);
      }
    }
  }
  return signals;
}
