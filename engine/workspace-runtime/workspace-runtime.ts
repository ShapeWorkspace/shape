import { WorkspaceMemberManager } from "../services/workspace-member-manager"
import { UserProfileProcess } from "../processes/user-profile-process"
import { NotificationService } from "../services/notification-service"
import { SSEConnectionManager } from "../services/sse-connection-manager"
import { HandleSSEEvents } from "../processes/handle-sse-events"
import { DraftSyncScheduler } from "../processes/draft-sync-scheduler"
import { ProcessManager } from "../processes/process-manager"
import { SyncProcess } from "../processes/sync"
import { HydrateSearchIndexInitializer } from "../initializers/hydrate-search-index"
import { InitializeWorkspaceInitializer } from "../initializers/initialize-workspace"
import { CacheStores } from "../store/cache-stores"
import { KeyStore } from "../store/key-store"
import { WorkspaceInfoStore } from "../store/workspace-info-store"
import { InviteService } from "../services/invite-service"
import { IOfflineDatabase } from "../repositories"
import { Crypto } from "../crypto/crypto"
import { logger } from "../utils/logger"
import type { SearchIndexInterface } from "../search/search-types"
import { StorageProvider } from "../storage/storage-provider"
import { Container } from "./workspace-runtime-container"
import { DI_INITIALIZERS, DI_SERVICES, DI_USE_CASES } from "./workspace-runtime-di"
import { AccountStore } from "../store/account-store"
import { WorkspaceStore } from "../store/workspace-store"
import { EncryptEntity } from "../usecase/crypto/EncryptEntity"
import { EncryptFileChunk } from "../usecase/crypto/EncryptFileChunk"
import { DecryptFileChunk } from "../usecase/crypto/DecryptFileChunk"
import { EncryptYjsDelta } from "../usecase/crypto/EncryptYjsDelta"
import { DecryptYjsDelta } from "../usecase/crypto/DecryptYjsDelta"
import {
  CreateEntityV2,
  UpdateEntity,
  DeleteEntity,
  SyncAllDrafts,
  Sync,
  SyncDraft,
  ClearDraft,
  PersistDraft,
  FetchWorkspaceKeys,
  IndexBlockEntity,
  SyncResult,
  QueryEntitiesAndCache,
  QueryEntitiesByParent,
  QueryEntityById,
  CreateBlockDraft,
  GetOrFetchEntity,
  DecryptEntityWithKeyLookup,
  GetWrappingKey,
} from "../usecase/entities/entities"
import { EventBus } from "../processes/event-bus"
import { UploadFile, UploadFileFromStream, DownloadFile } from "../usecase/files/files"
import { RepositoryStore } from "../repositories/repository-store"

// ACL use cases
import { GetEntityACLEntries } from "../usecase/acl/GetEntityACLEntries"
import { CreateEntityACLEntry } from "../usecase/acl/CreateEntityACLEntry"
import { UpdateEntityACLEntry } from "../usecase/acl/UpdateEntityACLEntry"
import { DeleteEntityACLEntry } from "../usecase/acl/DeleteEntityACLEntry"
import { GetEntityACLMemberCount } from "../usecase/acl/GetEntityACLMemberCount"
import { GetAvailableSubjectsForEntity } from "../usecase/acl/GetAvailableSubjectsForEntity"

// Entity links use cases
import { GetEntityLinks } from "../usecase/entity-links/GetEntityLinks"
import { SyncEntityLinks } from "../usecase/entity-links/SyncEntityLinks"

// Workspace use cases
import { UpdateWorkspace } from "../usecase/workspace/UpdateWorkspace"

// Member use cases
import { FetchWorkspaceMember } from "../usecase/members/FetchWorkspaceMember"

// Invite use cases
import { GetWorkspaceUserInvites } from "../usecase/invites/GetWorkspaceUserInvites"
import { CreateWorkspaceInvite } from "../usecase/invites/CreateWorkspaceInvite"
import { GetWorkspaceInvites } from "../usecase/invites/GetWorkspaceInvites"
import { GetWorkspacePendingInvites } from "../usecase/invites/GetWorkspacePendingInvites"
import { GetWorkspaceLinkInvites } from "../usecase/invites/GetWorkspaceLinkInvites"
import { RevokeUserInvite } from "../usecase/invites/RevokeUserInvite"
import { RevokeWorkspaceInvite } from "../usecase/invites/RevokeWorkspaceInvite"
import { RevokeWorkspacePendingInvite } from "../usecase/invites/RevokeWorkspacePendingInvite"
import { DeleteWorkspaceLinkInvite } from "../usecase/invites/DeleteWorkspaceLinkInvite"
import { CreateUserInviteForEmailAddress } from "../usecase/invites/CreateUserInviteForEmailAddress"
import { CreateKeyShareForUser } from "../usecase/invites/CreateKeyShareForUser"
import { MakeWorkspaceRequest } from "../usecase/network/MakeWorkspaceRequest"

// Member use cases (additional)
import { AddMemberToWorkspace } from "../usecase/members/AddMemberToWorkspace"

// Auth use cases
import { RefreshAuthTokens } from "../usecase/user/RefreshAuthTokens"

// Mentions use cases
import { GetMentionableUserIds } from "../usecase/mentions/GetMentionableUserIds"

// Team use cases
import { GetWorkspaceTeams } from "../usecase/teams/GetWorkspaceTeams"
import { UpsertCurrentUserProfile } from "../usecase/user-profiles/user-profiles"

/**
 * Workspace-scoped engine container.
 *
 * This provides access to workspace-scoped services and use cases via dependency injection.
 * The unified entity model consolidates all entity types into a single pattern with
 * type-safe content and meta fields.
 */
export class WorkspaceRuntime {
  private readonly container: Container
  private readonly accountUserId: string
  private readonly searchIndex: SearchIndexInterface
  // Keep process instances alive for the lifetime of this runtime.
  private readonly processManager: ProcessManager
  private readonly draftSyncScheduler: DraftSyncScheduler
  private readonly entityRealtimeSync: HandleSSEEvents

  constructor(
    public readonly workspaceId: string,
    crypto: Crypto,
    private readonly accountStore: AccountStore,
    workspaceStore: WorkspaceStore,
    offlineDatabase: IOfflineDatabase,
    storageProvider: StorageProvider,
    searchIndex: SearchIndexInterface,
    private readonly isWorkspaceRegisteredWithServer = true
  ) {
    this.accountUserId = accountStore.getUserId()
    this.searchIndex = searchIndex

    // Configure workspace-scoped services via dependency injection
    this.container = new Container({
      crypto,
      accountStore,
      workspaceStore,
      workspaceId,
      offlineDatabase,
      storageProvider,
      searchIndex,
      isWorkspaceRegisteredWithServer,
    })

    const eventBus = this.container.get<EventBus>(DI_SERVICES.EventBus)

    // Processes are long-lived observers; keep references so they persist.
    this.processManager = new ProcessManager(
      eventBus,
      this.container.get<UserProfileProcess>(DI_SERVICES.UserProfileProcess)
    )
    this.draftSyncScheduler = new DraftSyncScheduler(
      eventBus,
      this.container.get<SyncDraft>(DI_USE_CASES.SyncDraft)
    )
    // SyncProcess subscribes to EventBus in its constructor; no reference needed.
    new SyncProcess(eventBus, this.container.get<Sync>(DI_USE_CASES.Sync))
    this.entityRealtimeSync = this.container.get<HandleSSEEvents>(DI_SERVICES.EntityRealtimeSync)

    logger.debug("WorkspaceRuntime initialized", { workspaceId })
  }

  public getAccountStore(): AccountStore {
    return this.accountStore
  }

  /**
   * @returns true if the workspace is registered with the server, false if it's just a local workspace
   */
  public isWorkspaceRemote(): boolean {
    return this.isWorkspaceRegisteredWithServer
  }

  /**
   * Initialize the workspace runtime.
   * Loads keys, drafts, and starts sync for remote workspaces.
   */
  public async initialize(): Promise<void> {
    await this.searchIndex.initialize()

    // Initialize workspace (loads drafts and keys from IDB)
    await this.getInitializeWorkspace().execute()

    // Spin up process observers early so they can react to initialization events.
    this.processManager.initialize()

    // If no keys loaded from IDB, fetch from server
    const currentKey = this.getKeyStore().getCurrentKey()
    if (!currentKey && this.isWorkspaceRegisteredWithServer) {
      await this.getFetchWorkspaceKeys().execute()
    }

    await this.getHydrateSearchIndex().execute()

    if (this.isWorkspaceRegisteredWithServer) {
      this.getCacheStores().blockStore.initializeWithSSEManager(this.getSSEConnectionManager())

      // Initialize SSE for real-time updates
      this.getSSEConnectionManager().initialize()
      this.entityRealtimeSync.initialize()

      // Initialize member manager
      await this.getWorkspaceMemberManager().initialize()

      // Perform initial sync
      await this.getSync().execute()

      // Sync any pending drafts after canonical sync
      await this.getSyncAllDrafts().execute()
    }
  }

  /**
   * Gets the account user ID associated with this runtime instance.
   */
  public getAccountUserId(): string {
    return this.accountUserId
  }

  public destroy(): void {
    // Tear down process observers before shutting down the container.
    this.processManager.destroy()
    this.draftSyncScheduler.clearAllRetryTimers()
    this.getWorkspaceMemberManager().destroy()
    this.entityRealtimeSync.destroy()
    this.getSSEConnectionManager().destroy()
    this.container.deinit()
  }

  /**
   * Performs an explicit user-initiated sync.
   */
  async performSync(): Promise<SyncResult> {
    return this.getSync().execute()
  }

  // ========================================
  // Infrastructure Services
  // ========================================

  public getSSEConnectionManager(): SSEConnectionManager {
    return this.container.get<SSEConnectionManager>(DI_SERVICES.SSEConnectionManager)
  }

  public getEntityRealtimeSync(): HandleSSEEvents {
    return this.container.get<HandleSSEEvents>(DI_SERVICES.EntityRealtimeSync)
  }

  public getEventBus(): EventBus {
    return this.container.get<EventBus>(DI_SERVICES.EventBus)
  }

  // ========================================
  // Stores
  // ========================================

  public getCacheStores(): CacheStores {
    return this.container.get<CacheStores>(DI_SERVICES.CacheStores)
  }

  public getKeyStore(): KeyStore {
    return this.container.get<KeyStore>(DI_SERVICES.KeyStore)
  }

  public getWorkspaceInfoStore(): WorkspaceInfoStore {
    return this.container.get<WorkspaceInfoStore>(DI_SERVICES.WorkspaceInfoStore)
  }

  public getRepositoryStore(): RepositoryStore {
    return this.container.get<RepositoryStore>(DI_SERVICES.RepositoryStore)
  }

  public getSearchIndex(): SearchIndexInterface {
    return this.searchIndex
  }

  // ========================================
  // Services
  // ========================================

  public getWorkspaceMemberManager(): WorkspaceMemberManager {
    return this.container.get<WorkspaceMemberManager>(DI_SERVICES.WorkspaceMemberManager)
  }

  public getNotificationService(): NotificationService {
    return this.container.get<NotificationService>(DI_SERVICES.NotificationService)
  }

  public getUpsertCurrentUserProfile(): UpsertCurrentUserProfile {
    return this.container.get<UpsertCurrentUserProfile>(DI_USE_CASES.UpsertCurrentUserProfile)
  }

  public getInviteService(): InviteService {
    return this.container.get<InviteService>(DI_SERVICES.InviteService)
  }

  // ========================================
  // Crypto Use Cases
  // ========================================

  public getEncryptEntity(): EncryptEntity {
    return this.container.get<EncryptEntity>(DI_USE_CASES.EncryptEntity)
  }

  public getEncryptFileChunk(): EncryptFileChunk {
    return this.container.get<EncryptFileChunk>(DI_USE_CASES.EncryptFileChunk)
  }

  public getDecryptFileChunk(): DecryptFileChunk {
    return this.container.get<DecryptFileChunk>(DI_USE_CASES.DecryptFileChunk)
  }

  public getEncryptDelta(): EncryptYjsDelta {
    return this.container.get<EncryptYjsDelta>(DI_USE_CASES.EncryptYjsDelta)
  }

  public getDecryptDelta(): DecryptYjsDelta {
    return this.container.get<DecryptYjsDelta>(DI_USE_CASES.DecryptYjsDelta)
  }

  // ========================================
  // Entity Use Cases
  // ========================================

  public getCreateEntity(): CreateEntityV2 {
    return this.container.get<CreateEntityV2>(DI_USE_CASES.CreateEntityV2)
  }

  public getCreateBlockDraft(): CreateBlockDraft {
    return this.container.get<CreateBlockDraft>(DI_USE_CASES.CreateBlockDraft)
  }

  public getUpdateEntity(): UpdateEntity {
    return this.container.get<UpdateEntity>(DI_USE_CASES.UpdateEntity)
  }

  public getDeleteEntity(): DeleteEntity {
    return this.container.get<DeleteEntity>(DI_USE_CASES.DeleteEntity)
  }

  public getIndexBlockEntity(): IndexBlockEntity {
    return this.container.get<IndexBlockEntity>(DI_USE_CASES.IndexBlockEntity)
  }

  public getQueryEntities(): QueryEntitiesAndCache {
    return this.container.get<QueryEntitiesAndCache>(DI_USE_CASES.QueryEntitiesAndCache)
  }

  public getQueryEntitiesByParent(): QueryEntitiesByParent {
    return this.container.get<QueryEntitiesByParent>(DI_USE_CASES.QueryEntitiesByParent)
  }

  public getQueryEntityById(): QueryEntityById {
    return this.container.get<QueryEntityById>(DI_USE_CASES.QueryEntityById)
  }

  // ========================================
  // Draft / Sync Use Cases
  // ========================================

  private getInitializeWorkspace(): InitializeWorkspaceInitializer {
    return this.container.get<InitializeWorkspaceInitializer>(DI_INITIALIZERS.InitializeWorkspace)
  }

  public getSyncAllDrafts(): SyncAllDrafts {
    return this.container.get<SyncAllDrafts>(DI_USE_CASES.SyncAllDrafts)
  }

  public getHydrateSearchIndex(): HydrateSearchIndexInitializer {
    return this.container.get<HydrateSearchIndexInitializer>(DI_INITIALIZERS.HydrateSearchIndex)
  }

  public getSync(): Sync {
    return this.container.get<Sync>(DI_USE_CASES.Sync)
  }

  public getFetchWorkspaceKeys(): FetchWorkspaceKeys {
    return this.container.get<FetchWorkspaceKeys>(DI_USE_CASES.FetchWorkspaceKeys)
  }

  // ========================================
  // File Use Cases
  // ========================================

  public getUploadFile(): UploadFile {
    return this.container.get<UploadFile>(DI_USE_CASES.UploadFile)
  }

  public getUploadFileFromStream(): UploadFileFromStream {
    return this.container.get<UploadFileFromStream>(DI_USE_CASES.UploadFileFromStream)
  }

  public getDownloadFile(): DownloadFile {
    return this.container.get<DownloadFile>(DI_USE_CASES.DownloadFile)
  }

  // ========================================
  // Draft Use Cases (additional)
  // ========================================

  public getSyncDraft(): SyncDraft {
    return this.container.get<SyncDraft>(DI_USE_CASES.SyncDraft)
  }

  public getClearDraft(): ClearDraft {
    return this.container.get<ClearDraft>(DI_USE_CASES.ClearDraft)
  }

  // ========================================
  // Entity Use Cases (additional)
  // ========================================

  public getGetOrFetchEntity(): GetOrFetchEntity {
    return this.container.get<GetOrFetchEntity>(DI_USE_CASES.GetOrFetchEntity)
  }

  // ========================================
  // Entity ACL Use Cases
  // ========================================

  public getGetEntityACLEntries(): GetEntityACLEntries {
    return this.container.get<GetEntityACLEntries>(DI_USE_CASES.GetEntityACLEntries)
  }

  public getCreateEntityACLEntry(): CreateEntityACLEntry {
    return this.container.get<CreateEntityACLEntry>(DI_USE_CASES.CreateEntityACLEntry)
  }

  public getUpdateEntityACLEntry(): UpdateEntityACLEntry {
    return this.container.get<UpdateEntityACLEntry>(DI_USE_CASES.UpdateEntityACLEntry)
  }

  public getDeleteEntityACLEntry(): DeleteEntityACLEntry {
    return this.container.get<DeleteEntityACLEntry>(DI_USE_CASES.DeleteEntityACLEntry)
  }

  public getGetEntityACLMemberCount(): GetEntityACLMemberCount {
    return this.container.get<GetEntityACLMemberCount>(DI_USE_CASES.GetEntityACLMemberCount)
  }

  public getGetAvailableSubjectsForEntity(): GetAvailableSubjectsForEntity {
    return this.container.get<GetAvailableSubjectsForEntity>(DI_USE_CASES.GetAvailableSubjectsForEntity)
  }

  // ========================================
  // Entity Links Use Cases
  // ========================================

  public getGetEntityLinks(): GetEntityLinks {
    return this.container.get<GetEntityLinks>(DI_USE_CASES.GetEntityLinks)
  }

  public getSyncEntityLinks(): SyncEntityLinks {
    return this.container.get<SyncEntityLinks>(DI_USE_CASES.SyncEntityLinks)
  }

  // ========================================
  // Workspace Use Cases
  // ========================================

  public getUpdateWorkspace(): UpdateWorkspace {
    return this.container.get<UpdateWorkspace>(DI_USE_CASES.UpdateWorkspace)
  }

  // ========================================
  // Member Use Cases (individual)
  // ========================================

  public getGetWorkspaceMember(): FetchWorkspaceMember {
    return this.container.get<FetchWorkspaceMember>(DI_USE_CASES.GetWorkspaceMember)
  }

  // ========================================
  // Invite Use Cases
  // ========================================

  public getGetWorkspaceUserInvites(): GetWorkspaceUserInvites {
    return this.container.get<GetWorkspaceUserInvites>(DI_USE_CASES.GetWorkspaceUserInvites)
  }

  public getCreateWorkspaceInvite(): CreateWorkspaceInvite {
    return this.container.get<CreateWorkspaceInvite>(DI_USE_CASES.CreateWorkspaceInvite)
  }

  public getGetWorkspaceInvites(): GetWorkspaceInvites {
    return this.container.get<GetWorkspaceInvites>(DI_USE_CASES.GetWorkspaceInvites)
  }

  public getGetWorkspacePendingInvites(): GetWorkspacePendingInvites {
    return this.container.get<GetWorkspacePendingInvites>(DI_USE_CASES.GetWorkspacePendingInvites)
  }

  public getGetWorkspaceLinkInvites(): GetWorkspaceLinkInvites {
    return this.container.get<GetWorkspaceLinkInvites>(DI_USE_CASES.GetWorkspaceLinkInvites)
  }

  public getRevokeUserInvite(): RevokeUserInvite {
    return this.container.get<RevokeUserInvite>(DI_USE_CASES.RevokeUserInvite)
  }

  public getRevokeWorkspaceInvite(): RevokeWorkspaceInvite {
    return this.container.get<RevokeWorkspaceInvite>(DI_USE_CASES.RevokeWorkspaceInvite)
  }

  public getRevokeWorkspacePendingInvite(): RevokeWorkspacePendingInvite {
    return this.container.get<RevokeWorkspacePendingInvite>(DI_USE_CASES.RevokeWorkspacePendingInvite)
  }

  public getDeleteWorkspaceLinkInvite(): DeleteWorkspaceLinkInvite {
    return this.container.get<DeleteWorkspaceLinkInvite>(DI_USE_CASES.DeleteWorkspaceLinkInvite)
  }

  public getCreateUserInviteForEmailAddress(): CreateUserInviteForEmailAddress {
    return this.container.get<CreateUserInviteForEmailAddress>(DI_USE_CASES.CreateUserInviteForEmailAddress)
  }

  public getCreateKeyShareForUser(): CreateKeyShareForUser {
    return this.container.get<CreateKeyShareForUser>(DI_USE_CASES.CreateKeyShareForUser)
  }

  public getMakeWorkspaceRequest(): MakeWorkspaceRequest {
    return this.container.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest)
  }

  // ========================================
  // Mentions Use Cases
  // ========================================

  public getGetMentionableUserIds(): GetMentionableUserIds {
    return this.container.get<GetMentionableUserIds>(DI_USE_CASES.GetMentionableUserIds)
  }

  // ========================================
  // Team Use Cases
  // ========================================

  public getGetWorkspaceTeams(): GetWorkspaceTeams {
    return this.container.get<GetWorkspaceTeams>(DI_USE_CASES.GetWorkspaceTeams)
  }

  // ========================================
  // Internal Use Cases (used by tests)
  // ========================================

  public getDecryptEntityWithKeyLookup(): DecryptEntityWithKeyLookup {
    return this.container.get<DecryptEntityWithKeyLookup>(DI_USE_CASES.DecryptEntityWithKeyLookup)
  }

  public getGetWrappingKey(): GetWrappingKey {
    return this.container.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey)
  }

  public getPersistDraft(): PersistDraft {
    return this.container.get<PersistDraft>(DI_USE_CASES.PersistDraft)
  }

  public getAddMemberToWorkspace(): AddMemberToWorkspace {
    return this.container.get<AddMemberToWorkspace>(DI_USE_CASES.AddMemberToWorkspace)
  }

  public getRefreshAuthTokens(): RefreshAuthTokens {
    return this.container.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens)
  }
}
