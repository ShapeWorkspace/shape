import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { DeriveLoginKeysFromPasswordAndChallenge } from "./DeriveLoginKeysFromPasswordAndChallenge"
import { GeneratePasswordUpdateCryptoFieldsFromKeyBundle } from "./GeneratePasswordUpdateCryptoFieldsFromKeyBundle"
import { RequestLoginChallenge } from "./RequestLoginChallenge"

export class ChangePassword implements UseCaseInterface<void> {
  constructor(
    private readonly deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge,
    private readonly generatePasswordUpdateCryptoFieldsFromKeyBundle: GeneratePasswordUpdateCryptoFieldsFromKeyBundle,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore,
    private readonly requestLoginChallenge: RequestLoginChallenge
  ) {}

  public async execute(userId: string, currentPassword: string, newPassword: string): Promise<Result<void>> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return Result.fail("User ID is required")
    }

    const trimmedCurrent = currentPassword.trim()
    const trimmedNew = newPassword.trim()

    // Mirror the server-side validations locally so the user receives immediate feedback.
    if (!trimmedCurrent) {
      return Result.fail("Current password cannot be empty")
    }
    if (!trimmedNew) {
      return Result.fail("New password cannot be empty")
    }
    if (trimmedNew.length < 6) {
      return Result.fail("Password must be at least 6 characters")
    }
    if (trimmedCurrent === trimmedNew) {
      return Result.fail("New password must differ from current password")
    }

    const user = this.usersStore.getUserByUuid(trimmedUserId)
    if (!user) {
      return Result.fail("User not found")
    }

    const accountStore = this.accountStoreContainer.getAccountStore(trimmedUserId)
    if (!accountStore) {
      return Result.fail("Account store not found for password change")
    }

    const keyBundle = accountStore.getKeyBundle()
    if (!keyBundle) {
      return Result.fail("Key bundle not available for password change")
    }

    const httpClient = accountStore.getHttpClient()

    // Derive the server_password for the CURRENT password using server-provided salt.
    const challengeResponseResult = await this.requestLoginChallenge.execute(
      httpClient.getBaseUrl(),
      user.email
    )
    if (challengeResponseResult.isFailed()) {
      return Result.fail(challengeResponseResult.getError())
    }
    const challengeResponse = challengeResponseResult.getValue()
    const derivedCurrentKeys = this.deriveLoginKeysFromPasswordAndChallenge.execute(
      trimmedCurrent,
      challengeResponse
    )
    // Build new crypto fields that re-wrap the existing identity keys with the NEW password.
    const passwordUpdateResult = await this.generatePasswordUpdateCryptoFieldsFromKeyBundle.execute(
      user.email,
      trimmedNew,
      keyBundle
    )

    const appToken = accountStore.getAppToken()
    const headers = buildAuthenticatedAPIHeaders(trimmedUserId, appToken ?? undefined)

    try {
      await httpClient.post(
        "/auth/change-password",
        JSON.stringify({
          current_password: derivedCurrentKeys.serverPassword,
          new_password: passwordUpdateResult.serverPassword,
          crypto_fields: passwordUpdateResult.cryptoFields,
        }),
        headers
      )

      // Keep the plaintext bundle in sync with the server's latest bundle metadata.
      await accountStore.setKeyBundle(passwordUpdateResult.updatedKeyBundle)

      return Result.ok(undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(message)
    }
  }
}
