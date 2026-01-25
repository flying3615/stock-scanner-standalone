import { OptionSignalLite } from '../shared.js';

/**
 * Computes a hedge score for each signal based on various factors.
 * A score closer to 1 indicates a higher likelihood of being a hedge.
 * A score closer to 0 indicates a higher likelihood of being directional.
 * This function modifies the signals in place.
 */
export function computeHedgeScoreForSignal(
  signals: OptionSignalLite[],
  moneyFlowStrength: number,
  scanCfg?: any
): void {
  const smallCapRatioCut = Number.isFinite(scanCfg?.smallCapRatioCut)
    ? scanCfg.smallCapRatioCut
    : 0.00005;

  const weights = {
    deepOTMPut: 0.35,
    smallCapRatio: 0.15,
    longTerm: 0.25,
    comboHedge: 0.4,
    shortTermDirectional: 0.35,
    largeOTMCall: 0.25,
    moneyFlowConfirm: 0.2,
    moneyFlowContradict: 0.25,
    // New IV-based weights
    highIVDirectional: 0.15, // High IV + buy direction suggests directional bet
    institutionalTrader: 0.1, // Institutional traders more likely directional
  };

  for (const s of signals) {
    const tags: string[] = [];
    let score = 0;

    // Features that suggest hedging (increase score)
    if (s.isDeepOTMPut) {
      score += weights.deepOTMPut;
      tags.push('deepOTMPut');
    }
    if (
      s.notionalToMarketCap > 0 &&
      s.notionalToMarketCap <= smallCapRatioCut
    ) {
      score += weights.smallCapRatio;
      tags.push('smallCapRatio');
    }
    if (s.isLongTermHedge) {
      score += weights.longTerm;
      tags.push('longTerm');
    }
    if (s.isComboHedge) {
      score += weights.comboHedge;
      tags.push('comboHedge');
    }

    // Features that suggest directional speculation (decrease score)
    if (s.isShortTermSpec) {
      score -= weights.shortTermDirectional;
      tags.push('shortTermDirectional');
    }
    if (s.isLargeOTMCall) {
      score -= weights.largeOTMCall;
      tags.push('largeOTMCall');
    }

    // High IV + buy direction suggests conviction directional bet (not a hedge)
    if (s.iv > 0.5 && s.direction === 'buy') {
      score -= weights.highIVDirectional;
      tags.push('highIVDirectional');
    }

    // Institutional traders are more likely to make directional bets than hedges
    if (s.traderType === 'institutional') {
      score -= weights.institutionalTrader;
      tags.push('institutional');
    }

    // Money flow adjustment
    const isBullishSignal =
      (s.type === 'call' && s.direction === 'buy') ||
      (s.type === 'put' && s.direction === 'sell');
    const isBearishSignal =
      (s.type === 'put' && s.direction === 'buy') ||
      (s.type === 'call' && s.direction === 'sell');

    if (isBullishSignal && moneyFlowStrength > 0) {
      // Bullish signal + money inflow => confirmation, reduce hedge score
      score -= weights.moneyFlowConfirm * moneyFlowStrength;
      tags.push('moneyFlowBullishConfirm');
    } else if (isBearishSignal && moneyFlowStrength < 0) {
      // Bearish signal + money outflow => confirmation, reduce hedge score
      score -= weights.moneyFlowConfirm * Math.abs(moneyFlowStrength);
      tags.push('moneyFlowBearishConfirm');
    } else if (isBullishSignal && moneyFlowStrength < 0) {
      // Bullish signal + money outflow => contradiction, increase hedge score
      score += weights.moneyFlowContradict * Math.abs(moneyFlowStrength);
      tags.push('moneyFlowContradiction');
    } else if (isBearishSignal && moneyFlowStrength > 0) {
      // Bearish signal + money inflow => contradiction, increase hedge score
      score += weights.moneyFlowContradict * moneyFlowStrength;
      tags.push('moneyFlowContradiction');
    }

    s.hedgeScore = Math.max(0, Math.min(1, score));
    s.hedgeTags = tags;
  }
}
