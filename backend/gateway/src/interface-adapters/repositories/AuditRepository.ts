import type { Pool } from 'pg';
import type { IAuditRepository } from '../../domain/interfaces.js';
import type { AuditEvent } from '../../domain/entities.js';

export class AuditRepository implements IAuditRepository {
  constructor(private readonly db: Pool) {}

  async logEvent(event: AuditEvent): Promise<void> {
    await this.db.query(
      'INSERT INTO audit_log (user_id, tool_name, timestamp) VALUES ($1, $2, $3)',
      [event.userId, event.tool, event.timestamp],
    );
  }

  async getLogs(): Promise<AuditEvent[]> {
    const query = `
      SELECT id, user_id as "userId", tool_name as "tool", timestamp
      FROM audit_log
      ORDER BY timestamp DESC
      LIMIT 100
    `;
    const result = await this.db.query<AuditEvent & { id: string }>(query);
    return result.rows;
  }
}
