import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface SubscriptionUrlResponse {
  url: string
}

/**
 * Activates a workspace by creating a Stripe Checkout session.
 * The server returns a redirect URL to complete activation.
 */
export class ActivateWorkspace implements UseCaseInterface<string> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    emails: string[]
    successPath?: string
    cancelPath?: string
  }): Promise<Result<string>> {
    const { workspaceId, emails, successPath, cancelPath } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/activate")
      const payload: Record<string, unknown> = { emails }

      if (successPath) {
        payload.success_path = successPath
      }

      if (cancelPath) {
        payload.cancel_path = cancelPath
      }

      const response = await this.executeAuthenticatedRequest.executePost<SubscriptionUrlResponse>(
        url,
        JSON.stringify(payload)
      )
      return Result.ok(response.url)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to activate workspace")
    }
  }
}
