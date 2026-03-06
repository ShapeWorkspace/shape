import { Workspace, type WorkspaceServerDto } from "../../models/workspace"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Fetches all workspaces that the current user is a member of.
 */
export class GetWorkspacesWithMembership implements UseCaseInterface<Workspace[]> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(): Promise<Result<Workspace[]>> {
    try {
      const response = await this.executeAuthenticatedRequest.executeGet<WorkspaceServerDto[]>("/workspaces")
      const workspaces = response.map(workspace => Workspace.fromServerDto(workspace))
      return Result.ok(workspaces)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to fetch workspaces")
    }
  }
}
