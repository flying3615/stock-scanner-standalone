# Tiger Adapter API Key Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the active scanner/adapter Bearer auth env variable to `TIGER_ADAPTER_API_KEY`, remove stale `TIGER_ADAPTER_TOKEN` usage from `stock-scanner-standalone` and `tiger_adapter`, and clean obsolete Tiger OpenAPI placeholders from the scanner env template.

**Architecture:** Treat this as a coordinated two-repo rename. Update scanner runtime, deploy scripts, compose wiring, and docs first, then update adapter auth middleware and adapter docs to use the same env name. Preserve bundled compose behavior where `TIGER_ADAPTER_URL=http://tiger-adapter:8000` stays internal and compose-managed.

**Tech Stack:** TypeScript, Node.js, Docker Compose, Bash, Python, FastAPI, pytest, Markdown.

---

### Task 1: Rename scanner runtime env usage to `TIGER_ADAPTER_API_KEY`

**Files:**
- Modify: `src/modules/tiger/client.ts`
- Modify: `src/modules/tiger/client.spec.ts`

**Step 1: Write the failing test**

Add or update a client spec to assert:

- env-based client creation reads `TIGER_ADAPTER_API_KEY`
- auth header uses that value as `Authorization: Bearer ...`

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/modules/tiger/client.spec.ts`

Expected: FAIL because the client still reads `TIGER_ADAPTER_TOKEN`.

**Step 3: Write minimal implementation**

Update env-based client creation to read:

- `TIGER_ADAPTER_API_KEY`

Do not add backward compatibility for `TIGER_ADAPTER_TOKEN`.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/modules/tiger/client.spec.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/tiger/client.ts src/modules/tiger/client.spec.ts
git commit -m "refactor: rename scanner tiger adapter api key env"
```

### Task 2: Rename scanner deploy and compose auth envs

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `deploy-vps.sh`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- scanner compose passes `TIGER_ADAPTER_API_KEY` to both services
- deploy gating checks `TIGER_ADAPTER_API_KEY`
- `.env.example` no longer includes `TIGER_ADAPTER_TOKEN`
- `.env.example` no longer includes `TIGER_OPEN_API_KEY`, `TIGER_OPEN_API_SECRET`, or `TIGER_OPEN_API_PASS`

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN|TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|TIGER_OPEN_API_PASS" .env.example docker-compose.yml deploy-vps.sh`

Expected: matches are present.

**Step 3: Write minimal implementation**

Edit these files so that:

- `.env.example` keeps only `TIGER_ADAPTER_API_KEY` for adapter auth
- `docker-compose.yml` injects `TIGER_ADAPTER_API_KEY`
- `deploy-vps.sh` gates on `TIGER_ADAPTER_API_KEY`
- bundled deploy still does not require a user-set `TIGER_ADAPTER_URL`

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN|TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|TIGER_OPEN_API_PASS" .env.example docker-compose.yml deploy-vps.sh`

Expected: no active matches remain.

Run: `bash -n deploy-vps.sh`

Expected: PASS

**Step 5: Commit**

```bash
git add .env.example docker-compose.yml deploy-vps.sh
git commit -m "refactor: rename scanner deploy tiger adapter api key"
```

### Task 3: Update scanner docs for the new env name and URL behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- docs use only `TIGER_ADAPTER_API_KEY`
- docs explain bundled mode does not require a manual `TIGER_ADAPTER_URL`
- docs explain external adapter mode does require `TIGER_ADAPTER_URL`

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN|TIGER_ADAPTER_URL" README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

Expected: stale token references and ambiguous URL wording are present.

**Step 3: Write minimal implementation**

Update scanner docs to:

- replace `TIGER_ADAPTER_TOKEN` with `TIGER_ADAPTER_API_KEY`
- keep bundled internal URL documentation
- explicitly state users do not need to set `TIGER_ADAPTER_URL` in bundled mode

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN" README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

Expected: no matches.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md
git commit -m "docs: rename scanner tiger adapter api key env"
```

### Task 4: Rename adapter auth middleware env to `TIGER_ADAPTER_API_KEY`

**Files:**
- Modify: `../tiger_adapter/app/main.py`

**Step 1: Write the failing test**

Add or update a test that proves:

- auth middleware accepts `Authorization: Bearer ...` when `TIGER_ADAPTER_API_KEY` is set
- the old `TIGER_ADAPTER_TOKEN` name is no longer the configured runtime source

**Step 2: Run test to verify it fails**

Run the targeted adapter auth test.

Expected: FAIL because middleware still reads `TIGER_ADAPTER_TOKEN`.

**Step 3: Write minimal implementation**

Update adapter auth middleware to read only:

- `TIGER_ADAPTER_API_KEY`

**Step 4: Run test to verify it passes**

Run the same targeted auth test.

Expected: PASS

**Step 5: Commit**

```bash
git -C ../tiger_adapter add app/main.py
git -C ../tiger_adapter commit -m "refactor: rename adapter auth api key env"
```

### Task 5: Rename adapter docs and env templates

**Files:**
- Modify: `../tiger_adapter/.env.docker.example`
- Modify: `../tiger_adapter/README.md`
- Modify: `../tiger_adapter/docs/deploy.md`
- Modify: adapter tests that mention the old env name

**Step 1: Write the failing verification expectation**

Define the target behavior:

- adapter docs use only `TIGER_ADAPTER_API_KEY`
- env template uses only `TIGER_ADAPTER_API_KEY`

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN" ../tiger_adapter/.env.docker.example ../tiger_adapter/README.md ../tiger_adapter/docs/deploy.md ../tiger_adapter/tests`

Expected: matches are present.

**Step 3: Write minimal implementation**

Replace old env references with:

- `TIGER_ADAPTER_API_KEY`

Keep Bearer auth semantics unchanged.

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "TIGER_ADAPTER_TOKEN" ../tiger_adapter/.env.docker.example ../tiger_adapter/README.md ../tiger_adapter/docs/deploy.md ../tiger_adapter/tests`

Expected: no matches.

**Step 5: Commit**

```bash
git -C ../tiger_adapter add .env.docker.example README.md docs/deploy.md tests
git -C ../tiger_adapter commit -m "docs: rename adapter api key env"
```

### Task 6: Verify coordinated scanner + adapter rename

**Files:**
- Modify only if verification exposes a missed reference

**Step 1: Verify scanner build and client tests**

Run: `npm run build`

Run: `node --import tsx --test src/modules/tiger/client.spec.ts`

Expected: PASS

**Step 2: Verify adapter targeted tests**

Run a focused pytest command covering auth and combo endpoints.

Expected: PASS

**Step 3: Verify repository-wide grep cleanup**

Run in scanner repo: `rg -n "TIGER_ADAPTER_TOKEN|TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|TIGER_OPEN_API_PASS" .`

Run in adapter repo: `rg -n "TIGER_ADAPTER_TOKEN" .`

Expected: no active runtime/docs references remain, except historical plan docs if intentionally left untouched.

**Step 4: Verify URL semantics**

Run: `rg -n "TIGER_ADAPTER_URL" README.md docker-compose.yml docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

Expected: docs distinguish bundled internal URL from external override behavior.

**Step 5: Commit any final cleanup**

```bash
git add . && git commit -m "chore: finalize tiger adapter api key rename"
git -C ../tiger_adapter add . && git -C ../tiger_adapter commit -m "chore: finalize tiger adapter api key rename"
```
