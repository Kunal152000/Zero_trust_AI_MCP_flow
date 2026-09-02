# Phase 2: Domain Connectors — File Guide

This document explains every file in `/domain-connectors/`, what it does, and why it exists.

---

## What is a Domain Connector?

In the Zero-Trust architecture, the **Node.js Gateway** handles identity and access control. It never touches raw databases directly.

A **Domain Connector** is a small Python FastAPI server that sits inside the private network. Its only job: receive a validated `{ tool_name, args }` JSON payload from the Gateway, run a **parameterized SQL query**, and return a safe text result.

```
AI Client
   │  JWT + tool request
   ▼
Node.js Gateway  ──── verifies JWT, checks RBAC, logs audit ────►  POST /execute
                                                                         │
                                                            Domain Connector (this layer)
                                                                         │
                                                            Parameterized SQL → Database
```

The Gateway calls `POST {target_service_url}/execute`. The connector answers it.

---

## Directory Structure

```
domain-connectors/
└── inventory/
    ├── main.py           ← FastAPI app (the entire server)
    ├── requirements.txt  ← Python dependencies
    ├── .env.example      ← Environment variable template
    ├── .gitignore        ← Excludes .venv/, __pycache__/, .env
    └── .venv/            ← Virtual environment (never committed)
```

One folder per domain. Each folder is an independently deployable microservice. To add a new domain (e.g., HR, Finance), copy the folder and swap out the tool handlers.

---

## File-by-File Breakdown

---

### `inventory/requirements.txt`

**What it is:** The Python dependency manifest.

| Package | Why |
|---|---|
| `fastapi` | Web framework — provides the `@app.post()` decorator and Pydantic integration |
| `uvicorn` | ASGI server — what actually runs the FastAPI app and listens on a port |
| `asyncpg` | Async PostgreSQL driver — `await db.fetchrow(...)` doesn't block the event loop |
| `python-dotenv` | Loads `.env` into `os.environ` at startup |

**Why these and nothing else?** Ponytail rule: no extra packages when the above four cover everything.

**How to install:**
```bash
cd domain-connectors/inventory
pip install -r requirements.txt
```

---

### `inventory/.env.example`

**What it is:** A committed template showing which environment variables are required. The real `.env` is never committed.

```
DATABASE_URL=postgresql://user:password@localhost:5432/inventory_db
PORT=8001
```

- `DATABASE_URL` — used by `asyncpg.connect()` to reach the inventory PostgreSQL instance.
- `PORT` — each connector runs on its own port so multiple connectors can run side-by-side. In Docker Compose, the port is set via `environment:` and mapped per-service.

---

### `inventory/main.py`

**What it is:** The entire domain connector — one Python file, one FastAPI app. This is the most important file in Phase 2.

#### Section 1 — Lifespan (DB connection management)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await asyncpg.connect(db_url)
    yield
    await app.state.db.close()
```

**What it does:** Opens one database connection when the server starts. Closes it cleanly when the server shuts down.

**Why `asyncpg.connect()` and not a pool?**
Per ponytail: a single connection is sufficient for a single-purpose internal connector (the Gateway serializes calls per-user anyway). A pool would add complexity with no benefit at this traffic level.
> `// ponytail: single connection; ceiling is ~100 rps before pool is needed.`

**Why lifespan and not `@app.on_event("startup")`?**
`on_event` is deprecated in FastAPI 0.93+. Lifespan is the current standard.

---

#### Section 2 — Request Schema

```python
class ExecuteRequest(BaseModel):
    tool_name: str
    args: dict
```

**What it is:** A Pydantic model that describes the exact JSON body the Gateway sends.

**Why Pydantic?** FastAPI uses it for automatic validation. If the Gateway sends a malformed body, FastAPI returns a `422` before the route handler even runs — no manual `if` checks needed.

**Where does this shape come from?** It mirrors exactly what `McpProxyService.ts` in the Gateway sends:
```ts
body: JSON.stringify({ tool_name: payload.tool_name, args: payload.args })
```

---

#### Section 3 — Tool Handler Functions

```python
async def _query_inventory(db: asyncpg.Connection, args: dict) -> str:
    sku = args.get("sku")
    ...
    row = await db.fetchrow(
        "SELECT count FROM inventory_table WHERE sku = $1",
        sku,
    )
```

**What it does:** Executes one specific database query for one specific tool.

**Why parameterized queries (`$1`)?**
This is the core security guarantee of the Zero-Trust design. The LLM only outputs JSON arguments (e.g., `"sku": "user-supplied-value"`). That value is passed as a bound parameter, never concatenated into a SQL string. Even if the LLM is compromised and generates a malicious `sku` value, the query structure cannot be altered. This prevents **AI SQL injection**.

**Why prefix with `_`?**
Python convention: single underscore means "internal to this module." These functions are not part of the public API — only the dispatch table uses them.

**To add a new tool:** Write a new `async def _my_tool(db, args)` function. That's it.

---

#### Section 4 — Dispatch Table

```python
_TOOLS: dict = {
    "query_inventory": _query_inventory,
}
```

**What it is:** A plain dictionary mapping `tool_name` strings to handler functions.

**Why a dict and not `if/elif` or a decorator registry?**
Ponytail rule: no abstractions not explicitly requested. A dict lookup is `O(1)`, readable, and easily testable. An `if/elif` chain would work but is harder to extend. A decorator registry would be over-engineering for this scale.

**To register a new tool:** Add one line: `"my_new_tool": _my_new_tool`.

---

#### Section 5 — The Route

```python
@app.post("/execute")
async def execute(req: ExecuteRequest):
    handler = _TOOLS.get(req.tool_name)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Unknown tool: '{req.tool_name}'")
    result = await handler(app.state.db, req.args)
    return {"result": result}
```

**What it does:** The single HTTP entry-point for the entire connector.

1. FastAPI deserializes and validates `req` via `ExecuteRequest` automatically.
2. Looks up the tool handler by name in `_TOOLS`.
3. Returns `404` if the tool doesn't exist (not a security risk — the Gateway's RBAC already blocked unauthorized tools before this point).
4. Calls the handler and wraps the string result in `{ "result": "..." }`.

**Why only one route?**
The Gateway doesn't care about individual tool routes — it always calls `/execute` and passes `tool_name` in the body. This keeps the connector's API surface minimal and consistent regardless of how many tools it contains.

**Why no authentication here?**
This is the Zero-Trust design. The connector is on the internal network (VPC). Only the Gateway can reach it. Authentication is the Gateway's responsibility. Adding auth here would duplicate logic and create two sources of truth for access control.

---

## How to Run Locally

```bash
cd domain-connectors/inventory

# 1. Create isolated virtual environment (never install globally)
python -m venv .venv

# 2. Activate the venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# 3. Install dependencies into the venv
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your real DATABASE_URL

# 5. Start the server
uvicorn main:app --port 8001 --reload
```

**Verify it's running:**
```bash
# Should return 422 (body required — proves the server is up and validating)
curl -X POST http://localhost:8001/execute

# Real call
curl -X POST http://localhost:8001/execute \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "query_inventory", "args": {"sku": "ABC123"}}'
```

---

## How the Gateway Connects to This Connector

In the Gateway's `POST /tools/execute` request body, the AI client sets `target_service` to the connector's URL:

```json
{
  "tool_name": "query_inventory",
  "target_service": "http://localhost:8001",
  "args": { "sku": "ABC123" }
}
```

The Gateway's `McpProxyService` then calls `http://localhost:8001/execute` — which is exactly the route this connector serves.

In Docker Compose (Phase 3), `localhost:8001` becomes the internal service name, e.g., `http://inventory-connector:8001`.
