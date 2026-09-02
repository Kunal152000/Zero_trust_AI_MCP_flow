import 'dotenv/config';
import { pool } from './infrastructure/db/pool.js';
import { McpProxyService } from './infrastructure/mcp/proxyService.js';
import { RbacRepository } from './interface-adapters/repositories/RbacRepository.js';
import { AuditRepository } from './interface-adapters/repositories/AuditRepository.js';
import { ListToolsUseCase } from './use-cases/ListToolsUseCase.js';
import { ExecuteToolUseCase } from './use-cases/ExecuteToolUseCase.js';
import { GetAuditLogsUseCase } from './use-cases/GetAuditLogsUseCase.js';
import { GetRbacUsersUseCase } from './use-cases/GetRbacUsersUseCase.js';
import { buildServer } from './infrastructure/http/server.js';

// Manual DI — wire everything here. No container needed.
const rbacRepo = new RbacRepository(pool);
const auditRepo = new AuditRepository(pool);
const proxyService = new McpProxyService();

const listTools = new ListToolsUseCase(rbacRepo);
const executeTool = new ExecuteToolUseCase(rbacRepo, auditRepo, proxyService);
const getAuditLogs = new GetAuditLogsUseCase(auditRepo);
const getRbacUsers = new GetRbacUsersUseCase(rbacRepo);

const app = buildServer(listTools, executeTool, getAuditLogs, getRbacUsers);

const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
