import type { ToolExecutionPayload } from '../domain/entities.js';
import type { IRbacRepository, IAuditRepository, IMcpProxyService } from '../domain/interfaces.js';

export class ExecuteToolUseCase {
  constructor(
    private readonly rbac: IRbacRepository,
    private readonly audit: IAuditRepository,
    private readonly proxy: IMcpProxyService,
  ) {}

  async execute(userId: string, role: string, payload: ToolExecutionPayload): Promise<unknown> {
    // 1. Enforce RBAC — fail fast before any IO.
    const hasAccess = await this.rbac.verifyToolAccess(userId, payload.tool_name);
    if (!hasAccess) {
      throw Object.assign(new Error('Forbidden: privilege escalation attempt detected'), { statusCode: 403 });
    }

    // 2. Write immutable audit log — fire-and-forget; never block the response path on logging.
    // ponytail: if audit DB is down, the proxy still succeeds. Upgrade path: add a dead-letter queue.
    this.audit.logEvent({ userId, tool: payload.tool_name, timestamp: new Date().toISOString() }).catch(
      (err: unknown) => console.error('[audit] failed to write log:', err),
    );

    // 3. Proxy validated JSON args to the internal Python domain server.
    return this.proxy.forwardRequest(payload.target_service, payload);
  }
}
