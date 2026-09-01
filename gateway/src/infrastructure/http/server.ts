import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import type { ListToolsUseCase } from '../../use-cases/ListToolsUseCase.js';
import type { ExecuteToolUseCase } from '../../use-cases/ExecuteToolUseCase.js';
import { registerMcpRoutes } from '../../interface-adapters/controllers/mcpController.js';

export function buildServer(
  listTools: ListToolsUseCase,
  executeTool: ExecuteToolUseCase,
) {
  const app = Fastify({ logger: true });

  // Register JWT plugin — all routes require a valid token.
  app.register(jwt, { secret: process.env.JWT_SECRET! });

  // Authenticate every request before it reaches a route handler.
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  registerMcpRoutes(app, listTools, executeTool);

  return app;
}
