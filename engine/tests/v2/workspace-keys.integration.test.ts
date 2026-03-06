/**
 * Workspace Key Integration Tests (V2 Use Cases)
 *
 * Tests the engine's workspace key management against a running v2 server.
 * Uses key-related use cases and KeyStore instead of the legacy key service.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { GlobalClient } from "../../global/global-client"
import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { KeyStore } from "../../store/key-store"
import { ShareKeysWithInvitee } from "../../usecase/entities/entities"
import {
  initializeGlobalClient,
  generateTestUser,
  newClientWithWorkspace,
  newClientWithRegisteredUser,
  createCollaborativeClientAndApplicationPair,
  createApplicationForClient,
  requireIdentityKeysForClient,
  resolvedTestApiBaseUrl,
} from "./helpers"
import { Workspace } from "../../models/workspace"
import { WorkspaceMemberRole } from "../../models/workspace-member"
import { WorkspaceKeyRepository } from "../../repositories/workspace-key-repository"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID } from "../../models/workspace"
import { CreateWorkspaceKey } from "../../usecase/workspace/CreateWorkspaceKey"
import type { HttpRequestOptions } from "../../services/http-client"
import type { ApiResult } from "../../utils/ApiResult"

/**
 * Helper to add a user as a member of a workspace.
 * Uses the API directly since we're testing workspace key flows.
 */
async function addWorkspaceMember(
  application: WorkspaceRuntime,
  workspaceId: string,
  memberEmail: string,
  role: WorkspaceMemberRole = WorkspaceMemberRole.Member
): Promise<void> {
  const addMemberToWorkspaceUseCase = application.getAddMemberToWorkspace()
  const addMemberResult = await addMemberToWorkspaceUseCase.execute({
    workspaceId,
    email: memberEmail,
    role,
  })
  if (addMemberResult.isFailed()) {
    throw new Error(addMemberResult.getError())
  }
}

async function createWorkspaceKeyUsingUseCase(
  application: WorkspaceRuntime,
  client: GlobalClient
): Promise<DecryptedWorkspaceKey> {
  const createWorkspaceKeyUseCase = new CreateWorkspaceKey(
    client.getCrypto(),
    application.getMakeWorkspaceRequest(),
    application.getCreateKeyShareForUser(),
    application.getAccountStore(),
    application.getKeyStore()
  )
  const result = await createWorkspaceKeyUseCase.execute()
  if (result.isFailed()) {
    throw new Error(result.getError())
  }
  return result.getValue()
}

async function fetchWorkspaceKeysUsingUseCase(application: WorkspaceRuntime): Promise<void> {
  const fetchResult = await application.getFetchWorkspaceKeys().execute()
  if (fetchResult.isFailed()) {
    throw new Error(fetchResult.getError())
  }
}

async function shareWorkspaceKeysWithInviteeUsingUseCase(
  application: WorkspaceRuntime,
  inviteeUserId: string,
  inviteeBoxPublicKey: string
): Promise<void> {
  const shareKeysUseCase = new ShareKeysWithInvitee(
    application.getKeyStore(),
    application.getCreateKeyShareForUser()
  )
  const shareResult = await shareKeysUseCase.execute({
    inviteeUserId,
    inviteeBoxPublicKey,
  })
  if (shareResult.isFailed()) {
    throw new Error(shareResult.getError())
  }
}

async function clearWorkspaceKeyCacheAndStorage(
  keyStore: KeyStore,
  keyRepository: WorkspaceKeyRepository,
  workspaceId: string,
  userId: string
): Promise<void> {
  keyStore.keyStore.clear()
  const storedKeys = await keyRepository.getKeysByUser(workspaceId, userId)
  for (const key of storedKeys) {
    await keyRepository.deleteKey(workspaceId, key.workspace_key_id, userId)
  }
}

describe("Workspace Key Integration Tests (V2)", () => {
  let client: GlobalClient
  let app: WorkspaceRuntime
  let keyStore: KeyStore
  let workspaceId: string
  let accountId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("wskey-test")
    client = result.client
    workspaceId = result.workspace.uuid
    accountId = result.user.uuid

    // Create Application to load keys into the KeyStore
    app = createApplicationForClient(client, workspaceId, { accountId })
    await app.initialize()
    keyStore = app.getKeyStore()
  })

  afterEach(async () => {
    try {
      keyStore.keyStore.clear()
      app.destroy()
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Key Creation", () => {
    it("should create a workspace key with valid properties", async () => {
      const key = await createWorkspaceKeyUsingUseCase(app, client)

      expect(key).toBeTruthy()
      expect(key.id).toBeTruthy()
      expect(key.workspaceId).toBe(workspaceId)
      expect(key.generation).toBeGreaterThanOrEqual(1)
      // Key should be 32 bytes = 64 hex characters
      expect(key.key).toHaveLength(64)
    })

    it("should store created key in keyring", async () => {
      const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

      // Key should be retrievable by ID
      const retrievedKey = keyStore.getKey(createdKey.id)
      expect(retrievedKey).toBeTruthy()
      expect(retrievedKey?.id).toBe(createdKey.id)
      expect(retrievedKey?.key).toBe(createdKey.key)
    })

    it("should create key share for the creator", async () => {
      // Clear cache to start fresh
      keyStore.keyStore.clear()

      const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

      // Clear cache again
      keyStore.keyStore.clear()

      // Explicitly load from server - should be able to decrypt the share
      await fetchWorkspaceKeysUsingUseCase(app)

      // Now get from cache
      const fetchedKey = keyStore.getKey(createdKey.id)
      expect(fetchedKey).toBeTruthy()
      expect(fetchedKey?.key).toBe(createdKey.key)
    })

    it("should increment generation for each new key", async () => {
      const key1 = await createWorkspaceKeyUsingUseCase(app, client)
      const key2 = await createWorkspaceKeyUsingUseCase(app, client)
      const key3 = await createWorkspaceKeyUsingUseCase(app, client)

      expect(key2.generation).toBeGreaterThan(key1.generation)
      expect(key3.generation).toBeGreaterThan(key2.generation)
    })

    it("should generate unique keys for each creation", async () => {
      const key1 = await createWorkspaceKeyUsingUseCase(app, client)
      const key2 = await createWorkspaceKeyUsingUseCase(app, client)

      // Keys should have different IDs and different symmetric keys
      expect(key1.id).not.toBe(key2.id)
      expect(key1.key).not.toBe(key2.key)
    })
  })

  describe("Key Retrieval", () => {
    it("should return undefined when cache is cleared", async () => {
      // Clear all keys to ensure we start fresh
      keyStore.keyStore.clear()

      // For a workspace with no keys in cache, getCurrentKey returns undefined
      const key = keyStore.getCurrentKey()
      // After clearing, cache is empty
      expect(key).toBeUndefined()
    })

    it("should return the highest generation key as current", async () => {
      // Create multiple keys
      await createWorkspaceKeyUsingUseCase(app, client)
      await createWorkspaceKeyUsingUseCase(app, client)
      const key3 = await createWorkspaceKeyUsingUseCase(app, client)

      const currentKey = keyStore.getCurrentKey()

      expect(currentKey).toBeTruthy()
      expect(currentKey?.id).toBe(key3.id)
      expect(currentKey?.generation).toBe(key3.generation)
    })

    it("should return specific key by ID", async () => {
      const key1 = await createWorkspaceKeyUsingUseCase(app, client)
      await createWorkspaceKeyUsingUseCase(app, client)

      // Should be able to get the first key by ID even though it's not current
      const retrievedKey = keyStore.getKey(key1.id)
      expect(retrievedKey).toBeTruthy()
      expect(retrievedKey?.id).toBe(key1.id)
      expect(retrievedKey?.key).toBe(key1.key)
    })

    it("should return undefined for non-existent key ID", async () => {
      // Create a key first so the workspace has keys
      await createWorkspaceKeyUsingUseCase(app, client)

      const result = keyStore.getKey("non-existent-key-id")

      expect(result).toBeUndefined()
    })
  })

  describe("Key Caching", () => {
    it("should cache keys after loading", async () => {
      const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

      // First call loads from cache (populated by createWorkspaceKey)
      const cachedKey1 = keyStore.getKey(createdKey.id)

      // Second call should return same instance from cache
      const cachedKey2 = keyStore.getKey(createdKey.id)

      expect(cachedKey1).toBe(cachedKey2) // Same object reference
    })

    it("should clear workspace keys correctly", async () => {
      await createWorkspaceKeyUsingUseCase(app, client)

      // Clear keys for this workspace
      keyStore.keyStore.clear()

      // Cache should be empty after clearing
      const emptyKey = keyStore.getCurrentKey()
      expect(emptyKey).toBeUndefined()

      // Explicitly load from server to restore keys
      await fetchWorkspaceKeysUsingUseCase(app)

      // Now keys should be available again
      const reloadedKey = keyStore.getCurrentKey()
      expect(reloadedKey).toBeTruthy()
    })

    it("should reload keys from server", async () => {
      const key1 = await createWorkspaceKeyUsingUseCase(app, client)

      // Reload should clear and re-fetch
      keyStore.keyStore.clear()
      await fetchWorkspaceKeysUsingUseCase(app)

      const reloadedKey = keyStore.getKey(key1.id)
      expect(reloadedKey).toBeTruthy()
      expect(reloadedKey?.key).toBe(key1.key)
    })
  })

  describe("Current Key Resolution", () => {
    it("should return undefined when cache is cleared and not reloaded", async () => {
      // Workspaces are always created with initial keys (via generateInitialKeyParams).
      // After clearing cache, the current key should be undefined until reloaded.
      keyStore.keyStore.clear()

      const key = keyStore.getCurrentKey()
      expect(key).toBeUndefined()
    })

    it("should return a key after explicitly loading from server", async () => {
      // Clear cache
      keyStore.keyStore.clear()

      // Explicitly load keys from server
      await fetchWorkspaceKeysUsingUseCase(app)

      const key = keyStore.getCurrentKey()
      expect(key).toBeTruthy()
      expect(key?.workspaceId).toBe(workspaceId)
    })

    it("should return existing key if available", async () => {
      const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

      const key = keyStore.getCurrentKey()
      expect(key?.id).toBe(createdKey.id)
      expect(key?.key).toBe(createdKey.key)
    })

    it("should return the latest generation key", async () => {
      await createWorkspaceKeyUsingUseCase(app, client)
      const latestKey = await createWorkspaceKeyUsingUseCase(app, client)

      const key = keyStore.getCurrentKey()
      expect(key?.id).toBe(latestKey.id)
      expect(key?.generation).toBe(latestKey.generation)
    })
  })

  describe("Multi-generation Key Scenarios", () => {
    it("should handle key rotation correctly", async () => {
      // Create initial key (simulating workspace creation)
      const key1 = await createWorkspaceKeyUsingUseCase(app, client)

      // Rotate key (create new generation)
      const key2 = await createWorkspaceKeyUsingUseCase(app, client)

      // Both keys should be accessible
      const retrievedKey1 = keyStore.getKey(key1.id)
      const retrievedKey2 = keyStore.getKey(key2.id)

      expect(retrievedKey1).toBeTruthy()
      expect(retrievedKey2).toBeTruthy()
      expect(retrievedKey1?.key).not.toBe(retrievedKey2?.key)
    })

    it("should decrypt data encrypted with old key after rotation", async () => {
      // Create first key
      const oldKey = await createWorkspaceKeyUsingUseCase(app, client)
      const oldKeyValue = oldKey.key

      // Rotate to new key
      await createWorkspaceKeyUsingUseCase(app, client)

      // Clear cache and explicitly reload from server
      keyStore.keyStore.clear()
      await fetchWorkspaceKeysUsingUseCase(app)

      // Should still be able to get the old key for decryption
      const retrievedOldKey = keyStore.getKey(oldKey.id)
      expect(retrievedOldKey).toBeTruthy()
      expect(retrievedOldKey?.key).toBe(oldKeyValue)
    })
  })

  describe("Key Share Verification", () => {
    it("should persist key share across cache clears", async () => {
      // Create key
      const key = await createWorkspaceKeyUsingUseCase(app, client)
      const originalKeyValue = key.key

      // Clear all caches
      keyStore.keyStore.clear()

      // Reload from server - should decrypt share correctly
      await fetchWorkspaceKeysUsingUseCase(app)

      const reloadedKey = keyStore.getKey(key.id)

      expect(reloadedKey).toBeTruthy()
      expect(reloadedKey?.key).toBe(originalKeyValue)
    })

    it("should verify share signatures during decryption", async () => {
      // Create key
      const key = await createWorkspaceKeyUsingUseCase(app, client)

      // Clear cache and explicitly reload from server - signature verification happens during decryption
      keyStore.keyStore.clear()
      await fetchWorkspaceKeysUsingUseCase(app)

      const reloadedKey = keyStore.getCurrentKey()

      // If signature was invalid, this would be null
      expect(reloadedKey).toBeTruthy()
      expect(reloadedKey?.id).toBe(key.id)
    })
  })

  describe("Cross-session Key Persistence", () => {
    it("should load keys from server after simulated session restart", async () => {
      // Create key
      const key = await createWorkspaceKeyUsingUseCase(app, client)

      // Simulate session restart by clearing all in-memory state
      keyStore.keyStore.clear()

      // Explicitly load keys from server (simulates Application.initialize() flow)
      await fetchWorkspaceKeysUsingUseCase(app)

      // Keys should now be in cache
      const loadedKey = keyStore.getCurrentKey()

      expect(loadedKey).toBeTruthy()
      expect(loadedKey?.id).toBe(key.id)
      expect(loadedKey?.key).toBe(key.key)
    })
  })
})

describe("Workspace Registration Integration Tests", () => {
  let client: GlobalClient | null = null

  afterEach(async () => {
    if (!client) {
      return
    }

    try {
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    } finally {
      client = null
    }
  })

  it("should create a local workspace with a stored plaintext key", async () => {
    const initResult = await initializeGlobalClient("local-workspace-key")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()

    // Local workspaces must remain unregistered until explicitly uploaded.
    expect(localWorkspace.isRegisteredWithServer).toBe(false)

    // The plaintext key should be persisted for offline usage.
    const localKey = await client.getGetLocalWorkspaceKey().execute(localWorkspace.uuid)
    expect(localKey).not.toBeNull()
    expect(localKey!.id).toBe(localWorkspace.currentWorkspaceKeyId)
  })

  it("should keep the local workspace as current and listed after creation", async () => {
    const initResult = await initializeGlobalClient("local-workspace-current")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()

    const currentWorkspace = client.getWorkspaceStore().getCurrentWorkspace()
    expect(currentWorkspace).not.toBeNull()
    expect(currentWorkspace!.uuid).toBe(localWorkspace.uuid)

    const allWorkspaces = client.getWorkspaceStore().getAllWorkspaces()
    expect(allWorkspaces.some(workspace => workspace.uuid === localWorkspace.uuid)).toBe(true)
  })

  it("should register an existing local workspace while preserving the key ID", async () => {
    const initResult = await initializeGlobalClient("register-existing-workspace")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()
    const localKey = await client.getGetLocalWorkspaceKey().execute(localWorkspace.uuid)

    if (!localKey) {
      throw new Error("Local workspace key was not persisted")
    }

    // Register a user after the local workspace exists (matches onboarding flow).
    const testUser = generateTestUser("register-existing-workspace")
    const registerResult = await client
      .getRegister()
      .execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
    if (registerResult.isFailed()) {
      throw new Error(`Registration failed: ${registerResult.getError()}`)
    }
    const user = registerResult.getValue()

    const identityKeys = requireIdentityKeysForClient(client, user.uuid)
    const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
    if (!accountStore) {
      throw new Error("Account store not found for workspace registration")
    }

    // Register the existing workspace with the server using the same key material.
    const registerWorkspaceResult = await client
      .getRegisterExistingWorkspaceWithServer()
      .execute(localWorkspace.uuid, localWorkspace.name, localKey, accountStore, identityKeys)
    if (registerWorkspaceResult.isFailed()) {
      throw new Error(`Workspace registration failed: ${registerWorkspaceResult.getError()}`)
    }
    const registeredWorkspace = registerWorkspaceResult.getValue()

    expect(registeredWorkspace.uuid).toBe(localWorkspace.uuid)
    expect(registeredWorkspace.isRegisteredWithServer).toBe(true)
    expect(registeredWorkspace.currentWorkspaceKeyId).toBe(localKey.id)

    const storedWorkspace = client.getWorkspaceStore().getWorkspaceByUuid(localWorkspace.uuid)
    expect(storedWorkspace?.isRegisteredWithServer).toBe(true)

    // Validate that the registered key can be loaded into the KeyStore.
    const app = createApplicationForClient(client, registeredWorkspace.uuid, { accountId: user.uuid })
    await app.initialize()

    const keyStore = app.getKeyStore()
    const currentKey = keyStore.getCurrentKey()
    expect(currentKey).toBeTruthy()
    expect(currentKey?.id).toBe(localKey.id)

    app.destroy()
  })

  it("should reload the registered workspace key from the server after clearing storage", async () => {
    const initResult = await initializeGlobalClient("register-workspace-client-a")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()
    const localKey = await client.getGetLocalWorkspaceKey().execute(localWorkspace.uuid)

    if (!localKey) {
      throw new Error("Local workspace key was not persisted")
    }

    // Register a user and upload the workspace using the existing key material.
    const testUser = generateTestUser("register-workspace-client-a")
    const registerResult = await client
      .getRegister()
      .execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
    if (registerResult.isFailed()) {
      throw new Error(`Registration failed: ${registerResult.getError()}`)
    }
    const user = registerResult.getValue()

    const identityKeys = requireIdentityKeysForClient(client, user.uuid)
    const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
    if (!accountStore) {
      throw new Error("Account store not found for workspace registration")
    }

    const registerExistingResult = await client
      .getRegisterExistingWorkspaceWithServer()
      .execute(localWorkspace.uuid, localWorkspace.name, localKey, accountStore, identityKeys)
    if (registerExistingResult.isFailed()) {
      throw new Error(`Workspace registration failed: ${registerExistingResult.getError()}`)
    }

    // Simulate a fresh device by clearing local key storage before reloading keys.
    await client.getOfflineDatabase().clearWorkspace(localWorkspace.uuid)

    const app = createApplicationForClient(client, localWorkspace.uuid, { accountId: user.uuid })
    await app.initialize()

    const keyStore = app.getKeyStore()
    const currentKey = keyStore.getCurrentKey()
    expect(currentKey).toBeTruthy()
    expect(currentKey?.id).toBe(localKey.id)

    app.destroy()
  })

  it("should persist registered workspace keys for the authenticated user", async () => {
    const initResult = await initializeGlobalClient("register-workspace-key-store")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()
    const localKey = await client.getGetLocalWorkspaceKey().execute(localWorkspace.uuid)

    if (!localKey) {
      throw new Error("Local workspace key was not persisted")
    }

    const testUser = generateTestUser("register-workspace-key-store")
    const registerResult = await client
      .getRegister()
      .execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
    if (registerResult.isFailed()) {
      throw new Error(`Registration failed: ${registerResult.getError()}`)
    }
    const user = registerResult.getValue()

    const identityKeys = requireIdentityKeysForClient(client, user.uuid)
    const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
    if (!accountStore) {
      throw new Error("Account store not found for workspace registration")
    }

    const registerExistingResult = await client
      .getRegisterExistingWorkspaceWithServer()
      .execute(localWorkspace.uuid, localWorkspace.name, localKey, accountStore, identityKeys)
    if (registerExistingResult.isFailed()) {
      throw new Error(`Workspace registration failed: ${registerExistingResult.getError()}`)
    }

    const keyRepository = new WorkspaceKeyRepository(client.getOfflineDatabase())
    const storedKeys = await keyRepository.getKeysByUser(localWorkspace.uuid, identityKeys.userId)

    expect(storedKeys.length).toBeGreaterThanOrEqual(1)
    expect(storedKeys.some(key => key.workspace_key_id === localKey.id)).toBe(true)
  })

  it("should retain the anonymous key record alongside the registered key", async () => {
    const initResult = await initializeGlobalClient("register-workspace-anon-key")
    client = initResult.client

    const createLocalWorkspaceResult = await client.getCreateLocalWorkspace().execute("Local Workspace")
    if (createLocalWorkspaceResult.isFailed()) {
      throw new Error(`Failed to create local workspace: ${createLocalWorkspaceResult.getError()}`)
    }
    const localWorkspace = createLocalWorkspaceResult.getValue()
    const localKey = await client.getGetLocalWorkspaceKey().execute(localWorkspace.uuid)

    if (!localKey) {
      throw new Error("Local workspace key was not persisted")
    }

    const testUser = generateTestUser("register-workspace-anon-key")
    const registerResult = await client
      .getRegister()
      .execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
    if (registerResult.isFailed()) {
      throw new Error(`Registration failed: ${registerResult.getError()}`)
    }
    const user = registerResult.getValue()

    const identityKeys = requireIdentityKeysForClient(client, user.uuid)
    const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
    if (!accountStore) {
      throw new Error("Account store not found for workspace registration")
    }

    const registerExistingResult = await client
      .getRegisterExistingWorkspaceWithServer()
      .execute(localWorkspace.uuid, localWorkspace.name, localKey, accountStore, identityKeys)
    if (registerExistingResult.isFailed()) {
      throw new Error(`Workspace registration failed: ${registerExistingResult.getError()}`)
    }

    const keyRepository = new WorkspaceKeyRepository(client.getOfflineDatabase())
    const anonymousKeys = await keyRepository.getKeysByUser(
      localWorkspace.uuid,
      LOCAL_ANONYMOUS_WORKSPACE_USER_ID
    )

    expect(anonymousKeys.some(key => key.workspace_key_id === localKey.id)).toBe(true)
  })
})

describe("Workspace Key Multi-User Integration Tests (V2)", () => {
  let client1: GlobalClient
  let client2: GlobalClient
  let app1: WorkspaceRuntime
  let app2: WorkspaceRuntime
  let workspace: Workspace

  beforeEach(async () => {
    const result = await createCollaborativeClientAndApplicationPair()
    client1 = result.client1
    client2 = result.client2
    app1 = result.app1
    app2 = result.app2
    workspace = result.workspace
  })

  afterEach(async () => {
    try {
      app1.getKeyStore().keyStore.clear()
      app2.getKeyStore().keyStore.clear()
      app1.destroy()
      app2.destroy()
      if (client1.getUsersStore().hasUsers()) {
        await client1.getLogoutAllAccounts().execute()
      }
      if (client2.getUsersStore().hasUsers()) {
        await client2.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Key Sharing Between Users", () => {
    it("should create key share for another user", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Add user2 as a workspace member first
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore2 = app2.getKeyStore()

      // User 1 creates a workspace key
      const key = await createWorkspaceKeyUsingUseCase(app1, client1)

      // User 1 creates shares for User 2 across all workspace keys
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // User 2 loads keys from server to get the new share
      await fetchWorkspaceKeysUsingUseCase(app2)

      // User 2 should now be able to get the key from cache
      const user2Key = keyStore2.getKey(key.id)

      expect(user2Key).toBeTruthy()
      expect(user2Key?.key).toBe(key.key)
    })

    it("should allow both users to access the same key", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Add user2 as a workspace member first
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore1 = app1.getKeyStore()
      const keyStore2 = app2.getKeyStore()

      // User 1 creates and shares a key
      await createWorkspaceKeyUsingUseCase(app1, client1)
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // User 2 needs to load keys from server to get the new share
      await fetchWorkspaceKeysUsingUseCase(app2)

      // Both users now have the key in cache
      const user1Key = keyStore1.getCurrentKey()
      const user2Key = keyStore2.getCurrentKey()

      expect(user1Key).toBeTruthy()
      expect(user2Key).toBeTruthy()
      expect(user1Key?.key).toBe(user2Key?.key)
    })

    it("should handle multiple key generations with shared access", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Add user2 as a workspace member first
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore2 = app2.getKeyStore()

      // Create and share first key
      const key1 = await createWorkspaceKeyUsingUseCase(app1, client1)

      // Rotate: create and share second key
      const key2 = await createWorkspaceKeyUsingUseCase(app1, client1)
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // Reload User 2's keys
      await fetchWorkspaceKeysUsingUseCase(app2)

      // User 2 should have access to both keys
      const user2Key1 = keyStore2.getKey(key1.id)
      const user2Key2 = keyStore2.getKey(key2.id)

      expect(user2Key1).toBeTruthy()
      expect(user2Key2).toBeTruthy()
      expect(user2Key1?.key).toBe(key1.key)
      expect(user2Key2?.key).toBe(key2.key)
    })
  })

  describe("User Isolation", () => {
    it("should not allow user without share to decrypt key", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!

      // Add user2 as a workspace member so they can access the workspace
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore2 = app2.getKeyStore()

      // User 1 creates a key but does NOT share with User 2
      const key = await createWorkspaceKeyUsingUseCase(app1, client1)

      // User 2 clears cache and fetches from server to try to get the new key
      keyStore2.keyStore.clear()
      await fetchWorkspaceKeysUsingUseCase(app2)

      // User 2 tries to get the specific key - should be undefined (no share exists for them)
      const user2Key = keyStore2.getKey(key.id)

      expect(user2Key).toBeUndefined()
    })

    it("should maintain separate caches per client", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Add user2 as a workspace member first
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore1 = app1.getKeyStore()
      const keyStore2 = app2.getKeyStore()

      // User 1 creates and shares a key
      await createWorkspaceKeyUsingUseCase(app1, client1)
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // Load keys for user2 first
      await fetchWorkspaceKeysUsingUseCase(app2)

      // Clear User 1's cache
      keyStore1.keyStore.clear()

      // User 2's cache is independent and still has keys
      const user2Key = keyStore2.getCurrentKey()
      expect(user2Key).toBeTruthy()

      // User 1's cache is empty after clearing
      const user1EmptyKey = keyStore1.getCurrentKey()
      expect(user1EmptyKey).toBeUndefined()

      // User 1 needs to explicitly reload
      await fetchWorkspaceKeysUsingUseCase(app1)
      const user1Key = keyStore1.getCurrentKey()
      expect(user1Key).toBeTruthy()
    })
  })

  describe("Cryptographic Integrity", () => {
    it("should use different keypairs for encryption and signing", async () => {
      const user1IdentityKeys = requireIdentityKeysForClient(client1)

      // Verify that box (encryption) and sign keys are different
      expect(user1IdentityKeys.boxKeyPair.publicKey).not.toBe(user1IdentityKeys.signKeyPair.publicKey)
      expect(user1IdentityKeys.boxKeyPair.privateKey).not.toBe(user1IdentityKeys.signKeyPair.privateKey)
    })

    it("should generate cryptographically strong keys", async () => {
      // Create multiple keys and verify they're all different
      const keys: DecryptedWorkspaceKey[] = []
      for (let i = 0; i < 5; i++) {
        const key = await createWorkspaceKeyUsingUseCase(app1, client1)
        keys.push(key)
      }

      // All keys should be unique
      const uniqueKeys = new Set(keys.map(k => k.key))
      expect(uniqueKeys.size).toBe(5)

      // All keys should be 32 bytes (64 hex chars)
      for (const key of keys) {
        expect(key.key).toHaveLength(64)
      }
    })
  })
})

describe("Workspace Key IndexedDB Persistence", () => {
  /**
   * Tests that workspace keys are persisted to IndexedDB.
   * Per BOOK OF KEYS: "Workspace keys: stored encrypted in IndexedDB."
   * Since workspace keys are immutable, they don't need revalidation
   * and can be loaded from IndexedDB without requiring a server fetch.
   */
  let client: GlobalClient
  let app: WorkspaceRuntime
  let keyStore: KeyStore
  let workspaceId: string

  beforeEach(async () => {
    const result = await newClientWithWorkspace("indexeddb-storage-test")
    client = result.client
    workspaceId = result.workspace.uuid

    app = createApplicationForClient(client, workspaceId)
    await app.initialize()
    keyStore = app.getKeyStore()
  })

  afterEach(async () => {
    try {
      keyStore.keyStore.clear()
      app.destroy()
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  it("should persist decrypted workspace keys to IndexedDB", async () => {
    const identityKeys = requireIdentityKeysForClient(client)

    // Create a new key
    const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

    // Verify the key is stored in IndexedDB (scoped to user)
    const keyRepository = new WorkspaceKeyRepository(client.getOfflineDatabase())
    const storedKeys = await keyRepository.getKeysByUser(workspaceId, identityKeys.userId)
    expect(storedKeys.length).toBeGreaterThan(0)

    // Find and verify the created key
    const storedKey = storedKeys.find(k => k.workspace_key_id === createdKey.id)
    expect(storedKey).toBeDefined()
    expect(storedKey!.key).toBe(createdKey.key)
    expect(storedKey!.generation).toBe(createdKey.generation)
  })

  it("should load workspace keys from IndexedDB without server fetch", async () => {
    // Create a key and let it be stored in IndexedDB
    const createdKey = await createWorkspaceKeyUsingUseCase(app, client)

    // Clear the in-memory keyring to simulate a fresh session
    keyStore.keyStore.clear()

    // Track if a network request is made
    let networkFetchMade = false
    const makeWorkspaceRequest = app.getMakeWorkspaceRequest()
    const originalExecuteGet: <T>(
      url: string,
      options?: HttpRequestOptions
    ) => Promise<ApiResult<T>> = makeWorkspaceRequest.executeGet.bind(makeWorkspaceRequest)

    makeWorkspaceRequest.executeGet = async <T>(
      url: string,
      options?: HttpRequestOptions
    ): Promise<ApiResult<T>> => {
      if (url.includes("keys")) {
        networkFetchMade = true
      }
      return originalExecuteGet<T>(url, options)
    }

    // Initialize from IndexedDB (loads keys from IDB into memory cache)
    await keyStore.initialize()

    // Get key from cache - should have been loaded from IndexedDB
    const loadedKey = keyStore.getKey(createdKey.id)

    expect(loadedKey).toBeTruthy()
    expect(loadedKey?.id).toBe(createdKey.id)
    expect(loadedKey?.key).toBe(createdKey.key)
    expect(networkFetchMade).toBe(false) // Should not have fetched from server
  })

  it("should fetch new keys from server when IndexedDB has fewer keys", async () => {
    const identityKeys = requireIdentityKeysForClient(client)

    // Create first key
    await createWorkspaceKeyUsingUseCase(app, client)

    // Create second key
    const key2 = await createWorkspaceKeyUsingUseCase(app, client)

    // Clear memory and manually remove the second key from IndexedDB
    // to simulate a scenario where IndexedDB has fewer keys than server
    keyStore.keyStore.clear()
    const keyRepository = new WorkspaceKeyRepository(client.getOfflineDatabase())
    await keyRepository.deleteKey(workspaceId, key2.id, identityKeys.userId)

    // Initialize from IndexedDB first (only loads key1 since key2 was deleted)
    await keyStore.initialize()

    // Key2 is not in cache, so load from server
    await fetchWorkspaceKeysUsingUseCase(app)

    // Now the key should be available in cache
    const loadedKey = keyStore.getKey(key2.id)

    // Should have fetched the key from server
    expect(loadedKey).toBeTruthy()
    expect(loadedKey?.id).toBe(key2.id)
    expect(loadedKey?.key).toBe(key2.key)
  })

  it("should persist multiple key generations to IndexedDB", async () => {
    // Create multiple keys
    const key1 = await createWorkspaceKeyUsingUseCase(app, client)
    const key2 = await createWorkspaceKeyUsingUseCase(app, client)
    const key3 = await createWorkspaceKeyUsingUseCase(app, client)

    // Clear memory
    keyStore.keyStore.clear()

    // Initialize from IndexedDB to reload all keys into memory
    await keyStore.initialize()

    // Verify all keys were loaded from IndexedDB
    const loaded1 = keyStore.getKey(key1.id)
    const loaded2 = keyStore.getKey(key2.id)
    const loaded3 = keyStore.getKey(key3.id)

    expect(loaded1?.key).toBe(key1.key)
    expect(loaded2?.key).toBe(key2.key)
    expect(loaded3?.key).toBe(key3.key)
  })

  it("should clear IndexedDB keys when clearing workspace keys", async () => {
    const identityKeys = requireIdentityKeysForClient(client)

    // Create a key
    await createWorkspaceKeyUsingUseCase(app, client)

    // Clear workspace keys (should also clear IndexedDB)
    const keyRepository = new WorkspaceKeyRepository(client.getOfflineDatabase())
    await clearWorkspaceKeyCacheAndStorage(keyStore, keyRepository, workspaceId, identityKeys.userId)

    // Verify IndexedDB is cleared
    const storedKeys = await keyRepository.getKeysByUser(workspaceId, identityKeys.userId)
    expect(storedKeys.length).toBe(0)
  })
})

describe("Workspace Current Key ID Integration Tests", () => {
  let client: GlobalClient
  let app: WorkspaceRuntime
  let keyStore: KeyStore
  let workspaceId: string

  // Helper to create a new workspace key using the current workspace-scoped network stack.
  const createWorkspaceKeyAndPersistLocally = async (): Promise<DecryptedWorkspaceKey> => {
    const result = await new CreateWorkspaceKey(
      client.getCrypto(),
      app.getMakeWorkspaceRequest(),
      app.getCreateKeyShareForUser(),
      app.getAccountStore(),
      keyStore
    ).execute()

    if (result.isFailed()) {
      throw new Error(`Failed to create workspace key: ${result.getError()}`)
    }

    return result.getValue()
  }

  beforeEach(async () => {
    const result = await newClientWithWorkspace("current-key-test")
    client = result.client
    workspaceId = result.workspace.uuid

    app = createApplicationForClient(client, workspaceId)
    await app.initialize()
    keyStore = app.getKeyStore()
  })

  afterEach(async () => {
    try {
      keyStore.keyStore.clear()
      app.destroy()
      if (client.getUsersStore().hasUsers()) {
        await client.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Server-side current_workspace_key_id Updates", () => {
    it("should have current_workspace_key_id set from workspace creation", async () => {
      const workspaceStore = client.getWorkspaceStore()

      // Workspaces now have current_workspace_key_id set from creation
      // (the initial key is created atomically with the workspace)
      const workspace = workspaceStore.getWorkspaceByUuid(workspaceId)
      expect(workspace).toBeDefined()
      expect(workspace!.currentWorkspaceKeyId).toBeTruthy()
      expect(typeof workspace!.currentWorkspaceKeyId).toBe("string")

      // The initial key should already be in the keyring from workspace creation
      const currentKey = keyStore.getCurrentKey()
      expect(currentKey).toBeTruthy()
      expect(currentKey!.id).toBe(workspace!.currentWorkspaceKeyId)
      expect(currentKey!.generation).toBe(1)
    })

    it("should update current_workspace_key_id when creating subsequent keys (key rotation)", async () => {
      const workspaceStore = client.getWorkspaceStore()

      // The workspace already has an initial key from creation
      let workspace = workspaceStore.getWorkspaceByUuid(workspaceId)
      const initialKeyId = workspace!.currentWorkspaceKeyId
      expect(initialKeyId).toBeTruthy()

      // Create another key (key rotation)
      const rotatedKey = await createWorkspaceKeyAndPersistLocally()

      // Fetch and verify rotated key is now current
      const fetchAllResult = await client.getFetchAllWorkspaces().execute()
      if (fetchAllResult.isFailed()) {
        throw new Error(`Failed to fetch workspaces: ${fetchAllResult.getError()}`)
      }
      workspace = workspaceStore.getWorkspaceByUuid(workspaceId)
      expect(workspace!.currentWorkspaceKeyId).toBe(rotatedKey.id)

      // Verify the keys have different IDs
      expect(initialKeyId).not.toBe(rotatedKey.id)

      // Verify the rotated key has generation 2
      expect(rotatedKey.generation).toBe(2)
    })

    it("should always point to the latest generation key", async () => {
      const workspaceStore = client.getWorkspaceStore()

      // Create multiple keys in succession
      const keyIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const createdKey = await createWorkspaceKeyAndPersistLocally()
        keyIds.push(createdKey.id)
      }

      // Fetch workspace and verify current_workspace_key_id points to the last created key
      const fetchAllResult = await client.getFetchAllWorkspaces().execute()
      if (fetchAllResult.isFailed()) {
        throw new Error(`Failed to fetch workspaces: ${fetchAllResult.getError()}`)
      }
      const workspace = workspaceStore.getWorkspaceByUuid(workspaceId)

      expect(workspace).toBeDefined()
      expect(workspace!.currentWorkspaceKeyId).toBe(keyIds[keyIds.length - 1])
    })

    it("should match current_workspace_key_id with highest generation key from API", async () => {
      const workspaceStore = client.getWorkspaceStore()

      // Create a few keys
      await createWorkspaceKeyAndPersistLocally()
      await createWorkspaceKeyAndPersistLocally()
      const lastKey = await createWorkspaceKeyAndPersistLocally()

      // Clear cache and reload keys from server
      keyStore.keyStore.clear()
      const fetchResult = await app.getFetchWorkspaceKeys().execute()
      if (fetchResult.isFailed()) {
        throw new Error(`Failed to fetch workspace keys: ${fetchResult.getError()}`)
      }

      // Get current key from the KeyStore
      const currentKey = keyStore.getCurrentKey()

      // Fetch workspace to get current_workspace_key_id
      const fetchAllResult = await client.getFetchAllWorkspaces().execute()
      if (fetchAllResult.isFailed()) {
        throw new Error(`Failed to fetch workspaces: ${fetchAllResult.getError()}`)
      }
      const workspace = workspaceStore.getWorkspaceByUuid(workspaceId)

      // Both should match and point to the last created key
      expect(currentKey).toBeTruthy()
      expect(currentKey!.id).toBe(lastKey.id)
      expect(workspace!.currentWorkspaceKeyId).toBe(lastKey.id)
      expect(workspace!.currentWorkspaceKeyId).toBe(currentKey!.id)
    })
  })
})

/**
 * Integration tests for the E2EE invite flow.
 * Tests the createKeySharesForInvitee method used when inviting existing users.
 */
describe("E2EE Invite Flow Integration Tests", () => {
  let client1: GlobalClient
  let client2: GlobalClient
  let app1: WorkspaceRuntime
  let app2: WorkspaceRuntime
  let workspace: Workspace

  beforeEach(async () => {
    // Create two users with a shared workspace owned by user 1
    const result = await createCollaborativeClientAndApplicationPair()
    client1 = result.client1
    client2 = result.client2
    app1 = result.app1
    app2 = result.app2
    workspace = result.workspace
  })

  afterEach(async () => {
    try {
      app1.getKeyStore().keyStore.clear()
      app2.getKeyStore().keyStore.clear()
      app1.destroy()
      app2.destroy()
      if (client1.getUsersStore().hasUsers()) {
        await client1.getLogoutAllAccounts().execute()
      }
      if (client2.getUsersStore().hasUsers()) {
        await client2.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("createKeySharesForInvitee", () => {
    it("should create key shares for all workspace keys for an invitee", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // First, add user2 as a workspace member (required for key share access)
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore1 = app1.getKeyStore()
      const keyStore2 = app2.getKeyStore()

      // User 1 creates multiple workspace keys
      await createWorkspaceKeyUsingUseCase(app1, client1)
      await createWorkspaceKeyUsingUseCase(app1, client1)
      await createWorkspaceKeyUsingUseCase(app1, client1)

      // User 1 creates key shares for User 2 using the invite helper
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // User 2 should now be able to access all workspace keys
      await fetchWorkspaceKeysUsingUseCase(app2)

      // Verify User 2 can access the current key
      const user2CurrentKey = keyStore2.getCurrentKey()
      expect(user2CurrentKey).toBeTruthy()

      // The keys should match
      const user1CurrentKey = keyStore1.getCurrentKey()
      expect(user2CurrentKey?.key).toBe(user1CurrentKey?.key)
    })

    it("should succeed when workspace has initial key from creation", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Note: The workspace already has an initial key from creation
      // But we can still test that createKeySharesForInvitee handles any existing keys
      // Create shares for all existing keys
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)
    })

    it("should allow invitee to decrypt content after receiving key shares", async () => {
      const user2 = client2.getUsersStore().getUsers()[0]!
      const user2IdentityKeys = requireIdentityKeysForClient(client2)

      // Add user2 as a member first
      await addWorkspaceMember(app1, workspace.uuid, user2.email)

      const keyStore2 = app2.getKeyStore()

      // User 1 creates workspace key (privileged operation)
      const workspaceKey = await createWorkspaceKeyUsingUseCase(app1, client1)

      // User 1 creates key shares for User 2
      await shareWorkspaceKeysWithInviteeUsingUseCase(app1, user2.uuid, user2IdentityKeys.boxKeyPair.publicKey)

      // User 2 loads keys from server
      await fetchWorkspaceKeysUsingUseCase(app2)

      // User 2 retrieves the specific key by ID
      const retrievedKey = keyStore2.getKey(workspaceKey.id)

      // Keys should match exactly
      expect(retrievedKey).toBeTruthy()
      expect(retrievedKey?.id).toBe(workspaceKey.id)
      expect(retrievedKey?.key).toBe(workspaceKey.key)
      expect(retrievedKey?.workspaceId).toBe(workspace.uuid)
    })
  })
})

/**
 * Integration tests for the User-Without-Account Invite Flow.
 * Tests the cryptographic invite link flow per BOOK OF ENCRYPTION:
 * 1. Inviter creates an invite_secret (never sent to server)
 * 2. Inviter encrypts all workspace keys into a bundle with invite_secret
 * 3. Inviter signs the bundle and uploads encrypted crypto_fields to server
 * 4. Invitee (after account creation) decrypts bundle using secret from URL fragment
 * 5. Invitee creates self-shares for all workspace keys
 */
describe("User-Without-Account Invite Flow Integration Tests", () => {
  let client1: GlobalClient
  let app1: WorkspaceRuntime
  let workspace: Workspace

  beforeEach(async () => {
    // Create a user with a workspace (the inviter)
    const result = await newClientWithWorkspace("inviter")
    client1 = result.client
    workspace = result.workspace

    app1 = createApplicationForClient(client1, workspace.uuid)
    await app1.initialize()
  })

  afterEach(async () => {
    try {
      app1.getKeyStore().keyStore.clear()
      app1.destroy()
      if (client1.getUsersStore().hasUsers()) {
        await client1.getLogoutAllAccounts().execute()
      }
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("Invite Bundle Creation", () => {
    it("should create an encrypted invite bundle with all workspace keys", async () => {
      const inviteService = app1.getInviteService()

      // Create invite with encrypted key bundle
      const inviteResult = await inviteService.createLinkInvite()
      expect(inviteResult.isFailed()).toBe(false)

      const invite = inviteResult.getValue()
      expect(invite).toBeTruthy()
      expect(invite.inviteId).toBeTruthy()
      expect(invite.inviteSecret).toBeTruthy()
      expect(invite.inviteUrl).toBeTruthy()

      // Verify URL structure: /invite/{id}?pub={key}#sk={secret}
      expect(invite.inviteUrl).toContain(`/invite/${invite.inviteId}`)
      expect(invite.inviteUrl).toContain("?pub=")
      expect(invite.inviteUrl).toContain("#sk=")

      // The secret should be in the URL fragment (never sent to server)
      const urlParts = invite.inviteUrl.split("#sk=")
      expect(urlParts.length).toBe(2)
      expect(urlParts[1]).toBe(invite.inviteSecret)
    })

    it("should include inviter's sign public key in URL for verification", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // URL should contain pub= query parameter with inviter's sign public key
      expect(invite.inviteUrl).toContain(`pub=${inviterIdentityKeys.signKeyPair.publicKey}`)
    })

    it("should generate unique invite secrets for each invite", async () => {
      const inviteService = app1.getInviteService()

      const invite1Result = await inviteService.createLinkInvite()
      const invite2Result = await inviteService.createLinkInvite()

      const invite1 = invite1Result.getValue()
      const invite2 = invite2Result.getValue()

      // Each invite should have a unique secret
      expect(invite1.inviteSecret).not.toBe(invite2.inviteSecret)
      expect(invite1.inviteId).not.toBe(invite2.inviteId)
    })

    it("should encrypt workspace keys with XChaCha20-Poly1305 using invite secret", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Fetch the invite from server to verify crypto fields are stored
      const fetchedInvite = await inviteService.fetchInvite(invite.inviteId)
      expect(fetchedInvite.isFailed()).toBe(false)

      const inviteData = fetchedInvite.getValue()
      expect(inviteData.crypto_fields).toBeTruthy()
      expect(inviteData.crypto_fields.wrapped_workspace_keys_ciphertext).toBeTruthy()
      expect(inviteData.crypto_fields.wrapped_workspace_keys_nonce).toBeTruthy()
      expect(inviteData.crypto_fields.inviter_sign_public_key).toBe(inviterIdentityKeys.signKeyPair.publicKey)
      expect(inviteData.crypto_fields.invite_signature).toBeTruthy()
    })

    it("should sign the invite bundle with Ed25519", async () => {
      const inviteService = app1.getInviteService()
      const cryptoService = client1.getCrypto()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Fetch invite and verify signature
      const fetchedInvite = await inviteService.fetchInvite(invite.inviteId)
      const inviteData = fetchedInvite.getValue()

      // Build the signature string and verify
      const signatureString = inviteService.buildInviteSignatureString({
        workspaceId: workspace.uuid,
        inviteId: invite.inviteId,
        nonce: inviteData.crypto_fields.wrapped_workspace_keys_nonce,
        ciphertext: inviteData.crypto_fields.wrapped_workspace_keys_ciphertext,
        inviterSignPublicKey: inviteData.crypto_fields.inviter_sign_public_key,
        createdAt: inviteData.crypto_fields.signed_at,
      })

      const isValid = await cryptoService.verifySignature(
        signatureString,
        inviteData.crypto_fields.invite_signature,
        inviteData.crypto_fields.inviter_sign_public_key
      )
      expect(isValid).toBe(true)
    })
  })

  describe("Invite Bundle Decryption", () => {
    it("should decrypt invite bundle with correct invite secret", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()
      const keyStore = app1.getKeyStore()

      // Create invite
      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Get current workspace keys for comparison
      const currentKey = keyStore.getCurrentKey()
      if (!currentKey) {
        throw new Error("Expected current workspace key to be available before invite decryption")
      }

      // Simulate invitee decrypting the bundle (normally done by a new user)
      const decryptResult = await inviteService.decryptInviteBundle(
        invite.inviteId,
        invite.inviteSecret,
        inviterIdentityKeys.signKeyPair.publicKey // From URL pub= parameter
      )
      expect(decryptResult.isFailed()).toBe(false)

      const bundle = decryptResult.getValue()
      expect(bundle.workspaceId).toBe(workspace.uuid)
      expect(bundle.keys.length).toBeGreaterThan(0)

      // The decrypted keys should match the original workspace keys
      const decryptedCurrentKey = bundle.keys.find(k => k.workspaceKeyId === currentKey.id)
      expect(decryptedCurrentKey).toBeTruthy()
      expect(decryptedCurrentKey!.workspaceKey).toBe(currentKey.key)
    })

    it("should fail decryption with wrong invite secret", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()
      const cryptoService = client1.getCrypto()

      // Create invite
      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Generate a wrong secret
      const wrongSecret = await cryptoService.generateRandomHex(32)

      // Attempt to decrypt with wrong secret should fail
      const decryptResult = await inviteService.decryptInviteBundle(
        invite.inviteId,
        wrongSecret,
        inviterIdentityKeys.signKeyPair.publicKey
      )
      expect(decryptResult.isFailed()).toBe(true)
    })

    it("should fail verification if inviter public key doesn't match", async () => {
      const inviteService = app1.getInviteService()
      const cryptoService = client1.getCrypto()

      // Create invite
      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Generate a fake public key
      const fakePublicKey = await cryptoService.generateRandomHex(32)

      // Attempt to decrypt with mismatched public key should fail signature verification
      const decryptResult = await inviteService.decryptInviteBundle(
        invite.inviteId,
        invite.inviteSecret,
        fakePublicKey
      )
      expect(decryptResult.isFailed()).toBe(true)
    })
  })

  describe("Invite Acceptance and Self-Share Creation", () => {
    it("should create self-shares for all workspace keys after accepting invite", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()

      // Create invite
      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Create a new user (the invitee) in a separate client
      const { client: client2, user: inviteeUser } = await newClientWithRegisteredUser("invitee")

      // Invitee decrypts the bundle before any Application exists.
      const decryptResult = await client2.getDecryptInviteBundle().execute({
        accountUserId: inviteeUser.uuid,
        inviteId: invite.inviteId,
        inviteSecret: invite.inviteSecret,
        inviterSignPublicKey: inviterIdentityKeys.signKeyPair.publicKey,
      })
      expect(decryptResult.isFailed()).toBe(false)
      const bundle = decryptResult.getValue()

      // Invitee accepts invite and creates self-shares
      const inviteeAccountStore = client2.getAccountStoreContainer().getAccountStore(inviteeUser.uuid)
      if (!inviteeAccountStore) {
        throw new Error("Account store not found for invitee")
      }
      const acceptResult = await client2
        .getAcceptLinkInvite()
        .execute(invite.inviteId, bundle, inviteeAccountStore)
      expect(acceptResult.isFailed()).toBe(false)

      // Now create Application to access workspace keys
      const app2 = createApplicationForClient(client2, workspace.uuid, { accountId: inviteeUser.uuid })
      await app2.initialize()
      const keyStore2 = app2.getKeyStore()

      // Verify invitee can now access workspace keys
      const inviteeKey = keyStore2.getCurrentKey()
      expect(inviteeKey).toBeTruthy()

      // Keys should match inviter's keys
      const inviterKey = app1.getKeyStore().getCurrentKey()
      expect(inviterKey).toBeTruthy()
      expect(inviteeKey?.key).toBe(inviterKey?.key)

      // Cleanup
      app2.destroy()
      await client2.getLogoutAllAccounts().execute()
    })

    it("should handle invites to workspaces with multiple key generations", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()

      // Create multiple workspace keys (key rotation)
      await createWorkspaceKeyUsingUseCase(app1, client1)
      await createWorkspaceKeyUsingUseCase(app1, client1)
      const thirdKey = await createWorkspaceKeyUsingUseCase(app1, client1)

      // Create invite - should include all keys
      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Create invitee and accept
      const { client: client2, user: inviteeUser } = await newClientWithRegisteredUser("invitee2")

      const decryptResult = await client2.getDecryptInviteBundle().execute({
        accountUserId: inviteeUser.uuid,
        inviteId: invite.inviteId,
        inviteSecret: invite.inviteSecret,
        inviterSignPublicKey: inviterIdentityKeys.signKeyPair.publicKey,
      })
      const bundle = decryptResult.getValue()

      // Bundle should contain all key generations (initial + 3 created = 4 total)
      expect(bundle.keys.length).toBeGreaterThanOrEqual(4)

      const inviteeAccountStore = client2.getAccountStoreContainer().getAccountStore(inviteeUser.uuid)
      if (!inviteeAccountStore) {
        throw new Error("Account store not found for invitee")
      }
      const acceptResult = await client2
        .getAcceptLinkInvite()
        .execute(invite.inviteId, bundle, inviteeAccountStore)
      if (acceptResult.isFailed()) {
        throw new Error(`Invite acceptance failed: ${acceptResult.getError()}`)
      }

      // Create Application to access keys
      const app2 = createApplicationForClient(client2, workspace.uuid, { accountId: inviteeUser.uuid })
      await app2.initialize()
      const keyStore2 = app2.getKeyStore()

      // Invitee should have access to all keys including the latest
      const latestKey = keyStore2.getKey(thirdKey.id)
      expect(latestKey).toBeTruthy()
      expect(latestKey?.key).toBe(thirdKey.key)

      // Cleanup
      app2.destroy()
      await client2.getLogoutAllAccounts().execute()
    })
  })

  describe("Invite API Endpoints", () => {
    it("should store invite with crypto fields on server", async () => {
      const inviteService = app1.getInviteService()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Fetch invite via API (without auth - public endpoint)
      const fetchResult = await inviteService.fetchInvite(invite.inviteId)
      expect(fetchResult.isFailed()).toBe(false)

      const inviteData = fetchResult.getValue()
      expect(inviteData.id).toBe(invite.inviteId)
      expect(inviteData.workspace_id).toBe(workspace.uuid)
      expect(inviteData.workspace_name).toBeTruthy()
      expect(inviteData.crypto_fields).toBeTruthy()
    })

    it("should return workspace name for invite display", async () => {
      const inviteService = app1.getInviteService()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      const fetchResult = await inviteService.fetchInvite(invite.inviteId)
      const inviteData = fetchResult.getValue()

      // Workspace name should be returned for UI display
      expect(inviteData.workspace_name).toBe(workspace.name)
    })

    it("should return inviter name for invite display", async () => {
      const inviteService = app1.getInviteService()
      const inviterUser = client1.getUsersStore().getUsers()[0]

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      const fetchResult = await inviteService.fetchInvite(invite.inviteId)
      const inviteData = fetchResult.getValue()

      expect(inviterUser).toBeTruthy()
      expect(inviteData.inviter_user_id).toBe(inviterUser!.uuid)
      // Server derives the display name from the email prefix (see deriveInviteeDisplayName).
      const expectedInviterName = inviterUser!.email.split("@")[0]
      expect(inviteData.inviter_user_name).toBe(expectedInviterName)
    })

    it("should accept invite and add user as workspace member", async () => {
      const inviterIdentityKeys = requireIdentityKeysForClient(client1)
      const inviteService = app1.getInviteService()

      const inviteResult = await inviteService.createLinkInvite()
      const invite = inviteResult.getValue()

      // Create invitee
      const { client: client2, user: inviteeUser } = await newClientWithRegisteredUser("invitee3")
      const decryptResult = await client2.getDecryptInviteBundle().execute({
        accountUserId: inviteeUser.uuid,
        inviteId: invite.inviteId,
        inviteSecret: invite.inviteSecret,
        inviterSignPublicKey: inviterIdentityKeys.signKeyPair.publicKey,
      })
      const bundle = decryptResult.getValue()

      const inviteeAccountStore = client2.getAccountStoreContainer().getAccountStore(inviteeUser.uuid)
      if (!inviteeAccountStore) {
        throw new Error("Account store not found for invitee")
      }
      const acceptResult = await client2
        .getAcceptLinkInvite()
        .execute(invite.inviteId, bundle, inviteeAccountStore)
      expect(acceptResult.isFailed()).toBe(false)

      // Verify invitee is now a member
      const fetchAllResult = await client2.getFetchAllWorkspaces().execute()
      if (fetchAllResult.isFailed()) {
        throw new Error(`Failed to fetch workspaces: ${fetchAllResult.getError()}`)
      }
      const inviteeWorkspace = client2.getWorkspaceStore().getWorkspaceByUuid(workspace.uuid)
      expect(inviteeWorkspace).toBeTruthy()

      // Cleanup
      await client2.getLogoutAllAccounts().execute()
    })
  })
})
