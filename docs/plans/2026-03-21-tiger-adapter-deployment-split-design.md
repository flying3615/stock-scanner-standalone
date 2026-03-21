# Tiger Adapter Deployment Split Design

**Date:** 2026-03-21

**Goal:** Stop deploying `tiger-adapter` from `agentK-docker` while keeping its external integration hooks intact, and make `stock-scanner-standalone` the only stack that hosts and consumes `tiger-adapter` on the VPS.

## Current State

Today the two sibling repositories both assume ownership of the adapter:

- `agentK-docker` deploys `tiger-adapter` in [docker-compose.stack.yml](../../../agentK-docker/docker-compose.stack.yml) and always wires `agentk` to `http://tiger-adapter:8000`.
- `agentK-docker` also bootstraps adapter env files in [deploy-vps.sh](../../../agentK-docker/deploy-vps.sh).
- `stock-scanner-standalone` already has a `tiger-adapter` service in [docker-compose.yml](./../../docker-compose.yml) and a VPS deploy script in [deploy-vps.sh](./../../deploy-vps.sh).

The duplication creates three problems:

- the VPS has two stacks competing for ownership of the same adapter concern
- Tiger credentials and `api.properties` placement are unclear
- it is hard to tell which app should be responsible for adapter uptime and logs

There is also a config mismatch in the current scanner stack:

- the scanner compose file passes `TIGER_OPEN_API_KEY`, `TIGER_OPEN_API_SECRET`, and `TIGER_OPEN_API_PASS`
- the adapter code actually reads `TIGER_CONFIG_PATH` and loads `api.properties`

That means the scanner stack is structurally closer to the desired ownership model, but still not fully wired for a working Tiger deployment.

## Decision

Adopt a single-owner deployment model:

- `stock-scanner-standalone` becomes the only repository that deploys `tiger-adapter`
- `agentK-docker` stops deploying `tiger-adapter`
- `agentK-docker` keeps its Tiger client code and optional external adapter env vars for now

This gives a clean operational boundary without forcing an immediate product-level Tiger removal from `agentK-docker`.

## Alternatives Considered

### Option 1: Leave both stacks unchanged

Pros:

- no migration work

Cons:

- duplicated ownership remains
- operator confusion remains
- higher risk of drift between envs, versions, and credentials

### Option 2: Stop adapter deployment in `agentK-docker`, keep external hooks

Pros:

- fixes operational ownership now
- low-risk change to `agentK-docker`
- preserves future option to point `agentK-docker` at an external adapter

Cons:

- some Tiger-related code and docs still remain in `agentK-docker`

### Option 3: Fully remove Tiger from `agentK-docker`

Pros:

- cleanest long-term boundary

Cons:

- higher scope now
- not aligned with the user's current decision to defer full removal

**Recommendation:** Option 2.

## Target Architecture

### `agentK-docker`

`agentK-docker` should become adapter-agnostic at deploy time:

- remove the `tiger-adapter` service from the compose stack
- remove `depends_on` from `agentk` to `tiger-adapter`
- stop setting `TIGER_ADAPTER_URL=http://tiger-adapter:8000` by default in compose
- stop creating `tiger_adapter/.env.docker` in the deploy script
- update docs to say Tiger adapter is optional and external

The application code should remain untouched in this phase:

- keep `TIGER_ADAPTER_URL`
- keep `TIGER_ADAPTER_API_KEY`
- keep executor and fills code paths

Result:

- if no Tiger envs are configured, `agentK-docker` runs normally without adapter deployment
- if Tiger envs are configured later, `agentK-docker` can still target an externally hosted adapter

### `stock-scanner-standalone`

`stock-scanner-standalone` should become the adapter host:

- keep `tiger-adapter` in the compose stack
- keep internal service-to-service URL `http://tiger-adapter:8000`
- mount Tiger config into the adapter container
- pass `TIGER_CONFIG_PATH=/app/config/api.properties`
- gate startup on adapter-specific config that actually matches runtime requirements

Result:

- scanner automation owns adapter uptime, paper-trading config, and logs
- scanner deploys the exact adapter it needs for spread automation

## Required Changes

### `agentK-docker` deployment changes

Files to change:

- [docker-compose.stack.yml](../../../agentK-docker/docker-compose.stack.yml)
- [deploy-vps.sh](../../../agentK-docker/deploy-vps.sh)
- [README.md](../../../agentK-docker/README.md)

Specific behavior changes:

- remove `tiger-adapter` service block
- remove `agentk.depends_on.tiger-adapter`
- remove compose-level default `TIGER_ADAPTER_URL=http://tiger-adapter:8000`
- remove deploy-time creation of `tiger_adapter/.env.docker`
- document that Tiger adapter is no longer bundled in this stack

### `stock-scanner-standalone` deployment changes

Files to change:

- [docker-compose.yml](./../../docker-compose.yml)
- [deploy-vps.sh](./../../deploy-vps.sh)
- [README.md](./../../README.md)
- [docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md](./2026-03-20-auto-credit-spread-ops-checklist.md)

Specific behavior changes:

- mount a host config directory into `/app/config:ro` for `tiger-adapter`
- set `TIGER_CONFIG_PATH=/app/config/api.properties`
- change deploy detection from `TIGER_OPEN_API_KEY/TIGER_OPEN_API_SECRET` to adapter-real config presence
- document the expected VPS file layout and required env vars

## Operational Rules

- Only `stock-scanner-standalone` should own the Tiger paper account deployment.
- `agentK-docker` must not assume local adapter availability in compose.
- If `agentK-docker` needs Tiger again later, it must point to an external URL through env config.
- Scanner deploy should fail soft when adapter config is absent: `stock-scanner` still starts, but automation remains disabled.

## Risks

### Risk 1: `agentK-docker` still assumes adapter URL exists

Mitigation:

- remove compose default URL
- verify app startup and health checks without Tiger envs

### Risk 2: scanner adapter container starts but Tiger SDK cannot authenticate

Mitigation:

- align compose env with `TIGER_CONFIG_PATH`
- mount `api.properties`
- update deploy script checks to match the real runtime requirement

### Risk 3: operator confusion during transition

Mitigation:

- update both READMEs
- document that scanner is the only bundled adapter host

## Verification Plan

For `agentK-docker`:

- `docker compose -f docker-compose.stack.yml config`
- `docker compose -f docker-compose.stack.yml up -d agentk`
- verify no reference to `tiger-adapter` remains in the resulting stack

For `stock-scanner-standalone`:

- `docker compose config`
- `docker compose up -d`
- `docker compose ps`
- `docker compose logs tiger-adapter`
- verify `stock-scanner` resolves `http://tiger-adapter:8000`

## Success Criteria

- `agentK-docker` no longer deploys `tiger-adapter`
- `agentK-docker` still boots without Tiger configuration
- `stock-scanner-standalone` is the only bundled adapter host
- scanner compose and deploy logic match the adapter's actual config contract
