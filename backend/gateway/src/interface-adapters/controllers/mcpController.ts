import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ToolExecutionPayloadSchema } from '../../domain/entities.js';
import type { ListToolsUseCase } from '../../use-cases/ListToolsUseCase.js';
import type { ExecuteToolUseCase } from '../../use-cases/ExecuteToolUseCase.js';
import type { GetAuditLogsUseCase } from '../../use-cases/GetAuditLogsUseCase.js';
import type { GetRbacUsersUseCase } from '../../use-cases/GetRbacUsersUseCase.js';

export function registerMcpRoutes(
  app: FastifyInstance,
  listTools: ListToolsUseCase,
  executeTool: ExecuteToolUseCase,
  getAuditLogs: GetAuditLogsUseCase,
  getRbacUsers: GetRbacUsersUseCase,
): void {
  // GET /tools — returns the filtered tool menu for the caller's role.
  app.get('/tools', async (request: FastifyRequest, reply: FastifyReply) => {
    const tools = await listTools.execute(request.user.role);
    return reply.send({ tools });
  });

  // POST /tools/execute — validates body, enforces RBAC, audits, proxies.
  app.post('/tools/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ToolExecutionPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const result = await executeTool.execute(request.user.userId, request.user.role, parsed.data);
    return reply.send({ result });
  });

  app.get('/audit-log', async (request: FastifyRequest, reply: FastifyReply) => {
    const logs = await getAuditLogs.execute();
    return reply.send({ logs });
  });

  app.get('/rbac/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const users = await getRbacUsers.execute();
    return reply.send({ users });
  });
}
