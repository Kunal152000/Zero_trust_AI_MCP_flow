import type { IRbacRepository } from '../domain/interfaces.js';

export class ListToolsUseCase {
  constructor(private readonly rbac: IRbacRepository) {}

  async execute(role: string): Promise<string[]> {
    return this.rbac.getPermittedTools(role);
  }
}
