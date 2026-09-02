import type { IRbacRepository } from '../domain/interfaces.js';

export class GetRbacUsersUseCase {
  constructor(private readonly rbacRepository: IRbacRepository) {}

  async execute() {
    return this.rbacRepository.getAllUserRoles();
  }
}
