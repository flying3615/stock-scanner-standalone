import { OptionSignalLite } from '../shared.js';
import { simpleHash } from '../util.js';

/**
 * Identifies combo strategies (straddles, strangles, spreads) from a list of signals.
 * This function modifies the signals in place.
 */
export function identifyCombos(
  signals: OptionSignalLite[],
  scanCfg?: any,
  debug = false
): void {
  // Base time window (will be used for tiered matching)
  const baseTimeWindowMin = Number.isFinite(scanCfg?.comboTimeWindowMin)
    ? scanCfg.comboTimeWindowMin
    : 10;
  // Tiered time windows: strict -> medium -> loose
  const timeWindowTiers = [baseTimeWindowMin, baseTimeWindowMin * 3, baseTimeWindowMin * 6];

  const comboNotionalRatioTol = Number.isFinite(scanCfg?.comboNotionalRatioTol)
    ? scanCfg.comboNotionalRatioTol
    : 1.5;
  const comboStrikePctTol = Number.isFinite(scanCfg?.comboStrikePctTol)
    ? scanCfg.comboStrikePctTol
    : 0.05;

  const getTimeDiffMin = (a: OptionSignalLite, b: OptionSignalLite) =>
    Math.abs(
      new Date(a.lastTradeISO).getTime() - new Date(b.lastTradeISO).getTime()
    ) / 60000;

  const config = {
    comboTimeWindowMin: baseTimeWindowMin,
    timeWindowTiers,
    comboNotionalRatioTol,
    getTimeDiffMin,
    debug,
    comboStrikePctTol,
  };


  // Group by expiry for straddles/strangles and vertical spreads
  const byExpiry: Record<string, OptionSignalLite[]> = {};
  for (const s of signals) {
    if (!byExpiry[s.expiryISO]) byExpiry[s.expiryISO] = [];
    byExpiry[s.expiryISO].push(s);
  }

  for (const expISO in byExpiry) {
    const expirySignals = byExpiry[expISO];
    const calls = expirySignals
      .filter((s) => s.type === 'call')
      .sort((a, b) => a.strike - b.strike);
    const puts = expirySignals
      .filter((s) => s.type === 'put')
      .sort((a, b) => a.strike - b.strike);

    _identifyStraddlesAndStrangles(calls, puts, expISO, config);
    _identifyVerticalSpreads(calls, expISO, config);
    _identifyVerticalSpreads(puts, expISO, config);
  }

  // Group by strike and type for calendar spreads
  const byStrikeAndType: Record<string, OptionSignalLite[]> = {};
  for (const s of signals) {
    const key = `${s.type}|${s.strike}`;
    if (!byStrikeAndType[key]) byStrikeAndType[key] = [];
    byStrikeAndType[key].push(s);
  }

  for (const key in byStrikeAndType) {
    const [type, strike] = key.split('|');
    const strikeSignals = byStrikeAndType[key].sort((a, b) =>
      a.expiryISO.localeCompare(b.expiryISO)
    );
    _identifyCalendarSpreads(strikeSignals, strike, config);
  }
}

/**
 * Helper to identify straddle and strangle combos within a set of options of the same expiry.
 * Uses tiered time window matching for better coverage.
 */
export function _identifyStraddlesAndStrangles(
  calls: OptionSignalLite[],
  puts: OptionSignalLite[],
  expISO: string,
  config: {
    comboTimeWindowMin: number;
    timeWindowTiers?: number[];
    comboNotionalRatioTol: number;
    getTimeDiffMin: (a: OptionSignalLite, b: OptionSignalLite) => number;
    debug: boolean;
    comboStrikePctTol?: number; // optional strike diff tolerance for strangle (default 5%)
  }
) {
  const { comboNotionalRatioTol, getTimeDiffMin, debug } = config;
  // Use tiered windows if available, otherwise fall back to single window
  const timeWindows = config.timeWindowTiers || [config.comboTimeWindowMin];

  // Sort by trade time to cluster related trades
  const sortedCalls = [...calls].sort((a, b) =>
    a.lastTradeISO.localeCompare(b.lastTradeISO)
  );
  const sortedPuts = [...puts].sort((a, b) =>
    b.lastTradeISO.localeCompare(a.lastTradeISO)
  );

  for (const call of sortedCalls) {
    for (const put of sortedPuts) {
      // Prevent duplicate assignment
      if (call.comboId || put.comboId) continue;

      const timeDiff = getTimeDiffMin(call, put);

      // Try tiered matching - find the first tier that matches
      let matchedTier = -1;
      for (let tier = 0; tier < timeWindows.length; tier++) {
        if (timeDiff <= timeWindows[tier]) {
          matchedTier = tier;
          break;
        }
      }
      if (matchedTier < 0) continue; // No match in any tier

      const strikeDiff = Math.abs(call.strike - put.strike);
      const isSameStrike = strikeDiff === 0;
      const pctTol = Number.isFinite((config as any)?.comboStrikePctTol)
        ? ((config as any).comboStrikePctTol as number)
        : 0.05; // default 5%
      const isStrangle = strikeDiff > 0 && strikeDiff <= call.strike * pctTol; // within pctTol relative

      // Direction combinations for different combo types
      const isSyntheticLong =
        isSameStrike && call.direction === 'buy' && put.direction === 'sell';
      const isSyntheticShort =
        isSameStrike && call.direction === 'sell' && put.direction === 'buy';
      const isLongStraddle =
        isSameStrike && call.direction === 'buy' && put.direction === 'buy';
      const isShortStraddle =
        isSameStrike && call.direction === 'sell' && put.direction === 'sell';
      const isLongStrangle =
        isStrangle && call.direction === 'buy' && put.direction === 'buy';
      const isShortStrangle =
        isStrangle && call.direction === 'sell' && put.direction === 'sell';

      // Determine combo type
      let comboType: string;
      if (isSyntheticLong) comboType = 'synthetic-long';
      else if (isSyntheticShort) comboType = 'synthetic-short';
      else if (isLongStraddle) comboType = 'long-straddle';
      else if (isShortStraddle) comboType = 'short-straddle';
      else if (isLongStrangle) comboType = 'long-strangle';
      else if (isShortStrangle) comboType = 'short-strangle';
      else continue; // No valid combo

      const ratio =
        call.notional > put.notional
          ? call.notional / put.notional
          : put.notional / call.notional;
      if (ratio > comboNotionalRatioTol) continue;

      // Mark as combo
      const comboId = simpleHash(
        `${expISO}_${call.strike}_${put.strike}_${call.lastTradeISO}`
      );
      const comboDescription = `${comboType}-${comboId.slice(0, 4)}`;
      call.comboId = comboId;
      put.comboId = comboId;
      call.comboType = comboDescription;
      put.comboType = comboDescription;
      call.isComboHedge = true;
      put.isComboHedge = true;
      // Mark match tier (0=strict, 1=medium, 2=loose)
      call.comboMatchTier = matchedTier;
      put.comboMatchTier = matchedTier;

      if (debug) {
        const tierLabel = matchedTier === 0 ? 'strict' : matchedTier === 1 ? 'medium' : 'loose';
        console.log(
          `[identifyCombos] Detected ${comboType} (${tierLabel} match): call strike=${call.strike}, put strike=${put.strike}, timeDiff=${timeDiff}min`
        );
      }
    }
  }
}

/**
 * Helper to identify vertical spread combos within a set of options of the same type and expiry.
 */
export function _identifyVerticalSpreads(
  options: OptionSignalLite[], // pre-filtered by type (call/put) and pre-sorted by strike
  expISO: string,
  config: {
    comboTimeWindowMin: number;
    comboNotionalRatioTol: number;
    getTimeDiffMin: (a: OptionSignalLite, b: OptionSignalLite) => number;
    debug: boolean;
    comboStrikePctTol?: number; // accepted but not used here; keep signature aligned
  }
) {
  const { comboTimeWindowMin, comboNotionalRatioTol, getTimeDiffMin, debug } =
    config;
  const optionType = options.length > 0 ? options[0].type : null;
  if (!optionType) return;

  for (let i = 0; i < options.length - 1; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const leg1 = options[i];
      const leg2 = options[j];

      // Prevent duplicate assignment
      if (leg1.comboId || leg2.comboId) continue;

      const timeDiff = getTimeDiffMin(leg1, leg2);
      if (timeDiff > comboTimeWindowMin) continue;

      // For spreads, matching contract volume is more precise than matching notional value.
      const volumeRatio =
        leg1.volume > leg2.volume
          ? leg1.volume / leg2.volume
          : leg2.volume / leg1.volume;
      if (volumeRatio > comboNotionalRatioTol) continue; // Using the same tolerance for volume ratio

      // Given leg1.strike < leg2.strike:
      const isBull = leg1.direction === 'buy' && leg2.direction === 'sell';
      const isBear = leg1.direction === 'sell' && leg2.direction === 'buy';

      if (isBull || isBear) {
        const comboId = simpleHash(
          `${expISO}_vertical_${optionType}_${leg1.strike}_${leg2.strike}_${leg1.lastTradeISO}`
        );
        const baseType = optionType === 'call' ? 'CallVertical' : 'PutVertical';
        const comboType = isBull ? `bull${baseType}` : `bear${baseType}`;
        const comboDescription = `${comboType}-${comboId.slice(0, 4)}`;

        leg1.comboId = comboId;
        leg2.comboId = comboId;
        leg1.comboType = comboDescription;
        leg2.comboType = comboDescription;
        leg1.isComboHedge = true;
        leg2.isComboHedge = true;

        if (debug) {
          console.log(
            `[identifyCombos] Detected ${comboType}: strikes ${leg1.strike}-${leg2.strike}, timeDiff=${timeDiff}min`
          );
        }
      }
    }
  }
}

/**
 * Helper to identify calendar spread combos within a set of options of the same type and strike.
 */
export function _identifyCalendarSpreads(
  options: OptionSignalLite[], // pre-filtered by type (call/put) and pre-sorted by expiry
  strike: string,
  config: {
    comboTimeWindowMin: number;
    comboNotionalRatioTol: number;
    getTimeDiffMin: (a: OptionSignalLite, b: OptionSignalLite) => number;
    debug: boolean;
    comboStrikePctTol?: number; // accepted but not used here; keep signature aligned
  }
) {
  const { comboTimeWindowMin, comboNotionalRatioTol, getTimeDiffMin, debug } =
    config;
  const optionType = options.length > 0 ? options[0].type : null;
  if (!optionType) return;

  for (let i = 0; i < options.length - 1; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const near = options[i];
      const far = options[j];

      // Prevent duplicate assignment
      if (near.comboId || far.comboId) continue;

      const timeDiff = getTimeDiffMin(near, far);
      if (timeDiff > comboTimeWindowMin) continue;

      const ratio =
        near.notional > far.notional
          ? near.notional / far.notional
          : far.notional / near.notional;
      if (ratio > comboNotionalRatioTol) continue;

      // Long Calendar: Sell near, Buy far
      const isLongCalendar =
        near.direction === 'sell' && far.direction === 'buy';
      // Short Calendar: Buy near, Sell far
      const isShortCalendar =
        near.direction === 'buy' && far.direction === 'sell';

      if (isLongCalendar || isShortCalendar) {
        const comboId = simpleHash(
          `calendar_${optionType}_${strike}_${near.expiryISO}_${far.expiryISO}_${near.lastTradeISO}`
        );
        const baseType = optionType === 'call' ? 'CalendarCall' : 'CalendarPut';
        const comboType = isLongCalendar
          ? `long${baseType}`
          : `short${baseType}`;
        const comboDescription = `${comboType}-${comboId.slice(0, 4)}`;

        near.comboId = comboId;
        far.comboId = comboId;
        near.comboType = comboDescription;
        far.comboType = comboDescription;
        near.isComboHedge = true;
        far.isComboHedge = true;

        if (debug) {
          console.log(
            `[identifyCombos] Detected ${comboType}: strike ${strike}, expiries ${near.expiryISO.slice(
              0,
              10
            )}-${far.expiryISO.slice(0, 10)}, timeDiff=${timeDiff}min`
          );
        }
      }
    }
  }
}
