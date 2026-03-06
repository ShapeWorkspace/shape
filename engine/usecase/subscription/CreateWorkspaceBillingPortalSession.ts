import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface SubscriptionUrlResponse {
  url: string
}

/**
 * Creates a Stripe billing portal session for a workspace.
 */
export class CreateWorkspaceBillingPortalSession implements UseCaseInterface<string> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    returnPath?: string
    seatManagementOnly?: boolean
  }): Promise<Result<string>> {
    const { workspaceId, returnPath, seatManagementOnly = true } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/subscription/portal")
      const payload = JSON.stringify({
        ...(returnPath ? { return_path: returnPath } : {}),
        seat_management_only: seatManagementOnly,
      })
      const response = await this.executeAuthenticatedRequest.executePost<SubscriptionUrlResponse>(url, payload)
      return Result.ok(response.url)
    } catch (error) {
      return Result.fail(error instanceof Error ? error.message : "Failed to create billing portal session")
    }
  }
}
