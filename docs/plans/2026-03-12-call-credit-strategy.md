# Call Credit Strategy Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated options strategy page that ranks bearish breakdown candidates for short-term call credit spreads and presents a structured `3-7 DTE` spread template backed by the existing scanner, options, macro, and news layers.

**Architecture:** Add a backend strategy aggregation module that reuses current movers, daily chart analysis, options-chain scanning, and macro regime data to produce a single `/api/strategies/call-credit` payload. Then add a frontend `Strategies` view that consumes that payload, shows macro pressure at the top, ranks setups by score, and renders a detail panel with spread parameters and invalidation levels.

**Tech Stack:** TypeScript, Express, yahoo-finance2, NodeCache, React 19, Vite, Tailwind, optional Polygon greeks fallback, `node --import tsx --test` for backend unit tests.

---

### Task 1: Create strategy types and pure score helpers

**Files:**
- Create: `src/worker/strategies/call-credit-types.ts`
- Create: `src/worker/strategies/call-credit-helpers.ts`
- Create: `src/worker/strategies/call-credit-helpers.spec.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCloseLocationValue,
  calculateUpperWickRatio,
  scoreBreakdownState,
} from './call-credit-helpers.js';

test('scoreBreakdownState rewards hard breakdown candles', () => {
  const score = scoreBreakdownState({
    changePercent: -8.2,
    volumeRatio20: 2.1,
    closeLocationValue: calculateCloseLocationValue({
      open: 230,
      high: 232,
      low: 210,
      close: 212,
    }),
    upperWickRatio: calculateUpperWickRatio({
      open: 230,
      high: 232,
      low: 210,
      close: 212,
    }),
    brokeEma20: true,
    brokeEma50: true,
    brokePrior20Low: true,
  });

  assert.ok(score >= 24);
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal implementation**

```ts
export function calculateCloseLocationValue(candle: {
  high: number;
  low: number;
  close: number;
}): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0.5;
  return Math.max(0, Math.min(1, (candle.close - candle.low) / range));
}

export function calculateUpperWickRatio(candle: {
  open: number;
  high: number;
  low: number;
  close: number;
}): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.max(0, (candle.high - Math.max(candle.open, candle.close)) / range);
}
```

Then add `scoreBreakdownState`, exported types, and any small helper interfaces needed by the strategy service.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit-types.ts src/worker/strategies/call-credit-helpers.ts src/worker/strategies/call-credit-helpers.spec.ts
git commit -m "feat: add call credit strategy scoring helpers"
```

### Task 2: Add spread-template selection and delta fallback tests

**Files:**
- Modify: `src/worker/strategies/call-credit-helpers.ts`
- Modify: `src/worker/strategies/call-credit-helpers.spec.ts`

**Step 1: Write the failing test**

```ts
test('selectCallCreditTemplate picks a liquid 10-20 delta short call above resistance', () => {
  const template = selectCallCreditTemplate({
    spotPrice: 212,
    structureResistance: 226,
    options: [
      { strike: 220, delta: 0.28, bid: 2.8, ask: 3.2, openInterest: 1800, volume: 900 },
      { strike: 230, delta: 0.16, bid: 1.2, ask: 1.6, openInterest: 2600, volume: 1400 },
      { strike: 235, delta: 0.10, bid: 0.55, ask: 0.7, openInterest: 2100, volume: 1200 },
    ],
    widthCandidates: [5],
    dte: 5,
  });

  assert.equal(template?.shortStrike, 230);
  assert.equal(template?.longStrike, 235);
  assert.ok((template?.creditPctWidth ?? 0) >= 0.25);
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: FAIL because `selectCallCreditTemplate` is not implemented.

**Step 3: Write minimal implementation**

```ts
export function midpoint(bid: number, ask: number): number {
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  return Math.max(bid, ask, 0);
}
```

Then implement:

- `estimateCallDelta(...)`
- `selectCallCreditTemplate(...)`
- width bucketing
- `creditPctWidth`
- `takeProfitAt = creditMid * 0.4`
- `stopLossAt = creditMid * 2`

Keep these helpers pure and deterministic so they remain easy to test.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit-helpers.ts src/worker/strategies/call-credit-helpers.spec.ts
git commit -m "feat: add call credit spread template selection"
```

### Task 3: Build the backend aggregation service and route

**Files:**
- Create: `src/worker/strategies/call-credit.ts`
- Create: `src/worker/strategies/call-credit.spec.ts`
- Modify: `src/server.ts`
- Modify: `src/api/openapi.yaml`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCallCreditCandidates } from './call-credit.js';

test('rankCallCreditCandidates returns actionable setups ahead of watchlist names', async () => {
  const result = await rankCallCreditCandidates({
    movers: [
      { symbol: 'TSLA', name: 'Tesla', price: 212, changePercent: -8.1, volume: 120000000 },
      { symbol: 'AAPL', name: 'Apple', price: 180, changePercent: -2.2, volume: 40000000 },
    ],
    macro: { overallRegime: 'RISK_OFF', indices: [], dxy: { symbol: 'DX-Y.NYB', price: 104, changePercent: 0.5, trend: 'UP' }, vix: { symbol: '^VIX', price: 20, changePercent: 6, status: 'RISING' } },
    symbolInputs: {
      TSLA: { /* mocked chart, options, value */ },
      AAPL: { /* mocked chart, options, value */ },
    },
  });

  assert.equal(result.candidates[0]?.symbol, 'TSLA');
  assert.equal(result.candidates[0]?.setupState, 'ACTIONABLE');
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/worker/strategies/call-credit.spec.ts`

Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Create `rankCallCreditCandidates` and `getCallCreditStrategySnapshot` that:

- fetch `most_actives` and `day_losers`
- merge and deduplicate symbols before any expensive downstream fetches
- enforce hard filters (`price`, `volume`)
- compute daily structure features from raw chart history, including local `EMA20`, `EMA50`, `EMA200`, `closeLocationValue`, `upperWickRatio`, `volumeRatio20`, and `prior20Low`
- evaluate event tags from upcoming earnings plus a recent-news event window, so post-earnings breakdowns are not lost when `daysToEarnings` becomes `null`
- apply a cheap pre-options ranking pass and cap the options-scanning universe to a fixed size such as `20-25` names
- fetch macro snapshot once
- fetch option-chain data only for the capped universe
- cache the final route payload in `NodeCache` for `300` seconds and reuse per-request symbol results where practical
- build a sorted candidate list

Add a new route in `src/server.ts`:

```ts
app.get('/api/strategies/call-credit', async (_req, res) => {
  try {
    const data = await getCallCreditStrategySnapshot();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build call credit strategy snapshot' });
  }
});
```

Document the endpoint in `src/api/openapi.yaml`.

**Step 4: Run test and build verification**

Run:

```bash
node --import tsx --test src/worker/strategies/call-credit.spec.ts
npm run build
```

Expected: strategy test PASS and backend TypeScript build PASS.

The strategy test file should explicitly cover:

- duplicate symbols from multiple screeners are deduplicated
- the pre-options universe cap is enforced before option-chain fan-out
- a recent post-earnings news event still produces an earnings-driven event tag even when `daysToEarnings` is `null`

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit.ts src/worker/strategies/call-credit.spec.ts src/server.ts src/api/openapi.yaml
git commit -m "feat: add call credit strategy api"
```

### Task 4: Add frontend types and strategy page components

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/components/StrategyMacroBar.tsx`
- Create: `frontend/src/components/CallCreditCandidateList.tsx`
- Create: `frontend/src/components/CallCreditDetailPanel.tsx`

**Step 1: Write the failing type integration**

Add the new frontend interfaces first:

```ts
export interface CallCreditStrategySnapshot {
  generatedAt: string;
  macro: MacroSnapshot | null;
  filters: {
    minPrice: number;
    maxPrice: number;
    minVolume: number;
    targetDteMin: number;
    targetDteMax: number;
  };
  candidates: CallCreditCandidate[];
}
```

Then import those types inside the new components before the API wiring exists so the app build fails on missing exports/components.

**Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`

Expected: FAIL because the new components and props are incomplete.

**Step 3: Write minimal implementation**

Implement the three presentational components:

- `StrategyMacroBar.tsx`
- `CallCreditCandidateList.tsx`
- `CallCreditDetailPanel.tsx`

Keep them stateless and driven by props so `App.tsx` remains the only container for API fetching and page mode.

**Step 4: Run build to verify it passes**

Run: `cd frontend && npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/StrategyMacroBar.tsx frontend/src/components/CallCreditCandidateList.tsx frontend/src/components/CallCreditDetailPanel.tsx
git commit -m "feat: add call credit strategy ui components"
```

### Task 5: Integrate the strategy page into the dashboard

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`
- Optionally Modify: `frontend/src/App.css`

**Step 1: Write the failing integration**

In `frontend/src/App.tsx`, add:

- a `dashboardView` branch for `strategies`
- `strategyData` state
- a fetch call to `/api/strategies/call-credit`
- selection state for the active candidate

Do this before the JSX is fully wired so the build catches any missing props and state flows.

**Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`

Expected: FAIL on incomplete strategy rendering or missing props.

**Step 3: Write minimal implementation**

Render:

- a top-level navigation control for `scanner`, `radar`, `strategies`
- the macro pressure bar for strategy mode
- the candidate list
- the selected spread detail panel
- a checklist / risk note block

Add stable DOM ids for quick inspection, for example:

- `id="strategy-regime"`
- `id="strategy-candidate-TSLA"`
- `id="strategy-detail-short-strike"`
- `id="strategy-detail-credit"`

**Step 4: Run end-to-end verification**

Run:

```bash
npm run build
cd frontend && npm run build
```

Expected: both backend and frontend builds PASS.

Then run manually:

```bash
npm run server
cd frontend && npm run dev
```

Verify:

- `/api/strategies/call-credit` returns JSON
- strategy tab renders
- `ACTIONABLE` and `WATCHLIST` states are visually distinct
- selecting a candidate updates the detail panel

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/index.css frontend/src/App.css
git commit -m "feat: add call credit strategy page"
```

### Task 6: Add final polish, guards, and documentation

**Files:**
- Modify: `src/worker/strategies/call-credit.ts`
- Modify: `src/api/openapi.yaml`
- Modify: `README.md` if present

**Step 1: Write the failing guard test**

Extend `src/worker/strategies/call-credit.spec.ts` with cases that assert:

- missing macro does not crash the payload
- missing option spread returns `WATCHLIST`
- `RISK_ON` macro penalizes otherwise weak bearish setups

**Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test src/worker/strategies/call-credit.spec.ts
```

Expected: FAIL on at least one missing guard path.

**Step 3: Write minimal implementation**

Add:

- graceful fallback for macro fetch failures
- per-symbol error isolation
- explicit `watchlist-only` reason strings
- API docs for setup states and spread template nullability

**Step 4: Run full verification**

Run:

```bash
node --import tsx --test src/worker/strategies/call-credit-helpers.spec.ts src/worker/strategies/call-credit.spec.ts
npm run build
cd frontend && npm run build
```

Expected: all tests PASS, backend build PASS, frontend build PASS.

**Step 5: Commit**

```bash
git add src/worker/strategies/call-credit.ts src/worker/strategies/call-credit.spec.ts src/api/openapi.yaml README.md
git commit -m "chore: harden call credit strategy workflow"
```
