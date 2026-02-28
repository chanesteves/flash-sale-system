# Flash Sale System

A high-throughput flash sale platform for a single product with limited stock. Built with NestJS (backend), React (frontend), Redis (atomic inventory), and PostgreSQL (persistence).

## Project Structure

```
flash-sale-system/
├── server/           # NestJS API server
├── client/           # React frontend (Vite)
├── stress-test/      # Load & stress tests
├── docker-compose.yml # Redis + PostgreSQL
└── .env.example      # Environment variable template
```

## Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- npm >= 9

## Quick Start

```bash
# 1. Copy environment config
cp .env.example .env

# 2. Start infrastructure (Redis + PostgreSQL)
docker-compose up -d

# 3. Install dependencies
npm install

# 4. Start backend (dev mode)
cd server && npm run dev

# 5. Start frontend (dev mode) — in a new terminal
cd client && npm run dev
```

- **API Server**: http://localhost:3000
- **Frontend**: http://localhost:5173

## Running Tests

```bash
# Unit tests
cd server && npm run test

# Integration tests (requires Docker services running)
cd server && npm run test:e2e

# Stress tests
cd stress-test && npm run test
```
