/**
 * Session Management Integration Tests
 *
 * Tests the engine's session management functionality against a running server.
 * Covers password changes, password reset, session callbacks,
 * and E2EE authentication with cryptographic identity keys.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest"
import { GlobalClient } from "../../global/global-client"
import { UsersStore } from "../../store/users-store"
import { LoginChallengeResponse } from "../../models/auth-types"
import { Crypto } from "../../crypto/crypto"
import { WorkspaceMemberRole } from "../../models/workspace-member"
import * as tauriRuntime from "../../utils/tauri-runtime"
import { DeriveLoginKeysFromPasswordAndChallenge } from "../../usecase/user/DeriveLoginKeysFromPasswordAndChallenge"
import { ExecuteAuthenticatedRequest } from "../../usecase/network/ExecuteAuthenticatedRequest"
import { ShareKeysWithInvitee } from "../../usecase/entities/entities"
import { logger } from "../../utils/logger"
import {
  createApplicationForClient,
  initializeGlobalClient,
  generateTestUser,
  generateTestWorkspaceName,
  newClientWithRegisteredUser,
  newClientWithExistingUser,
  newClientWithWorkspace,
  resolvedTestApiBaseUrl,
  sleep,
} from "./helpers"
import { cookieJar } from "./setup"

const requireAccountStoreForUserId = (client: GlobalClient, userId: string) => {
  const accountStore = client.getAccountStoreContainer().getAccountStore(userId)
  if (!accountStore) {
    throw new Error(`Account store not found for user ${userId}`)
  }
  return accountStore
}

const requireIdentityKeysForUserId = (client: GlobalClient, userId: string) => {
  const accountStore = requireAccountStoreForUserId(client, userId)
  const identityKeys = accountStore.getIdentityKeys()
  if (!identityKeys) {
    throw new Error(`Identity keys not available for user ${userId}`)
  }
  return identityKeys
}

describe("Session Management Integration Tests", () => {
  let client: GlobalClient
  let usersStore: UsersStore

  beforeEach(async () => {
    const result = await initializeGlobalClient()
    client = result.client
    usersStore = client.getUsersStore()

    // Clear any existing users/sessions before each test
    if (usersStore.hasUsers()) {
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Failed to logout all accounts in setup: ${logoutAllResult.getError()}`)
      }
    }
  })

  afterEach(async () => {
    // Clean up after each test
    try {
      if (usersStore.hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Password Changes", () => {
    it("should change password successfully", async () => {
      const testUser = generateTestUser("password1")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const originalKeys = requireIdentityKeysForUserId(client, user.uuid)

      const newPassword = "newSecurePassword123!"
      const changePasswordResult = await client
        .getChangePassword()
        .execute(user.uuid, testUser.password, newPassword)
      if (changePasswordResult.isFailed()) {
        throw new Error(`Change password failed: ${changePasswordResult.getError()}`)
      }

      // Verify by logging out and logging in with new password
      const logoutResult = await client.getLogout().execute(user.uuid)
      if (logoutResult.isFailed()) {
        throw new Error(`Logout failed: ${logoutResult.getError()}`)
      }

      const loginResult = await client.getLogin().execute({ email: testUser.email, password: newPassword, apiUrl: resolvedTestApiBaseUrl })
      if (loginResult.isFailed()) {
        throw new Error(`Login failed: ${loginResult.getError()}`)
      }
      expect(loginResult.getValue().email).toBe(testUser.email)

      const refreshedKeys = requireIdentityKeysForUserId(client, user.uuid)
      expect(refreshedKeys.boxKeyPair.publicKey).toBe(originalKeys.boxKeyPair.publicKey)
      expect(refreshedKeys.signKeyPair.publicKey).toBe(originalKeys.signKeyPair.publicKey)
    })

    it("should fail with incorrect current password", async () => {
      const testUser = generateTestUser("password2")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const changePasswordResult = await client
        .getChangePassword()
        .execute(user.uuid, "wrongPassword!", "newPassword123!")

      expect(changePasswordResult.isFailed()).toBe(true)
    })

    it("should fail when no user is logged in", async () => {
      const testUser = generateTestUser("password2-no-user")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }

      const changePasswordResult = await client
        .getChangePassword()
        .execute("", "oldPassword!", "newPassword123!")

      expect(changePasswordResult.isFailed()).toBe(true)
      expect(changePasswordResult.getError()).toBe("User ID is required")
    })

    it("should reject empty current password", async () => {
      const testUser = generateTestUser("password3")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const changePasswordResult = await client.getChangePassword().execute(user.uuid, "", "newPassword123!")

      expect(changePasswordResult.isFailed()).toBe(true)
      expect(changePasswordResult.getError()).toBe("Current password cannot be empty")
    })

    it("should reject empty new password", async () => {
      const testUser = generateTestUser("password4")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const changePasswordResult = await client.getChangePassword().execute(user.uuid, testUser.password, "")

      expect(changePasswordResult.isFailed()).toBe(true)
      expect(changePasswordResult.getError()).toBe("New password cannot be empty")
    })

    it("should reject password shorter than 6 characters", async () => {
      const testUser = generateTestUser("password5")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const changePasswordResult = await client
        .getChangePassword()
        .execute(user.uuid, testUser.password, "short")

      expect(changePasswordResult.isFailed()).toBe(true)
      expect(changePasswordResult.getError()).toBe("Password must be at least 6 characters")
    })

    it("should reject same password as current", async () => {
      const testUser = generateTestUser("password6")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      const changePasswordResult = await client
        .getChangePassword()
        .execute(user.uuid, testUser.password, testUser.password)

      expect(changePasswordResult.isFailed()).toBe(true)
      expect(changePasswordResult.getError()).toBe("New password must differ from current password")
    })
  })

  describe("Password Reset", () => {
    it("should request password reset successfully", async () => {
      const testUser = generateTestUser("reset1")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      // In test/dev mode, the server returns the token for verification
      const resetResult = await client.getRequestPasswordReset().execute(resolvedTestApiBaseUrl, testUser.email)
      if (resetResult.isFailed()) {
        throw new Error(`Password reset request failed: ${resetResult.getError()}`)
      }

      // In dev mode, we get the token back
      const resetValue = resetResult.getValue()
      expect(resetValue.tokenId).toBeTruthy()
      expect(resetValue.token).toBeTruthy()
    })

    it("should not error on non-existent email (security)", async () => {
      // Password reset should not reveal whether an email exists
      const nonExistentEmail = `nonexistent-${Date.now()}@example.com`

      // Should not throw - server returns 200 for security, but no tokens are returned.
      const resetResult = await client.getRequestPasswordReset().execute(resolvedTestApiBaseUrl, nonExistentEmail)
      expect(resetResult.isFailed()).toBe(true)
    })

    it("should reset password with valid token", async () => {
      const testUser = generateTestUser("reset2")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()
      const originalKeys = requireIdentityKeysForUserId(client, user.uuid)

      // Request reset token
      const resetResult = await client.getRequestPasswordReset().execute(resolvedTestApiBaseUrl, testUser.email)
      if (resetResult.isFailed()) {
        throw new Error(`Password reset request failed: ${resetResult.getError()}`)
      }

      const resetValue = resetResult.getValue()
      const newPassword = "newResetPassword123!"
      const resetPasswordResult = await client.getResetPassword().execute({
        userId: user.uuid,
        tokenId: resetValue.tokenId,
        token: resetValue.token,
        newPassword,
        apiUrl: resolvedTestApiBaseUrl,
      })
      if (resetPasswordResult.isFailed()) {
        throw new Error(`Password reset failed: ${resetPasswordResult.getError()}`)
      }

      // Verify new password works
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }
      const loginResult = await client.getLogin().execute({ email: testUser.email, password: newPassword, apiUrl: resolvedTestApiBaseUrl })
      if (loginResult.isFailed()) {
        throw new Error(`Login failed: ${loginResult.getError()}`)
      }
      expect(loginResult.getValue().email).toBe(testUser.email)

      const refreshedKeys = requireIdentityKeysForUserId(client, user.uuid)
      expect(refreshedKeys.boxKeyPair.publicKey).toBe(originalKeys.boxKeyPair.publicKey)
      expect(refreshedKeys.signKeyPair.publicKey).toBe(originalKeys.signKeyPair.publicKey)
    })

    it("should reject reset with invalid token", async () => {
      const testUser = generateTestUser("reset-invalid")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      await expect(
        client.getResetPassword().execute({ userId: user.uuid, tokenId: "invalid-token-id", token: "invalid-token", newPassword: "newPassword123!", apiUrl: resolvedTestApiBaseUrl })
      ).rejects.toThrow()
    })

    it("should reject empty email for password reset", async () => {
      const resetResult = await client.getRequestPasswordReset().execute(resolvedTestApiBaseUrl, "")
      expect(resetResult.isFailed()).toBe(true)
      expect(resetResult.getError()).toBe("Email cannot be empty")
    })

    it("should reject missing fields in reset password", async () => {
      const testUser = generateTestUser("reset-missing")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()
      const missingUserResult = await client.getResetPassword().execute({ userId: "", tokenId: "id", token: "token", newPassword: "password", apiUrl: resolvedTestApiBaseUrl })
      expect(missingUserResult.isFailed()).toBe(true)

      const missingTokenIdResult = await client.getResetPassword().execute({ userId: user.uuid, tokenId: "", token: "token", newPassword: "password", apiUrl: resolvedTestApiBaseUrl })
      expect(missingTokenIdResult.isFailed()).toBe(true)

      const missingTokenResult = await client.getResetPassword().execute({ userId: user.uuid, tokenId: "id", token: "", newPassword: "password", apiUrl: resolvedTestApiBaseUrl })
      expect(missingTokenResult.isFailed()).toBe(true)

      const missingPasswordResult = await client.getResetPassword().execute({ userId: user.uuid, tokenId: "id", token: "token", newPassword: "", apiUrl: resolvedTestApiBaseUrl })
      expect(missingPasswordResult.isFailed()).toBe(true)
    })
  })

  describe("Session Persistence", () => {
    it("should retrieve user info from server", async () => {
      const testUser = generateTestUser("retrieve1")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      expect(usersStore.getUsers()[0]!.email).toBe(testUser.email)
    })
  })

  describe("Multi-Account Sessions", () => {
    it("tracks multiple registered accounts and identity keys", async () => {
      const accountOne = generateTestUser("multi-account-1")
      const accountTwo = generateTestUser("multi-account-2")

      const registerResultOne = await client.getRegister().execute({ email: accountOne.email, password: accountOne.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultOne.isFailed()) {
        throw new Error(`Registration failed: ${registerResultOne.getError()}`)
      }
      const userOne = registerResultOne.getValue()

      const registerResultTwo = await client.getRegister().execute({ email: accountTwo.email, password: accountTwo.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultTwo.isFailed()) {
        throw new Error(`Registration failed: ${registerResultTwo.getError()}`)
      }
      const userTwo = registerResultTwo.getValue()

      const users = usersStore.getUsers()
      expect(users.map(user => user.uuid)).toEqual(expect.arrayContaining([userOne.uuid, userTwo.uuid]))
      expect(requireIdentityKeysForUserId(client, userOne.uuid)).toBeTruthy()
      expect(requireIdentityKeysForUserId(client, userTwo.uuid)).toBeTruthy()
    })

    it("login adds a second account without removing the first", async () => {
      const primaryCredentials = generateTestUser("multi-login-primary")
      const secondaryCredentials = generateTestUser("multi-login-secondary")

      const primaryRegisterResult = await client.getRegister().execute({
        email: primaryCredentials.email,
        password: primaryCredentials.password,
        apiUrl: resolvedTestApiBaseUrl,
      })
      if (primaryRegisterResult.isFailed()) {
        throw new Error(`Registration failed: ${primaryRegisterResult.getError()}`)
      }
      const primaryUser = primaryRegisterResult.getValue()

      // Register the secondary account in a separate client to exercise the login flow.
      const { client: secondaryClient } = await initializeGlobalClient("multi-login-secondary")
      const secondaryRegisterResult = await secondaryClient.getRegister().execute({
        email: secondaryCredentials.email,
        password: secondaryCredentials.password,
        apiUrl: resolvedTestApiBaseUrl,
      })
      if (secondaryRegisterResult.isFailed()) {
        throw new Error(`Registration failed: ${secondaryRegisterResult.getError()}`)
      }
      const secondaryUser = secondaryRegisterResult.getValue()

      const loginResult = await client.getLogin().execute({
        email: secondaryCredentials.email,
        password: secondaryCredentials.password,
        apiUrl: resolvedTestApiBaseUrl,
      })
      if (loginResult.isFailed()) {
        throw new Error(`Login failed: ${loginResult.getError()}`)
      }
      const loggedInUser = loginResult.getValue()

      expect(loggedInUser.uuid).toBe(secondaryUser.uuid)

      const users = usersStore.getUsers()
      expect(users.map(user => user.uuid)).toEqual(
        expect.arrayContaining([primaryUser.uuid, secondaryUser.uuid])
      )
    })

    it("logoutAccount removes only the targeted account and preserves other workspaces", async () => {
      const accountOne = generateTestUser("multi-logout-1")
      const accountTwo = generateTestUser("multi-logout-2")

      const registerResultOne = await client.getRegister().execute({ email: accountOne.email, password: accountOne.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultOne.isFailed()) {
        throw new Error(`Registration failed: ${registerResultOne.getError()}`)
      }
      const userOne = registerResultOne.getValue()

      const registerResultTwo = await client.getRegister().execute({ email: accountTwo.email, password: accountTwo.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultTwo.isFailed()) {
        throw new Error(`Registration failed: ${registerResultTwo.getError()}`)
      }
      const userTwo = registerResultTwo.getValue()

      const userOneKeys = requireIdentityKeysForUserId(client, userOne.uuid)
      const userTwoKeys = requireIdentityKeysForUserId(client, userTwo.uuid)

      const accountStoreOne = requireAccountStoreForUserId(client, userOne.uuid)
      const accountStoreTwo = requireAccountStoreForUserId(client, userTwo.uuid)

      const workspaceOneResult = await client
        .getCreateWorkspace()
        .execute(generateTestWorkspaceName("Account One Workspace"), accountStoreOne, userOneKeys)
      if (workspaceOneResult.isFailed()) {
        throw new Error(`Workspace creation failed: ${workspaceOneResult.getError()}`)
      }
      const workspaceOne = workspaceOneResult.getValue()

      const workspaceTwoResult = await client
        .getCreateWorkspace()
        .execute(generateTestWorkspaceName("Account Two Workspace"), accountStoreTwo, userTwoKeys)
      if (workspaceTwoResult.isFailed()) {
        throw new Error(`Workspace creation failed: ${workspaceTwoResult.getError()}`)
      }
      const workspaceTwo = workspaceTwoResult.getValue()

      const workspaceStore = client.getWorkspaceStore()
      const workspaceIds = workspaceStore.getAllWorkspaces().map(workspace => workspace.uuid)
      expect(workspaceIds).toEqual(expect.arrayContaining([workspaceOne.uuid, workspaceTwo.uuid]))

      const logoutResult = await client.getLogout().execute(userOne.uuid)
      if (logoutResult.isFailed()) {
        throw new Error(`Logout failed: ${logoutResult.getError()}`)
      }

      const remainingUsers = usersStore.getUsers()
      expect(remainingUsers.map(user => user.uuid)).toEqual(expect.arrayContaining([userTwo.uuid]))
      expect(remainingUsers.find(user => user.uuid === userOne.uuid)).toBeUndefined()

      expect(
        client.getAccountStoreContainer().getAccountStore(userOne.uuid)?.getIdentityKeys()
      ).toBeUndefined()
      expect(requireIdentityKeysForUserId(client, userTwo.uuid)).toBeTruthy()

      const remainingWorkspaces = workspaceStore.getAllWorkspaces()
      expect(remainingWorkspaces).toHaveLength(1)
      expect(remainingWorkspaces[0]?.uuid).toBe(workspaceTwo.uuid)
      expect(remainingWorkspaces[0]?.userId).toBe(userTwo.uuid)
    })

    it("lists shared workspaces separately for each authenticated account", async () => {
      const accountOne = generateTestUser("multi-workspace-1")
      const accountTwo = generateTestUser("multi-workspace-2")

      const registerResultOne = await client.getRegister().execute({ email: accountOne.email, password: accountOne.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultOne.isFailed()) {
        throw new Error(`Registration failed: ${registerResultOne.getError()}`)
      }
      const userOne = registerResultOne.getValue()

      const registerResultTwo = await client.getRegister().execute({ email: accountTwo.email, password: accountTwo.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultTwo.isFailed()) {
        throw new Error(`Registration failed: ${registerResultTwo.getError()}`)
      }
      const userTwo = registerResultTwo.getValue()

      const userOneKeys = requireIdentityKeysForUserId(client, userOne.uuid)
      const userTwoKeys = requireIdentityKeysForUserId(client, userTwo.uuid)

      const accountStore = requireAccountStoreForUserId(client, userOne.uuid)
      const workspaceResult = await client
        .getCreateWorkspace()
        .execute(generateTestWorkspaceName("Shared Workspace"), accountStore, userOneKeys)
      if (workspaceResult.isFailed()) {
        throw new Error(`Workspace creation failed: ${workspaceResult.getError()}`)
      }
      const workspace = workspaceResult.getValue()

      const appForUserOne = createApplicationForClient(client, workspace.uuid, {
        accountId: userOne.uuid,
      })
      await appForUserOne.initialize()

      // Invite account two and share workspace keys using user-one scoped auth.
      const addMemberToWorkspaceUseCase = appForUserOne.getAddMemberToWorkspace()
      const addMemberResult = await addMemberToWorkspaceUseCase.execute({
        workspaceId: workspace.uuid,
        email: userTwo.email,
        role: WorkspaceMemberRole.Member,
      })
      if (addMemberResult.isFailed()) {
        throw new Error(addMemberResult.getError())
      }

      const shareKeysUseCase = new ShareKeysWithInvitee(
        appForUserOne.getKeyStore(),
        appForUserOne.getCreateKeyShareForUser()
      )
      const shareResult = await shareKeysUseCase.execute({
        inviteeUserId: userTwo.uuid,
        inviteeBoxPublicKey: userTwoKeys.boxKeyPair.publicKey,
      })

      appForUserOne.destroy()

      if (shareResult.isFailed()) {
        throw new Error(`Failed to share workspace keys: ${shareResult.getError()}`)
      }

      const fetchAllWorkspacesResult = await client.getFetchAllWorkspaces().execute()
      if (fetchAllWorkspacesResult.isFailed()) {
        throw new Error(`Failed to fetch workspaces: ${fetchAllWorkspacesResult.getError()}`)
      }

      const workspaceStore = client.getWorkspaceStore()
      const matchingEntries = workspaceStore.getWorkspacesByWorkspaceId(workspace.uuid)
      expect(matchingEntries).toHaveLength(2)
      expect(matchingEntries.map(entry => entry.userId)).toEqual(
        expect.arrayContaining([userOne.uuid, userTwo.uuid])
      )

      const userTwoEntry = matchingEntries.find(entry => entry.userId === userTwo.uuid)
      if (!userTwoEntry) {
        throw new Error("Expected workspace entry for second account")
      }
      workspaceStore.setCurrentWorkspace(userTwoEntry)
      expect(workspaceStore.getWorkspaceByUuid(workspace.uuid)?.userId).toBe(userTwo.uuid)
    })

    it("logoutAllAccounts clears all users, identity keys, and workspaces", async () => {
      const accountOne = generateTestUser("multi-logout-all-1")
      const accountTwo = generateTestUser("multi-logout-all-2")

      const registerResultOne = await client.getRegister().execute({ email: accountOne.email, password: accountOne.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultOne.isFailed()) {
        throw new Error(`Registration failed: ${registerResultOne.getError()}`)
      }
      const userOne = registerResultOne.getValue()

      const registerResultTwo = await client.getRegister().execute({ email: accountTwo.email, password: accountTwo.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResultTwo.isFailed()) {
        throw new Error(`Registration failed: ${registerResultTwo.getError()}`)
      }
      const userTwo = registerResultTwo.getValue()

      const userOneKeys = requireIdentityKeysForUserId(client, userOne.uuid)
      const accountStore = requireAccountStoreForUserId(client, userOne.uuid)
      const createWorkspaceResult = await client
        .getCreateWorkspace()
        .execute(generateTestWorkspaceName("Logout All Workspace"), accountStore, userOneKeys)
      if (createWorkspaceResult.isFailed()) {
        throw new Error(`Workspace creation failed: ${createWorkspaceResult.getError()}`)
      }

      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      expect(usersStore.getUsers()).toHaveLength(0)
      expect(
        client.getAccountStoreContainer().getAccountStore(userOne.uuid)?.getIdentityKeys()
      ).toBeUndefined()
      expect(
        client.getAccountStoreContainer().getAccountStore(userTwo.uuid)?.getIdentityKeys()
      ).toBeUndefined()

      const workspaceStore = client.getWorkspaceStore()
      expect(workspaceStore.getAllWorkspaces()).toHaveLength(0)
      expect(workspaceStore.getCurrentWorkspace()).toBeUndefined()
    })
  })

  describe("Tauri SSE Token Exchange", () => {
    let deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge
    let cryptoService: Crypto

    beforeAll(async () => {
      // Auth crypto service is needed to derive the server_password from the login challenge.
      cryptoService = new Crypto()
      await cryptoService.initialize()
      deriveLoginKeysFromPasswordAndChallenge = new DeriveLoginKeysFromPasswordAndChallenge(cryptoService)
    })

    afterAll(() => {
      cryptoService.deinit()
    })

    const requestLoginChallengeForTauriClient = async (email: string): Promise<LoginChallengeResponse> => {
      // Step 1 of the 2-step auth flow: request KDF params for the user.
      const response = await fetch(`${resolvedTestApiBaseUrl}/auth/login-challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Type": "tauri",
        },
        body: JSON.stringify({ email }),
        credentials: "omit",
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(
          `Login challenge failed with ${response.status} ${response.statusText}: ${responseText}`
        )
      }

      return (await response.json()) as LoginChallengeResponse
    }

    const loginTauriClientForAppToken = async (
      email: string,
      password: string
    ): Promise<{ appToken: string; userId: string }> => {
      // Step 2: derive server_password and authenticate while requesting a Tauri app token.
      const challenge = await requestLoginChallengeForTauriClient(email)
      const derivedKeys = deriveLoginKeysFromPasswordAndChallenge.execute(password, challenge)

      const response = await fetch(`${resolvedTestApiBaseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Type": "tauri",
        },
        body: JSON.stringify({
          email,
          server_password: derivedKeys.serverPassword,
        }),
        credentials: "omit",
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`Tauri login failed with ${response.status} ${response.statusText}: ${responseText}`)
      }

      const payload = (await response.json()) as { user?: { uuid?: string }; app_token?: string }
      if (!payload.user?.uuid) {
        throw new Error("Tauri login response missing user UUID")
      }
      if (!payload.app_token) {
        throw new Error("Tauri login response missing app token")
      }

      return { appToken: payload.app_token, userId: payload.user.uuid }
    }

    const exchangeAppTokenForSseToken = async (appToken: string, userId: string): Promise<string> => {
      // Exchange the long-lived app token for a short-lived SSE token.
      const response = await fetch(`${resolvedTestApiBaseUrl}/sse/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appToken}`,
          "X-Active-Account-ID": userId,
        },
        body: JSON.stringify({}),
        credentials: "omit",
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(
          `SSE token exchange failed with ${response.status} ${response.statusText}: ${responseText}`
        )
      }

      const payload = (await response.json()) as { token?: string }
      if (!payload.token) {
        throw new Error("SSE token exchange response missing token")
      }

      return payload.token
    }

    it("should exchange app token for a single-use SSE token", async () => {
      const {
        client: workspaceClient,
        workspace,
        testCredentials,
      } = await newClientWithWorkspace("sse-token")

      // Clear any cookie-based session so this test only exercises token-based auth.
      const logoutAllResult = await workspaceClient.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      const { appToken, userId } = await loginTauriClientForAppToken(
        testCredentials.email,
        testCredentials.password
      )

      const sseToken = await exchangeAppTokenForSseToken(appToken, userId)

      // First use should succeed and establish the SSE stream.
      const firstSseAbortController = new AbortController()
      const firstResponse = await fetch(
        `${resolvedTestApiBaseUrl}/sse/workspaces/${workspace.uuid}/notifications/events?sseToken=${sseToken}`,
        {
          method: "GET",
          signal: firstSseAbortController.signal,
          credentials: "omit",
        }
      )

      expect(firstResponse.status).toBe(200)

      // Abort the stream to avoid hanging the test on an open SSE connection.
      firstSseAbortController.abort()
      await sleep(10)

      // Second use should fail because the token is single-use.
      const secondResponse = await fetch(
        `${resolvedTestApiBaseUrl}/sse/workspaces/${workspace.uuid}/notifications/events?sseToken=${sseToken}`,
        {
          method: "GET",
          credentials: "omit",
        }
      )

      expect(secondResponse.status).toBe(401)
    })

    it("should reject SSE token exchange without an active account header", async () => {
      const { client: workspaceClient, testCredentials } =
        await newClientWithWorkspace("sse-token-missing-header")

      const logoutAllResult = await workspaceClient.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      const { appToken } = await loginTauriClientForAppToken(testCredentials.email, testCredentials.password)

      const response = await fetch(`${resolvedTestApiBaseUrl}/sse/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify({}),
        credentials: "omit",
      })

      expect(response.status).toBe(400)
    })
  })

  describe("Tauri App Token Refresh Integration Tests", () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("should refresh app token and rotate refresh token when access token is invalid", async () => {
      vi.spyOn(tauriRuntime, "isTauriRuntime").mockReturnValue(true)
      const { client: tauriClient } = await initializeGlobalClient("tauri-refresh")
      const keychainService = tauriClient.getKeychainService()

      vi.spyOn(keychainService, "getAllAuthTokens").mockResolvedValue({})
      vi.spyOn(keychainService, "getAllRefreshTokens").mockResolvedValue({})
      vi.spyOn(keychainService, "getAllIdentityKeyBundles").mockResolvedValue({})
      vi.spyOn(keychainService, "saveIdentityKeysForUser").mockResolvedValue(true)
      vi.spyOn(keychainService, "saveIdentityKeyBundleForUser").mockResolvedValue(true)
      const saveAuthTokenSpy = vi.spyOn(keychainService, "saveAuthTokenForUser")
      const saveRefreshTokenSpy = vi.spyOn(keychainService, "saveRefreshTokenForUser")

      const testUser = generateTestUser("tauri-refresh")
      const registerResult = await tauriClient.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()
      const identityKeys = requireIdentityKeysForUserId(tauriClient, user.uuid)
      const accountStore = requireAccountStoreForUserId(tauriClient, user.uuid)

      const createWorkspaceResult = await tauriClient
        .getCreateWorkspace()
        .execute(generateTestWorkspaceName("Tauri Refresh Workspace"), accountStore, identityKeys)
      if (createWorkspaceResult.isFailed()) {
        throw new Error(`Workspace creation failed: ${createWorkspaceResult.getError()}`)
      }
      const workspace = createWorkspaceResult.getValue()

      const initialAppToken = await keychainService.getAuthTokenForUser(user.uuid)
      const initialRefreshToken = await keychainService.getRefreshTokenForUser(user.uuid)

      expect(initialAppToken).toBeTruthy()
      expect(initialRefreshToken).toBeTruthy()

      // Force the access token to be invalid so the refresh flow is exercised.
      await accountStore.setAppToken("invalid-token")

      const app = createApplicationForClient(tauriClient, workspace.uuid, { accountId: user.uuid })
      await app.initialize()
      const refreshAuthTokens = app.getRefreshAuthTokens()
      const networkService = new ExecuteAuthenticatedRequest(
        app.getAccountStore().getHttpClient(),
        app.getAccountStore(),
        refreshAuthTokens,
        logger
      )

      const initialSaveAuthTokenCalls = saveAuthTokenSpy.mock.calls.length
      const initialSaveRefreshTokenCalls = saveRefreshTokenSpy.mock.calls.length

      // Simulate a Tauri environment with no cookie-based session.
      cookieJar.removeAllCookiesSync()

      const response = await networkService.executeGet<{ user?: { email?: string } }>("/auth/me")
      expect(response.user?.email).toBe(testUser.email)

      const refreshedAppToken = await keychainService.getAuthTokenForUser(user.uuid)
      const refreshedRefreshToken = await keychainService.getRefreshTokenForUser(user.uuid)

      expect(refreshedAppToken).toBeTruthy()
      expect(refreshedAppToken).not.toBe("invalid-token")
      expect(refreshedRefreshToken).toBeTruthy()
      expect(refreshedRefreshToken).not.toBe(initialRefreshToken)
      expect(saveAuthTokenSpy.mock.calls.length > initialSaveAuthTokenCalls).toBe(true)
      expect(saveRefreshTokenSpy.mock.calls.length > initialSaveRefreshTokenCalls).toBe(true)

      app.destroy()
    })
  })

  describe("getUserByUuid", () => {
    it("should find user by UUID", async () => {
      const testUser = generateTestUser("uuid1")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }

      const uuid = usersStore.getUsers()[0]!.uuid
      const foundUser = usersStore.getUserByUuid(uuid)

      expect(foundUser).toBeTruthy()
      expect(foundUser!.email).toBe(testUser.email)
    })

    it("should return undefined for non-existent UUID", async () => {
      const testUser = generateTestUser("uuid2")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }

      const foundUser = usersStore.getUserByUuid("non-existent-uuid")
      expect(foundUser).toBeUndefined()
    })
  })

  describe("E2EE Authentication and Cryptography", () => {
    it("should generate identity keys during registration", async () => {
      const testUser = generateTestUser("crypto1")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      // After registration, identity keys should be available.
      const identityKeys = requireIdentityKeysForUserId(client, user.uuid)
      expect(identityKeys).toBeTruthy()
      expect(identityKeys.userId).toBe(user.uuid)
      expect(identityKeys.boxKeyPair).toBeTruthy()
      expect(identityKeys.boxKeyPair.publicKey).toHaveLength(64) // 32 bytes hex
      expect(identityKeys.boxKeyPair.privateKey).toHaveLength(64) // 32 bytes hex
      expect(identityKeys.signKeyPair).toBeTruthy()
      expect(identityKeys.signKeyPair.publicKey).toHaveLength(64) // 32 bytes hex
      expect(identityKeys.signKeyPair.privateKey).toHaveLength(128) // 64 bytes hex for Ed25519
    })

    it("should recover identity keys during login", async () => {
      // Register a new user.
      const testUser = generateTestUser("crypto2")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      // Store the original identity keys for comparison.
      const originalKeys = requireIdentityKeysForUserId(client, user.uuid)
      const originalBoxPub = originalKeys.boxKeyPair.publicKey
      const originalSignPub = originalKeys.signKeyPair.publicKey

      // Logout to clear the session and keys.
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }
      expect(client.getAccountStoreContainer().getAccountStore(user.uuid)?.getIdentityKeys()).toBeUndefined()

      // Login should recover the same keys via bundle decryption.
      const loginResult = await client.getLogin().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (loginResult.isFailed()) {
        throw new Error(`Login failed: ${loginResult.getError()}`)
      }

      const recoveredKeys = requireIdentityKeysForUserId(client, user.uuid)
      expect(recoveredKeys).toBeTruthy()
      expect(recoveredKeys.boxKeyPair.publicKey).toBe(originalBoxPub)
      expect(recoveredKeys.signKeyPair.publicKey).toBe(originalSignPub)
    })

    it("should clear identity keys on logout", async () => {
      const testUser = generateTestUser("crypto3")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()

      expect(requireIdentityKeysForUserId(client, user.uuid)).toBeTruthy()

      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      // Keys should be cleared from memory.
      expect(client.getAccountStoreContainer().getAccountStore(user.uuid)?.getIdentityKeys()).toBeUndefined()
    })

    it("should use 2-step authentication dance for login", async () => {
      // This test verifies the client doesn't send the raw password.
      // We can't directly observe the network, but we verify the flow works.
      const testUser = generateTestUser("crypto4")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const user = registerResult.getValue()
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      // Login should succeed using the 2-step dance:
      // 1. Request KDF params via login-challenge
      // 2. Derive server_password and authenticate
      const loginResult = await client.getLogin().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (loginResult.isFailed()) {
        throw new Error(`Login failed: ${loginResult.getError()}`)
      }
      expect(loginResult.getValue().email).toBe(testUser.email)
      expect(requireIdentityKeysForUserId(client, user.uuid)).toBeTruthy()
    })

    it("should fail login with wrong password", async () => {
      const testUser = generateTestUser("crypto5")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      // Wrong password should fail authentication.
      const loginResult = await client.getLogin().execute({ email: testUser.email, password: "wrongPassword123!", apiUrl: resolvedTestApiBaseUrl })
      expect(loginResult.isFailed()).toBe(true)
    })

    it("should fail login for non-existent user", async () => {
      // Non-existent user should fail (after the fake salt prevents enumeration).
      const loginResult = await client.getLogin().execute({ email: "nonexistent@example.com", password: "anyPassword123!", apiUrl: resolvedTestApiBaseUrl })
      expect(loginResult.isFailed()).toBe(true)
    })

    it("should handle login from different client instance", async () => {
      // Register with one client.
      const { user: originalUser, testCredentials } = await newClientWithRegisteredUser("crypto6-a")

      // Login from a different client (simulating different device).
      const { client: newClient, user: loggedInUser } = await newClientWithExistingUser({
        email: testCredentials.email,
        password: testCredentials.password,
        clientKey: "crypto6-b",
      })

      expect(loggedInUser.uuid).toBe(originalUser.uuid)
      expect(loggedInUser.email).toBe(testCredentials.email)

      // Identity keys should be recovered on the new client.
      const newClientKeys = requireIdentityKeysForUserId(newClient, originalUser.uuid)
      expect(newClientKeys).toBeTruthy()
      expect(newClientKeys.userId).toBe(originalUser.uuid)
    })

    it("should reject registration with duplicate email", async () => {
      const testUser = generateTestUser("crypto7")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }
      const logoutAllResult = await client.getLogoutAllAccounts().execute()
      if (logoutAllResult.isFailed()) {
        throw new Error(`Logout-all failed: ${logoutAllResult.getError()}`)
      }

      // Attempting to register with same email should fail.
      await expect(client.getRegister().execute({ email: testUser.email, password: "differentPassword!", apiUrl: resolvedTestApiBaseUrl })).rejects.toThrow()
    })

    it("should use client-generated user ID bound to crypto payload", async () => {
      const testUser = generateTestUser("crypto8")
      const registerResult = await client.getRegister().execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
      if (registerResult.isFailed()) {
        throw new Error(`Registration failed: ${registerResult.getError()}`)
      }

      // The user ID from server should match the one in identity keys
      // (since it's cryptographically bound to the encrypted payload).
      const activeUser = usersStore.getUsers()[0]!
      const identityKeys = requireIdentityKeysForUserId(client, activeUser.uuid)

      expect(activeUser.uuid).toBe(identityKeys.userId)
    })
  })
})
