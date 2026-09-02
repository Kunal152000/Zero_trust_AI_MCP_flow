import { z } from 'zod';

// Core Zod schemas — single source of truth for types and runtime validation.

export const UserIdentitySchema = z.object({
  userId: z.string(),
  role: z.string(),
});

export const ToolExecutionPayloadSchema = z.object({
  tool_name: z.string(),
  target_service: z.string().url(),
  args: z.record(z.unknown()),
});

export const AuditEventSchema = z.object({
  userId: z.string(),
  tool: z.string(),
  timestamp: z.string().datetime(),
});

// Inferred TypeScript types — no duplication needed.
export type UserIdentity = z.infer<typeof UserIdentitySchema>;
export type ToolExecutionPayload = z.infer<typeof ToolExecutionPayloadSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
