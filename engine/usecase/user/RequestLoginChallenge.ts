import { LoginChallengeResponse } from "../../models/auth-types"
import { buildAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"

/**
 * Requests KDF parameters for the given email address.
 * Used for login and password change flows to derive server_password.
 */
export class RequestLoginChallenge implements UseCaseInterface<LoginChallengeResponse> {
  public async execute(apiUrl: string, email: string): Promise<Result<LoginChallengeResponse>> {
    const normalizedEmail = email.toLowerCase().trim()
    if (!normalizedEmail) {
      return Result.fail("Email cannot be empty")
    }

    const httpClient = new HttpClient(apiUrl)

    const challengeResponse = await httpClient.post<LoginChallengeResponse>(
      "/auth/login-challenge",
      JSON.stringify({ email: normalizedEmail }),
      buildAPIHeaders()
    )

    if (!challengeResponse?.pw_salt) {
      return Result.fail("Invalid challenge response from server")
    }

    return Result.ok(challengeResponse)
  }
}
