# Nearby Options Chain And D1 Chart API Design

**Date:** 2026-03-12

**Goal:** Add two normalized market-data endpoints that give downstream AI models enough recent price structure and near-term options-chain detail to reason about bearish call credit and bullish put credit setups without forcing them to consume raw Yahoo or Polygon payloads.

## Why This Change

The project now has a strategy layer that can rank directional credit spreads, but external AI clients still do not have a clean way to inspect the underlying materials behind those recommendations.

Two gaps matter most:

- there is no dedicated endpoint for a compact, strategy-relevant options chain
- there is no dedicated endpoint for recent `1d` bars plus the structure metrics the strategy engine already relies on

These are foundation APIs. They should land before any `spread-builder` endpoint so downstream systems can inspect market structure directly instead of being forced to trust a black-box spread proposal.

## Product Boundary

These endpoints are market-data infrastructure, not trade execution or ranking APIs.

They should answer:

> What does the near-term options chain look like around spot, and what does recent daily price structure look like right now?

They should not:

- rank symbols
- decide whether a trade is actionable
- select a spread automatically
- expose raw vendor-specific response shapes

## Scope

### In Scope

- `GET /api/options-chain/nearby/{symbol}`
- `GET /api/charts/{symbol}/d1`
- normalized response contracts
- AI-friendly OpenAPI descriptions
- compact summaries alongside the normalized datasets
- light caching suitable for repeated AI polling

### Out Of Scope For This Iteration

- `spread-builder`
- intraday bars
- non-`1d` chart intervals
- full raw options chain export
- persistence of snapshots

## Endpoint 1: Nearby Options Chain

### Route

- `GET /api/options-chain/nearby/{symbol}`

### Purpose

Give AI clients the near-term options data most relevant to short-duration vertical credit spreads without sending the full chain.

### Query Parameters

- `dteMin`
  - default: `3`
- `dteMax`
  - default: `7`
- `strikesEachSide`
  - default: `10`
  - meaning: keep the nearest `N` strikes above and below spot per expiry
- optional future filters such as `minOi` and `minVol`

### Response Shape

Top-level fields:

- `symbol`
- `spot`
- `asOf`
- `requested`
  - echoes query settings for auditability
- `summary`
  - selected expiry count
  - available expiries in the DTE window
  - ATM strike
  - strike window actually returned
- `expiries`
  - grouped by `expiryISO`

Each expiry bucket should include:

- `expiryISO`
- `dte`
- `atmStrike`
- `calls`
- `puts`

Each option row should include:

- `contractSymbol` when available
- `strike`
- `bid`
- `ask`
- `mid`
- `last`
- `delta`
- `impliedVolatility`
- `openInterest`
- `volume`
- `inTheMoney`
- `lastTradeDate`

### Normalization Rules

- `mid` should be calculated as `(bid + ask) / 2` only when both sides are positive; otherwise fallback to the best available side or `null`
- missing vendor values should prefer `null` over `0` when the distinction matters for AI reasoning
- expiries should be sorted nearest first
- strikes inside each expiry should be sorted ascending
- calls and puts should use the same normalized field names regardless of vendor source

### Why Group By Expiry

Grouping by expiry makes it easier for AI clients to:

- choose a single target `3-7 DTE` expiry
- compare call and put ladders at the same expiration
- construct a spread without rejoining rows manually

## Endpoint 2: D1 Chart With Structure Summary

### Route

- `GET /api/charts/{symbol}/d1`

### Purpose

Give AI clients recent daily bars plus the core structure indicators already used by the credit-spread engine.

### Query Parameters

- `lookback`
  - default: `120`
  - meaning: number of `1d` bars returned to the caller

### Response Shape

Top-level fields:

- `symbol`
- `interval`
  - fixed to `1d`
- `asOf`
- `requested`
  - requested lookback
- `summary`
  - latest close
  - period high/low
  - recent percent change
  - average volume over 20 sessions
- `indicators`
- `bars`

Each bar should include:

- `date`
- `open`
- `high`
- `low`
- `close`
- `volume`

The `indicators` object should include at least:

- `ema20`
- `ema50`
- `ema200`
- `volumeRatio20`
- `closeLocationValue`
- `upperWickRatio`
- `lowerWickRatio`
- `support`
- `resistance`

### Indicator Semantics

- `closeLocationValue`
  - normalized daily close location inside the candle range, `0-1`
- `upperWickRatio`
  - normalized upper wick size, `0-1`
- `lowerWickRatio`
  - normalized lower wick size, `0-1`
- `volumeRatio20`
  - latest volume divided by the 20-session average
- `support`
  - structure reference suitable for bullish put-credit review
- `resistance`
  - structure reference suitable for bearish call-credit review

### EMA200 Handling

Even if `lookback=120`, the server should fetch more historical bars internally so `ema200` is stable. The response should still return only the requested trailing window.

## Shared API Principles

### AI-Friendly Semantics

OpenAPI descriptions must clearly state:

- `asOf` is snapshot generation time, not necessarily the exchange timestamp of the latest trade
- `mid` is a derived estimate, not an executable price guarantee
- `support` and `resistance` are structural reference levels, not trade signals
- `closeLocationValue` and wick ratios are normalized metrics in the `0-1` range

### Error Handling

- invalid symbol or missing data should return `404` when appropriate
- malformed query parameters should return `400`
- upstream vendor failure should return `500` with a concise error payload

### Caching

Recommended TTLs:

- nearby options chain: `60s`
- `d1` chart snapshot: `300s`

These values are short enough for repeated AI inspection but still protect Yahoo and Polygon from unnecessary repeat calls.

## Reuse Strategy

The implementation should reuse existing internals:

- `fetchOptionsData(...)` for chain retrieval
- `fetchDirectChart(...)` for price history
- existing candle/EMA helpers from the strategy layer where appropriate

This avoids drifting into a second incompatible indicator implementation.

## OpenAPI Expectations

The spec should include:

- path definitions for both new endpoints
- query parameter descriptions
- normalized option row schema
- expiry-group schema
- `d1` bar schema
- structure-indicator schema
- examples that are realistic for a single symbol snapshot

The spec should be good enough that another AI model can construct a spread candidate by reading only:

- `/api/options-chain/nearby/{symbol}`
- `/api/charts/{symbol}/d1`
- the OpenAPI descriptions

## Testing Strategy

The implementation should be driven by tests for:

- options-chain strike window trimming
- expiry filtering by `dteMin` / `dteMax`
- `mid` normalization
- chart indicator calculation and returned shape
- route-level parameter parsing and error handling

## Follow-On Work

Once these two base endpoints are stable, a third iteration can add:

- `/api/strategies/spread-builder`

That endpoint should depend on these contracts rather than replacing them.
