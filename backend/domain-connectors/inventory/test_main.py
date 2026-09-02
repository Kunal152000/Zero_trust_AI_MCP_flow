"""
Tests for the Inventory Domain Connector.

The lifespan connects to a real DB on startup. We mock asyncpg.connect so the
app starts without any real Postgres, letting us test all route logic in isolation.

Run:
    cd domain-connectors/inventory
    .venv\\Scripts\\activate          # Windows
    pip install -r requirements-dev.txt
    pytest test_main.py -v
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app


# ── Fixture ──────────────────────────────────────────────────────────────────
@pytest.fixture
def mock_db():
    """A fresh mock asyncpg connection for each test."""
    conn = MagicMock()
    conn.close   = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)  # default: row not found
    return conn


@pytest.fixture
def client(mock_db, monkeypatch):
    """
    TestClient that triggers the full lifespan (startup + shutdown).
    asyncpg.connect is patched so no real DB is needed.
    """
    monkeypatch.setenv("DATABASE_URL", "postgresql://test/test")
    with patch("main.asyncpg.connect", new=AsyncMock(return_value=mock_db)):
        with TestClient(app) as c:
            yield c


# ── /execute route tests ──────────────────────────────────────────────────────
def test_missing_body_returns_422(client):
    """No body at all → Pydantic validation error."""
    resp = client.post("/execute")
    assert resp.status_code == 422


def test_unknown_tool_returns_404(client):
    resp = client.post("/execute", json={"tool_name": "nonexistent", "args": {}})
    assert resp.status_code == 404
    assert "nonexistent" in resp.json()["detail"]


def test_query_inventory_missing_sku_returns_400(client):
    resp = client.post("/execute", json={"tool_name": "query_inventory", "args": {}})
    assert resp.status_code == 400
    assert "sku" in resp.json()["detail"]


def test_query_inventory_sku_not_found_returns_404(client, mock_db):
    mock_db.fetchrow.return_value = None  # DB row not found
    resp = client.post(
        "/execute",
        json={"tool_name": "query_inventory", "args": {"sku": "MISSING-SKU"}},
    )
    assert resp.status_code == 404
    assert "MISSING-SKU" in resp.json()["detail"]


def test_query_inventory_success(client, mock_db):
    mock_db.fetchrow.return_value = {"count": 42}
    resp = client.post(
        "/execute",
        json={"tool_name": "query_inventory", "args": {"sku": "ABC123"}},
    )
    assert resp.status_code == 200
    assert resp.json() == {"result": "Inventory for ABC123: 42 items."}


def test_query_inventory_rejects_non_string_sku(client):
    """Guard against type confusion — sku must be a string."""
    resp = client.post(
        "/execute",
        json={"tool_name": "query_inventory", "args": {"sku": 12345}},
    )
    assert resp.status_code == 400
