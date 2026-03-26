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

# 0. Light concurrent test (50 VUs, 200 requests - recommended for local testing)
npm run test:light

# 1. Concurrent purchase load test (200 VUs, 1000 requests, 100 stock)
npm run test:stress

# 2. Sustained throughput test (500 req/s for 60 s)
npm run test:sustained

# 3. Duplicate user storm (100 requests from same userId)
npm run test:dedup

# Run all
npm run test:all
```

## Notes

- **Connection limits**: The default Node.js HTTP server may reset connections when
  handling very high concurrency (200+ simultaneous connections). The `test:light`
  script uses 50 VUs which works reliably on local machines. For production-scale
  testing, consider increasing system limits or using a load balancer.

## What to expect

| Test            | Key assertions                                                                              |
| --------------- | ------------------------------------------------------------------------------------------- |
| Light load      | 50 VUs, 200 requests; reliable on local machines; no connection resets.                     |
| Concurrent load | 200 VUs, 1000 requests; expect some connection resets on local machines.                    |
| Sustained       | Server handles 500 req/s for 60 s; p95 latency < 500 ms; p99 < 1 s; error rate < 1%.        |
| Duplicate storm | Exactly 1 success (201); 99 conflicts (409); no stock leakage.                              |

## Resetting between runs

The stress scripts call `POST /api/test/reset` to reset stock + DB before
each run. This endpoint only exists when `NODE_ENV !== 'production'`.
If you prefer a manual reset, restart Redis and truncate the `orders` table.
