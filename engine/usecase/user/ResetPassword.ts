import { buildAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { GeneratePasswordUpdateCryptoFieldsFromKeyBundle } from "./GeneratePasswordUpdateCryptoFieldsFromKeyBundle"

/**
 * Requests KDF parameters for the given email address.
 * Used for login and password change flows to derive server_password.
 */
export class ResetPassword implements UseCaseInterface<void> {
  constructor(
    private readonly generatePasswordUpdateCryptoFieldsFromKeyBundle: GeneratePasswordUpdateCryptoFieldsFromKeyBundle,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore
  ) {}

  public async execute(params: {
    userId: string
    tokenId: string
    token: string
    newPassword: string
    apiUrl: string
  }): Promise<Result<void>> {
    const { userId, tokenId, token, newPassword, apiUrl } = params

    const trimmedUserId = userId.trim()
    const trimmed = newPassword.trim()

    if (!trimmedUserId || !tokenId || !token || !trimmed) {
      return Result.fail("Missing required fields")
    }
    if (trimmed.length < 6) {
      return Result.fail("Password must be at least 6 characters")
    }

    const user = this.usersStore.getUserByUuid(trimmedUserId)
    if (!user) {
      return Result.fail("User not found for password reset")
    }

    const accountStore = this.accountStoreContainer.getAccountStore(trimmedUserId)
    if (!accountStore) {
      return Result.fail("Account store not found for password reset")
    }

    const keyBundle = accountStore.getKeyBundle()
    if (!keyBundle) {
      return Result.fail("Key bundle not available for password reset")
    }

    // Re-encrypt the identity key bundle with the NEW password.
    // This keeps identity keys stable while rotating the password-derived wrapper.
    const passwordUpdateResult = await this.generatePasswordUpdateCryptoFieldsFromKeyBundle.execute(
      user.email,
      trimmed,
      keyBundle
    )

    const httpClient = new HttpClient(apiUrl)

    await httpClient.post(
      "/auth/reset-password",
      JSON.stringify({
        token_id: tokenId,
        token,
        server_password: passwordUpdateResult.serverPassword,
        crypto_fields: passwordUpdateResult.cryptoFields,
      }),
      buildAPIHeaders()
    )

    // Keep the plaintext bundle in sync with the server's latest bundle metadata.
    await accountStore.setKeyBundle(passwordUpdateResult.updatedKeyBundle)

    return Result.ok(undefined)
  }
}
