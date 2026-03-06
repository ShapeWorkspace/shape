import { buildAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

export class RequestPasswordReset implements UseCaseInterface<{ tokenId: string; token: string }> {
  public async execute(apiUrl: string, email: string): Promise<Result<{ tokenId: string; token: string }>> {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return Result.fail("Email cannot be empty")
    }

    const httpClient = new HttpClient(apiUrl)

    type ForgotPasswordResponse = { message: string; token_id?: string; token?: string }

    const response = await httpClient.post<ForgotPasswordResponse>(
      "/auth/forgot-password",
      JSON.stringify({ email: normalizedEmail }),
      buildAPIHeaders()
    )

    // Tokens are returned only in development mode to faciliate testing
    if (response && response.token_id && response.token) {
      return Result.ok({ tokenId: response.token_id, token: response.token })
    }
    return Result.fail("Failed to request password reset")
  }
}
