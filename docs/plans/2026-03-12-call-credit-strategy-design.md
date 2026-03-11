# Call Credit Strategy Page Design

**Date:** 2026-03-12

**Goal:** Add a dedicated options strategy page that identifies event-driven breakdown names suitable for short-term `3-7 DTE` call credit spreads, then presents a structured spread template instead of a generic stock scan card.

## Why This Fits the Existing Project

The current project already has the core building blocks for a first version:

- `src/worker/scanner/market-movers.ts` provides a liquid stock candidate pool.
- `src/worker/util.ts` already computes money flow and moving-average context.
- `src/worker/options/options.ts` and `src/worker/options/processing.ts` already fetch and filter near-term option chains with `bid`, `ask`, `iv`, `openInterest`, `volume`, `notional`, and spread quality.
- `src/worker/macro/macro-monitor.ts` already produces a macro regime layer that can be reused as a bearish-credit filter.
- `frontend/src/App.tsx` already has a dashboard shell, macro bar, cards, and a detail modal pattern that can be adapted into a strategy workflow.

What is missing is the strategy-specific aggregation layer:

- no dedicated "short call credit candidate" score
- no day-structure proxy for "failed bounce"
- no spread construction template
- no UI designed around trade setup review

## Product Boundary

This page is not an execution engine and not a generic options screener.

It should answer one practical question:

> Which stocks are currently the best candidates for a short-term bearish call credit spread, and what structure-based spread template should I inspect first?

The page should optimize for fast daily review, not auto-trading. Every setup must remain advisory and include invalidation levels plus risk notes.

## Scope

### In Scope

- New strategy endpoint for call credit candidates
- Candidate ranking from existing scanner universe
- Daily-candle proxy for failed bounce / weak close
- Event-driven bearish setup scoring
- Suggested `3-7 DTE` call credit template
- Macro-aware ranking adjustments
- Dedicated frontend strategy page or tab

### Out of Scope for V1

- Real intraday VWAP logic
- Real order routing or broker integration
- Auto-trading
- Historical performance tracking in the database
- Full news-event taxonomy beyond lightweight keyword tagging

## User Workflow

1. Open the strategy page.
2. Read the macro pressure bar first.
3. Review the highest-ranked `ACTIONABLE` call credit setups.
4. Open one candidate.
5. Inspect the breakdown reasons, structure levels, and spread template.
6. Manually decide whether to trade.

This keeps the product aligned with a real discretionary workflow rather than pretending the system can fully automate edge detection.

## Recommended Architecture

Create a new strategy aggregation layer in the backend instead of mixing this logic into existing scanner routes.

### Backend Modules

- Create `src/worker/strategies/call-credit.ts`
  - main orchestration entrypoint
  - fetches candidate pool
  - computes setup scores
  - selects spread templates
- Create `src/worker/strategies/call-credit-types.ts`
  - strategy-specific response types
  - keeps frontend/server typing clean
- Optionally create `src/worker/strategies/call-credit-helpers.ts`
  - pure scoring and spread-selection helpers for testability

### Route

- Add `GET /api/strategies/call-credit` in `src/server.ts`

The route should return one aggregated payload with:

- macro context
- ranked candidates
- page metadata such as timestamp and filters used

This keeps the frontend simple and avoids scattering strategy logic across multiple API calls.

## Candidate Pool

V1 should reuse the existing scanner-friendly universe rather than building a brand-new market universe.

Suggested pool order:

1. `most_actives`
2. `day_losers`
3. optional hand-picked liquid ETFs / mega-cap names if needed

Hard filters before scoring:

- `price >= 20 && price <= 500`
- `regularMarketVolume >= 5_000_000`, prefer `10_000_000`
- options chain exists and near-term expirations are available
- exclude symbols with unusable spreads or stale chain data

This matches the actual trading constraints better than a broad theoretical universe.

## Breakdown Detection

Because V1 does not use minute data, the "first failed rebound" logic must be approximated from daily candles plus existing technical context.

### Required Daily Features

For each candidate, compute:

- `changePercent`
- `volumeRatio20`
- `closeLocationValue = (close - low) / (high - low)`
- `upperWickRatio = (high - max(open, close)) / (high - low)`
- `gapDown`
- `brokeEma20`
- `brokeEma50`
- `brokeEma200` if enough history exists
- `brokePrior20Low`

### Bearish Structure Interpretation

Strong breakdown proxies:

- daily drop `<= -6%`
- `volumeRatio20 >= 1.5`
- close in the lower `35%` of the day range
- upper wick ratio `>= 0.30`
- close below one or more key support references

This is not true intraday confirmation, but it is a realistic proxy for "sold on the bounce and could not reclaim structure."

## Event Layer

The strategy should prioritize downside moves with a reason, not random noisy red days.

### V1 Event Inputs

- `daysToEarnings` already produced in options analysis
- large gap-down behavior from daily candles
- lightweight symbol-news keyword tags from existing news search

### Suggested Event Tags

- `EARNINGS_MISS`
- `GUIDANCE_CUT`
- `REGULATORY`
- `LAWSUIT`
- `PRODUCT_ISSUE`
- `UNCLASSIFIED_BREAKDOWN`

V1 can derive tags by scanning headline keywords. This will be imperfect, but still useful for triage.

## Scoring Model

Use a `0-100` setup score with explicit sub-scores so the page remains explainable.

### Score Weights

- `breakdownScore`: 30
- `eventScore`: 20
- `optionsLiquidityScore`: 20
- `premiumScore`: 15
- `macroAlignmentScore`: 10
- `spotFlowScore`: 5

### Breakdown Score Inputs

- daily drop magnitude
- 20-day volume ratio
- break below EMA20 / EMA50 / EMA200
- break below prior low
- close near day low
- large upper wick

### Event Score Inputs

- earnings proximity
- news keyword match
- true gap-down severity

### Options Liquidity Score Inputs

- near-term call OI
- near-term call volume
- bid/ask spread quality
- chain freshness

### Premium Score Inputs

- spread credit as percent of width
- usable implied volatility
- enough premium in `3-7 DTE`

### Macro Alignment

Use the existing macro endpoint behavior:

- `RISK_OFF`: add score
- `CHOPPY`: neutral
- `RISK_ON`: penalize

### Final Setup States

- `ACTIONABLE`
- `WATCHLIST`
- `AVOID`

These states should be derived from both total score and the presence of a valid spread template.

## Spread Template Construction

The system should not attempt to place trades. It should produce an inspection template.

### Expiration Selection

Pick the best `3-7 DTE` expiration that has acceptable option liquidity.

### Resistance Anchor

Compute a `structureResistance` using the highest relevant bearish invalidation level among:

- day high
- prior day low / gap edge
- broken support turned resistance
- EMA20 / EMA50 if above spot

### Short Call Selection

Pick the first call strike that satisfies:

- `estimatedDelta` between `0.10` and `0.20`
- strike at or above `structureResistance`
- acceptable `OI`, `volume`, `bid/ask spread`

### Long Call Selection

Pick the next liquid strike above the short call, or use a width bucket:

- `$20-$80`: `$1` or `$2`
- `$80-$200`: `$2` or `$5`
- `$200+`: `$5` or `$10`

### Template Outputs

- `expiryISO`
- `dte`
- `shortStrike`
- `longStrike`
- `shortDeltaEst`
- `creditMid`
- `width`
- `creditPctWidth`
- `maxLoss`
- `takeProfitAt`
- `stopLossAt`
- `invalidationLevel`

If the chain cannot support a viable spread, the candidate should stay visible but be marked `WATCHLIST`.

## Delta Estimation

Yahoo data does not reliably provide greeks in the current flow.

Use a two-tier approach:

1. If `POLYGON_API_KEY` is configured and greeks are available, use Polygon delta.
2. Otherwise estimate delta from `spot`, `strike`, `DTE`, and `IV` with a Black-Scholes-style approximation.

This keeps the strategy page useful even without premium market-data entitlements.

## API Shape

Recommended response shape:

```json
{
  "generatedAt": "2026-03-12T10:00:00.000Z",
  "macro": {
    "overallRegime": "RISK_OFF",
    "indices": [],
    "dxy": {},
    "vix": {}
  },
  "filters": {
    "minPrice": 20,
    "maxPrice": 500,
    "minVolume": 5000000,
    "targetDteMin": 3,
    "targetDteMax": 7
  },
  "candidates": [
    {
      "symbol": "TSLA",
      "name": "Tesla, Inc.",
      "price": 212.4,
      "changePercent": -8.1,
      "setupScore": 78,
      "setupState": "ACTIONABLE",
      "reasons": [
        "Gap-down earnings miss",
        "Volume 2.3x avg20",
        "Close near day low"
      ],
      "scores": {
        "breakdown": 26,
        "event": 16,
        "optionsLiquidity": 18,
        "premium": 10,
        "macroAlignment": 6,
        "spotFlow": 2
      },
      "dailyProxy": {
        "volumeRatio20": 2.3,
        "closeLocationValue": 0.18,
        "upperWickRatio": 0.34,
        "gapDown": true,
        "brokeEma20": true,
        "brokeEma50": true,
        "brokePriorLow": true
      },
      "spreadTemplate": {
        "expiryISO": "2026-03-20",
        "dte": 5,
        "shortStrike": 230,
        "longStrike": 235,
        "shortDeltaEst": 0.16,
        "creditMid": 1.45,
        "width": 5,
        "creditPctWidth": 0.29,
        "takeProfitAt": 0.58,
        "stopLossAt": 2.9,
        "invalidationLevel": 228.5
      }
    }
  ]
}
```

## Frontend Design

Add a dedicated `Strategies` view instead of burying this inside the standard scanner cards.

### Layout

1. `Macro Pressure Bar`
   - DXY
   - VIX
   - Nasdaq score
   - S&P score
   - overall regime

2. `Candidate Board`
   - ranked setup cards or dense rows
   - setup state badge
   - score breakdown
   - event tag
   - daily structure summary

3. `Trade Template Panel`
   - selected symbol
   - spread template
   - invalidation level
   - rationale list
   - risk notes

4. `Checklist Footer`
   - strategy rules and warnings

### Visual Priority

This page should feel like a review terminal, not a marketing dashboard:

- dense but legible
- stronger red / amber emphasis for bearish setups
- persistent IDs for easy visual inspection if needed later
- clear separation between "candidate quality" and "trade template quality"

## Caching and Performance

This route will be more expensive than a plain movers request because it combines:

- mover fetching
- chart data
- options chain selection
- macro context
- optional news tagging

Recommended caching:

- cache the final `/api/strategies/call-credit` payload for `300` seconds
- cache per-symbol intermediate results if repeated in the same request cycle
- cap the candidate universe to prevent excessive options requests

## Error Handling

The strategy page must degrade gracefully:

- if macro fails, still return candidates with `macroUnavailable: true`
- if one symbol options chain fails, keep the rest of the page
- if a candidate has no tradable spread, return `spreadTemplate: null` with `setupState: WATCHLIST`

This page should never hard-fail just because one option chain is unusable.

## Verification Strategy

Backend verification should focus on pure logic and deterministic outputs:

- score calculation from mocked daily data
- state assignment (`ACTIONABLE`, `WATCHLIST`, `AVOID`)
- spread selection and credit thresholds
- delta estimation fallback behavior

Frontend verification should focus on:

- successful page rendering
- type-safe API integration
- visual distinction of candidate states
- detail panel correctness

## Delivery Strategy

### Phase 1

- strategy types
- backend scoring helpers
- spread template generator
- `/api/strategies/call-credit`
- frontend page shell

### Phase 2

- news keyword classification improvements
- strategy filters in the UI
- saved watchlists or snapshots if needed

### Phase 3

- intraday bars
- VWAP / failed-bounce logic
- historical setup tracking and replay

## Recommendation

Build V1 as a daily-structure strategy page with a backend-owned scoring model and a rule-based spread template. Do not wait for perfect intraday data before shipping the first version. The current codebase already supports a high-value first release if the logic remains explicit and conservative.
