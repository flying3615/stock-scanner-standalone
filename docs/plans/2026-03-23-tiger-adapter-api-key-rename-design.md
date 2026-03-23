# Tiger Adapter API Key Rename Design

**Date:** 2026-03-23

**Goal:** Standardize the scanner-side and adapter-side Bearer auth configuration on `TIGER_ADAPTER_API_KEY`, remove stale `TIGER_ADAPTER_TOKEN` usage from the active deployment path, and clean obsolete Tiger OpenAPI env placeholders from `stock-scanner-standalone`.

## Current State

The three related repositories are not fully aligned today.

- `agentK-docker` already uses `TIGER_ADAPTER_API_KEY` as the client-side Bearer credential name when talking to a Tiger adapter service.
- `stock-scanner-standalone` still uses `TIGER_ADAPTER_TOKEN` for its Tiger adapter client and VPS deploy gating.
- `tiger_adapter` still reads `TIGER_ADAPTER_TOKEN` in its auth middleware and deployment docs.
- `stock-scanner-standalone/.env.example` still exposes `TIGER_OPEN_API_KEY`, `TIGER_OPEN_API_SECRET`, and `TIGER_OPEN_API_PASS`, even though the current bundled deployment no longer uses them directly.

This creates avoidable confusion:

- the same Bearer secret has two names in sibling repos
- scanner docs suggest a token name that differs from the existing `agentK-docker` convention
- `.env.example` advertises obsolete Tiger OpenAPI values that are no longer used by the scanner deploy path

## Scope

This rename should touch only the active scanner + adapter integration path:

- `stock-scanner-standalone`
- sibling `tiger_adapter`

This rename should not modify `agentK-docker`, because it already uses the target name and the user explicitly does not want additional changes there.

## Decision

Use `TIGER_ADAPTER_API_KEY` everywhere in the active scanner/adapter integration.

That means:

- `stock-scanner-standalone` sends Bearer auth using `TIGER_ADAPTER_API_KEY`
- `tiger_adapter` validates incoming Bearer auth using `TIGER_ADAPTER_API_KEY`
- docs, compose files, deploy scripts, and examples use only `TIGER_ADAPTER_API_KEY`
- `TIGER_ADAPTER_TOKEN` is removed from active code and active docs in these two repos

## TIGER_ADAPTER_URL Behavior

There are two deployment modes.

### Bundled compose deployment

When `stock-scanner-standalone` hosts `tiger-adapter` as a sibling service in the same compose stack, the scanner should keep using:

- `TIGER_ADAPTER_URL=http://tiger-adapter:8000`

But this should remain a compose-injected internal value, not a required `.env.example` entry for users.

### External adapter deployment

If the adapter runs outside the scanner compose stack, then:

- the operator must set `TIGER_ADAPTER_URL` explicitly

So the docs should explain that `TIGER_ADAPTER_URL` is optional in bundled mode and required only when pointing to an external service.

## Alternatives Considered

### Option 1: Keep `TIGER_ADAPTER_TOKEN`

Pros:

- no runtime rename work

Cons:

- stays inconsistent with the already-adopted `agentK-docker` name
- preserves unnecessary mental overhead

### Option 2: Support both names indefinitely

Pros:

- easiest migration path

Cons:

- keeps ambiguity forever
- contradicts the user's requirement to keep only one name

### Option 3: Rename scanner + adapter to `TIGER_ADAPTER_API_KEY`

Pros:

- aligns active repos with the existing client naming convention
- removes ambiguity
- leaves one clear Bearer credential name

Cons:

- requires coordinated edits in two repos

**Recommendation:** Option 3.

## Required Changes

### `stock-scanner-standalone`

Files likely affected:

- `.env.example`
- `docker-compose.yml`
- `deploy-vps.sh`
- `README.md`
- `docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md`
- `src/modules/tiger/client.ts`
- `src/modules/tiger/client.spec.ts`

Behavior changes:

- replace `TIGER_ADAPTER_TOKEN` with `TIGER_ADAPTER_API_KEY`
- update deploy gating messages accordingly
- remove `TIGER_OPEN_API_*` placeholders from `.env.example`
- clarify that `TIGER_ADAPTER_URL` is bundled by compose and only needs manual configuration for external adapter deployments

### `tiger_adapter`

Files likely affected:

- `app/main.py`
- `.env.docker.example`
- `README.md`
- `docs/deploy.md`
- tests that reference the old env name

Behavior changes:

- auth middleware reads `TIGER_ADAPTER_API_KEY`
- docs and examples use `TIGER_ADAPTER_API_KEY`
- any setup examples that still mention `TIGER_ADAPTER_TOKEN` are removed

## Risks

### Risk 1: Scanner and adapter drift during rename

If only one repo is updated, every request becomes unauthorized.

Mitigation:

- treat this as a coordinated two-repo change
- verify both repos in the same pass before claiming completion

### Risk 2: Bundled users think they must set `TIGER_ADAPTER_URL`

Mitigation:

- document bundled mode separately from external mode
- keep compose injecting the internal URL

### Risk 3: Hidden docs still mention the old name

Mitigation:

- use repository-wide grep verification for both names after edits

## Verification Plan

For `stock-scanner-standalone`:

- grep for `TIGER_ADAPTER_TOKEN` and confirm active runtime/docs no longer use it
- grep for `TIGER_OPEN_API_KEY|TIGER_OPEN_API_SECRET|TIGER_OPEN_API_PASS` and confirm `.env.example` no longer advertises them
- run `npm run build`
- run `node --import tsx --test src/modules/tiger/client.spec.ts`

For `tiger_adapter`:

- grep for `TIGER_ADAPTER_TOKEN` and confirm runtime/docs no longer use it
- run targeted API tests that exercise auth and combo endpoints

## Success Criteria

- `stock-scanner-standalone` and `tiger_adapter` use only `TIGER_ADAPTER_API_KEY`
- `stock-scanner-standalone/.env.example` no longer exposes obsolete `TIGER_OPEN_API_*`
- bundled compose still works without requiring a user-set `TIGER_ADAPTER_URL`
- external adapter mode is still documented via `TIGER_ADAPTER_URL`
