# Tiger Adapter Deployment Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move bundled `tiger-adapter` deployment ownership from `agentK-docker` to `stock-scanner-standalone` without removing `agentK-docker`'s ability to connect to an external adapter later.

**Architecture:** Remove adapter deployment concerns from `agentK-docker` at the compose, deploy-script, and docs layers only. Keep the runtime Tiger integration code in `agentK-docker` untouched. In `stock-scanner-standalone`, keep `tiger-adapter` as a sibling service but align compose and deploy checks with the adapter's real runtime dependency on `TIGER_CONFIG_PATH` and `api.properties`.

**Tech Stack:** Docker Compose, Bash, TypeScript/Node.js, FastAPI container deployment, Markdown docs.

---

### Task 1: Remove bundled `tiger-adapter` deployment from `agentK-docker` compose

**Files:**
- Modify: `../agentK-docker/docker-compose.stack.yml`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- `docker compose -f docker-compose.stack.yml config` should no longer emit a `tiger-adapter` service
- `agentk` should no longer depend on `tiger-adapter`
- `agentk` should no longer get a compose-injected default `TIGER_ADAPTER_URL`

**Step 2: Run verification to capture the current behavior**

Run: `docker compose -f docker-compose.stack.yml config | rg -n "tiger-adapter|TIGER_ADAPTER_URL|depends_on"`

Expected: output includes the bundled adapter service and wiring.

**Step 3: Write minimal implementation**

Edit `../agentK-docker/docker-compose.stack.yml` to:

- remove the entire `tiger-adapter` service
- remove `agentk.depends_on.tiger-adapter`
- remove `agentk.environment.TIGER_ADAPTER_URL=http://tiger-adapter:8000`

Do not change unrelated services.

**Step 4: Run verification to confirm the new behavior**

Run: `docker compose -f docker-compose.stack.yml config | rg -n "tiger-adapter|TIGER_ADAPTER_URL|depends_on"`

Expected: no `tiger-adapter` service and no adapter-specific dependency wiring in compose output.

**Step 5: Commit**

```bash
git -C ../agentK-docker add docker-compose.stack.yml
git -C ../agentK-docker commit -m "chore: remove bundled tiger adapter deployment"
```

### Task 2: Remove adapter bootstrap from `agentK-docker` deploy script

**Files:**
- Modify: `../agentK-docker/deploy-vps.sh`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- deploy script should stop creating `tiger_adapter/.env.docker`
- deploy should simply pull and start the remaining stack

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "tiger_adapter/.env.docker|tiger_adapter/.env.docker.example" ../agentK-docker/deploy-vps.sh`

Expected: matching lines are present.

**Step 3: Write minimal implementation**

Delete the bootstrap block that copies `tiger_adapter/.env.docker.example` to `tiger_adapter/.env.docker`.

Keep the rest of the deployment flow unchanged.

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "tiger_adapter/.env.docker|tiger_adapter/.env.docker.example" ../agentK-docker/deploy-vps.sh`

Expected: no matches.

**Step 5: Commit**

```bash
git -C ../agentK-docker add deploy-vps.sh
git -C ../agentK-docker commit -m "chore: stop bootstrapping tiger adapter env"
```

### Task 3: Update `agentK-docker` docs to describe external-only Tiger usage

**Files:**
- Modify: `../agentK-docker/README.md`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- README should no longer instruct users to deploy the bundled `tiger_adapter`
- README should state that Tiger integration, if used, points to an external adapter service

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "tiger_adapter/.env.docker|ghcr.io/flying3615/tiger-adapter|http://tiger-adapter:8000" ../agentK-docker/README.md`

Expected: bundled adapter deployment instructions are present.

**Step 3: Write minimal implementation**

Update README sections that mention:

- bundled adapter env files
- bundled adapter image
- local service URL assumptions

Replace them with language that says:

- adapter is not deployed by this stack
- if Tiger is needed, set `TIGER_ADAPTER_URL` and related auth envs to an external service

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "tiger_adapter/.env.docker|ghcr.io/flying3615/tiger-adapter|http://tiger-adapter:8000" ../agentK-docker/README.md`

Expected: no bundled-deployment instructions remain.

**Step 5: Commit**

```bash
git -C ../agentK-docker add README.md
git -C ../agentK-docker commit -m "docs: mark tiger adapter as external dependency"
```

### Task 4: Align `stock-scanner-standalone` compose with adapter runtime config

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- `tiger-adapter` service should mount a config directory into `/app/config:ro`
- `tiger-adapter` should receive `TIGER_CONFIG_PATH=/app/config/api.properties`
- adapter service should still expose port `8000` only internally

**Step 2: Run verification to capture the current behavior**

Run: `docker compose config | rg -n "TIGER_CONFIG_PATH|/app/config|tiger-adapter"`

Expected: adapter service exists, but `TIGER_CONFIG_PATH` and config mount are missing.

**Step 3: Write minimal implementation**

Edit `docker-compose.yml` to:

- add `TIGER_CONFIG_PATH=/app/config/api.properties`
- mount a host directory such as `./tiger_adapter/config:/app/config:ro`
- keep the existing logs volume and internal network wiring

Do not switch the internal adapter URL used by `stock-scanner`.

**Step 4: Run verification to confirm the new behavior**

Run: `docker compose config | rg -n "TIGER_CONFIG_PATH|/app/config|tiger-adapter"`

Expected: config path env and config mount are present in the rendered compose output.

**Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: mount tiger adapter config in scanner stack"
```

### Task 5: Align `stock-scanner-standalone` deploy gating with real adapter requirements

**Files:**
- Modify: `deploy-vps.sh`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- deploy script should no longer use `TIGER_OPEN_API_KEY` and `TIGER_OPEN_API_SECRET` as the enablement check
- deploy script should instead check for adapter-real prerequisites such as `TIGER_ADAPTER_TOKEN` and the presence of `api.properties`

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|TIGER_ADAPTER_TOKEN|api.properties|TIGER_CONFIG_PATH" deploy-vps.sh`

Expected: the script checks API key and secret, but not `api.properties`.

**Step 3: Write minimal implementation**

Change `deploy-vps.sh` to:

- derive an adapter config file path, defaulting to `./tiger_adapter/config/api.properties`
- enable adapter deployment when `TIGER_ADAPTER_TOKEN` is set and the config file exists
- print a precise warning when the token or config file is missing

Keep the soft-fail behavior that allows `stock-scanner` to start without auto-trading.

**Step 4: Run verification to confirm the new behavior**

Run: `bash -n deploy-vps.sh`

Run: `rg -n "api.properties|TIGER_CONFIG_PATH|TIGER_ADAPTER_TOKEN" deploy-vps.sh`

Expected: shell syntax passes and adapter gating refers to token plus config presence.

**Step 5: Commit**

```bash
git add deploy-vps.sh
git commit -m "chore: gate tiger adapter deploy on config file"
```

### Task 6: Update scanner docs and ops checklist for single-owner adapter hosting

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

**Step 1: Write the failing verification expectation**

Define the target behavior:

- README should document scanner as the bundled adapter host
- ops checklist should mention the VPS config file location and token requirements

**Step 2: Run verification to capture the current behavior**

Run: `rg -n "TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|api.properties|tiger-adapter" README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

Expected: docs mention adapter usage but not the final single-owner hosting model.

**Step 3: Write minimal implementation**

Update docs to state:

- scanner stack is the bundled host for `tiger-adapter`
- Tiger config must exist at the mounted VPS path
- automation depends on a healthy local adapter service

Keep the docs narrowly focused on the paper-trading setup.

**Step 4: Run verification to confirm the new behavior**

Run: `rg -n "api.properties|TIGER_ADAPTER_TOKEN|tiger-adapter" README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`

Expected: docs explicitly describe the single-owner adapter deployment.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md
git commit -m "docs: clarify scanner-owned tiger adapter deployment"
```

### Task 7: Verify both stacks after the split

**Files:**
- Modify: `README.md` if verification exposes any deployment ambiguity
- Modify: `../agentK-docker/README.md` if verification exposes any deployment ambiguity

**Step 1: Run `agentK-docker` compose verification**

Run: `docker compose -f ../agentK-docker/docker-compose.stack.yml config`

Expected:

- stack renders successfully
- no `tiger-adapter` service remains

**Step 2: Run scanner compose verification**

Run: `docker compose config`

Expected:

- stack renders successfully
- `tiger-adapter` includes config mount and `TIGER_CONFIG_PATH`

**Step 3: Run shell verification**

Run: `bash -n deploy-vps.sh`

Run: `bash -n ../agentK-docker/deploy-vps.sh`

Expected: both scripts pass syntax checks.

**Step 4: Review docs for consistency**

Manually verify that:

- `agentK-docker` docs no longer present bundled adapter deployment
- scanner docs present the adapter as the only bundled host

**Step 5: Commit any final doc or config touch-ups**

```bash
git add README.md docs/plans ../agentK-docker/README.md ../agentK-docker/docker-compose.stack.yml ../agentK-docker/deploy-vps.sh docker-compose.yml deploy-vps.sh
git commit -m "chore: finalize tiger adapter deployment split"
```
