# Stock Scanner Standalone

This service scans equities and options, stores market snapshots in SQLite via Prisma, and now includes a paper-trading execution layer for `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT` spreads through the sibling `tiger_adapter` service.

## VPS Deployment

`stock-scanner-standalone` is the bundled VPS host for `tiger-adapter`. The compose stack keeps the scanner on the internal adapter URL `http://tiger-adapter:8000` and mounts the adapter config from the current repo.

To enable bundled adapter deployment on VPS:

- set `TIGER_ADAPTER_API_KEY` in `.env`
- place the Tiger OpenAPI properties file at `./tiger_adapter/config/api.properties`
- the `tiger-adapter` container reads that file through `TIGER_CONFIG_PATH=/app/config/api.properties`

If `TIGER_ADAPTER_API_KEY` is unset or `./tiger_adapter/config/api.properties` is missing, `deploy-vps.sh` soft-fails the adapter side and starts `stock-scanner` without auto-trading.

## Development

```bash
npm install
cd frontend && npm install
cd ..
npm run build
npm run server
```

Important environment variables:

- `POLYGON_API_KEY`
- `DATABASE_URL`
- `TIGER_ADAPTER_URL`
- `TIGER_ADAPTER_API_KEY`
- `AUTO_CREDIT_SPREAD_AUTOMATION_ENABLED`
- `AUTO_CREDIT_SPREAD_PAPER_ONLY`
- `AUTO_CREDIT_SPREAD_MAX_RISK_PCT_PER_TRADE`
- `AUTO_CREDIT_SPREAD_MAX_PORTFOLIO_RISK_PCT`
- `AUTO_CREDIT_SPREAD_COOLDOWN_MINUTES`

## Credit Spread Automation

The current execution flow is built for paper trading first:

- local risk sizing by account percentage
- broker preview before entry
- combo order repricing down to `minAcceptableNetCredit`
- managed-position exit automation for take-profit, stop-loss, and forced close
- paper-only guardrail on automation routes when `AUTO_CREDIT_SPREAD_PAPER_ONLY=true`

Main operator endpoints:

- `POST /api/automation/credit-spreads/run-once`
- `GET /api/automation/credit-spreads/intents`
- `GET /api/automation/credit-spreads/positions`
- `POST /api/automation/credit-spreads/positions/:id/close`

Example run-once payload:

```json
{
  "accountMode": "PAPER",
  "tif": "DAY",
  "repricingStepCredits": 0.05,
  "candidates": [
    {
      "strategyType": "BULL_PUT_CREDIT",
      "symbol": "AAPL",
      "expiryISO": "2026-03-27",
      "quantity": 1,
      "width": 2,
      "targetNetCredit": 1.2,
      "minAcceptableNetCredit": 1.0,
      "maxLoss": 80,
      "shortLeg": {
        "symbol": "AAPL",
        "expiry": "20260327",
        "strike": 190,
        "putCall": "PUT",
        "action": "SELL",
        "multiplier": 100
      },
      "longLeg": {
        "symbol": "AAPL",
        "expiry": "20260327",
        "strike": 188,
        "putCall": "PUT",
        "action": "BUY",
        "multiplier": 100
      },
      "idempotencyKey": "AAPL:BULL_PUT_CREDIT:2026-03-27:190.0000:188.0000"
    }
  ]
}
```

See [docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md](docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md) before enabling the scheduler on a paper account.

## Bundled Adapter Notes

- Compose mounts `./tiger_adapter/config:/app/config:ro` into the adapter container.
- The expected host-side config file is `./tiger_adapter/config/api.properties`.
- `deploy-vps.sh` uses `TIGER_ADAPTER_API_KEY` plus that config file as the adapter enablement gate.
- The scanner can still be deployed by itself when the adapter config is absent.
