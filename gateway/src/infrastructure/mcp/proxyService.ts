import type { IMcpProxyService } from '../../domain/interfaces.js';
import type { ToolExecutionPayload } from '../../domain/entities.js';

export class McpProxyService implements IMcpProxyService {
  // Uses Node 18+ native fetch — no extra HTTP client lib needed.
  async forwardRequest(targetService: string, payload: ToolExecutionPayload): Promise<unknown> {
    const response = await fetch(`${targetService}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_name: payload.tool_name, args: payload.args }),
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`Domain server error: ${response.status} ${response.statusText}`),
        { statusCode: 502 },
      );
    }

    return response.json();
  }
}
