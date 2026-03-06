import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

/**
 * Marks workspace onboarding as completed on the server.
 * This is a side-effect call that only returns a success/failure result.
 */
export class CompleteWorkspaceOnboarding implements UseCaseInterface<void> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: { workspaceId: string }): Promise<Result<void>> {
    const { workspaceId } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/onboarding/complete")
      await this.executeAuthenticatedRequest.executePost<{ onboarding_completed: boolean }>(
        url,
        JSON.stringify({})
      )
      return Result.ok()
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to complete workspace onboarding")
    }
  }
}
