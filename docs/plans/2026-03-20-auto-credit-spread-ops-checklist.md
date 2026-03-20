# Auto Credit Spread Ops Checklist

Use this checklist before enabling recurring automation against a Tiger paper account.

## Preflight

- `AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED=false` until manual run-once verification is complete
- `AUTO_CREDIT_SPREAD_PAPER_ONLY=true`
- `TIGER_ADAPTER_URL` and `TIGER_ADAPTER_TOKEN` point at the paper-trading adapter deployment
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
