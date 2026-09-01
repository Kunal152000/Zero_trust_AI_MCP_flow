import type { Pool } from 'pg';
import type { IRbacRepository } from '../../domain/interfaces.js';

export class RbacRepository implements IRbacRepository {
  constructor(private readonly db: Pool) {}

  async verifyToolAccess(userId: string, toolName: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM tool_permissions tp
         JOIN user_roles ur ON ur.role_name = tp.role_name
         WHERE ur.user_id = $1 AND tp.tool_name = $2
       ) AS "exists"`,
      [userId, toolName],
    );
    return result.rows[0]?.exists ?? false;
  }

  async getPermittedTools(role: string): Promise<string[]> {
    const result = await this.db.query<{ tool_name: string }>(
      'SELECT tool_name FROM tool_permissions WHERE role_name = $1',
      [role],
    );
    return result.rows.map((r) => r.tool_name);
  }
}
