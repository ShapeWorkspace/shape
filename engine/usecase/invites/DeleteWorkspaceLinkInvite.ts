import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Deletes (revokes) a workspace link invite.
 */
export class DeleteWorkspaceLinkInvite implements UseCaseInterface<void> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string; inviteId: string }): Promise<Result<void>> {
    const { workspaceId, inviteId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, `/link-invites/${inviteId}`)
      await this.executeAuthenticatedRequest.executeDelete(url)
      return Result.ok()
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to delete link invite")
    }
  }
}
