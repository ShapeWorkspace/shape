import "./setup"

import * as Y from "yjs"
import { v4 as uuidv4 } from "uuid"
import type { ClientEntity, EntityContent, EntityMetaFields } from "../../models/entity"
import type { EntityType } from "../../utils/encryption-types"
import type { IdentityKeys } from "../../models/auth-types"
import type { SearchIndexInterface } from "../../search/search-types"
import { GlobalClient } from "../../global/global-client"
import { ClientUser } from "../../models/client_user"
import { Workspace } from "../../models/workspace"
import { WorkspaceSubscription, WorkspaceSubscriptionServerDto } from "../../models/workspace-subscription"
import { buildAuthenticatedAPIHeaders } from "../../utils/api-headers"
import { HttpClient } from "../../services/http-client"
import { WorkspaceRuntime } from "../../workspace-runtime/workspace-runtime"
import { NullSearchIndex } from "../helpers/null-search-index"
import { InMemoryStorageProvider, getSharedStorage } from "./setup"
import { InMemoryOfflineDatabase } from "./in-memory-offline-database"

// Determine if a URL is absolute (has http:// or https:// prefix)
const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value)

// Declare process for Node.js environment
declare const process: { env: Record<string, string | undefined> }

// Default server origin for tests - requires TEST_SERVER_ORIGIN or VITE_SERVER_PORT env var.
const DEFAULT_SERVER_ORIGIN = (() => {
  if (process.env.TEST_SERVER_ORIGIN) {
    return process.env.TEST_SERVER_ORIGIN.replace(/\/+$/, "")
  }
  if (process.env.VITE_SERVER_PORT) {
    return `http://127.0.0.1:${process.env.VITE_SERVER_PORT}`
  }
  throw new Error("TEST_SERVER_ORIGIN or VITE_SERVER_PORT environment variable is required")
})()

/**
 * Normalizes a relative path by ensuring it starts with a single slash
 * and has no trailing slashes.
 */
const normalizeRelativePath = (path: string): string => {
  const trimmed = path.replace(/^\/+/, "").replace(/\/+$/, "")
  if (trimmed.length === 0) {
    return "/"
  }
  return `/${trimmed}`
}

/**
 * Resolves the API base URL for tests.
 * Priority: VITE_API_URL env var > DEFAULT_SERVER_ORIGIN/api
 */
const resolveTestApiBaseUrl = (): string => {
  const rawApiUrl = process.env.VITE_API_URL?.trim()
  if (rawApiUrl && rawApiUrl.length > 0) {
    if (isAbsoluteUrl(rawApiUrl)) {
      return rawApiUrl.replace(/\/+$/, "")
    }
    return `${DEFAULT_SERVER_ORIGIN}${normalizeRelativePath(rawApiUrl)}`
  }
  return `${DEFAULT_SERVER_ORIGIN}/api`
}

// Resolved API base URL - computed once at module load
export const resolvedTestApiBaseUrl = resolveTestApiBaseUrl()

/**
 * Generates a unique workspace name with an optional prefix.
 * Uses UUID to ensure uniqueness across concurrent test runs.
 */
export function generateTestWorkspaceName(prefix: string = "Test Workspace"): string {
  return `${prefix} ${uuidv4().slice(0, 8)}`
}

/**
 * Checks if the API server is available by hitting the health endpoint.
 * Returns true if the server responds with 200 OK.
 */
export async function isApiServerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${resolvedTestApiBaseUrl}/health`, { method: "GET" })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Generates unique test user credentials.
 * Email format: test{suffix}_{randomId}@example.com
 * Password format: securePassword{randomId}!{suffix}
 */
export function generateTestUser(suffix: string = "") {
  const randomId = Math.random().toString(36).substring(2, 8)
  return {
    email: `test${suffix}_${randomId}@example.com`,
    password: `securePassword${randomId}!${suffix}`,
  }
}

/**
 * Simple sleep utility - pauses execution for the specified milliseconds.
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Waits for a condition to become true, polling at regular intervals.
 * Throws an error if the condition is not met within the timeout.
 *
 * @param predicate - Function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait (default: 8000ms)
 * @param intervalMs - Time between checks (default: 200ms)
 */
export async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number = 8000,
  intervalMs: number = 200
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await sleep(intervalMs)
  }
  throw new Error("Timed out waiting for condition")
}

// Type for test subscription API response
type TestSubscriptionResponse = {
  subscription: WorkspaceSubscriptionServerDto
}

/**
 * Activates a test workspace subscription via the dev/test-only API.
 * This marks the workspace as paid so write guards remain permissive during tests.
 *
 * @param httpClient - HttpClient instance to make the request
 * @param userId - User ID for authentication headers
 * @param workspaceId - UUID of the workspace to activate
 * @param seats - Optional number of seats to provision
 */
export async function ensureTestWorkspaceSubscription(
  httpClient: HttpClient,
  userId: string,
  workspaceId: string,
  seats?: number
): Promise<WorkspaceSubscriptionServerDto> {
  const body = seats === undefined ? { workspace_id: workspaceId } : { workspace_id: workspaceId, seats }

  const response = await httpClient.post<TestSubscriptionResponse>(
    `/test/subscriptions`,
    JSON.stringify(body),
    buildAuthenticatedAPIHeaders(userId)
  )

  return response.subscription
}

/**
 * Initializes a GlobalClient with an in-memory storage provider.
 * Each client gets a unique storage namespace via the clientKey.
 *
 * @param clientKey - Unique key for storage namespace (default: "global")
 * @returns Object containing the client and storage provider
 */
export async function initializeGlobalClient(clientKey: string = "global"): Promise<{
  client: GlobalClient
  storage: InMemoryStorageProvider
}> {
  const storage = getSharedStorage()
  const offlineDatabase = new InMemoryOfflineDatabase()
  const client = new GlobalClient(storage, resolvedTestApiBaseUrl, offlineDatabase, clientKey)
  await client.initialize()
  return { client, storage }
}

/**
 * Creates a new GlobalClient and registers a new test user.
 * The user becomes the active user for the client.
 *
 * @param clientKey - Optional unique key for storage namespace
 * @returns Object containing client, storage, and the registered user
 */
export async function newClientWithRegisteredUser(clientKey?: string): Promise<{
  client: GlobalClient
  storage: InMemoryStorageProvider
  user: ClientUser
  testCredentials: { email: string; password: string }
}> {
  const { client, storage } = await initializeGlobalClient(clientKey)

  const testUser = generateTestUser(clientKey || "")
  const registerResult = await client
    .getRegister()
    .execute({ email: testUser.email, password: testUser.password, apiUrl: resolvedTestApiBaseUrl })
  if (registerResult.isFailed()) {
    throw new Error(`Registration failed: ${registerResult.getError()}`)
  }
  const user = registerResult.getValue()

  return { client, storage, user, testCredentials: testUser }
}

/**
 * Creates a new GlobalClient, registers a user, and creates a workspace.
 * Also activates the workspace subscription for testing.
 *
 * @param clientKey - Optional unique key for storage namespace
 * @param workspaceName - Optional workspace name (auto-generated if not provided)
 * @returns Object containing client, storage, user, workspace, and credentials
 */
export async function newClientWithWorkspace(
  clientKey?: string,
  workspaceName?: string
): Promise<{
  client: GlobalClient
  storage: InMemoryStorageProvider
  user: ClientUser
  workspace: Workspace
  testCredentials: { email: string; password: string }
}> {
  const { client, storage, user, testCredentials } = await newClientWithRegisteredUser(clientKey)

  // Get identity keys and account store for workspace creation
  const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
  if (!accountStore) {
    throw new Error("Account store not available after registration")
  }
  const identityKeys = accountStore.getIdentityKeys()
  if (!identityKeys) {
    throw new Error("Identity keys not available after registration")
  }

  // Create workspace with initial encryption key using the CreateWorkspace use case
  const resolvedWorkspaceName = workspaceName ?? generateTestWorkspaceName()
  const createWorkspaceResult = await client
    .getCreateWorkspace()
    .execute(resolvedWorkspaceName, accountStore, identityKeys)
  if (createWorkspaceResult.isFailed()) {
    throw new Error(`Workspace creation failed: ${createWorkspaceResult.getError()}`)
  }
  let workspace = createWorkspaceResult.getValue()

  // Activate subscription for testing (makes workspace writable)
  const subscriptionDto = await ensureTestWorkspaceSubscription(
    accountStore.getHttpClient(),
    user.uuid,
    workspace.uuid
  )
  const subscription = WorkspaceSubscription.fromServerDto(subscriptionDto)
  workspace = workspace.withSubscription(subscription)

  // Update the tracked workspace in the store
  client.getWorkspaceStore().setCurrentWorkspace(workspace)

  return { client, storage, user, workspace, testCredentials }
}

/**
 * Creates an Application instance for a client.
 * This is the standard way to create Applications in tests - it handles
 * getting identity keys, account store, and passing them to the constructor.
 *
 * @param client - GlobalClient instance to create Application for
 * @param workspaceId - UUID of the workspace
 * @returns Application instance (NOT initialized - call initialize() if needed)
 */
export function createApplicationForClient(
  client: GlobalClient,
  workspaceId: string,
  options?: {
    accountId?: string
    isWorkspaceRegisteredWithServer?: boolean
    searchIndex?: SearchIndexInterface
  }
): WorkspaceRuntime {
  const workspaceStore = client.getWorkspaceStore()
  const usersStore = client.getUsersStore()
  const resolvedAccountIdFromOptions = options?.accountId?.trim()
  const workspace = resolvedAccountIdFromOptions
    ? workspaceStore.getWorkspaceByUuid(workspaceId, resolvedAccountIdFromOptions)
    : workspaceStore.getWorkspaceByUuid(workspaceId)
  const isWorkspaceRegisteredWithServer =
    options?.isWorkspaceRegisteredWithServer ?? workspace?.isRegisteredWithServer ?? true

  let accountStore = null

  if (isWorkspaceRegisteredWithServer) {
    const users = usersStore.getUsers()
    const resolvedAccountId =
      resolvedAccountIdFromOptions ?? workspace?.userId ?? (users.length === 1 ? users[0].uuid : "")

    if (!resolvedAccountId) {
      throw new Error("Account ID required to initialize server-registered workspace")
    }

    accountStore = client.getAccountStoreContainer().getAccountStore(resolvedAccountId)
    if (!accountStore) {
      throw new Error(`Account store not found for user ${resolvedAccountId}`)
    }
  } else {
    // For local workspaces, create a local account store with ephemeral keys
    accountStore = client.getAccountStoreContainer().getOrCreateLocalAccountStore()
  }

  const resolvedSearchIndex = options?.searchIndex ?? new NullSearchIndex()

  // WorkspaceRuntime expects a StorageProvider; use the shared test storage instance.
  const storageProvider = getSharedStorage()

  return new WorkspaceRuntime(
    workspaceId,
    client.getCrypto(),
    accountStore,
    workspaceStore,
    client.getOfflineDatabase(),
    storageProvider,
    resolvedSearchIndex,
    isWorkspaceRegisteredWithServer
  )
}

/**
 * Creates and initializes an Application instance for a client.
 * This is the recommended helper for tests - combines creation and initialization
 * into a single async call, ensuring workspace keys are loaded before use.
 *
 * @param client - GlobalClient instance to create Application for
 * @param workspaceId - UUID of the workspace
 * @returns Initialized Application instance ready for use
 */
export async function createAndInitApplicationForClient(
  client: GlobalClient,
  workspaceId: string,
  options?: {
    accountId?: string
    isWorkspaceRegisteredWithServer?: boolean
    searchIndex?: SearchIndexInterface
  }
): Promise<WorkspaceRuntime> {
  const app = createApplicationForClient(client, workspaceId, options)
  await app.initialize()
  return app
}

/**
 * Returns identity keys for a client, enforcing a single-account or explicit account selection.
 */
export function requireIdentityKeysForClient(client: GlobalClient, accountId?: string): IdentityKeys {
  const users = client.getUsersStore().getUsers()
  const resolvedAccountId = accountId ?? users[0]?.uuid ?? ""
  if (!resolvedAccountId) {
    throw new Error("Account ID required to resolve identity keys")
  }

  const accountStore = client.getAccountStoreContainer().getAccountStore(resolvedAccountId)
  if (!accountStore) {
    throw new Error(`Account store not found for user ${resolvedAccountId}`)
  }

  const identityKeys = accountStore.getIdentityKeys()
  if (!identityKeys) {
    throw new Error("Identity keys not available for account")
  }

  return identityKeys
}

/**
 * Shares all currently available workspace keys with a recipient user.
 * Ensures keys are loaded before issuing share requests.
 */
async function shareWorkspaceKeysWithUser(
  application: WorkspaceRuntime,
  recipientUserId: string,
  recipientBoxPublicKey: string
): Promise<void> {
  const keyStore = application.getKeyStore()
  const createKeyShareForUser = application.getCreateKeyShareForUser()

  if (keyStore.getAllKeys().length === 0) {
    const fetchResult = await application.getFetchWorkspaceKeys().execute()
    if (fetchResult.isFailed()) {
      throw new Error(`Failed to fetch workspace keys: ${fetchResult.getError()}`)
    }
  }

  for (const key of keyStore.getAllKeys()) {
    const shareResult = await createKeyShareForUser.execute(
      key.id,
      recipientUserId,
      recipientBoxPublicKey,
      key.key
    )
    if (shareResult.isFailed()) {
      throw new Error(`Failed to share key ${key.id}: ${shareResult.getError()}`)
    }
  }
}

/**
 * Logs in an existing user with a new client instance.
 *
 * @param email - User's email
 * @param password - User's password
 * @param clientKey - Optional unique key for storage namespace
 * @returns Object containing client, storage, and the logged-in user
 */
export async function newClientWithExistingUser(params: {
  email: string
  password: string
  clientKey?: string
}): Promise<{
  client: GlobalClient
  storage: InMemoryStorageProvider
  user: ClientUser
}> {
  const { client, storage } = await initializeGlobalClient(params.clientKey)
  const loginResult = await client
    .getLogin()
    .execute({ email: params.email, password: params.password, apiUrl: resolvedTestApiBaseUrl })
  if (loginResult.isFailed()) {
    throw new Error(`Login failed: ${loginResult.getError()}`)
  }
  const user = loginResult.getValue()

  return { client, storage, user }
}

/**
 * Represents a single collaborative client in an N-client scenario.
 */
export type CollaborativeClient = {
  client: GlobalClient
  storage: InMemoryStorageProvider
  app: WorkspaceRuntime
  user: ClientUser
  workspace: Workspace
}

/**
 * Creates N collaborative clients in a shared workspace.
 * The first client creates the workspace and shares keys with all subsequent clients.
 * All clients are initialized with Applications and SSE connections ready.
 *
 * This is the recommended helper for tests needing multiple clients - it scales
 * from 1 to N clients without separate helper functions.
 *
 * @param count - Number of clients to create (must be >= 1)
 * @returns Array of CollaborativeClient objects, first is the workspace admin
 */
export async function createNCollaborativeClients(count: number): Promise<CollaborativeClient[]> {
  if (count < 1) {
    throw new Error("count must be at least 1")
  }

  // First client creates workspace (admin).
  const {
    client: adminClient,
    storage: adminStorage,
    user: adminUser,
    workspace,
  } = await newClientWithWorkspace("client1")

  // Temporary admin runtime used exclusively for key sharing.
  const temporaryAdminRuntime = createApplicationForClient(adminClient, workspace.uuid)
  await temporaryAdminRuntime.initialize()

  const collaborativeClients: CollaborativeClient[] = []

  // For remaining clients: register, add to workspace, share keys.
  for (let clientIndex = 2; clientIndex <= count; clientIndex += 1) {
    const { client, storage, user } = await newClientWithRegisteredUser(`client${clientIndex}`)

    const adminHttpClient = adminClient
      .getAccountStoreContainer()
      .getSureAccountStore(adminUser.uuid)
      .getHttpClient()

    // Add the new user as a workspace member.
    await adminHttpClient.post(
      `/workspaces/${workspace.uuid}/members`,
      JSON.stringify({ email: user.email, role: "member" }),
      buildAuthenticatedAPIHeaders(adminUser.uuid)
    )

    // Share workspace keys with the new user.
    const accountStore = client.getAccountStoreContainer().getAccountStore(user.uuid)
    if (!accountStore) {
      throw new Error(`Account store missing for client${clientIndex}`)
    }
    const identityKeys = accountStore.getIdentityKeys()
    if (!identityKeys) {
      throw new Error(`Identity keys missing for client${clientIndex}`)
    }

    await shareWorkspaceKeysWithUser(temporaryAdminRuntime, user.uuid, identityKeys.boxKeyPair.publicKey)

    // Placeholder app for the new client; we'll initialize a fresh runtime below.
    collaborativeClients.push({
      client,
      storage,
      user,
      workspace,
      app: null as unknown as WorkspaceRuntime,
    })
  }

  // Destroy the temporary admin runtime before creating the final runtimes.
  temporaryAdminRuntime.destroy()

  // Create and initialize the admin runtime.
  const adminRuntime = createApplicationForClient(adminClient, workspace.uuid)
  await adminRuntime.initialize()

  // Insert admin at the beginning of the results.
  collaborativeClients.unshift({
    client: adminClient,
    storage: adminStorage,
    user: adminUser,
    workspace,
    app: adminRuntime,
  })

  // Initialize runtimes for all remaining clients (index 1+).
  for (let clientIndex = 1; clientIndex < collaborativeClients.length; clientIndex += 1) {
    const runtime = createApplicationForClient(collaborativeClients[clientIndex].client, workspace.uuid)
    await runtime.initialize()
    collaborativeClients[clientIndex].app = runtime
  }

  return collaborativeClients
}

/**
 * Creates a pair of clients in a collaborative setup.
 * First client creates a workspace, second client is added as a member with shared keys.
 *
 * @returns Object containing both clients, users, and shared workspace
 */
export async function createCollaborativeClientPair(): Promise<{
  client1: GlobalClient
  client2: GlobalClient
  storage1: InMemoryStorageProvider
  storage2: InMemoryStorageProvider
  user1: ClientUser
  user2: ClientUser
  workspace: Workspace
}> {
  const collaborativeClients = await createNCollaborativeClients(2)

  const [firstClient, secondClient] = collaborativeClients
  if (!firstClient || !secondClient) {
    throw new Error("Expected two collaborative clients")
  }

  // Tear down the runtimes since this helper only returns clients/users/workspace.
  for (const collaborativeClient of collaborativeClients) {
    collaborativeClient.app.destroy()
  }

  const {
    client: client1,
    storage: storage1,
    user: user1,
    workspace,
  } = firstClient
  const {
    client: client2,
    storage: storage2,
    user: user2,
  } = secondClient

  return {
    client1,
    client2,
    storage1,
    storage2,
    user1,
    user2,
    workspace,
  }
}

/**
 * Creates a pair of clients with initialized Applications in a collaborative setup.
 * First client creates a workspace, second client is added as a member with shared keys.
 * Both Applications are initialized with SSE connections ready.
 *
 * @returns Object containing both clients, applications, users, and shared workspace
 */
export async function createCollaborativeClientAndApplicationPair(): Promise<{
  client1: GlobalClient
  client2: GlobalClient
  app1: WorkspaceRuntime
  app2: WorkspaceRuntime
  user1: ClientUser
  user2: ClientUser
  workspace: Workspace
}> {
  const { client1, client2, user1, user2, workspace } = await createCollaborativeClientPair()

  // Create Application for client1
  const app1 = createApplicationForClient(client1, workspace.uuid)

  // Create Application for client2
  const app2 = createApplicationForClient(client2, workspace.uuid)

  // Initialize both applications (loads keys from server, starts SSE connections)
  await app1.initialize()
  await app2.initialize()

  return {
    client1,
    client2,
    app1,
    app2,
    user1,
    user2,
    workspace,
  }
}

/**
 * Creates an entity via the v2 runtime and throws on failures.
 * Centralized here so test files don't re-implement the same flow.
 */
export async function createEntityThroughRuntime<C extends EntityContent, M extends EntityMetaFields>(
  runtime: WorkspaceRuntime,
  params: {
    entityType: EntityType
    content: C
    parent?: ClientEntity
    metaFields?: M
  }
): Promise<ClientEntity<C>> {
  const createResult = await runtime.getCreateEntity().execute(params)
  if (createResult.isFailed()) {
    throw new Error(createResult.getError())
  }
  return createResult.getValue()
}

/**
 * Builds a Yjs update for tests that need an encrypted block payload.
 */
export function createYjsUpdateForBlockContent(text: string): Uint8Array {
  const ydoc = new Y.Doc()
  const fragment = ydoc.getXmlFragment("content")
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  fragment.insert(0, [textNode])
  return Y.encodeStateAsUpdate(ydoc)
}

/**
 * Creates a browser File for upload tests.
 */
export function createTestFile(content: string, name: string, mimeType: string): File {
  const blob = new Blob([content], { type: mimeType })
  return new File([blob], name, { type: mimeType })
}
