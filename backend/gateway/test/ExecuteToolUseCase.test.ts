import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExecuteToolUseCase } from '../src/use-cases/ExecuteToolUseCase.js';
import type { IRbacRepository, IAuditRepository, IMcpProxyService } from '../src/domain/interfaces.js';
import type { ToolExecutionPayload } from '../src/domain/entities.js';

// ── In-memory mock implementations ──────────────────────────────────────────
const allowAll: IRbacRepository = {
  verifyToolAccess: async () => true,
  getPermittedTools: async () => ['query_inventory'],
};

const denyAll: IRbacRepository = {
  verifyToolAccess: async () => false,
  getPermittedTools: async () => [],
};

const noopAudit: IAuditRepository = {
  logEvent: async () => {},
};

const mockProxy: IMcpProxyService = {
  forwardRequest: async () => ({ result: 'mock-data' }),
};

const payload: ToolExecutionPayload = {
  tool_name: 'query_inventory',
  target_service: 'http://inventory:8001',
  args: { sku: 'ABC123' },
};

// ── Tests ────────────────────────────────────────────────────────────────────
describe('ExecuteToolUseCase', () => {
  it('throws 403 when RBAC denies access', async () => {
    const uc = new ExecuteToolUseCase(denyAll, noopAudit, mockProxy);

    await assert.rejects(
      () => uc.execute('user-1', 'viewer', payload),
      (err: unknown) => {
        assert(err instanceof Error);
        assert.equal((err as NodeJS.ErrnoException & { statusCode?: number }).statusCode, 403);
        return true;
      },
    );
  });

  it('returns proxy result when access is granted', async () => {
    const uc = new ExecuteToolUseCase(allowAll, noopAudit, mockProxy);
    const result = await uc.execute('user-1', 'admin', payload);
    assert.deepEqual(result, { result: 'mock-data' });
  });

  it('still succeeds when audit log throws (fire-and-forget guarantee)', async () => {
    const failAudit: IAuditRepository = {
      logEvent: async () => { throw new Error('audit DB is down'); },
    };
    const uc = new ExecuteToolUseCase(allowAll, failAudit, mockProxy);

    // Must not throw — the audit failure is swallowed on purpose
    const result = await uc.execute('user-1', 'admin', payload);
    assert.deepEqual(result, { result: 'mock-data' });
  });
});
