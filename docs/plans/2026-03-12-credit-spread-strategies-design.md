# Credit Spread Strategies API Design

**Date:** 2026-03-12

**Goal:** Expand the existing single-purpose call credit strategy into a unified credit spread strategy system that supports both `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT`, with an AI-friendly OpenAPI contract detailed enough for downstream models to reason over setups without relying on the frontend.

## Why This Change

The current call credit strategy work proves the project can already do three important things:

- rank stocks with strategy-specific logic
- construct a rule-based short-duration spread template
- present the result in a dedicated strategy view

What it does not yet do is generalize that logic into a reusable credit spread engine. Right now the product shape is still too tied to one bearish strategy and one UI interpretation.

The new goal is to support two high-win-rate credit spread playbooks within one consistent API:

- `BEAR_CALL_CREDIT`
- `BULL_PUT_CREDIT`

This is a better product boundary than separately adding more one-off strategy pages.

## Product Boundary

This system is still not an execution engine and not a generic option strategy optimizer.

It should answer:

> Which symbols currently support a well-formed directional credit spread setup, and what structured template best matches that thesis?

It should optimize for:

- fast ranking
- consistent reasoning
- explicit blockers
- machine-readable semantics

It should not optimize for:

- auto-trading
- neutral premium strategies
- full options portfolio construction
- broker-specific order generation

## Scope

### In Scope

- unified credit spread endpoint
- support for bearish call credits
- support for bullish put credits
- common candidate schema for AI and frontend consumers
- explicit strategy type, direction, anchor semantics, invalidation semantics, blockers, and template metadata
- OpenAPI descriptions written for machine interpretation rather than only UI display

### Out of Scope for V1

- debit spreads
- iron condors, calendars, or diagonals
- intraday VWAP confirmation
- trade journaling / outcome persistence
- automatic execution

## Recommended API Shape

Use one unified route:

- `GET /api/strategies/credit-spreads`

Recommended query parameters:

- `strategyType`
  - `BEAR_CALL_CREDIT`
  - `BULL_PUT_CREDIT`
- `setupState`
  - `ACTIONABLE`
  - `WATCHLIST`
- `limit`
- optional future filters such as `minPrice`, `maxPrice`, `minVolume`

### Why One Route

This is the most AI-friendly shape because:

- one schema defines both strategies
- downstream agents only need to learn one candidate contract
- the semantic difference is encoded in typed fields like `strategyType`, `direction`, and `anchorType`
- documentation drift is reduced compared with duplicating nearly identical endpoints

## Core Strategy Abstraction

Introduce a generic `credit spread candidate` model.

### Shared Candidate Concepts

- `strategyType`
- `direction`
- `setupState`
- `score`
- `scoreComponents`
- `anchorType`
- `anchorLevel`
- `invalidationPrice`
- `structureSummary`
- `spreadTemplate`
- `thesis`
- `blockers`

### Strategy Types

- `BEAR_CALL_CREDIT`
  - direction: `BEARISH`
  - anchor type: `RESISTANCE`
  - short leg should be at or above resistance

- `BULL_PUT_CREDIT`
  - direction: `BULLISH`
  - anchor type: `SUPPORT`
  - short leg should be at or below support

This is important: the API should not force downstream consumers to infer direction from option leg type.

## AI-Friendly Semantic Fields

The API must describe meaning, not just shape.

### Required Fields

- `strategyType`
  - which playbook this candidate belongs to
- `direction`
  - normalized directional bias
- `setupState`
  - execution readiness, not recommendation strength
- `score`
  - internal ranking score, not probability of profit
- `anchorType`
  - whether the structural anchor is support or resistance
- `anchorLevel`
  - the chart reference level used to place the short strike outside structure
- `invalidationPrice`
  - the price level that breaks the trade thesis
- `blockers`
  - machine-readable reasons the setup is still watchlist-only

### Field Semantics That Must Be Explicit in OpenAPI

- `score` is a ranking heuristic, not win rate
- `setupState = WATCHLIST` means informative but not currently executable
- `anchorLevel` is not an entry price
- `invalidationPrice` is not necessarily equal to `anchorLevel`
- `creditPctWidth = creditMid / width`
- `expiryISO` is the exact expiration date associated with the spread template

## Shared Scoring Engine

Use one engine with strategy-specific feature adapters.

### Shared Score Buckets

- `structureScore`
- `eventScore`
- `optionsLiquidityScore`
- `premiumScore`
- `macroAlignmentScore`
- optional `valuationBiasScore`

### Shared Candidate Pipeline

1. build liquid candidate pool
2. deduplicate universe
3. run cheap daily-structure pass
4. assign strategy-specific structure features
5. run macro filter
6. fetch near-term option chain only for capped universe
7. generate spread template
8. emit `ACTIONABLE` or `WATCHLIST`

This preserves the current performance discipline while expanding to two directional setups.

## Bear Call Credit Logic

This is the continuation / failed rebound strategy.

### Conditions

- strong down day
- elevated volume
- closes near low
- remains below key resistance references
- bearish macro backdrop preferred
- short call placed above structural resistance

### Daily Proxies

- `changePercent <= -5%` or stronger
- `volumeRatio20 >= 1.5`
- `closeLocationValue <= 0.35`
- weak reclaim of EMA / prior support
- upper wick not strong enough to imply durable reversal

### Template Shape

- short OTM call
- long higher-strike call
- `3-7 DTE`
- `10-20 delta`
- credit threshold based on width

## Bull Put Credit Logic

This is not just the inverse option structure; it uses different spot logic.

### Conditions

- sharp selloff or pullback into support
- evidence of stabilization rather than continued breakdown
- close recovers away from the low
- support remains intact
- macro should be at least non-hostile; strongest when fear stops accelerating
- short put placed below structural support

### Daily Proxies

- large recent down move, but not ongoing freefall
- `closeLocationValue >= 0.45`
- lower wick indicates absorption or stabilization
- close remains above critical support / prior low / support EMA
- volume can remain elevated, but the candle should not finish like a breakdown continuation bar

### Template Shape

- short OTM put
- long lower-strike put
- `3-7 DTE`
- `10-20 delta`
- credit threshold based on width

## Structural Anchors

The API should use one consistent naming system that works for both strategies.

### Fields

- `anchorType`
  - `RESISTANCE`
  - `SUPPORT`
- `anchorLevel`
- `invalidationPrice`

### Meaning

- `anchorLevel` is the structure reference used to position the short leg
- `invalidationPrice` is the buffered thesis-break level

Examples:

- bear call: `anchorLevel = 420.34`, `invalidationPrice = 424.54`
- bull put: `anchorLevel = 178.20`, `invalidationPrice = 175.90`

## Spread Template Contract

The template should work for either bearish or bullish credit spreads.

### Suggested Fields

- `expiryISO`
- `dte`
- `shortStrike`
- `longStrike`
- `width`
- `shortOptionType`
  - `CALL`
  - `PUT`
- `longOptionType`
  - `CALL`
  - `PUT`
- `shortDelta`
- `creditMid`
- `creditPctWidth`
- `takeProfitAt`
- `stopLossAt`

For AI consumers, explicit option-type fields are worth the extra verbosity because they eliminate ambiguity.

## Blockers

The current watchlist reason strings are UI-friendly but not ideal for machine filtering.

The new API should expose both:

- `blockers`
  - short machine-readable codes
- `watchlistReasons`
  - human-readable text

Suggested blocker codes:

- `NO_LIQUID_TEMPLATE`
- `BREAKDOWN_TOO_WEAK`
- `BOUNCE_NOT_CONFIRMED`
- `MACRO_NOT_ALIGNED`
- `CREDIT_TOO_THIN`
- `MOVE_DIRECTION_CONFLICT`

This allows other AI models to filter without fragile string matching.

## Recommended Response Shape

```json
{
  "generatedAt": "2026-03-12T10:00:00.000Z",
  "filters": {
    "strategyType": "BEAR_CALL_CREDIT",
    "setupState": "ACTIONABLE",
    "minPrice": 20,
    "maxPrice": 500,
    "minVolume": 20000000,
    "targetDteMin": 3,
    "targetDteMax": 7
  },
  "macro": {
    "overallRegime": "RISK_OFF"
  },
  "candidates": [
    {
      "strategyType": "BEAR_CALL_CREDIT",
      "direction": "BEARISH",
      "setupState": "ACTIONABLE",
      "score": 78,
      "scoreComponents": {
        "structure": 28,
        "event": 15,
        "optionsLiquidity": 16,
        "premium": 9,
        "macroAlignment": 8,
        "valuationBias": 2
      },
      "anchorType": "RESISTANCE",
      "anchorLevel": 420.34,
      "invalidationPrice": 424.54,
      "structureSummary": {
        "changePercent": -7.1,
        "volumeRatio20": 2.3,
        "closeLocationValue": 0.12,
        "upperWickRatio": 0.18
      },
      "blockers": [],
      "watchlistReasons": [],
      "spreadTemplate": {
        "expiryISO": "2026-03-20",
        "dte": 5,
        "shortOptionType": "CALL",
        "longOptionType": "CALL",
        "shortStrike": 430,
        "longStrike": 435,
        "width": 5,
        "shortDelta": 0.16,
        "creditMid": 1.22,
        "creditPctWidth": 0.244,
        "takeProfitAt": 0.49,
        "stopLossAt": 2.44
      }
    }
  ]
}
```

## OpenAPI Requirements

The spec should be written to help downstream models reason about trade setups.

### Required Improvements

- add a dedicated `Strategies` tag entry for the unified endpoint
- define field-level descriptions for all strategy semantics
- avoid UI-only language such as "good setup" without precise meaning
- define enums for:
  - `strategyType`
  - `direction`
  - `anchorType`
  - `setupState`
  - `blockers`
- document that `score` is ordinal/ranking-oriented

### Special Attention Fields

- `anchorLevel`
- `invalidationPrice`
- `setupState`
- `creditPctWidth`
- `expiryISO`
- `blockers`

## Frontend Impact

The frontend can still present separate tabs or filters, but the backend contract should no longer be tied to a single strategy page implementation.

Recommended UI evolution:

- strategy page defaults to one selected `strategyType`
- filter toggle between `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT`
- same list/detail shell reused for both

This keeps API and UI concerns properly separated.

## Performance and Caching

This unified endpoint will be heavier than the current single strategy route if it computes both directions in one request.

Recommended V1 behavior:

- compute only the requested `strategyType` per request
- cache each `(strategyType, setupState, filters)` combination for `300` seconds
- reuse per-symbol daily data and options fetches inside the request lifecycle

## Recommendation

Build a unified `credit spread strategies` API with a single candidate contract and explicit strategy semantics. Keep the first release focused on the two highest-win-rate directional credit spreads: `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT`. Prioritize OpenAPI clarity so external AI consumers can use the endpoint without reverse-engineering the frontend or guessing what key pricing fields mean.
