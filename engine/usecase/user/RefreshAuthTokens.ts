import { AccountStore } from "../../store/account-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { logger } from "../../utils/logger"

/**
 * Refreshes app auth tokens for a user session.
 *
 * This use case:
 * 1. Reads the current refresh token from AccountStore
 * 2. Sends a refresh request to the server
 * 3. On success, persists new tokens to AccountStore
 * 4. On auth failure (400/401), clears tokens from AccountStore
 *
 * Returns true if new tokens were obtained and persisted.
 */
export class RefreshAuthTokens implements UseCaseInterface<boolean> {
  constructor(private readonly accountStore: AccountStore) {}

  async execute(): Promise<Result<boolean>> {
    const refreshToken = this.accountStore.getRefreshToken()
    if (!refreshToken) {
      return Result.ok(false)
    }

    const userId = this.accountStore.getUserId()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Type": "tauri",
      "X-Active-Account-ID": userId,
    }

    try {
      // Use rawFetch so we can handle invalid refresh tokens and persist updates explicitly.
      const response = await this.accountStore.getHttpClient().rawFetch("/auth/refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: "omit",
      })

      if (!response.ok) {
        if (response.status === 400 || response.status === 401) {
          // Refresh token is invalid/expired - clear tokens.
          await this.accountStore.clearTokens()
        }
        return Result.ok(false)
      }

      const payload = (await response.json()) as { app_token?: string; refresh_token?: string }
      if (!payload?.app_token || !payload?.refresh_token) {
        return Result.ok(false)
      }

      await this.accountStore.setAppToken(payload.app_token)
      await this.accountStore.setRefreshToken(payload.refresh_token)
      return Result.ok(true)
    } catch (error) {
      logger.error("Failed to refresh app auth tokens:", error)
      return Result.ok(false)
    }
  }
}
