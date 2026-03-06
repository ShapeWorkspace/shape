import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { buildApiWorkspacePath } from "../../utils/workspace-routes"

interface SubscriptionUrlResponse {
  url: string
}

/**
 * Creates a Stripe Checkout session for workspace billing.
 */
export class CreateWorkspaceCheckoutSession implements UseCaseInterface<string> {
  constructor(private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest) {}

  public async execute(params: {
    workspaceId: string
    seatQuantity: number
    successPath?: string
    cancelPath?: string
  }): Promise<Result<string>> {
    const { workspaceId, seatQuantity, successPath, cancelPath } = params

    try {
      const url = buildApiWorkspacePath(workspaceId, "/subscription/checkout")
      const payload: Record<string, unknown> = { seat_quantity: seatQuantity }

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
      return Result.fail(error instanceof Error ? error.message : "Failed to create checkout session")
    }
  }
}
