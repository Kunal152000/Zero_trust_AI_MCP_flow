// Must be set before buildServer() is called so Fastify's JWT plugin gets the secret.
import process from 'node:process';
process.env.JWT_SECRET = 'test-secret';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/infrastructure/http/server.js';
import { ListToolsUseCase } from '../src/use-cases/ListToolsUseCase.js';
import { ExecuteToolUseCase } from '../src/use-cases/ExecuteToolUseCase.js';
import { GetAuditLogsUseCase } from '../src/use-cases/GetAuditLogsUseCase.js';
import { GetRbacUsersUseCase } from '../src/use-cases/GetRbacUsersUseCase.js';
import type { IRbacRepository, IAuditRepository, IMcpProxyService } from '../src/domain/interfaces.js';

// ── Mock repos ───────────────────────────────────────────────────────────────
// user-1 can call query_inventory; all other tool names are denied.
const rbac: IRbacRepository = {
  verifyToolAccess: async (userId, toolName) =>
    userId === 'user-1' && toolName === 'query_inventory',
  getPermittedTools: async () => ['query_inventory'],
  getAllUserRoles: async () => [],
};
const audit: IAuditRepository = { logEvent: async () => {}, getLogs: async () => [] };
const proxy: IMcpProxyService = { forwardRequest: async () => ({ data: 'ok' }) };

const listTools  = new ListToolsUseCase(rbac);
const executeTool = new ExecuteToolUseCase(rbac, audit, proxy);
const getAuditLogs = new GetAuditLogsUseCase(audit);
const getRbacUsers = new GetRbacUsersUseCase(rbac);

// ── Server setup ─────────────────────────────────────────────────────────────
describe('MCP Gateway — HTTP routes', () => {
  const app = buildServer(listTools, executeTool, getAuditLogs, getRbacUsers);
  let token: string;

  before(async () => {
    await app.ready();
    // Sign a JWT using the same app instance so the secret always matches.
    token = app.jwt.sign({ userId: 'user-1', role: 'admin' });
  });

  after(async () => {
    await app.close();
  });

  // ── GET /tools ─────────────────────────────────────────────────────────────
  describe('GET /tools', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/tools' });
      assert.equal(res.statusCode, 401);
    });

    it('returns 200 and tool list with valid JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/tools',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(JSON.parse(res.body), { tools: ['query_inventory'] });
    });
  });

  // ── POST /tools/execute ────────────────────────────────────────────────────
  describe('POST /tools/execute', () => {
    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'POST', url: '/tools/execute', payload: {} });
      assert.equal(res.statusCode, 401);
    });

    it('returns 400 for malformed payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tools/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: { wrong_field: true },
      });
      assert.equal(res.statusCode, 400);
    });

    it('returns 403 when tool is not permitted', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tools/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tool_name:      'forbidden_tool',
          target_service: 'http://inventory:8001',
          args:           {},
        },
      });
      assert.equal(res.statusCode, 403);
    });

    it('returns 200 for a valid authorised request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tools/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          tool_name:      'query_inventory',
          target_service: 'http://inventory:8001',
          args:           { sku: 'ABC123' },
        },
      });
      assert.equal(res.statusCode, 200);
      assert.ok('result' in JSON.parse(res.body));
    });
  });
});
