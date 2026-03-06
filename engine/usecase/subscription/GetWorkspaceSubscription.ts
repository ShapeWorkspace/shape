import { WorkspaceSubscription, type WorkspaceSubscriptionServerDto } from "../../models/workspace-subscription"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Retrieves the current workspace subscription, if any.
 */
export class GetWorkspaceSubscription implements UseCaseInterface<WorkspaceSubscription | null> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<WorkspaceSubscription | null>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/subscription")
      const response = await this.executeAuthenticatedRequest.executeGet<WorkspaceSubscriptionServerDto | null>(
        url
      )
      if (!response) {
        return Result.ok(null)
      }
      return Result.ok(WorkspaceSubscription.fromServerDto(response))
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to load workspace subscription")
    }
  }
}
