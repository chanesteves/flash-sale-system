# ⚡ Flash Sale System

A high-throughput flash sale platform for a single product with limited stock. Handles thousands of concurrent purchase attempts with atomic inventory management, duplicate purchase prevention, and asynchronous order persistence.

Built with **NestJS** (backend), **React + Vite** (frontend), **Redis** (atomic inventory), **PostgreSQL** (persistence), and **BullMQ** (async queue).

---

## System Architecture

```mermaid
graph TB
    subgraph Clients
        UI["React SPA<br/>(Vite + TypeScript)"]
    end

    subgraph API["NestJS API Server :3000"]
        direction TB
        RL["Rate Limiter<br/>(@nestjs/throttler)"]
        VP["Validation Pipe<br/>(class-validator)"]
        EF["Exception Filter"]
        LI["Logging Interceptor"]

        subgraph Controllers
            SC["Sale Controller<br/>GET /api/sale/status"]
            PC["Purchase Controller<br/>POST /api/purchases<br/>GET /api/purchases/:userId"]
            HC["Health Controller<br/>GET /api/health"]
        end

        subgraph Guards
            SAG["SaleActiveGuard"]
            URLG["UserRateLimitGuard<br/>(Redis-backed)"]
        end

        subgraph Services
            SS["SaleService"]
            IS["InventoryService<br/>(Lua Script)"]
            PS["PurchaseService"]
        end
    end

    subgraph Infrastructure
        RD[("Redis 7<br/>• Stock counter<br/>• Purchased-users set<br/>• Rate-limit counters<br/>• BullMQ backing store")]
        PG[("PostgreSQL 16<br/>• Orders table<br/>• Persistent storage")]
        BQ["BullMQ<br/>order-processing queue"]
        OW["Order Worker<br/>(async persistence)"]
    end

    UI -- "HTTP/REST" --> RL
    RL --> VP --> Controllers

    SC --> SS
    SC --> IS
    PC --> SAG --> URLG --> PS
    PC --> PS
    PS --> IS
    IS -- "Lua: SADD + DECR<br/>(atomic)" --> RD
    PS -- "enqueue job" --> BQ
    BQ --> OW
    OW -- "INSERT order" --> PG
    HC --> RD
    HC --> PG
    URLG -- "INCR + EXPIRE" --> RD

    style RD fill:#dc382c,color:#fff
    style PG fill:#336791,color:#fff
    style BQ fill:#e8590c,color:#fff
    style UI fill:#61dafb,color:#000
```

### Purchase Request Flow

```mermaid
sequenceDiagram
    participant U as User (React)
    participant API as NestJS API
    participant TG as ThrottlerGuard
    participant SAG as SaleActiveGuard
    participant URG as UserRateLimitGuard
    participant R as Redis (Lua)
    participant Q as BullMQ
    participant W as Order Worker
    participant DB as PostgreSQL

    U->>API: POST /api/purchases { userId }
    API->>TG: IP rate check
    alt Over limit
        TG-->>U: 429 Too Many Requests
    end
    API->>SAG: Sale window check
    alt Not active
        SAG-->>U: 400 Sale Not Active
    end
    API->>URG: Per-user attempt check (Redis INCR)
    alt Exceeded attempts
        URG-->>U: 429 Too Many Attempts
    end
    API->>R: EVAL Lua script (SADD user + DECR stock)
    alt Already purchased
        R-->>API: -1
        API-->>U: 409 Already Purchased
    else Sold out
        R-->>API: 0 (rollback INCR + SREM)
        API-->>U: 410 Sold Out
    else Success
        R-->>API: 1
        API->>Q: Add job { orderId, userId }
        API-->>U: 201 Purchase Confirmed
        Q->>W: Process job
        W->>DB: INSERT INTO orders
    end
```

---

## Project Structure

```
flash-sale-system/
├── docker-compose.yml          # Redis 7 + PostgreSQL 16
├── package.json                # npm workspaces root
├── .env.example                # Environment variable template
│
├── server/                     # NestJS backend
│   ├── src/
│   │   ├── main.ts             # Bootstrap (CORS, pipes, filters)
│   │   ├── app.module.ts       # Root module (TypeORM, BullMQ, Throttler)
│   │   ├── config/             # ConfigModule + typed configs
│   │   ├── sale/               # Sale status (upcoming/active/ended)
│   │   ├── inventory/          # Redis Lua atomic stock management
│   │   ├── purchase/           # Purchase flow + BullMQ worker
│   │   ├── health/             # Health check (Redis + DB latency)
│   │   └── common/             # Guards, filters, interceptors
│   └── test/                   # E2e integration tests
│
├── client/                     # React + Vite frontend
│   └── src/
│       ├── components/         # SaleStatus, PurchaseForm, PurchaseResult
│       ├── hooks/              # useSaleStatus, usePurchase
│       └── api/                # Typed HTTP client
│
└── stress-test/                # k6 load testing scripts
    └── scripts/                # concurrent, sustained, dedup scenarios
```

---

## Tech Stack

| Layer           | Technology                       | Purpose                                           |
| --------------- | -------------------------------- | ------------------------------------------------- |
| Backend         | NestJS 11 + TypeScript           | API server, dependency injection, guards          |
| Frontend        | React 19 + Vite 7                | Single-page application                           |
| Cache / Atomics | Redis 7 + Lua scripts            | Atomic stock counter, purchase dedup, rate limits |
| Database        | PostgreSQL 16 + TypeORM          | Persistent order storage, connection pooling      |
| Message Queue   | BullMQ (Redis-backed)            | Async order persistence under burst load          |
| Rate Limiting   | @nestjs/throttler + custom guard | Two-tier IP limiting + per-user attempt limits    |
| Validation      | class-validator                  | DTO validation with whitelist enforcement         |
| Testing         | Jest 30 + supertest              | 29 unit tests + 14 e2e integration tests          |
| Stress Testing  | k6                               | Burst load, sustained throughput, dedup storms    |
| Infrastructure  | Docker Compose                   | Local Redis + PostgreSQL containers               |

---

## Prerequisites

- **Node.js** >= 18
- **Docker** & Docker Compose
- **npm** >= 9
- **k6** (optional, for stress tests) — [Install guide](https://grafana.com/docs/k6/latest/set-up/install-k6/)

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd flash-sale-system
cp .env.example .env
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Start backend (dev mode, port 3000)
cd server && npm run dev

# 4. Start frontend (dev mode, port 5173) — in a new terminal
cd client && npm run dev
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# 1. Clone and install
git clone <repo-url>; cd flash-sale-system
Copy-Item .env.example .env
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Start backend (dev mode, port 3000)
cd server; npm run dev

# 4. Start frontend (dev mode, port 5173) — in a new terminal
cd client; npm run dev
```

</details>

Open http://localhost:5173 to access the flash sale UI.

### Environment Variables

| Variable          | Default                                                                         | Description             |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `SALE_START_TIME` | `2026-03-01T10:00:00Z`                                                          | Sale window start (ISO) |
| `SALE_END_TIME`   | `2026-03-01T11:00:00Z`                                                          | Sale window end (ISO)   |
| `STOCK_QUANTITY`  | `100`                                                                           | Total items available   |
| `DATABASE_URL`    | `postgresql://flash_sale_user:flash_sale_password@localhost:5432/flash_sale_db` | PostgreSQL connection   |
| `REDIS_HOST`      | `localhost`                                                                     | Redis host              |
| `REDIS_PORT`      | `6379`                                                                          | Redis port              |
| `PORT`            | `3000`                                                                          | API server port         |

---

## API Endpoints

| Method | Path                     | Description                   | Auth/Guards                            |
| ------ | ------------------------ | ----------------------------- | -------------------------------------- |
| GET    | `/api/sale/status`       | Sale status + remaining stock | Throttler                              |
| POST   | `/api/purchases`         | Attempt a purchase            | Throttler + SaleActive + UserRateLimit |
| GET    | `/api/purchases/:userId` | Check if user has purchased   | Throttler                              |
| GET    | `/api/health`            | Redis + DB health check       | None                                   |
| GET    | `/`                      | Server info                   | None                                   |

### Example: Purchase

```bash
# Attempt purchase
curl -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-42"}'

# Response (201)
{
  "success": true,
  "message": "Purchase confirmed!",
  "orderId": "a1b2c3d4-..."
}

# Duplicate attempt (409)
{
  "statusCode": 409,
  "message": "You have already purchased this item.",
  "error": "Conflict"
}
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Attempt purchase
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"user-42\"}' | jq
```

</details>

---

## Running Tests

### Unit Tests (29 tests)

```bash
cd server
npm run test
```

Covers: `InventoryService` (Lua script results, stock init, reset), `SaleService` (window logic), `PurchaseService` (full flow, dedup, sold-out, Redis/queue failures), `AppController`.

### E2e Integration Tests (14 tests)

Requires Docker services running:

```bash
cd server
npm run test:e2e
```

Covers:

- **Sale status** — field validation, ISO dates, stock bounds
- **Purchase flow** — successful purchase, duplicate rejection, sold-out handling, validation errors
- **Concurrency** — 10 concurrent users with 5 stock → exactly 5 succeed; 10 same-user requests → exactly 1 succeeds
- **Stock consistency** — stock count decrements correctly after purchases

### Stress Tests (k6)

Requires the server running with an active sale window:

```bash
cd stress-test

# Burst: 1000 purchases across 200 VUs
npm run test:stress

# Sustained: 500 req/s for 60 seconds
npm run test:sustained

# Dedup: 100 requests from the same user
npm run test:dedup
```

| Test            | Key Assertions                                                     |
| --------------- | ------------------------------------------------------------------ |
| Concurrent      | Exactly `STOCK_QUANTITY` succeed (201); rest get 409/410; zero 5xx |
| Sustained       | 500 req/s for 60s; p95 < 500ms; p99 < 1s; error rate < 1%          |
| Duplicate storm | Exactly 1 success; 99 conflicts (409); no stock leakage            |

---

## Design Decisions & Trade-offs

### 1. Redis as Source of Truth for Hot Data

**Choice:** Stock count and purchased-users set live in Redis, not PostgreSQL.

**Why:** Redis operations are O(1) and execute in microseconds. Under 10,000+ concurrent requests, PostgreSQL row-level locks would become a severe bottleneck. Redis Lua scripts provide atomicity without distributed transactions.

**Trade-off:** If Redis crashes, in-flight state is lost. Mitigated by Redis AOF persistence (`appendonly yes`) and BullMQ ensuring eventual consistency with PostgreSQL.

### 2. Single Lua Script for Atomic Purchases

**Choice:** Combine dedup check (`SADD`) + stock decrement (`DECR`) in one Lua script.

**Why:** Eliminates the race condition window between "check if user purchased" and "decrement stock." A single atomic script means no distributed locking needed — two users hitting the endpoint simultaneously both get correct results.

**Trade-off:** Lua scripts block other Redis commands during execution. Acceptable because the script is < 10 operations and executes in microseconds.

```lua
-- Atomic: add user to set → decrement stock → rollback if out of stock
local added = redis.call('SADD', usersKey, userId)
if added == 0 then return -1 end      -- already purchased
local stock = redis.call('DECR', stockKey)
if stock < 0 then                      -- sold out → rollback
    redis.call('INCR', stockKey)
    redis.call('SREM', usersKey, userId)
    return 0
end
return 1                               -- success
```

### 3. Asynchronous Order Persistence via BullMQ

**Choice:** Confirm purchase in Redis immediately; persist to PostgreSQL asynchronously via a job queue.

**Why:** Removes PostgreSQL from the critical purchase path. Users get instant feedback (< 10ms), and database writes happen in the background. Under burst load, orders queue up and drain at a sustainable rate.

**Trade-off:** Brief window where a confirmed order exists only in Redis/BullMQ. If both crash simultaneously, orders could be lost. Mitigated by BullMQ's retry mechanism (5 attempts, exponential backoff) and Redis AOF.

### 4. Multi-Layer Rate Limiting

**Choice:** IP-based throttling (`@nestjs/throttler`: 10 req/s, 50 req/10s) + per-user attempt limiting (`UserRateLimitGuard`: 3 attempts/hour via Redis INCR).

**Why:** Prevents abuse at multiple levels. A bot spamming from one IP gets blocked before hitting Redis. A single user retrying after purchase is rate-limited before the Lua script runs. This reduces unnecessary load on the critical path.

### 5. Stateless API Servers

**Choice:** No in-memory state on the NestJS server; all shared state lives in Redis.

**Why:** Enables horizontal scaling — any number of NestJS instances can serve requests because they all read/write the same Redis. Load balancing becomes trivial.

### 6. Connection Pool Tuning

**Choice:** PostgreSQL pool: `max: 20`, `min: 5`, idle timeout 30s, connect timeout 5s.

**Why:** Prevents connection exhaustion under burst load while maintaining warm connections for the BullMQ worker's steady-state writes.

---

## How It Works

1. **User opens the app** → React polls `GET /api/sale/status` for countdown, stock remaining, and sale state.

2. **Sale becomes active** → The "Buy Now" button enables. User enters their ID and clicks purchase.

3. **Request hits the API** → Passes through IP rate limiter → sale-active guard → per-user rate limiter → reaches `PurchaseService`.

4. **Redis Lua script executes atomically:**
   - `SADD purchased_users <userId>` — if already in set, return `-1` (duplicate)
   - `DECR stock_count` — if result < 0, rollback both operations, return `0` (sold out)
   - Otherwise return `1` (success)

5. **On success** → Generate UUID order ID → enqueue to BullMQ `order-processing` queue → return `201` immediately.

6. **BullMQ worker** → Picks up job → `INSERT INTO orders` (PostgreSQL) → retries up to 5 times with exponential backoff on failure.

7. **Frontend updates** — Shows success/failure message, re-fetches sale status to update stock display.

---

## Infrastructure

### Docker Compose Services

| Service    | Image                | Port | Purpose                         |
| ---------- | -------------------- | ---- | ------------------------------- |
| Redis      | `redis:7-alpine`     | 6379 | Stock state, dedup, rate limits |
| PostgreSQL | `postgres:16-alpine` | 5432 | Order persistence               |

Both services have health checks configured and use named volumes for data persistence.

```bash
# Start services
docker compose up -d

# Check health
docker compose ps

# Stop and remove volumes
docker compose down -v
```

### Inspecting Data

#### Redis

```bash
# List all flash-sale keys
docker exec flash-sale-redis redis-cli KEYS "flash_sale:*"

# Current stock count
docker exec flash-sale-redis redis-cli GET flash_sale:stock_count

# All users who have purchased
docker exec flash-sale-redis redis-cli SMEMBERS flash_sale:purchased_users

# Check if a specific user has purchased
docker exec flash-sale-redis redis-cli SISMEMBER flash_sale:purchased_users alice

# Check rate-limit attempts for a user (3 max per hour)
docker exec flash-sale-redis redis-cli GET flash_sale:attempts:alice

# TTL remaining on a rate-limit key
docker exec flash-sale-redis redis-cli TTL flash_sale:attempts:alice
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

Same commands — `docker exec` works identically in PowerShell.

</details>

#### BullMQ (order-processing queue)

BullMQ stores jobs in Redis under the `bull:order-processing:*` key namespace.

```bash
# List all BullMQ keys for the order-processing queue
docker exec flash-sale-redis redis-cli KEYS "bull:order-processing:*"

# Count of jobs by state
docker exec flash-sale-redis redis-cli LLEN bull:order-processing:wait
docker exec flash-sale-redis redis-cli ZCARD bull:order-processing:delayed
docker exec flash-sale-redis redis-cli LLEN bull:order-processing:active
docker exec flash-sale-redis redis-cli ZCARD bull:order-processing:completed
docker exec flash-sale-redis redis-cli ZCARD bull:order-processing:failed

# View a specific job's data (replace <jobId> with actual ID)
docker exec flash-sale-redis redis-cli HGETALL "bull:order-processing:<jobId>"
```

#### PostgreSQL

```bash
# List all orders (most recent first)
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db \
  -c "SELECT id, \"userId\", status, \"createdAt\" FROM orders ORDER BY \"createdAt\" DESC LIMIT 10;"

# Count orders by status
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db \
  -c "SELECT status, COUNT(*) FROM orders GROUP BY status;"

# Total number of orders
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db \
  -c "SELECT COUNT(*) FROM orders;"

# Find order for a specific user
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db \
  -c "SELECT * FROM orders WHERE \"userId\" = 'alice';"
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# List all orders (most recent first)
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db -c "SELECT id, \""userId\"", status, \""createdAt\"" FROM orders ORDER BY \""createdAt\"" DESC LIMIT 10;"

# Count orders by status
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db -c "SELECT status, COUNT(*) FROM orders GROUP BY status;"

# Total number of orders
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db -c "SELECT COUNT(*) FROM orders;"

# Find order for a specific user
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db -c "SELECT * FROM orders WHERE \""userId\"" = 'alice';"
```

</details>

---

## Manual Testing Scenarios

Below are step-by-step scenarios you can run with `curl` to manually verify every behaviour of the system. Make sure Docker services are running (`docker compose up -d`) and the server is started (`cd server && npm run dev`).

> **🪟 Windows (PowerShell) users:**
>
> - Use **`curl.exe`** instead of `curl` (PowerShell aliases `curl` to `Invoke-WebRequest`).
> - Commands are single-line — PowerShell does not support `\` for line continuation.
> - JSON data uses single quotes with backslash-escaped inner quotes: `-d '{\"userId\": \"alice\"}'` instead of `-d '{"userId": "alice"}'`.
> - Each scenario below includes a **Windows (PowerShell)** dropdown with equivalent commands.

### Setup: Configure an Active Sale

Edit `.env` so the sale is currently active with a small stock:

```env
SALE_START_TIME=2020-01-01T00:00:00Z
SALE_END_TIME=2099-01-01T00:00:00Z
STOCK_QUANTITY=5
```

Restart the server after changing `.env`.

---

### Scenario 1 — Health Check

Verify Redis and PostgreSQL are reachable.

```bash
curl -s http://localhost:3000/api/health | jq
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/health | jq
```

</details>

**Expected:** Status `"ok"`, both services `"up"` with latency in ms.

---

### Scenario 2 — Sale Status (Active)

```bash
curl -s http://localhost:3000/api/sale/status | jq
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/sale/status | jq
```

</details>

**Expected:**

```json
{
  "status": "active",
  "startsAt": "2020-01-01T00:00:00.000Z",
  "endsAt": "2099-01-01T00:00:00.000Z",
  "stockRemaining": 5,
  "totalStock": 5
}
```

---

### Scenario 3 — Successful Purchase

```bash
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice"}' | jq
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"alice\"}' | jq
```

</details>

**Expected (201):**

```json
{
  "success": true,
  "message": "Purchase confirmed!",
  "orderId": "<uuid>"
}
```

Verify stock decremented:

```bash
curl -s http://localhost:3000/api/sale/status | jq '.stockRemaining'
# Expected: 4
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/sale/status | jq ".stockRemaining"
# Expected: 4
```

</details>

---

### Scenario 4 — Duplicate Purchase Rejection

Try buying again with the same user:

```bash
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice"}' | jq
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"alice\"}' | jq
```

</details>

**Expected (409):**

```json
{
  "statusCode": 409,
  "message": "You have already purchased this item.",
  "error": "Conflict"
}
```

---

### Scenario 5 — Purchase Status Check

```bash
# User who purchased
curl -s http://localhost:3000/api/purchases/alice | jq
# Expected: { "purchased": true, "userId": "alice" }

# User who didn't purchase
curl -s http://localhost:3000/api/purchases/unknown-user | jq
# Expected: { "purchased": false, "userId": "unknown-user" }
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# User who purchased
curl.exe -s http://localhost:3000/api/purchases/alice | jq
# Expected: { "purchased": true, "userId": "alice" }

# User who didn't purchase
curl.exe -s http://localhost:3000/api/purchases/unknown-user | jq
# Expected: { "purchased": false, "userId": "unknown-user" }
```

</details>

---

### Scenario 6 — Sell Out All Stock

Buy the remaining 4 items (stock was 5, alice bought 1):

```bash
for user in bob carol dave eve; do
  echo "--- $user ---"
  curl -s -X POST http://localhost:3000/api/purchases \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$user\"}" | jq '.success'
done
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
foreach ($user in @("bob","carol","dave","eve")) {
  Write-Host "--- $user ---"
  $body = '{\"userId\": \"' + $user + '\"}'
  curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d $body | jq ".success"
}
```

</details>

**Expected:** All four return `true`. Stock is now 0.

---

### Scenario 7 — Sold-Out Rejection

```bash
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "frank"}' | jq
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"frank\"}' | jq
```

</details>

**Expected (410):**

```json
{
  "statusCode": 410,
  "message": "Sorry, the item is sold out.",
  "error": "Gone"
}
```

Verify stock is zero:

```bash
curl -s http://localhost:3000/api/sale/status | jq '.stockRemaining'
# Expected: 0
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/sale/status | jq ".stockRemaining"
# Expected: 0
```

</details>

---

### Scenario 8 — Validation Errors

```bash
# Missing userId
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{}' | jq
# Expected (400): "userId should not be empty" or similar

# Empty userId
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": ""}' | jq
# Expected (400): validation error

# Extra fields stripped (whitelist: true)
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "hack": true}' | jq
# Expected (400): "property hack should not exist"
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Missing userId
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{}' | jq
# Expected (400): "userId should not be empty" or similar

# Empty userId
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"\"}' | jq
# Expected (400): validation error

# Extra fields stripped (whitelist: true)
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"test-user\", \"hack\": true}' | jq
# Expected (400): "property hack should not exist"
```

</details>

---

### Scenario 9 — Sale Not Active (Upcoming)

Change `.env` so the sale hasn't started yet, then restart:

```env
SALE_START_TIME=2099-01-01T00:00:00Z
SALE_END_TIME=2099-12-31T00:00:00Z
```

```bash
# Check status
curl -s http://localhost:3000/api/sale/status | jq '.status'
# Expected: "upcoming"

# Try to purchase
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "eager-user"}' | jq
# Expected (400): sale not active
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Check status
curl.exe -s http://localhost:3000/api/sale/status | jq ".status"
# Expected: "upcoming"

# Try to purchase
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"eager-user\"}' | jq
# Expected (400): sale not active
```

</details>

---

### Scenario 10 — Sale Not Active (Ended)

Change `.env` so the sale is in the past, then restart:

```env
SALE_START_TIME=2020-01-01T00:00:00Z
SALE_END_TIME=2020-01-02T00:00:00Z
```

```bash
curl -s http://localhost:3000/api/sale/status | jq '.status'
# Expected: "ended"

curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "late-user"}' | jq
# Expected (400): sale not active
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/sale/status | jq ".status"
# Expected: "ended"

curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"late-user\"}' | jq
# Expected (400): sale not active
```

</details>

---

### Scenario 11 — Per-User Rate Limiting (3 attempts max)

Set the sale to active again and restart. Then spam from one user:

```bash
# Attempt 1 — succeeds (purchase)
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "spammer"}' | jq '.success'
# Expected: true

# Attempt 2 — 409 (already purchased, but counts as attempt)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "spammer"}'
# Expected: 409

# Attempt 3 — 409 (still counts)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "spammer"}'
# Expected: 409

# Attempt 4+ — 429 (rate limited, blocked before reaching service)
curl -s -X POST http://localhost:3000/api/purchases \
  -H "Content-Type: application/json" \
  -d '{"userId": "spammer"}' | jq
# Expected (429): "Too many purchase attempts. Maximum 3 attempts allowed."
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Attempt 1 — succeeds (purchase)
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"spammer\"}' | jq ".success"
# Expected: true

# Attempt 2 — 409 (already purchased, but counts as attempt)
curl.exe -s -o NUL -w "%{http_code}" -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"spammer\"}'
# Expected: 409

# Attempt 3 — 409 (still counts)
curl.exe -s -o NUL -w "%{http_code}" -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"spammer\"}'
# Expected: 409

# Attempt 4+ — 429 (rate limited, blocked before reaching service)
curl.exe -s -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d '{\"userId\": \"spammer\"}' | jq
# Expected (429): "Too many purchase attempts. Maximum 3 attempts allowed."
```

</details>

---

### Scenario 12 — Concurrent Purchases (Shell)

Test atomicity with 10 parallel requests against 3 stock:

```bash
# Set STOCK_QUANTITY=3 in .env and restart server

for i in $(seq 1 10); do
  curl -s -o /dev/null -w "user-$i: %{http_code}\n" \
    -X POST http://localhost:3000/api/purchases \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$i\"}" &
done
wait
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Set STOCK_QUANTITY=3 in .env and restart server

$jobs = 1..10 | ForEach-Object {
  $userId = "user-$_"
  Start-Job -ScriptBlock {
    param($id)
    $body = '{\"userId\": \"' + $id + '\"}'
    curl.exe -s -o NUL -w "$id`: %{http_code}" -X POST http://localhost:3000/api/purchases -H "Content-Type: application/json" -d $body
  } -ArgumentList $userId
}
$jobs | Wait-Job | Receive-Job
$jobs | Remove-Job
```

</details>

**Expected:** Exactly 3 responses with `201`, exactly 7 with `410`. No overselling.

Verify:

```bash
curl -s http://localhost:3000/api/sale/status | jq '.stockRemaining'
# Expected: 0
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
curl.exe -s http://localhost:3000/api/sale/status | jq ".stockRemaining"
# Expected: 0
```

</details>

---

### Scenario 13 — Order Persistence in PostgreSQL

After a successful purchase, verify the order was persisted asynchronously:

```bash
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db \
  -c "SELECT id, \"userId\", status, \"createdAt\" FROM orders ORDER BY \"createdAt\" DESC LIMIT 5;"
```

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
docker exec flash-sale-postgres psql -U flash_sale_user -d flash_sale_db -c "SELECT id, \""userId\"", status, \""createdAt\"" FROM orders ORDER BY \""createdAt\"" DESC LIMIT 5;"
```

</details>

**Expected:** Rows with `status = 'confirmed'` matching the userIds that successfully purchased.

---

### Scenario 14 — Frontend Walkthrough

1. Open http://localhost:5173
2. **Upcoming sale** — Timer counts down, "Buy Now" button is disabled
3. **Active sale** — Stock count visible, enter a userId, click "Buy Now"
4. **Success** — Green confirmation with order ID
5. **Duplicate** — Try same userId again → error message
6. **Sold out** — After all stock is gone → sold-out message
7. **Ended sale** — After `SALE_END_TIME` passes → "Sale Ended" display

---

## Development

```bash
# Run all unit tests
cd server && npm run test

# Run tests in watch mode
cd server && npm run test:watch

# Run with coverage
cd server && npm run test:cov

# Run e2e tests (Docker services must be running)
cd server && npm run test:e2e

# Lint
cd server && npm run lint

# Format
cd server && npm run format

# Build for production
cd server && npm run build
cd client && npm run build
```

---

## License

UNLICENSED — Private project.
