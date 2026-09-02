-- MCP Gateway: Database Initialisation Script
-- Runs automatically on first postgres container startup via /docker-entrypoint-initdb.d/
-- All tables use IF NOT EXISTS so re-runs are safe.

-- ── Anchor ────────────────────────────────────────────────────────────────
-- roles is the single source of truth for every role name.
-- Both permission tables reference it via FK so orphaned role names are impossible.
CREATE TABLE IF NOT EXISTS roles (
  role_name TEXT PRIMARY KEY
);

-- ── RBAC ──────────────────────────────────────────────────────────────────
-- Which tools each role can call.
-- ON DELETE CASCADE: removing a role automatically removes its tool grants.
CREATE TABLE IF NOT EXISTS tool_permissions (
  role_name TEXT NOT NULL REFERENCES roles(role_name) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  PRIMARY KEY (role_name, tool_name)
);

-- Which role each user is assigned to.
-- ON DELETE CASCADE: removing a role automatically removes user assignments.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id   TEXT NOT NULL,
  role_name TEXT NOT NULL REFERENCES roles(role_name) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_name)
);

-- ── Audit trail ───────────────────────────────────────────────────────────
-- Append-only, NO foreign keys by design.
-- Audit records must survive role/user deletion to maintain the immutable SOC2 log.
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL    PRIMARY KEY,
  user_id   TEXT         NOT NULL,
  tool_name TEXT         NOT NULL,
  timestamp TIMESTAMPTZ  NOT NULL
);

-- ── Seed data ─────────────────────────────────────────────────────────────
-- Insert roles first (FK anchor), then permission tables.
-- ON CONFLICT DO NOTHING makes this idempotent.
INSERT INTO roles (role_name) VALUES
  ('admin'),
  ('viewer')
ON CONFLICT DO NOTHING;

INSERT INTO tool_permissions (role_name, tool_name) VALUES
  ('admin',  'query_inventory'),
  ('viewer', 'query_inventory')
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_name) VALUES
  ('test-user-1', 'admin'),
  ('test-user-2', 'viewer')
ON CONFLICT DO NOTHING;
