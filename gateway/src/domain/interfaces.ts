import type { AuditEvent, ToolExecutionPayload } from './entities.js';

// Pure contracts — no implementation details leak into the domain.

export interface IRbacRepository {
  verifyToolAccess(userId: string, toolName: string): Promise<boolean>;
  getPermittedTools(role: string): Promise<string[]>;
}

export interface IAuditRepository {
  logEvent(event: AuditEvent): Promise<void>;
}

export interface IMcpProxyService {
  forwardRequest(targetService: string, payload: ToolExecutionPayload): Promise<unknown>;
}
