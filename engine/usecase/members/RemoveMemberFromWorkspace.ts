import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Removes a workspace member by user ID.
 */
export class RemoveMemberFromWorkspace implements UseCaseInterface<void> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string; userId: string }): Promise<Result<void>> {
    const { workspaceId, userId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, `/members/${userId}`)
      await this.executeAuthenticatedRequest.executeDelete(url)
      return Result.ok()
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to remove workspace member")
    }
  }
}
