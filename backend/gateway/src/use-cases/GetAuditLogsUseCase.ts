import type { IAuditRepository } from '../domain/interfaces.js';

export class GetAuditLogsUseCase {
  constructor(private readonly auditRepository: IAuditRepository) {}

  async execute() {
    return this.auditRepository.getLogs();
  }
}
