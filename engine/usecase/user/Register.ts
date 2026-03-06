import { AuthResponseWithCrypto } from "../../models/auth-types"
import { ClientUser } from "../../models/client_user"
import { buildAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { AccountStoreContainer } from "../../store/account-store-container"
import { UsersStore } from "../../store/users-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { GenerateRegistrationKeyBundleAndIdentityKeys } from "./GenerateRegistrationKeyBundleAndIdentityKeys"

/**
 * Requests KDF parameters for the given email address.
 * Used for login and password change flows to derive server_password.
 */
export class Register implements UseCaseInterface<ClientUser> {
  constructor(
    private readonly generateRegistrationKeyBundleAndIdentityKeys: GenerateRegistrationKeyBundleAndIdentityKeys,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly usersStore: UsersStore
  ) {}

  /**
   * Registers a new user with E2EE cryptographic identity.
   *
   * This method:
   * 1. Generates identity keys and derives server_password from the raw password
   * 2. Encrypts the key bundle with a password-derived key
   * 3. Sends the server_password (NOT raw password) and crypto fields to the server
   * 4. Stores identity keys locally for E2EE operations
   *
   * The raw password NEVER leaves the client.
   */
  public async execute(params: {
    email: string
    password: string
    apiUrl: string
    attribution?: Record<string, string>
    inviteCode?: string // Required when REQUIRE_INVITE_CODE is enabled on server
    bypassInviteCode?: boolean // Set for workspace invite flows (link/email invites)
  }): Promise<Result<ClientUser>> {
    const { email, password, apiUrl, attribution, inviteCode, bypassInviteCode } = params
    if (!email.trim()) {
      throw new Error("Email cannot be empty")
    }
    if (!password.trim()) {
      throw new Error("Password cannot be empty")
    }

    const normalizedEmail = email.toLowerCase().trim()

    try {
      // Generate the user ID on the client. This ID is cryptographically bound to the
      // encrypted key bundle via the associated data, so the server MUST use this exact ID.
      // If there's a UUID collision (extremely unlikely), registration will be rejected.
      const userId = crypto.randomUUID()

      // Generate all cryptographic material for registration.
      // This derives server_password from the raw password and creates the encrypted key bundle.
      const registrationResult = await this.generateRegistrationKeyBundleAndIdentityKeys.execute(
        userId,
        normalizedEmail,
        password
      )

      // Detect Playwright/WebDriver automation so test runs can request automatic subscription activation.
      const shouldAutoActivateSubscription =
        typeof navigator !== "undefined" && typeof navigator.webdriver === "boolean" && navigator.webdriver

      // Build the registration payload with server_password (not raw password) and crypto fields.
      // The user_id is client-generated and cryptographically bound to the key bundle.
      const registerPayload: Record<string, unknown> = {
        user_id: userId, // Client-generated, bound to encrypted payload
        email: normalizedEmail,
        server_password: registrationResult.serverPassword, // Derived key, not raw password
        crypto_fields: registrationResult.cryptoFields,
      }

      if (shouldAutoActivateSubscription) {
        registerPayload.auto_activate_test_subscription = true
      }

      if (attribution) {
        registerPayload.attribution = attribution
      }

      // Include invite code for registration gating (when REQUIRE_INVITE_CODE is enabled)
      if (inviteCode) {
        registerPayload.invite_code = inviteCode
      }

      // Bypass flag for workspace invite flows (link/email invites)
      if (bypassInviteCode) {
        registerPayload.bypass_invite_code = true
      }

      const httpClient = new HttpClient(apiUrl)

      const authResponse = await httpClient.post<AuthResponseWithCrypto>(
        "/auth/register",
        JSON.stringify(registerPayload),
        buildAPIHeaders()
      )

      const clientUser = ClientUser.fromServerUser(authResponse.user)

      // The server uses the client-generated user ID since it's bound to the encrypted payload.
      // Verify the IDs match as a sanity check.
      if (clientUser.uuid !== userId) {
        throw new Error("Server returned unexpected user ID - registration may have failed")
      }

      // Identity keys are already bound to the correct user ID.
      const identityKeys = registrationResult.identityKeys

      await this.usersStore.upsertUser(clientUser)
      await this.accountStoreContainer.createNewAccountStore({
        userId: clientUser.uuid,
        identityKeys: identityKeys,
        keyBundle: registrationResult.keyBundle,
        appToken: authResponse.app_token,
        refreshToken: authResponse.refresh_token,
        defaultApiUrl: apiUrl,
      })

      return Result.ok(clientUser)
    } catch (error) {
      throw new Error(`Registration failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
}
