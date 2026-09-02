"""
Inventory Domain Connector
--------------------------
Internal FastAPI server. Receives validated JSON tool calls from the Node.js
Gateway and executes parameterized SQL against the inventory database.

The Gateway POSTs to   POST /execute
with body:             { "tool_name": "query_inventory", "args": { "sku": "ABC" } }

No authentication is done here — that is the Gateway's job (Zero-Trust boundary).
"""

import os
import asyncpg
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


# ---------------------------------------------------------------------------
# Lifespan: open one DB connection on startup, close on shutdown.
# asyncpg.connect() is a single connection — fine for a single-purpose
# connector. Upgrade to asyncpg.create_pool() if concurrency becomes an issue.
# ponytail: single connection; ceiling is ~100 rps before pool is needed.
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    app.state.db = await asyncpg.connect(db_url)
    yield
    await app.state.db.close()


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------------------
# Request schema — mirrors what McpProxyService sends from the Gateway.
# ---------------------------------------------------------------------------
class ExecuteRequest(BaseModel):
    tool_name: str
    args: dict


# ---------------------------------------------------------------------------
# Tool handlers — one function per tool. Args are extracted by name;
# SQL is always parameterized ($1, $2 ...) — no string interpolation ever.
# ---------------------------------------------------------------------------
async def _query_inventory(db: asyncpg.Connection, args: dict) -> str:
    sku = args.get("sku")
    if not sku or not isinstance(sku, str):
        raise HTTPException(status_code=400, detail="Missing or invalid arg: 'sku' (string required)")

    # Parameterized query — AI-generated args can never mutate SQL structure.
    row = await db.fetchrow(
        "SELECT count FROM inventory_table WHERE sku = $1",
        sku,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"SKU '{sku}' not found in inventory")

    return f"Inventory for {sku}: {row['count']} items."


# Dispatch table — add new tools here without touching the route handler.
# ponytail: plain dict lookup; no plugin/registry abstraction needed at this scale.
_TOOLS: dict = {
    "query_inventory": _query_inventory,
}


# ---------------------------------------------------------------------------
# Single entry-point route — the Gateway always calls POST /execute.
# ---------------------------------------------------------------------------
@app.post("/execute")
async def execute(req: ExecuteRequest):
    handler = _TOOLS.get(req.tool_name)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"Unknown tool: '{req.tool_name}'")

    result = await handler(app.state.db, req.args)
    return {"result": result}
