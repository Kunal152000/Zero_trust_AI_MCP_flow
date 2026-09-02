// Global JWT payload type — imported by tsconfig so all files see it.
// Augments @fastify/jwt so request.user is typed as { userId, role } everywhere.
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { userId: string; role: string };
  }
}
