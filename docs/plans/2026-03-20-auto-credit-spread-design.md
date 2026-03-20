# Auto Credit Spread Execution Design

**Date:** 2026-03-20

**Goal:** Extend the current stock scanner into an automated paper-trading system that discovers, sizes, places, and manages `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT` option spreads through the sibling `tiger_adapter` service during regular U.S. market hours.

## Current State

This repository already has a working options-signal pipeline:

- [src/worker/options/options.ts](./../../src/worker/options/options.ts) scans a symbol and emits filtered `OptionSignalLite` legs.
- [src/server.ts](./../../src/server.ts) exposes `/api/options/:symbol` and persists snapshots.
- [src/db/persistence.ts](./../../src/db/persistence.ts) stores scan snapshots, signal legs, and detected combos.
- [src/scheduler.ts](./../../src/scheduler.ts) currently runs a daily end-of-day batch, not an intraday execution loop.

What is missing is the execution layer:

- no strategy-level spread candidate model
- no account-risk budget model
- no order intent / execution / position lifecycle tables
- no broker integration from this service
- no automatic entry or exit management

The sibling `tiger_adapter` repository is a separate FastAPI service that already wraps Tiger trade APIs, but its current request model and routes are still stock-order oriented:

- [../tiger_adapter/app/models.py](../../../tiger_adapter/app/models.py)
- [../tiger_adapter/app/trade_api.py](../../../tiger_adapter/app/trade_api.py)

Important integration note:

- the README examples in `tiger_adapter` use `/order`, but the actual router prefix in code is `/api/v1`
- integration code should target the implemented route shape, not the README examples

## Product Boundary

V1 should automate only defined-risk U.S. option credit spreads:

- `BEAR_CALL_CREDIT`
- `BULL_PUT_CREDIT`

V1 should run only:

- in the paper account
- during regular U.S. equity market hours
- on a 15-minute scan cadence

V1 should not:

- place naked option legs
- place stock hedge legs
- trade outside regular hours
- support arbitrary multi-leg structures beyond these two spread types

## Recommended Architecture

Use a three-layer system.

### 1. Signal Layer

Keep the existing scanner as the source of market context:

- options flow
- spot confirmation
- event proximity
- liquidity and spread quality

This layer should remain focused on market observation, not order placement.

### 2. Strategy and Execution Planning Layer

Add a new backend-owned planning layer that converts raw signals plus spot structure into executable spread candidates.

Responsibilities:

- choose strategy type: `BEAR_CALL_CREDIT` or `BULL_PUT_CREDIT`
- choose expiration and strike pair
- compute target net credit and floor net credit
- compute max loss and risk budget usage
- reject setups that fail structure, liquidity, DTE, event, or account limits
- assign entry and exit rules
- emit one idempotent order intent per candidate

This is the missing boundary between "interesting options activity" and "actionable trade".

### 3. Broker Execution Layer

Keep broker-specific behavior in `tiger_adapter`.

Responsibilities:

- resolve option contracts
- preview combo orders
- place combo orders
- modify or cancel working orders
- return position and order state in a normalized format

This layer should not contain strategy logic beyond validating the request and translating it to Tiger.

## Strategy Model

Introduce a new strategy contract in this repository, separate from `OptionSignalLite`.

Recommended shape:

- `strategyType`
- `symbol`
- `underlyingPrice`
- `expiryISO`
- `shortLeg`
- `longLeg`
- `width`
- `targetNetCredit`
- `minAcceptableNetCredit`
- `maxLoss`
- `riskPerContract`
- `quantity`
- `invalidationPrice`
- `setupState`
- `entryReason`
- `exitPlan`
- `idempotencyKey`

Leg shape should be explicit:

- `symbol`
- `expiry`
- `strike`
- `putCall`
- `action`
- `multiplier`
- `contractId` when available

## Entry Logic

### Bear Call Credit

Use the existing bearish signal stack plus spot-structure logic:

- bearish spot context
- resistance remains intact
- short call sits above resistance
- long call caps risk at a fixed width
- credit and bid/ask quality must exceed thresholds

### Bull Put Credit

Use a distinct bullish-support model:

- selloff or pullback into support
- stabilization rather than ongoing breakdown
- short put sits below support
- long put caps risk at a fixed width
- credit and bid/ask quality must exceed thresholds

### Shared Entry Rules

V1 should keep these constraints intentionally narrow:

- `3-7 DTE`
- fixed width ladder only, for example `1`, `2`, or `5`
- minimum per-leg liquidity thresholds
- maximum bid/ask width as a percentage of midpoint
- earnings/event filters near expiration
- no duplicate open position for the same symbol and strategy direction

## Risk Model

Position sizing should be based on account net value percentage, as requested.

### Required Risk Inputs

- `maxRiskPctPerTrade`
- `maxPortfolioRiskPct`
- `maxOpenPositions`
- `maxPositionsPerSymbol`
- `maxNewEntriesPerScan`

### Sizing Formula

For each candidate:

`contracts = floor((accountNetValue * maxRiskPctPerTrade) / maxLossPerContract)`

Additional caps:

- minimum `1` contract
- reject if resulting size is `0`
- reject if aggregate open risk would exceed `maxPortfolioRiskPct`
- reject if buying power buffer falls below a configured reserve

### Margin and Buying Power Validation

Every entry must pass two checks:

1. local risk check in `stock-scanner-standalone`
2. broker-side preview check in `tiger_adapter`

If Tiger preview or tradability checks fail, the trade is rejected before order placement.

## Execution Model

### Order Type

Use native combo spread orders only.

V1 must not auto-submit two independent naked legs to simulate a spread.

Reason:

- legging risk is not acceptable for unattended automation
- the system must know Tiger accepted the structure as one defined-risk position

### Price Handling

For entries:

- submit a combo `net credit limit` order
- start at a conservative target credit
- if unfilled, reprice in configured increments
- stop after a bounded number of attempts or when credit falls below the configured floor

For exits:

- submit a combo debit-to-close or credit-to-close order as appropriate
- apply bounded repricing and expiry-aware urgency

### Idempotency

Every order intent should be keyed by:

`symbol + strategyType + expiry + shortStrike + longStrike`

Rules:

- if an open or pending intent already exists for the key, do not create another
- failed or canceled intents should enter a cooldown period
- all calls to `tiger_adapter` should include an external client order key when possible

## Position Lifecycle Management

Introduce managed position states:

- `pending_entry`
- `open`
- `pending_exit`
- `closed`
- `failed`
- `manual_intervention_required`

Each managed position should store:

- opening order metadata
- fill prices and quantity
- live max-risk reference
- current exit policy
- reconciliation timestamps

## Exit Rules

V1 should support fully automatic management, but only with simple and deterministic rules.

Required exit triggers:

- fixed profit target
- fixed loss threshold
- spot invalidation breach
- forced close before expiration
- stale or inconsistent broker/order state

Recommended initial rules:

- profit target based on captured share of original credit
- stop loss based on a multiple of original credit or a share of max loss
- mandatory close at `1 DTE` or stricter
- if position reconciliation fails or legs do not match expectations, mark `manual_intervention_required` and block new entries

## Scheduling and Market Hours

The current scheduler in [src/scheduler.ts](./../../src/scheduler.ts) is a daily batch.

V1 should add a separate execution schedule for:

- every 15 minutes
- Monday through Friday
- only during regular U.S. session

Do not rely only on cron expression timing.

The execution loop should also check:

- current market session
- holiday / closed market status if available
- a feature flag for `paper` vs `live`

## Persistence Changes

The current Prisma schema is snapshot-oriented. Add execution-oriented models.

Recommended new models:

- `TradeIntent`
- `TradeExecution`
- `ManagedPosition`
- `RiskConfig`
- `RiskEvent`

Suggested purposes:

- `TradeIntent`: one planned spread candidate and its decision record
- `TradeExecution`: broker requests, order ids, reprices, fills, cancels
- `ManagedPosition`: the durable lifecycle record for an opened spread
- `RiskConfig`: runtime thresholds and account-level settings
- `RiskEvent`: blocked trade, rejected preview, reconciliation mismatch, forced halt

## API Changes In This Repository

Add internal or user-facing endpoints for:

- previewing spread candidates
- listing order intents
- listing managed positions
- pausing automation
- manually forcing close on a managed position

Possible initial route set:

- `GET /api/automation/credit-spreads/candidates`
- `GET /api/automation/credit-spreads/intents`
- `GET /api/automation/credit-spreads/positions`
- `POST /api/automation/credit-spreads/run-once`
- `POST /api/automation/credit-spreads/pause`
- `POST /api/automation/credit-spreads/resume`
- `POST /api/automation/credit-spreads/positions/:id/close`

## API Changes In tiger_adapter

Extend the adapter with option-combo primitives.

Recommended routes:

- `POST /api/v1/options/preview-combo`
- `POST /api/v1/options/place-combo`
- `POST /api/v1/options/modify-combo`
- `POST /api/v1/options/cancel-combo`
- `GET /api/v1/options/orders`
- `GET /api/v1/options/positions`

The adapter request model should support:

- explicit leg array
- order side semantics
- quantity
- limit net price
- tif
- paper/live mode guardrails
- external idempotency key

If Tiger SDK exposes native option contract and combo order helpers, the adapter should use those directly instead of reconstructing spread behavior in application code.

## Observability

This system needs more than console logging.

Minimum required logging:

- candidate accepted / rejected
- account-risk rejection reason
- preview rejection reason
- order placement attempts and reprices
- fill events
- forced exits
- reconciliation mismatches

Also add metrics or at least queryable DB records for:

- scan count
- candidate count
- entry attempts
- entry fills
- exit fills
- rejection reasons
- manual intervention events

## Safety Controls

V1 should include hard kill switches:

- global automation enabled flag
- paper-account-only flag
- market-hours-only flag
- max daily new entries
- max daily loss halt
- manual pause endpoint

If any of the following occurs, the system should stop opening new trades:

- broker preview failures above a threshold
- repeated reconciliation mismatches
- order placement errors above a threshold
- missing account data
- unexpected open naked leg exposure

## Recommended Delivery Order

1. Add spread candidate and execution-intent types in `stock-scanner-standalone`
2. Add risk sizing and idempotent intent persistence
3. Extend `tiger_adapter` with option contract and combo preview/place APIs
4. Build run-once execution orchestration in paper mode
5. Build managed-position reconciliation and exit automation
6. Add operator endpoints and safety controls
7. Run paper-trading observation before any live-account consideration

## Verification Strategy

Before any live trading consideration, verify:

- spread candidates are structurally correct
- risk-per-trade math matches expected max loss
- preview rejections are surfaced cleanly
- entry repricing never crosses configured floor credit
- duplicate signals do not create duplicate positions
- exit automation closes the intended spread
- any broken broker reconciliation halts new entries

## Recommendation

The integration should be built as an execution system on top of the existing scanner, not as a direct "scan then call broker" shortcut.

That keeps the architecture defensible:

- scanner decides what is interesting
- planner decides what is tradable
- broker adapter decides how to express it to Tiger

This is the narrowest path that still supports safe automatic paper trading for credit spreads.
