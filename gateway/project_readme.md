# Gateway — Project README & Change Log

> This file tracks every file created in the `/gateway` module, what it does, and the reasoning behind each decision.

---

## Project Overview

The `/gateway` is a **Node.js + TypeScript** service that acts as the zero-trust security layer between an AI client (LLM) and internal enterprise data. It handles:

- JWT authentication on every incoming request
- Role-Based Access Control (RBAC) — filters which tools a user can see/call
- Immutable audit logging to PostgreSQL before any tool executes
- Reverse-proxying validated JSON arguments to internal Python MCP domain servers

---

## File-by-File Change Log

---

### `package.json`
**What it is:** Project manifest — defines all dependencies and npm scripts.

**Dependencies added & why:**

| Package | Why |
|---|---|
| `fastify` | High-performance HTTP server; better throughput than Express for this I/O-heavy gateway |
| `@fastify/jwt` | Official JWT plugin; integrates cleanly with Fastify's hook system |
| `pg` | PostgreSQL client for both the RBAC policy DB and audit log writes |
| `zod` | Runtime schema validation + TypeScript type inference from one definition |
| `dotenv` | Loads `.env` into `process.env` at startup |
| `tsx` (dev) | Runs TypeScript directly in dev — no separate compile step needed |
| `typescript` (dev) | TypeScript compiler |
| `@types/node`, `@types/pg` (dev) | Type definitions for Node.js stdlib and `pg` |

**Scripts:**
- `npm run dev` — `tsx watch src/main.ts` (hot reload in development)
- `npm run build` — `tsc` (compile to `dist/`)
- `npm start` — `node dist/main.js` (production)

---

### `tsconfig.json`
**What it is:** TypeScript compiler configuration.

**Key settings:**
- `"target": "ES2022"` — modern JS output; enables native `fetch`, top-level await, etc.
- `"module": "NodeNext"` — matches Node.js native ESM resolution (required for `.js` imports in TS)
- `"strict": true` — enforces full type safety; no implicit `any`, no unchecked nulls
- `"outDir": "dist"` — compiled output goes to `dist/` so source stays clean
- `"include": ["src", "src/types/*.d.ts"]` — explicitly includes the global JWT declaration file

---

### `.env.example`
**What it is:** Template for required environment variables. Committed to source control; the real `.env` is never committed.

```
DATABASE_URL=postgresql://user:password@localhost:5432/mcp_gateway
JWT_SECRET=change_me_to_a_strong_random_secret
PORT=3000
```

Used by: `src/infrastructure/db/pool.ts` (DATABASE_URL), `src/infrastructure/http/server.ts` (JWT_SECRET), `src/main.ts` (PORT).

---

### `src/domain/entities.ts`
**What it is:** The core data shapes of the entire system, defined once with Zod.

**Why Zod in the domain layer?**
Zod schemas serve double duty — they are both the runtime validator AND the TypeScript type source. No duplicate `interface` + `schema` definitions.

**Schemas defined:**

| Schema | Fields | Purpose |
|---|---|---|
| `UserIdentitySchema` | `userId`, `role` | Represents the decoded JWT payload |
| `ToolExecutionPayloadSchema` | `tool_name`, `target_service` (URL), `args` (key-value map) | The body of a `POST /tools/execute` request |
| `AuditEventSchema` | `userId`, `tool`, `timestamp` (ISO datetime) | What gets written to the audit log table |

TypeScript types (`UserIdentity`, `ToolExecutionPayload`, `AuditEvent`) are inferred from the schemas with `z.infer<>`.

---

### `src/domain/interfaces.ts`
**What it is:** Pure TypeScript contracts (interfaces) for the three external dependencies the use-cases need.

**Why interfaces here?**
This is the core of Clean Architecture's Dependency Inversion Principle — the domain defines *what it needs*, not *how it's done*. The actual Postgres/HTTP implementations are in `infrastructure/` and `interface-adapters/`.

| Interface | Methods |
|---|---|
| `IRbacRepository` | `verifyToolAccess(userId, toolName)` → `boolean`, `getPermittedTools(role)` → `string[]` |
| `IAuditRepository` | `logEvent(event)` → `void` |
| `IMcpProxyService` | `forwardRequest(targetService, payload)` → `unknown` |

---

### `src/use-cases/ListToolsUseCase.ts`
**What it is:** The business logic for `GET /tools`.

**What it does:** Takes a user's `role` string, asks the RBAC repository for the list of permitted tools for that role, and returns it. That's it — one responsibility.

**Why so small?** This is the point. Use cases orchestrate; they don't implement. All DB logic stays in the repository.

---

### `src/use-cases/ExecuteToolUseCase.ts`
**What it is:** The business logic for `POST /tools/execute`. This is the most important file in the codebase.

**Three-step flow (in order):**

1. **RBAC check** — `rbacRepo.verifyToolAccess(userId, tool_name)`. Throws a 403 error immediately if access is denied. No IO happens after a rejection.

2. **Audit logging** — `auditRepo.logEvent(...)` is called with `.catch()` but **not awaited on the success path**. This is a deliberate ponytail trade-off:
   ```ts
   // ponytail: if audit DB is down, the proxy still succeeds.
   // Upgrade path: add a dead-letter queue.
   this.audit.logEvent(...).catch(err => console.error('[audit]', err));
   ```
   The proxy response is never blocked by audit DB latency.

3. **Proxy** — forwards only `tool_name` and `args` to the target Python service. The `target_service` URL is not forwarded outbound (internal routing stays opaque to the caller).

---

### `src/interface-adapters/repositories/RbacRepository.ts`
**What it is:** The concrete Postgres implementation of `IRbacRepository`.

**What it queries:**

- `verifyToolAccess` — `SELECT EXISTS(...)` JOIN between `user_roles` and `tool_permissions` tables. Returns a boolean.
- `getPermittedTools` — `SELECT tool_name FROM tool_permissions WHERE role_name = $1`. Returns an array of strings.

**Security note:** Both queries use `$1`, `$2` parameterized placeholders — never string interpolation. This prevents SQL injection regardless of what the LLM passes as arguments.

---

### `src/interface-adapters/repositories/AuditRepository.ts`
**What it is:** The concrete Postgres implementation of `IAuditRepository`.

**What it does:** A single `INSERT INTO audit_log (user_id, tool_name, timestamp) VALUES ($1, $2, $3)`. Rows are never updated or deleted — this is an **append-only** log for SOC2 compliance.

---

### `src/interface-adapters/controllers/mcpController.ts`
**What it is:** The Fastify route definitions — the HTTP adapter layer.

**Routes:**

| Method | Path | What it does |
|---|---|---|
| `GET` | `/tools` | Reads `request.user.role` from the verified JWT, calls `ListToolsUseCase`, returns `{ tools: string[] }` |
| `POST` | `/tools/execute` | Validates request body with `ToolExecutionPayloadSchema.safeParse()`, calls `ExecuteToolUseCase`, returns `{ result }` |

**Validation failure:** Returns `400` with `parsed.error.flatten()` — a structured Zod error that tells the caller exactly which fields are wrong.

**Note:** No business logic lives here. The controller's only job is to translate HTTP ↔ use-case.

---

### `src/types/jwt.d.ts`
**What it is:** A global TypeScript declaration file that tells the compiler what shape `request.user` has after JWT verification.

**Why a separate file?** `@fastify/jwt` v9 requires augmenting its own `FastifyJWT` namespace. If this augmentation is placed inside a regular `.ts` file, it only applies to that module. By placing it in a `.d.ts` file included in `tsconfig.json`, it applies globally — `request.user.userId` and `request.user.role` are typed everywhere without repetition.

---

### `src/infrastructure/db/pool.ts`
**What it is:** The single shared `pg.Pool` instance for the entire process.

**Why a singleton?** A connection pool is designed to be shared. Creating multiple pools wastes connections. Any file that needs the DB just imports `pool` from here.

**Startup guard:** Throws immediately if `DATABASE_URL` is missing — fail loudly at boot, not silently mid-request.

---

### `src/infrastructure/mcp/proxyService.ts`
**What it is:** The concrete implementation of `IMcpProxyService`. Forwards requests to Python domain servers.

**Why native `fetch`?** Node.js 18+ ships `fetch` built-in. Using it means zero extra dependencies for HTTP proxying. `undici` (the underlying engine) is already installed as a transitive dep of Fastify.

**Error handling:** Non-2xx responses from the Python server are converted to a `502 Bad Gateway` error with a clear message — the caller knows the domain server failed, not the gateway.

---

### `src/infrastructure/http/server.ts`
**What it is:** A factory function that builds and configures the Fastify app instance.

**Why a factory (not a direct startup)?** Returning the app without calling `.listen()` means the server can be tested without binding to a port. It also keeps all config in one place.

**JWT hook:** `app.addHook('onRequest', ...)` runs `request.jwtVerify()` before **every route**. There is no way to accidentally skip authentication — it's enforced at the server level, not per-route.

---

### `src/main.ts`
**What it is:** The application entry point. The only file that knows about all the concrete implementations.

**What it does:**
1. Imports `dotenv/config` (loads `.env`) as the very first side-effect
2. Constructs all infrastructure instances (`pool`, `McpProxyService`)
3. Constructs all repositories (`RbacRepository`, `AuditRepository`) injecting the pool
4. Constructs all use-cases injecting the repositories
5. Calls `buildServer()` with the use-cases
6. Calls `app.listen()` on the configured `PORT`

**Why manual DI?** No DI container library is needed for this scale. Swapping any implementation (e.g., a mock RBAC repo for testing) means changing one `new` call in this file. The dependency graph is visible and explicit.

---

## Database Tables Required

The gateway expects these tables to exist in PostgreSQL (will be created by the `/infrastructure` init scripts):

```sql
-- RBAC policy: which roles can call which tools
CREATE TABLE tool_permissions (
  role_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  PRIMARY KEY (role_name, tool_name)
);

-- Maps users to their roles
CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  PRIMARY KEY (user_id, role_name)
);

-- Immutable audit trail (append-only)
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);
```

---

## How to Run Locally

```bash
cd gateway
cp .env.example .env
# Edit .env with real DATABASE_URL and JWT_SECRET

npm install
npm run dev
# Server starts on PORT (default 3000)
```

**Verify it's running:**
```bash
# Should return 401 (no token)
curl http://localhost:3000/tools
```
