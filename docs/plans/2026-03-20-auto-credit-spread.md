# Auto Credit Spread Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated paper-trading workflow that generates, risk-checks, submits, and manages `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT` spreads through the sibling `tiger_adapter` service during regular U.S. market hours.

**Architecture:** Add a new execution-planning layer to `stock-scanner-standalone` so the existing options scanner feeds structured spread candidates instead of raw legs. Persist trade intents and managed positions in Prisma, then call new option-combo endpoints in `tiger_adapter` for preview, placement, repricing, and position reconciliation. Keep strategy logic in TypeScript and broker translation in Python.

**Tech Stack:** TypeScript, Express, Prisma, SQLite, node-cron, tsx, Python 3.9+, FastAPI, tigeropen SDK, pytest.

---

### Task 1: Add execution domain types for auto credit spreads

**Files:**
- Create: `src/worker/strategies/credit-spread-types.ts`
- Create: `src/worker/execution/types.ts`
- Create: `src/worker/execution/types.spec.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CreditSpreadCandidate } from './types.js';

test('credit spread candidate captures both legs and execution fields', () => {
  const candidate: CreditSpreadCandidate = {
    strategyType: 'BULL_PUT_CREDIT',
    symbol: 'AAPL',
    expiryISO: '2026-03-27',
    quantity: 1,
    width: 2,
    targetNetCredit: 0.55,
    minAcceptableNetCredit: 0.4,
    maxLoss: 145,
    shortLeg: { putCall: 'PUT', action: 'SELL', strike: 190, expiry: '20260327', multiplier: 100, symbol: 'AAPL' },
    longLeg: { putCall: 'PUT', action: 'BUY', strike: 188, expiry: '20260327', multiplier: 100, symbol: 'AAPL' },
    idempotencyKey: 'AAPL:BULL_PUT_CREDIT:2026-03-27:190:188',
  };

  assert.equal(candidate.longLeg.action, 'BUY');
  assert.equal(candidate.shortLeg.putCall, 'PUT');
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/execution/types.spec.ts`

Expected: FAIL because the new execution types do not exist yet.

**Step 3: Write minimal implementation**

Create shared execution types covering:

- `CreditSpreadCandidate`
- `CreditSpreadLeg`
- `TradeIntentStatus`
- `ManagedPositionStatus`
- `ExitPolicy`
- `RiskCheckResult`

Keep the types pure and independent of broker-specific request payloads.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/execution/types.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/credit-spread-types.ts src/worker/execution/types.ts src/worker/execution/types.spec.ts
git commit -m "feat: add auto credit spread execution types"
```

### Task 2: Build a spread candidate planner from existing scan output

**Files:**
- Create: `src/worker/strategies/credit-spread-planner.ts`
- Create: `src/worker/strategies/credit-spread-planner.spec.ts`
- Modify: `src/worker/options/options.ts`
- Modify: `src/worker/shared.ts`

**Step 1: Write the failing tests**

Add tests for:

- `BEAR_CALL_CREDIT` selection chooses short and long calls above resistance
- `BULL_PUT_CREDIT` selection chooses short and long puts below support
- candidate is rejected when width or credit thresholds fail
- planner emits a stable `idempotencyKey`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/credit-spread-planner.spec.ts`

Expected: FAIL because no planner exists.

**Step 3: Write minimal implementation**

Create planner helpers that:

- consume existing options scan output plus spot context
- produce `CreditSpreadCandidate[]`
- keep V1 limited to `3-7 DTE`
- use fixed width ladder filtering
- annotate invalidation and entry reason fields

Avoid broker calls in this module.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/credit-spread-planner.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/credit-spread-planner.ts src/worker/strategies/credit-spread-planner.spec.ts src/worker/options/options.ts src/worker/shared.ts
git commit -m "feat: add spread candidate planner"
```

### Task 3: Add account-percentage risk sizing and trade gating

**Files:**
- Create: `src/worker/execution/risk.ts`
- Create: `src/worker/execution/risk.spec.ts`
- Create: `src/worker/execution/config.ts`

**Step 1: Write the failing tests**

Add tests for:

- quantity sizing from `accountNetValue * maxRiskPctPerTrade`
- rejection when quantity rounds to `0`
- rejection when aggregate open risk exceeds configured cap
- rejection when duplicate position key already exists

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/execution/risk.spec.ts`

Expected: FAIL because the risk module does not exist.

**Step 3: Write minimal implementation**

Implement:

- config loader for risk settings
- contract count calculation from max loss
- aggregate risk cap checks
- duplicate and cooldown checks using the idempotency key

Keep this module deterministic and easy to unit test.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/execution/risk.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/execution/risk.ts src/worker/execution/risk.spec.ts src/worker/execution/config.ts
git commit -m "feat: add credit spread risk sizing"
```

### Task 4: Extend Prisma schema for intents, executions, and managed positions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_auto_credit_spread_execution/migration.sql`
- Modify: `src/db/persistence.ts`
- Create: `src/db/execution-repository.ts`

**Step 1: Write the failing repository test or fixture harness**

Add a thin test or manual fixture script that expects:

- an intent record to persist
- a managed position to reference the opening intent
- risk events to persist rejection reasons

**Step 2: Run verification to confirm it fails**

Run the repository test or migration-backed fixture command.

Expected: FAIL because the schema tables do not exist.

**Step 3: Write minimal implementation**

Add Prisma models:

- `TradeIntent`
- `TradeExecution`
- `ManagedPosition`
- `RiskEvent`

Add a repository module for creating and updating these records. Keep snapshot persistence working as-is.

**Step 4: Run migration and verification**

Run: `npx prisma migrate dev --name add_auto_credit_spread_execution`

Run: `npx prisma generate`

Expected: PASS

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/db/persistence.ts src/db/execution-repository.ts
git commit -m "feat: add execution persistence models"
```

### Task 5: Add Tiger adapter client in the TypeScript service

**Files:**
- Create: `src/modules/tiger/client.ts`
- Create: `src/modules/tiger/client.spec.ts`
- Modify: `src/server.ts`

**Step 1: Write the failing tests**

Add tests for:

- preview request payload mapping
- combo placement payload mapping
- authorization header handling
- non-200 responses returning normalized errors

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/modules/tiger/client.spec.ts`

Expected: FAIL because no client module exists.

**Step 3: Write minimal implementation**

Create a small HTTP client for `tiger_adapter` that can call:

- combo preview
- combo place
- combo cancel
- option positions
- option orders

Read base URL and token from environment variables.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/modules/tiger/client.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/tiger/client.ts src/modules/tiger/client.spec.ts src/server.ts
git commit -m "feat: add tiger adapter combo client"
```

### Task 6: Add option combo request models and preview endpoint to tiger_adapter

**Files:**
- Modify: `../tiger_adapter/app/models.py`
- Modify: `../tiger_adapter/app/trade_api.py`
- Modify: `../tiger_adapter/tests/test_api.py`

**Step 1: Write the failing tests**

Add pytest coverage for:

- previewing a two-leg credit spread request
- validating both legs are same expiry and opposite actions
- rejecting malformed combo requests

**Step 2: Run test to verify it fails**

Run: `cd ../tiger_adapter && pytest tests/test_api.py -k combo -v`

Expected: FAIL because combo models and routes do not exist.

**Step 3: Write minimal implementation**

Add Pydantic models for:

- option leg
- combo order preview request
- combo order preview response

Implement `POST /api/v1/options/preview-combo` using Tiger option contract helpers and preview functionality.

**Step 4: Run test to verify it passes**

Run: `cd ../tiger_adapter && pytest tests/test_api.py -k combo -v`

Expected: PASS

**Step 5: Commit**

```bash
cd ../tiger_adapter
git add app/models.py app/trade_api.py tests/test_api.py
git commit -m "feat: add option combo preview api"
```

### Task 7: Add combo placement, cancellation, and normalized option position routes to tiger_adapter

**Files:**
- Modify: `../tiger_adapter/app/models.py`
- Modify: `../tiger_adapter/app/trade_api.py`
- Modify: `../tiger_adapter/tests/test_api.py`

**Step 1: Write the failing tests**

Add tests for:

- placing a combo order with net credit limit
- canceling a combo order
- listing option positions with leg detail
- propagating Tiger SDK failures into normalized HTTP errors

**Step 2: Run test to verify it fails**

Run: `cd ../tiger_adapter && pytest tests/test_api.py -k "combo or option_positions" -v`

Expected: FAIL because these routes do not exist.

**Step 3: Write minimal implementation**

Expose:

- `POST /api/v1/options/place-combo`
- `POST /api/v1/options/cancel-combo`
- `GET /api/v1/options/positions`
- `GET /api/v1/options/orders`

Normalize the response shape for the TypeScript coordinator.

**Step 4: Run test to verify it passes**

Run: `cd ../tiger_adapter && pytest tests/test_api.py -k "combo or option_positions" -v`

Expected: PASS

**Step 5: Commit**

```bash
cd ../tiger_adapter
git add app/models.py app/trade_api.py tests/test_api.py
git commit -m "feat: add combo execution routes"
```

### Task 8: Build the entry execution coordinator and run-once workflow

**Files:**
- Create: `src/worker/execution/entry-coordinator.ts`
- Create: `src/worker/execution/entry-coordinator.spec.ts`
- Create: `src/worker/execution/run-once.ts`
- Modify: `src/server.ts`

**Step 1: Write the failing tests**

Add tests for:

- candidate accepted only after local risk pass and broker preview pass
- repricing stops at `minAcceptableNetCredit`
- duplicate idempotency key does not create another order
- failed preview stores a `RiskEvent`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/execution/entry-coordinator.spec.ts`

Expected: FAIL because the coordinator does not exist.

**Step 3: Write minimal implementation**

Implement a coordinator that:

- loads candidates
- applies risk gating
- calls Tiger preview
- places combo entry orders
- persists intent and execution records
- supports a `run-once` execution entrypoint

Add a backend route:

- `POST /api/automation/credit-spreads/run-once`

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/execution/entry-coordinator.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/execution/entry-coordinator.ts src/worker/execution/entry-coordinator.spec.ts src/worker/execution/run-once.ts src/server.ts
git commit -m "feat: add spread entry execution coordinator"
```

### Task 9: Add managed-position reconciliation and exit automation

**Files:**
- Create: `src/worker/execution/position-manager.ts`
- Create: `src/worker/execution/position-manager.spec.ts`
- Modify: `src/modules/tiger/client.ts`
- Modify: `src/server.ts`

**Step 1: Write the failing tests**

Add tests for:

- take-profit exit trigger
- stop-loss exit trigger
- forced close before expiration
- reconciliation mismatch transitions to `manual_intervention_required`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/execution/position-manager.spec.ts`

Expected: FAIL because the position manager does not exist.

**Step 3: Write minimal implementation**

Implement a managed-position loop that:

- fetches current option positions and working orders
- reconciles against local records
- generates exit intents
- submits combo exit orders through `tiger_adapter`
- blocks new entries on dangerous mismatches

Add routes for operator visibility:

- `GET /api/automation/credit-spreads/intents`
- `GET /api/automation/credit-spreads/positions`
- `POST /api/automation/credit-spreads/positions/:id/close`

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/execution/position-manager.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/execution/position-manager.ts src/worker/execution/position-manager.spec.ts src/modules/tiger/client.ts src/server.ts
git commit -m "feat: add managed spread exit automation"
```

### Task 10: Add execution scheduler, safety controls, and paper-mode guardrails

**Files:**
- Modify: `src/scheduler.ts`
- Create: `src/worker/execution/market-hours.ts`
- Create: `src/worker/execution/market-hours.spec.ts`
- Modify: `.env.example`
- Modify: `src/server.ts`

**Step 1: Write the failing tests**

Add tests for:

- regular-hours-only guard
- weekday 15-minute execution cadence helper
- automation disabled flag blocks run
- paper-only flag blocks live-account calls

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/execution/market-hours.spec.ts`

Expected: FAIL because the guard module does not exist.

**Step 3: Write minimal implementation**

Add:

- a 15-minute scheduler separate from the current daily scan job
- market-hours guard helpers
- env flags for automation enablement, paper/live mode, and risk caps
- pause/resume endpoints if a lightweight implementation fits in this step

**Step 4: Run verification**

Run: `npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add src/scheduler.ts src/worker/execution/market-hours.ts src/worker/execution/market-hours.spec.ts .env.example src/server.ts
git commit -m "feat: add automated spread execution scheduler"
```

### Task 11: Verify end-to-end paper trading flow and document operations

**Files:**
- Modify: `src/api/openapi.yaml`
- Modify: `README.md`
- Modify: `../tiger_adapter/README.md`
- Create: `docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

**Step 1: Write the failing verification checklist**

Create a checklist that requires:

- candidate generation works
- preview route responds
- paper order placement succeeds
- open position appears in reconciliation
- exit automation triggers correctly

**Step 2: Run the verification flow**

Run:

- `npm run build`
- `npm run server`
- `cd ../tiger_adapter && pytest tests/test_api.py -v`
- manual paper-trading smoke test against a small-risk setup

Expected: at least one failing item before docs and operational fixes are complete.

**Step 3: Write minimal implementation and docs**

Document:

- required env vars
- route contracts
- safety switches
- paper-trading startup procedure
- rollback and manual intervention procedure

**Step 4: Run final verification**

Run:

- `npm run build`
- `cd ../tiger_adapter && pytest tests/test_api.py -v`

Expected: PASS

**Step 5: Commit**

```bash
git add src/api/openapi.yaml README.md ../tiger_adapter/README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md
git commit -m "docs: add auto credit spread operations guide"
```
