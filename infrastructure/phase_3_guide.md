# Phase 3: Infrastructure — File Guide

This document explains every file created in Phase 3, what it does, and why it exists.

---

## What Phase 3 Delivers

Phase 3 connects Phases 1 and 2 into a single deployable system. Running one command —
`docker compose up --build` — spins up three services (Postgres, Gateway, Inventory Connector)
in the correct order, with the database schema already created.

```
Host machine (port 3000 only exposed)
│
└─► gateway:3000       Node.js — JWT auth, RBAC, audit, proxy
      │
      ├─► postgres:5432   Shared DB — RBAC tables + audit log
      │
      └─► inventory-connector:8001   Python — parameterized SQL queries
```

---

## Directory Structure Added

```
Business_Ai/
├── docker-compose.yml          ← Orchestrates all services
├── infrastructure/
│   └── db/
│       └── init.sql            ← Auto-runs on first postgres startup
├── gateway/
│   ├── Dockerfile              ← Builds the Node.js gateway image
│   └── .dockerignore           ← Excludes node_modules, dist, .env
└── domain-connectors/
    └── inventory/
        ├── Dockerfile          ← Builds the Python connector image
        └── .dockerignore       ← Excludes .venv, __pycache__, .env
```

---

## File-by-File Breakdown

---

### `infrastructure/db/init.sql`

**What it is:** The SQL script that creates all three database tables and inserts seed data.

**How it runs:** The official `postgres` Docker image automatically executes every `.sql`
file placed in `/docker-entrypoint-initdb.d/` on **first startup only**. The
`docker-compose.yml` mounts this file into that directory.

**Tables created:**

| Table | Purpose |
|---|---|
| `tool_permissions` | Maps `role_name` → `tool_name`. Defines which roles can call which tools |
| `user_roles` | Maps `user_id` → `role_name`. Assigns users to roles |
| `audit_log` | Append-only record of every tool execution (SOC2 compliance) |

**Seed data:** Two test users and two roles are pre-inserted so the system works immediately
after `docker compose up` without any manual DB setup.

**Why `IF NOT EXISTS`?** Makes the script idempotent — safe to reference even if the
DB volume is preserved across restarts (though the script only runs once per fresh volume).

---

### `gateway/Dockerfile`

**What it is:** A two-stage Docker build for the Node.js gateway.

**Why two stages?**

| Stage | Purpose |
|---|---|
| `builder` (Stage 1) | Installs all deps (including `typescript`, `tsx`) and compiles `src/` → `dist/` |
| Final (Stage 2) | Starts fresh from `node:20-alpine`; copies only `dist/` + production deps |

The final image has **no TypeScript compiler, no tsx, no source files** — just the compiled
JavaScript. This reduces the image size and eliminates dev tooling from production.

**Why `node:20-alpine`?** The `-alpine` variant is ~50 MB vs ~350 MB for the full Debian
image. Alpine is sufficient for a pure Node.js HTTP server.

**`npm ci --omit=dev`:** `npm ci` is used instead of `npm install` in Docker because it
installs exactly what's in `package-lock.json` (reproducible), and `--omit=dev` skips
`typescript`, `tsx`, and type definitions in the final image.

---

### `gateway/.dockerignore`

**What it is:** Tells Docker which files to exclude from the build context sent to the daemon.

```
node_modules/   ← Never copy — Docker installs them from package.json inside the image
dist/           ← Compiled output is generated inside the builder stage, not copied in
.env            ← Secrets must never be baked into an image
*.md            ← Documentation is irrelevant to runtime
```

**Why it matters:** Without `.dockerignore`, Docker would send the entire `node_modules/`
folder (~100 MB+) to the daemon on every build, making builds slow.

---

### `domain-connectors/inventory/Dockerfile`

**What it is:** A single-stage Docker build for the Python inventory connector.

**Why single-stage (not multi-stage)?**
Python doesn't have a compile step. There's no build artifact to separate from source.
A multi-stage build here adds complexity with no size benefit.

**Layer ordering — most important pattern:**
```dockerfile
COPY requirements.txt ./          # ← copied first
RUN pip install ...               # ← cached unless requirements.txt changes
COPY main.py ./                   # ← copied last
```
This order exploits Docker's layer cache. If only `main.py` changes (the common case),
Docker reuses the cached pip install layer — rebuilds take seconds, not minutes.

**Why `python:3.12-slim`?** The `-slim` variant strips unnecessary system packages while
keeping pip and standard library. Smaller than full Debian, still compatible with asyncpg
(which compiles a C extension).

---

### `domain-connectors/inventory/.dockerignore`

```
.venv/          ← Never copy — pip installs deps inside the image from requirements.txt
__pycache__/    ← Bytecode cache — irrelevant in a fresh container
.env            ← Secrets must never be baked into an image
*.md            ← Documentation
```

---

### `docker-compose.yml`

**What it is:** The single file that defines, wires, and starts the entire system.

**Service startup order:**
```
postgres  →  (health check passes)  →  gateway + inventory-connector start in parallel
```

**Key design decisions:**

**`depends_on` with `condition: service_healthy`**
The gateway and connector wait not just for the postgres *container* to start, but for
postgres to be *ready to accept connections* (via `pg_isready`). Without this, the
gateway would crash on startup because the DB isn't accepting connections yet.

**Internal networking**
Docker Compose creates a private network for all services automatically. Services
communicate using their service name as the hostname:
- Gateway connects to postgres via `postgresql://user:password@postgres:5432/mcp_gateway`
- Gateway calls inventory connector via `http://inventory-connector:8001`

**Only the gateway port is exposed to the host (`3000:3000`)**
The `inventory-connector` has *no* `ports:` mapping — it is invisible to the outside world.
This is the Zero-Trust isolation: only the Gateway is on the public network.

**Named volume `postgres_data`**
Data persists across `docker compose down` / `docker compose up` cycles. To wipe the DB
and re-run `init.sql`, run: `docker compose down -v`

---

## How to Run

```bash
# From the project root
docker compose up --build

# Verify gateway is up (should return 401 — auth working)
curl http://localhost:3000/tools

# Tear down (keeps DB data)
docker compose down

# Tear down AND wipe the database (re-runs init.sql on next up)
docker compose down -v
```

---

## Credentials for Local Testing

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/mcp_gateway` |
| `JWT_SECRET` | `change_me_to_a_strong_random_secret` |
| Test user | `test-user-1` (role: `admin`) |
| Test user | `test-user-2` (role: `viewer`) |

> **Before going to production:** replace `JWT_SECRET` and Postgres credentials with
> strong values via environment-specific `.env` files or a secrets manager. Never commit
> real secrets to source control.
