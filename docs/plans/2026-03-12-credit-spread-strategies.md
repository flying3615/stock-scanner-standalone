# Credit Spread Strategies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-purpose call credit strategy contract with a unified `credit spread strategies` API and UI model that supports both `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT`, while documenting every key field clearly enough for external AI clients to consume the endpoint directly from the OpenAPI spec.

**Architecture:** Refactor the current call credit strategy engine into a shared credit spread engine with strategy-specific spot-structure adapters. Introduce a new `/api/strategies/credit-spreads` route, a generalized candidate/template schema, machine-readable blocker codes, and OpenAPI descriptions that encode chart and trade semantics instead of only UI copy. Reuse the existing frontend strategy shell with a strategy-type selector rather than maintaining separate pages.

**Tech Stack:** TypeScript, Express, yahoo-finance2, NodeCache, React 19, Vite, Tailwind, OpenAPI 3.0 YAML, `node --import tsx --test` for backend and utility tests.

---

### Task 1: Generalize strategy types and candidate schema

**Files:**
- Modify: `src/worker/strategies/call-credit-types.ts`
- Modify: `frontend/src/types.ts`
- Create: `src/worker/strategies/credit-spread-types.spec.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CreditSpreadCandidate } from './call-credit-types.js';

test('credit spread candidate supports both bearish and bullish variants', () => {
  const candidate = {
    strategyType: 'BULL_PUT_CREDIT',
    direction: 'BULLISH',
    anchorType: 'SUPPORT',
    blockers: ['NO_LIQUID_TEMPLATE'],
  } satisfies Partial<CreditSpreadCandidate>;

  assert.equal(candidate.strategyType, 'BULL_PUT_CREDIT');
  assert.equal(candidate.anchorType, 'SUPPORT');
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/credit-spread-types.spec.ts`

Expected: FAIL because the generalized types do not exist yet.

**Step 3: Write minimal implementation**

Expand the shared strategy types to add:

- `strategyType`
- `direction`
- `anchorType`
- `anchorLevel`
- `blockers`
- generic spread template leg typing

Keep naming generic enough that the same schema works for both bear call and bull put spreads.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/credit-spread-types.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit-types.ts frontend/src/types.ts src/worker/strategies/credit-spread-types.spec.ts
git commit -m "feat: generalize credit spread strategy types"
```

### Task 2: Extract shared spread-template helpers

**Files:**
- Modify: `src/worker/strategies/call-credit-helpers.ts`
- Modify: `src/worker/strategies/call-credit-helpers.spec.ts`

**Step 1: Write the failing tests**

Add tests covering:

- bear call templates produce `CALL/CALL` leg typing
- bull put templates produce `PUT/PUT` leg typing
- `creditPctWidth` remains `creditMid / width`
- `expiryISO` is preserved

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: FAIL because the helper only understands the current call-credit shape.

**Step 3: Write minimal implementation**

Refactor helper selection into shared functions:

- `selectBearCallCreditTemplate(...)`
- `selectBullPutCreditTemplate(...)`
- shared midpoint / delta / width logic where possible

Keep this logic pure and deterministic.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit-helpers.ts src/worker/strategies/call-credit-helpers.spec.ts
git commit -m "feat: add shared credit spread template helpers"
```

### Task 3: Build a shared ranking engine with bear/bull adapters

**Files:**
- Modify: `src/worker/strategies/call-credit.ts`
- Modify: `src/worker/strategies/call-credit.spec.ts`

**Step 1: Write the failing tests**

Add cases asserting:

- `BEAR_CALL_CREDIT` uses resistance anchors and bearish blockers
- `BULL_PUT_CREDIT` uses support anchors and bullish blockers
- the same symbol can produce different rankings depending on strategy type
- a green-session recovery candidate can qualify for bull put but not bear call

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/call-credit.spec.ts`

Expected: FAIL because the ranking engine is still bearish-only.

**Step 3: Write minimal implementation**

Refactor the current ranking entrypoint into a generalized service that:

- accepts `strategyType`
- derives direction-specific spot structure
- derives `anchorType` and `anchorLevel`
- creates machine-readable blocker codes
- selects the correct spread template constructor
- returns generalized candidates

Maintain the existing universe cap, deduplication, and caching behavior.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/call-credit.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit.ts src/worker/strategies/call-credit.spec.ts
git commit -m "feat: add unified credit spread ranking engine"
```

### Task 4: Introduce the unified API endpoint and preserve compatibility

**Files:**
- Modify: `src/server.ts`
- Modify: `src/api/openapi.yaml`

**Step 1: Write the failing route test or request harness**

Add a backend test or request-level check that expects:

- `GET /api/strategies/credit-spreads?strategyType=BEAR_CALL_CREDIT`
- `GET /api/strategies/credit-spreads?strategyType=BULL_PUT_CREDIT`

to return the generalized snapshot schema.

**Step 2: Run verification to confirm it fails**

Run the route-focused test command or an equivalent request harness.

Expected: FAIL because the route does not yet exist.

**Step 3: Write minimal implementation**

Add the new route:

```ts
app.get('/api/strategies/credit-spreads', async (req, res) => {
  // parse strategyType, setupState, limit
  // build snapshot
});
```

Keep `/api/strategies/call-credit` temporarily if needed, but mark it as legacy in comments/docs or internally route it through the new engine for backward compatibility.

**Step 4: Run build verification**

Run: `npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add src/server.ts src/api/openapi.yaml
git commit -m "feat: add unified credit spread strategies api"
```

### Task 5: Rewrite OpenAPI for AI consumers

**Files:**
- Modify: `src/api/openapi.yaml`

**Step 1: Write the failing documentation checklist**

Create a checklist that confirms the spec now explicitly describes:

- `strategyType`
- `direction`
- `anchorType`
- `anchorLevel`
- `invalidationPrice`
- `score` as ranking, not win rate
- `blockers`
- `creditPctWidth`
- `expiryISO`

**Step 2: Verify the checklist currently fails**

Read the existing YAML and confirm some or all of these descriptions are missing or too vague.

**Step 3: Write minimal implementation**

Update OpenAPI to:

- add the `/api/strategies/credit-spreads` path
- add query parameter documentation
- define generalized schemas
- add precise field-level descriptions oriented toward machine readers
- add enums for strategy semantics and blockers

This task is complete only when an external model can correctly distinguish anchor, invalidation, setup state, and spread template fields from the spec alone.

**Step 4: Verify rendered documentation**

Run:

```bash
npm run server
```

Then check `/api-docs` and `/api-docs/openapi.yaml` manually to ensure the route and field descriptions render correctly.

**Step 5: Commit**

```bash
git add src/api/openapi.yaml
git commit -m "docs: clarify credit spread strategy semantics in openapi"
```

### Task 6: Update the strategy UI to use the generalized contract

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/StrategyMacroBar.tsx`
- Modify: `frontend/src/components/CallCreditCandidateList.tsx`
- Modify: `frontend/src/components/CallCreditDetailPanel.tsx`
- Modify: `frontend/src/utils/callCredit.ts`
- Modify: `frontend/src/utils/callCredit.spec.ts`

**Step 1: Write the failing UI utility test**

Add tests that assert:

- the strategy selector can request either `BEAR_CALL_CREDIT` or `BULL_PUT_CREDIT`
- visible candidate filtering still prefers `ACTIONABLE`
- template horizon formatting still works

**Step 2: Run test/build to verify it fails**

Run:

```bash
node --import tsx --test frontend/src/utils/callCredit.spec.ts
cd frontend && npm run build
```

Expected: FAIL because the UI still assumes bearish call-credit-only semantics.

**Step 3: Write minimal implementation**

Update the strategy page to:

- add a `strategyType` selector
- query the new unified endpoint
- label anchors as support or resistance according to payload
- render put-credit templates without special-casing hidden assumptions

Do not add a second independent page. Reuse the existing shell.

**Step 4: Run verification**

Run:

```bash
node --import tsx --test frontend/src/utils/callCredit.spec.ts
cd frontend && npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/types.ts frontend/src/components/StrategyMacroBar.tsx frontend/src/components/CallCreditCandidateList.tsx frontend/src/components/CallCreditDetailPanel.tsx frontend/src/utils/callCredit.ts frontend/src/utils/callCredit.spec.ts
git commit -m "feat: add unified credit spread strategy ui"
```

### Task 7: Run final verification and document compatibility

**Files:**
- Modify: `src/api/openapi.yaml`
- Modify: `README.md` if present

**Step 1: Create final verification checklist**

Confirm:

- both strategy types return valid payloads
- blocker codes appear in watchlist setups
- OpenAPI documents AI-facing semantics clearly
- frontend can switch between bear call and bull put
- old route behavior is either preserved or intentionally removed and documented

**Step 2: Run complete verification**

Run:

```bash
node --import tsx --test src/worker/strategies/credit-spread-types.spec.ts src/worker/strategies/call-credit-helpers.spec.ts src/worker/strategies/call-credit.spec.ts
node --import tsx --test frontend/src/utils/callCredit.spec.ts
npm run build
cd frontend && npm run build
```

Expected: all tests PASS, backend build PASS, frontend build PASS.

Then manually verify:

- `http://localhost:3000/api/strategies/credit-spreads?strategyType=BEAR_CALL_CREDIT`
- `http://localhost:3000/api/strategies/credit-spreads?strategyType=BULL_PUT_CREDIT`
- `http://localhost:3000/api-docs`

**Step 3: Document compatibility and migration notes**

If `/api/strategies/call-credit` is retained:

- mark it as legacy in docs
- point consumers to `/api/strategies/credit-spreads`

If it is removed:

- document the breaking change explicitly

**Step 4: Commit**

```bash
git add src/api/openapi.yaml README.md
git commit -m "chore: verify and document unified credit spread strategies"
```
