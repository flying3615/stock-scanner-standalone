# Nearby Options Chain And D1 Chart Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two normalized market-data endpoints, `/api/options-chain/nearby/:symbol` and `/api/charts/:symbol/d1`, so downstream AI clients can inspect recent daily price structure and near-term options-chain detail without consuming raw vendor payloads.

**Architecture:** Reuse the existing Yahoo/Polygon fetchers and strategy helpers to build thin normalization modules. Expose two new Express routes with short TTL caching, concise summaries, and AI-friendly OpenAPI descriptions. Keep the contracts strategy-oriented but not strategy-prescriptive so a future `spread-builder` endpoint can compose them directly.

**Tech Stack:** TypeScript, Express, NodeCache, yahoo-finance2, existing Polygon fallback integration, OpenAPI 3.0 YAML, `node --import tsx --test`, `tsc`.

---

### Task 1: Define normalized response types for nearby chains and d1 charts

**Files:**
- Create: `src/worker/market-data/contracts.ts`
- Create: `src/worker/market-data/contracts.spec.ts`
- Modify: `frontend/src/types.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_DATA_INTERVALS } from './contracts.js';

test('market-data contracts expose the supported intervals and endpoint shapes', () => {
  assert.deepEqual(MARKET_DATA_INTERVALS, ['1d']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/market-data/contracts.spec.ts`

Expected: FAIL because the contracts module does not exist yet.

**Step 3: Write minimal implementation**

Create normalized TypeScript contracts for:

- `NearbyOptionsChainSnapshot`
- `NearbyOptionsExpiryBucket`
- `NearbyOptionRow`
- `DailyChartSnapshot`
- `DailyChartBar`
- `DailyChartIndicators`

Also export shared constants for supported interval names and default query values.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/market-data/contracts.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/market-data/contracts.ts src/worker/market-data/contracts.spec.ts frontend/src/types.ts
git commit -m "feat: add normalized market data contracts"
```

### Task 2: Build the nearby options chain normalizer

**Files:**
- Create: `src/worker/market-data/options-chain-nearby.ts`
- Create: `src/worker/market-data/options-chain-nearby.spec.ts`
- Modify: `src/worker/options/fetch.ts`

**Step 1: Write the failing tests**

Add tests covering:

- expiry filtering respects `dteMin` and `dteMax`
- strike trimming keeps only the requested window around spot
- option rows normalize `mid`, `delta`, `impliedVolatility`, `volume`, and `openInterest`
- calls and puts are grouped under the same `expiryISO`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/market-data/options-chain-nearby.spec.ts`

Expected: FAIL because the normalizer does not exist yet.

**Step 3: Write minimal implementation**

Implement a pure builder that:

- accepts a vendor chain plus `spot`, `dteMin`, `dteMax`, and `strikesEachSide`
- normalizes both Yahoo and Polygon row shapes into one contract
- derives `mid`
- preserves `null` for missing price or greek fields when the distinction matters
- emits a compact `summary`

Only add the minimal helpers needed for deterministic behavior.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/market-data/options-chain-nearby.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/market-data/options-chain-nearby.ts src/worker/market-data/options-chain-nearby.spec.ts src/worker/options/fetch.ts
git commit -m "feat: normalize nearby options chains"
```

### Task 3: Build the d1 chart snapshot normalizer with structure indicators

**Files:**
- Create: `src/worker/market-data/chart-d1.ts`
- Create: `src/worker/market-data/chart-d1.spec.ts`
- Modify: `src/worker/strategies/call-credit-helpers.ts`

**Step 1: Write the failing tests**

Add tests covering:

- returned bars are trimmed to the requested `lookback`
- `ema20`, `ema50`, and `ema200` are computed from a longer internal history
- `closeLocationValue`, `upperWickRatio`, `lowerWickRatio`, and `volumeRatio20` are included
- `support` and `resistance` are present in the indicator payload

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/market-data/chart-d1.spec.ts`

Expected: FAIL because the chart snapshot builder does not exist yet.

**Step 3: Write minimal implementation**

Implement a chart normalizer that:

- fetches enough bars to keep `ema200` stable
- returns only the requested trailing bars
- reuses existing candle and EMA helpers where practical
- emits a `summary` plus `indicators`

If a helper must move out of the strategy layer for reuse, move only that helper.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/market-data/chart-d1.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/market-data/chart-d1.ts src/worker/market-data/chart-d1.spec.ts src/worker/strategies/call-credit-helpers.ts
git commit -m "feat: add d1 chart snapshots with structure indicators"
```

### Task 4: Add the two Express routes with query validation and caching

**Files:**
- Modify: `src/server.ts`
- Create: `src/worker/market-data/routes.spec.ts`

**Step 1: Write the failing route-level tests or request harness**

Add cases covering:

- `GET /api/options-chain/nearby/:symbol?dteMin=3&dteMax=7&strikesEachSide=10`
- `GET /api/charts/:symbol/d1?lookback=120`
- invalid query parameters return `400`
- valid responses include `asOf`

**Step 2: Run verification to confirm it fails**

Run the route-focused test command or request harness you add.

Expected: FAIL because the routes do not exist yet.

**Step 3: Write minimal implementation**

Add route handlers that:

- parse and validate query parameters
- call the new normalizers
- cache nearby-chain responses for `60s`
- cache d1-chart responses for `300s`

Keep route logic thin and push shaping logic into the worker modules.

**Step 4: Run verification to confirm it passes**

Run the new route test command plus:

```bash
npm run build
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/server.ts src/worker/market-data/routes.spec.ts
git commit -m "feat: add nearby options and d1 chart api routes"
```

### Task 5: Document both endpoints in OpenAPI for AI consumers

**Files:**
- Modify: `src/api/openapi.yaml`
- Modify: `src/api/openapi-setup.ts` only if needed for spec serving

**Step 1: Write the failing documentation checklist**

Create a checklist that confirms the spec explicitly documents:

- `mid` semantics
- `asOf` semantics
- `closeLocationValue` range
- `support` and `resistance` as structural references, not trading commands
- query parameters and defaults for both routes

**Step 2: Verify the checklist currently fails**

Read the existing YAML and confirm these two paths and field descriptions are missing.

**Step 3: Write minimal implementation**

Add:

- `/api/options-chain/nearby/{symbol}`
- `/api/charts/{symbol}/d1`
- normalized schemas for option rows, expiry groups, bars, and indicators
- realistic examples
- AI-oriented field descriptions

Do not dump vendor-specific schema noise into the public contract.

**Step 4: Verify the rendered docs**

Run the server and confirm:

- `/api-docs`
- `/api-docs/openapi.yaml`

show the new endpoints and raw YAML correctly.

**Step 5: Commit**

```bash
git add src/api/openapi.yaml src/api/openapi-setup.ts
git commit -m "docs: add nearby options and d1 chart api spec"
```

### Task 6: Run full verification

**Files:**
- No new files expected

**Step 1: Run backend tests**

Run:

```bash
node --import tsx --test \
  src/worker/market-data/contracts.spec.ts \
  src/worker/market-data/options-chain-nearby.spec.ts \
  src/worker/market-data/chart-d1.spec.ts \
  src/worker/market-data/routes.spec.ts
```

Expected: PASS

**Step 2: Run existing strategy tests to guard reuse**

Run:

```bash
node --import tsx --test \
  src/worker/strategies/call-credit-helpers.spec.ts \
  src/worker/strategies/call-credit.spec.ts
```

Expected: PASS

**Step 3: Run builds**

Run:

```bash
npm run build
cd frontend && npm run build
```

Expected: PASS

**Step 4: Smoke-test the live routes**

Run:

```bash
PORT=3010 npm run server
curl 'http://localhost:3010/api/options-chain/nearby/NVDA?dteMin=3&dteMax=7&strikesEachSide=10'
curl 'http://localhost:3010/api/charts/NVDA/d1?lookback=120'
```

Expected: Both routes return normalized JSON payloads with `asOf`.

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify nearby options and d1 chart endpoints"
```
