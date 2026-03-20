# Stock Scanner Standalone

This service scans equities and options, stores market snapshots in SQLite via Prisma, and now includes a paper-trading execution layer for `BEAR_CALL_CREDIT` and `BULL_PUT_CREDIT` spreads through the sibling `tiger_adapter` service.

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
- `TIGER_ADAPTER_TOKEN`
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

See [docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md](/Users/yufei/Documents/git/stock-scanner-standalone/.worktrees/auto-credit-spread-execution/docs/plans/2026-03-20-auto-credit-spread-ops-checklist.md) before enabling the scheduler on a paper account.
