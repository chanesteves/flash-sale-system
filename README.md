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

| Layer            | Technology                       | Purpose                                        |
| ---------------- | -------------------------------- | ---------------------------------------------- |
| Backend          | NestJS 11 + TypeScript           | API server, dependency injection, guards        |
| Frontend         | React 19 + Vite 7                | Single-page application                         |
| Cache / Atomics  | Redis 7 + Lua scripts            | Atomic stock counter, purchase dedup, rate limits |
| Database         | PostgreSQL 16 + TypeORM          | Persistent order storage, connection pooling     |
| Message Queue    | BullMQ (Redis-backed)            | Async order persistence under burst load         |
| Rate Limiting    | @nestjs/throttler + custom guard | Two-tier IP limiting + per-user attempt limits   |
| Validation       | class-validator                  | DTO validation with whitelist enforcement        |
| Testing          | Jest 30 + supertest              | 29 unit tests + 14 e2e integration tests         |
| Stress Testing   | k6                               | Burst load, sustained throughput, dedup storms   |
| Infrastructure   | Docker Compose                   | Local Redis + PostgreSQL containers              |

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

Open http://localhost:5173 to access the flash sale UI.

### Environment Variables

| Variable           | Default                                                                     | Description               |
| ------------------ | --------------------------------------------------------------------------- | ------------------------- |
| `SALE_START_TIME`  | `2026-03-01T10:00:00Z`                                                      | Sale window start (ISO)   |
| `SALE_END_TIME`    | `2026-03-01T11:00:00Z`                                                      | Sale window end (ISO)     |
| `STOCK_QUANTITY`   | `100`                                                                       | Total items available     |
| `DATABASE_URL`     | `postgresql://flash_sale_user:flash_sale_password@localhost:5432/flash_sale_db` | PostgreSQL connection   |
| `REDIS_HOST`       | `localhost`                                                                  | Redis host               |
| `REDIS_PORT`       | `6379`                                                                       | Redis port               |
| `PORT`             | `3000`                                                                       | API server port          |

---

## API Endpoints

| Method | Path                       | Description                     | Auth/Guards                              |
| ------ | -------------------------- | ------------------------------- | ---------------------------------------- |
| GET    | `/api/sale/status`         | Sale status + remaining stock   | Throttler                                |
| POST   | `/api/purchases`           | Attempt a purchase              | Throttler + SaleActive + UserRateLimit   |
| GET    | `/api/purchases/:userId`   | Check if user has purchased     | Throttler                                |
| GET    | `/api/health`              | Redis + DB health check         | None                                     |
| GET    | `/`                        | Server info                     | None                                     |

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

| Test           | Key Assertions                                                                         |
| -------------- | -------------------------------------------------------------------------------------- |
| Concurrent     | Exactly `STOCK_QUANTITY` succeed (201); rest get 409/410; zero 5xx                     |
| Sustained      | 500 req/s for 60s; p95 < 500ms; p99 < 1s; error rate < 1%                             |
| Duplicate storm| Exactly 1 success; 99 conflicts (409); no stock leakage                                |

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

| Service    | Image              | Port | Purpose                          |
| ---------- | ------------------ | ---- | -------------------------------- |
| Redis      | `redis:7-alpine`   | 6379 | Stock state, dedup, rate limits  |
| PostgreSQL | `postgres:16-alpine` | 5432 | Order persistence                |

Both services have health checks configured and use named volumes for data persistence.

```bash
# Start services
docker compose up -d

# Check health
docker compose ps

# Stop and remove volumes
docker compose down -v
```

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
