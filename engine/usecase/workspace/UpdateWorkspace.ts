import { Workspace, type WorkspaceServerDto } from "../../models/workspace"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Updates mutable workspace attributes (e.g., name).
 */
export class UpdateWorkspace implements UseCaseInterface<Workspace> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string; attributes: { name?: string } }): Promise<Result<Workspace>> {
    const { workspaceId, attributes } = params

    try {
      const url = buildApiWorkspacePath(workspaceId)
      const response = await this.executeAuthenticatedRequest.executePut<WorkspaceServerDto>(
        url,
        JSON.stringify(attributes)
      )
      return Result.ok(Workspace.fromServerDto(response))
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to update workspace")
    }
  }
}
