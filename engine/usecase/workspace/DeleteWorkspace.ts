import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Deletes a workspace from the server.
 */
export class DeleteWorkspace implements UseCaseInterface<void> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<void>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId)
      await this.executeAuthenticatedRequest.executeDelete(url)
      return Result.ok()
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to delete workspace")
    }
  }
}
