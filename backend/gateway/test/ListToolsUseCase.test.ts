import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ListToolsUseCase } from '../src/use-cases/ListToolsUseCase.js';
import type { IRbacRepository } from '../src/domain/interfaces.js';

const mockRbac: IRbacRepository = {
  verifyToolAccess: async () => true,
  getPermittedTools: async (role) =>
    role === 'admin'
      ? ['query_inventory', 'query_financials']
      : ['query_inventory'],
};

describe('ListToolsUseCase', () => {
  it('returns full tool list for admin role', async () => {
    const uc = new ListToolsUseCase(mockRbac);
    const tools = await uc.execute('admin');
    assert.deepEqual(tools, ['query_inventory', 'query_financials']);
  });

  it('returns limited tool list for viewer role', async () => {
    const uc = new ListToolsUseCase(mockRbac);
    const tools = await uc.execute('viewer');
    assert.deepEqual(tools, ['query_inventory']);
  });

  it('returns empty array for unknown role', async () => {
    const emptyRbac: IRbacRepository = {
      verifyToolAccess: async () => false,
      getPermittedTools: async () => [],
    };
    const uc = new ListToolsUseCase(emptyRbac);
    const tools = await uc.execute('unknown-role');
    assert.deepEqual(tools, []);
  });
});
