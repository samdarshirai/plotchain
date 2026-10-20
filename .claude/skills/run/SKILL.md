---
name: run
description: Use when asked to run, start, or screenshot Plotchain, or to confirm a change works in the real app (not just tests) — covers backend, frontend, and DB startup for this repo.
---

# Run Plotchain

## Overview

Plotchain = Spring Boot backend (`backend/`) + Angular frontend (`frontend/`) + Postgres via docker-compose. Three pieces, start in order: DB, backend, frontend.

## Quick Reference

| Piece | Command | Port |
|---|---|---|
| DB | `docker compose up -d db` (from repo root) | 5434 (host) → 5432 (container) |
| Backend | `cd backend && ./mvnw spring-boot:run` | 8081 |
| Frontend | `cd frontend && npm start` (= `ng serve`) | 4200 |

Frontend proxies `/api/*` to `localhost:8081` automatically (`frontend/proxy.conf.json`, wired into `ng serve` via `angular.json`). No manual proxy flag needed.

## Steps

1. **DB**: `docker compose up -d db`. Check it's up: `docker compose ps`.
2. **Backend**: `cd backend && mvn spring-boot:run`. Wait for `Started PlotchainApplication` in the log. Defaults to `dev` behavior only when no profile is set explicitly as non-dev — see root `README.md` for `JWT_SECRET`/`PLOTCHAIN_SECRETS_KEY` env vars if running outside `dev`/`test`.
3. **Frontend**: `cd frontend && npm start`. Open `http://localhost:4200`.

## Common Mistakes

- Running frontend without the DB/backend up first — API calls will 502/connection-refused through the proxy.
- Assuming Postgres is on the default 5432 — this repo maps it to host port **5434** (`docker-compose.yml`), matched by `DB_PORT:5434` in `application.yml`.
- Forgetting `./mvnw` (not `mvn`) if the system Maven version differs from what the project expects.

## Verifying a change

For UI changes: after starting all three, use claude-in-chrome (or ask the user) to exercise the actual flow at `localhost:4200` — don't just rely on `ng test`/`mvn test` passing.
