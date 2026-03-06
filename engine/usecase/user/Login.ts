import { AuthResponseWithCrypto, IdentityKeys, KeyBundle } from "../../models/auth-types"
import { ClientUser } from "../../models/client_user"
import { buildAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { BuildIdentityKeysFromKeyBundle } from "./BuildIdentityKeysFromKeyBundle"
import { DecryptKeyBundleToPlaintextBundle } from "../invites/DecryptKeyBundleToPlaintextBundle"
import { DeriveLoginKeysFromPasswordAndChallenge } from "./DeriveLoginKeysFromPasswordAndChallenge"
import { RequestLoginChallenge } from "./RequestLoginChallenge"

/**
 * Requests KDF parameters for the given email address.
 * Used for login and password change flows to derive server_password.
 */
export class Login implements UseCaseInterface<ClientUser> {
  constructor(
    private readonly requestLoginChallenge: RequestLoginChallenge,
    private readonly deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge,
    private readonly decryptKeyBundleToPlaintextBundle: DecryptKeyBundleToPlaintextBundle,
    private readonly buildIdentityKeysFromKeyBundle: BuildIdentityKeysFromKeyBundle,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore,
    private readonly logger: Logger
  ) {}

  /**
   * Logs in a user using the 2-step E2EE authentication dance.
   *
   * Step 1: Request KDF parameters (salt, version) from server via /auth/login-challenge
   * Step 2: Derive server_password from raw password using the KDF params
   * Step 3: Authenticate with the server using server_password (NOT raw password)
   * Step 4: Decrypt the key bundle to recover identity keys
   *
   * The raw password NEVER leaves the client.
   */
  public async execute(params: {
    email: string
    password: string
    apiUrl: string
  }): Promise<Result<ClientUser>> {
    const { email, password, apiUrl } = params

    if (!email.trim()) {
      return Result.fail("Email cannot be empty")
    }
    if (!password.trim()) {
      return Result.fail("Password cannot be empty")
    }

    const normalizedEmail = email.toLowerCase().trim()

    try {
      // Step 1: Request KDF parameters from the server.
      // This returns the salt needed to derive keys from the password.
      const challengeResponseResult = await this.requestLoginChallenge.execute(apiUrl, normalizedEmail)
      if (challengeResponseResult.isFailed()) {
        return Result.fail(challengeResponseResult.getError())
      }
      const challengeResponse = challengeResponseResult.getValue()

      // Step 2: Derive keys from the password using the KDF parameters.
      // This produces the server_password for authentication and pw_kek for bundle decryption.
      const derivedKeys = this.deriveLoginKeysFromPasswordAndChallenge.execute(password, challengeResponse)

      // Step 3: Authenticate with the server using the derived server_password.
      const loginPayload = {
        email: normalizedEmail,
        server_password: derivedKeys.serverPassword, // Derived key, not raw password
      }

      const httpClient = new HttpClient(apiUrl)

      const response = await httpClient.post<AuthResponseWithCrypto>(
        "/auth/login",
        JSON.stringify(loginPayload),
        buildAPIHeaders()
      )

      if (!response?.user) {
        return Result.fail("Invalid login response from server")
      }

      const clientUser = ClientUser.fromServerUser(response.user)

      // Step 4: Decrypt the key bundle to recover identity keys and cache the plaintext bundle.
      let identityKeys: IdentityKeys | undefined
      let keyBundle: KeyBundle | undefined
      if (response.crypto_fields) {
        const decryptedBundle =
          this.decryptKeyBundleToPlaintextBundle.execute(
            normalizedEmail,
            derivedKeys.pwKek,
            response.crypto_fields
          ) ?? undefined

        if (!decryptedBundle) {
          // Decryption failed - this shouldn't happen if the password was correct.
          // The server verified the password, so this indicates data corruption.
          this.logger.warn("Failed to decrypt key bundle - identity keys unavailable")
        } else if (decryptedBundle.userId !== clientUser.uuid) {
          // This is a critical integrity check: the bundle must be bound to the authenticated user.
          return Result.fail("Decrypted key bundle does not match authenticated user")
        } else {
          keyBundle = decryptedBundle
          identityKeys = this.buildIdentityKeysFromKeyBundle.execute(decryptedBundle)
        }
      }

      if (!identityKeys || !keyBundle) {
        return Result.fail("Failed to decrypt key bundle - identity keys unavailable")
      }

      await this.accountStoreContainer.createNewAccountStore({
        userId: clientUser.uuid,
        defaultApiUrl: apiUrl,
        identityKeys: identityKeys,
        keyBundle: keyBundle,
        appToken: response.app_token,
        refreshToken: response.refresh_token,
      })

      await this.usersStore.upsertUser(clientUser)

      return Result.ok(clientUser)
    } catch (error) {
      return Result.fail(`Login failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
}
