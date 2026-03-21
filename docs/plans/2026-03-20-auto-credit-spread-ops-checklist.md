# Auto Credit Spread Ops Checklist

Use this checklist before enabling recurring automation against a Tiger paper account. In this repo, `stock-scanner-standalone` is the bundled VPS host for `tiger-adapter`.

## Preflight

- `AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED=false` until manual run-once verification is complete
- `AUTO_CREDIT_SPREAD_PAPER_ONLY=true`
- `TIGER_ADAPTER_URL=http://tiger-adapter:8000` for the bundled adapter network path
- `TIGER_ADAPTER_TOKEN` is set in `.env`
- `./tiger_adapter/config/api.properties` exists on the host before starting the bundled adapter
- compose mounts `./tiger_adapter/config:/app/config:ro` and the adapter reads `TIGER_CONFIG_PATH=/app/config/api.properties`
- Prisma migration for execution tables has been applied
- `npm run build` passes in `stock-scanner-standalone`
- `pytest tests/test_api.py -k "combo or option_positions or option_orders" -v` passes in `tiger_adapter`

## Manual Entry Dry Run

- Start `tiger_adapter`
- Start `stock-scanner-standalone`
- Call `POST /api/automation/credit-spreads/run-once` with a single paper candidate
- Confirm Tiger preview succeeds before order placement
- Confirm resulting `TradeIntent`, `TradeExecution`, and `ManagedPosition` rows persist
- Confirm no duplicate entry occurs for the same `idempotencyKey`

## Manual Exit Dry Run

- Confirm the managed position appears in `GET /api/automation/credit-spreads/positions`
- Trigger `POST /api/automation/credit-spreads/positions/:id/close`
- Confirm an exit `TradeExecution` record is created
- Confirm reconciliation mismatches move the position to `MANUAL_INTERVENTION_REQUIRED`

## Scheduler Enablement

- Set `AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED=true`
- Keep `AUTO_CREDIT_SPREAD_PAPER_ONLY=true`
- Confirm weekday 15-minute scheduler logs only during U.S. regular hours
- Monitor `GET /api/automation/credit-spreads/intents` and adapter logs through at least one full session

## Promotion Gate

- At least several paper trades complete end-to-end
- No unexpected duplicate entries or unmanaged exit states
- No unresolved `MANUAL_INTERVENTION_REQUIRED` positions remain
- Risk sizing matches intended account percentage limits
- Only after all of the above should live-trading requirements be discussed

## Bundled Deployment Soft-Fail

- If `TIGER_ADAPTER_TOKEN` is missing, `deploy-vps.sh` skips the bundled adapter and only starts `stock-scanner`
- If `./tiger_adapter/config/api.properties` is missing, `deploy-vps.sh` skips the bundled adapter and only starts `stock-scanner`
- Treat that mode as scanner-only deployment with auto-trading disabled
