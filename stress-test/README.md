# Stress Tests — Flash Sale System

## Prerequisites

1. **Install k6** — <https://grafana.com/docs/k6/latest/set-up/install-k6/>
2. **Docker services running** (`docker compose up -d` from project root)
3. **Server running** (`cd server && npm run dev`)
4. **Sale is ACTIVE** — set `.env` so `SALE_START_TIME` is in the past and
   `SALE_END_TIME` is in the future, e.g.:

   ```env
   SALE_START_TIME=2020-01-01T00:00:00Z
   SALE_END_TIME=2099-01-01T00:00:00Z
   STOCK_QUANTITY=100
   ```

## Running

```bash
cd stress-test

# 1. Concurrent purchase load test (1 000 VUs, 100 stock, ramp-up 10 s)
npm run test:stress

# 2. Sustained throughput test (500 req/s for 60 s)
npm run test:sustained

# 3. Duplicate user storm (100 requests from same userId)
npm run test:dedup

# Run all
npm run test:all
```

## What to expect

| Test              | Key assertions                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Concurrent load   | Exactly `STOCK_QUANTITY` orders succeed (201); every other request gets 409 or 410; no 5xx.      |
| Sustained         | Server handles 500 req/s for 60 s; p95 latency < 500 ms; p99 < 1 s; error rate < 1%.            |
| Duplicate storm   | Exactly 1 success (201); 99 conflicts (409); no stock leakage.                                   |

## Resetting between runs

The stress scripts call `POST /api/test/reset` to reset stock + DB before
each run. This endpoint only exists when `NODE_ENV !== 'production'`.
If you prefer a manual reset, restart Redis and truncate the `orders` table.
