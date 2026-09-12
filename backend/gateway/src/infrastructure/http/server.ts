import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import pg from 'pg';
import type { ListToolsUseCase } from '../../use-cases/ListToolsUseCase.js';
import type { ExecuteToolUseCase } from '../../use-cases/ExecuteToolUseCase.js';
import type { GetAuditLogsUseCase } from '../../use-cases/GetAuditLogsUseCase.js';
import type { GetRbacUsersUseCase } from '../../use-cases/GetRbacUsersUseCase.js';
import { registerMcpRoutes } from '../../interface-adapters/controllers/mcpController.js';
import { registerAuthRoutes } from '../../interface-adapters/controllers/authController.js';

const { Pool } = pg;

export function buildServer(
  listTools: ListToolsUseCase,
  executeTool: ExecuteToolUseCase,
  getAuditLogs: GetAuditLogsUseCase,
  getRbacUsers: GetRbacUsersUseCase,
) {
  const app = Fastify({ logger: true });

  // Enable Cross-Origin Resource Sharing (CORS) for the frontend
  app.register(cors, {
    origin: true, // During dev, accept all origins (or you can lock it to localhost)
    credentials: true, // Essential for allowing the frontend to receive/send the HttpOnly cookie
  });

  // Required for reading/setting the HttpOnly refresh_token cookie.
  app.register(cookie);

  // Register JWT plugin — used for signing + verifying access tokens.
  app.register(jwt, { secret: process.env.JWT_SECRET! });

  // Authenticate every request EXCEPT /auth/* routes (login/signup are public).
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith('/auth')) return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  registerMcpRoutes(app, listTools, executeTool, getAuditLogs, getRbacUsers);
  registerAuthRoutes(app, pool);

  return app;
}
