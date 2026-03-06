import { DependencyContainer } from "../utils/DependencyContainer"
import { Crypto } from "../crypto/crypto"
import { logger } from "../utils/logger"
import { SSEConnectionManager } from "../services/sse-connection-manager"
import { HandleSSEEvents } from "../processes/handle-sse-events"

// Repositories
import {
  DraftBlockRepository,
  MemberRepository,
  WorkspaceKeyRepository,
  IOfflineDatabase,
} from "../repositories"
import { BlockRepository } from "../repositories/block-repository"
import { DraftRepository } from "../repositories/draft-repository"
import { EntityRepository } from "../repositories/entity-repository"
import { RepositoryStore } from "../repositories/repository-store"

// Stores
import { AccountStore } from "../store/account-store"
import { WorkspaceStore } from "../store/workspace-store"
import { CacheStores } from "../store/cache-stores"
import { KeyStore } from "../store/key-store"
import { WorkspaceInfoStore } from "../store/workspace-info-store"

// Crypto usecases
import { EncryptEntity } from "../usecase/crypto/EncryptEntity"
import { DecryptEntity } from "../usecase/crypto/DecryptEntity"
import { EncryptFileChunk } from "../usecase/crypto/EncryptFileChunk"
import { DecryptFileChunk } from "../usecase/crypto/DecryptFileChunk"
import { EncryptYjsDelta } from "../usecase/crypto/EncryptYjsDelta"
import { DecryptYjsDelta } from "../usecase/crypto/DecryptYjsDelta"

// Network usecases
import { MakeWorkspaceRequest } from "../usecase/network/MakeWorkspaceRequest"
import { RefreshAuthTokens } from "../usecase/user/RefreshAuthTokens"
import { CreateSSEConnection } from "../usecase/network/CreateSSEConnection"

// Member usecases
import { FetchWorkspaceMembers } from "../usecase/members/FetchWorkspaceMembers"
import { GetWorkspacePendingInvites } from "../usecase/invites/GetWorkspacePendingInvites"
import { AddMemberToWorkspace } from "../usecase/members/AddMemberToWorkspace"
import { RemoveMemberFromWorkspace } from "../usecase/members/RemoveMemberFromWorkspace"
import { UpdateWorkspaceMemberRole } from "../usecase/members/UpdateWorkspaceMemberRole"
import { RevokeWorkspacePendingInvite } from "../usecase/invites/RevokeWorkspacePendingInvite"

// Invite usecases
import { DecryptKeyFromShares } from "../usecase/invites/DecryptKeyFromShares"
import { CreateKeyShareForUser } from "../usecase/invites/CreateKeyShareForUser"
import { BuildKeyShareSignatureMessage } from "../usecase/invites/BuildKeyShareSignatureMessage"
import { GetWorkspaceUserInvites } from "../usecase/invites/GetWorkspaceUserInvites"
import { CreateWorkspaceInvite } from "../usecase/invites/CreateWorkspaceInvite"
import { GetWorkspaceInvites } from "../usecase/invites/GetWorkspaceInvites"
import { GetWorkspaceLinkInvites } from "../usecase/invites/GetWorkspaceLinkInvites"
import { RevokeUserInvite } from "../usecase/invites/RevokeUserInvite"
import { RevokeWorkspaceInvite } from "../usecase/invites/RevokeWorkspaceInvite"
import { DeleteWorkspaceLinkInvite } from "../usecase/invites/DeleteWorkspaceLinkInvite"
import { CreateUserInviteForEmailAddress } from "../usecase/invites/CreateUserInviteForEmailAddress"

// Workspace usecases
import { UpdateWorkspace } from "../usecase/workspace/UpdateWorkspace"

// Member usecases (individual)
import { FetchWorkspaceMember } from "../usecase/members/FetchWorkspaceMember"

// Mentions usecases
import { GetMentionableUserIds } from "../usecase/mentions/GetMentionableUserIds"

// Team usecases
import { GetWorkspaceTeams } from "../usecase/teams/GetWorkspaceTeams"

// Entity ACL usecases
import { GetEntityACLEntries } from "../usecase/acl/GetEntityACLEntries"
import { CreateEntityACLEntry } from "../usecase/acl/CreateEntityACLEntry"
import { UpdateEntityACLEntry } from "../usecase/acl/UpdateEntityACLEntry"
import { DeleteEntityACLEntry } from "../usecase/acl/DeleteEntityACLEntry"
import { GetEntityACLMemberCount } from "../usecase/acl/GetEntityACLMemberCount"
import { GetAvailableSubjectsForEntity } from "../usecase/acl/GetAvailableSubjectsForEntity"
import { GetEntityLinks } from "../usecase/entity-links/GetEntityLinks"
import { SyncEntityLinks } from "../usecase/entity-links/SyncEntityLinks"

// Services
import { WorkspaceMemberManager } from "../services/workspace-member-manager"
import { UserProfileProcess } from "../processes/user-profile-process"
import { NotificationService } from "../services/notification-service"
import { InviteService } from "../services/invite-service"
import { HydrateSearchIndexInitializer } from "../initializers/hydrate-search-index"
import { InitializeWorkspaceInitializer } from "../initializers/initialize-workspace"

// Entity service classes from entities.ts
import {
  GetWrappingKey,
  GetOrFetchEntity,
  IndexClientEntity,
  PersistServerEntity,
  ExecuteRemoteQuery,
  QueryEntitiesAndCache,
  QueryEntitiesByParent,
  QueryEntityById,
  CreateEntityV2,
  UpdateEntity,
  DeleteEntity,
  RemoveEntityLocally,
  DecryptEntityWithKeyLookup,
  ConstructYjsDocFromEncryptedBlocks,
  IndexBlockEntity,
  CreateDraft,
  PersistDraft,
  SyncDraft,
  ClearDraft,
  CreateBlockDraft,
  SyncBlockDraft,
  SyncAllDrafts,
  Sync,
  FetchWorkspaceKeys,
} from "../usecase/entities/entities"
import {
  BuildWorkspaceMemberProfile,
  EnrichWorkspaceMemberWithUserProfile,
  FetchUserProfileEntityByUserId,
  GetCachedUserProfileEntities,
  GetCachedUserProfileEntityByUserId,
  UpsertCurrentUserProfile,
} from "../usecase/user-profiles/user-profiles"
import { EventBus } from "../processes/event-bus"

// File service classes
import {
  CreateBaseFile,
  UploadFile,
  UploadFileFromStream,
  DownloadFile,
  RequestSingleUploadPartURL,
  RecordUploadedMultipartPart,
  CompleteMultipartUpload,
  UploadEncryptedChunk,
} from "../usecase/files/files"

import { ExecuteAuthenticatedRequest } from "../usecase/network/ExecuteAuthenticatedRequest"
import type { SearchIndexInterface } from "../search/search-types"
import { SyncStore } from "../store/sync-store"
import { WorkspaceStorage } from "../storage/workspace-storage"
import { StorageProvider } from "../storage/storage-provider"
import { DI_INITIALIZERS, DI_USE_CASES, DI_SERVICES } from "./workspace-runtime-di"

/**
 * Container configuration options.
 */
export interface ContainerConfig {
  crypto: Crypto
  accountStore: AccountStore
  workspaceStore: WorkspaceStore
  workspaceId: string
  offlineDatabase: IOfflineDatabase
  storageProvider: StorageProvider
  searchIndex: SearchIndexInterface
  isWorkspaceRegisteredWithServer: boolean
}

/**
 * Workspace-scoped container for use cases and services.
 * Binds all dependencies with their dependencies.
 */
export class Container extends DependencyContainer {
  constructor(config: ContainerConfig) {
    super()

    const {
      crypto,
      accountStore,
      workspaceStore,
      workspaceId,
      offlineDatabase,
      storageProvider,
      searchIndex,
      isWorkspaceRegisteredWithServer,
    } = config

    const userId = accountStore.getUserId()

    // ========================================
    // Storage
    // ========================================
    const workspaceStorage = new WorkspaceStorage(storageProvider, workspaceId)

    // ========================================
    // Repositories
    // ========================================
    const blockRepository = new BlockRepository(offlineDatabase, workspaceId)
    const draftRepository = new DraftRepository(offlineDatabase, workspaceId)
    const draftBlockRepository = new DraftBlockRepository(offlineDatabase, workspaceId)
    const entityRepository = new EntityRepository(offlineDatabase, workspaceId)
    const keyRepository = new WorkspaceKeyRepository(offlineDatabase)
    const memberRepository = new MemberRepository(offlineDatabase, workspaceId)

    const repositoryStore = new RepositoryStore(
      blockRepository,
      draftRepository,
      draftBlockRepository,
      entityRepository,
      keyRepository,
      memberRepository
    )
    this.bind(DI_SERVICES.RepositoryStore, () => repositoryStore)

    // ========================================
    // Core Stores
    // ========================================
    const cacheStores = new CacheStores()
    this.bind(DI_SERVICES.CacheStores, () => cacheStores)

    const workspaceInfoStore = new WorkspaceInfoStore(isWorkspaceRegisteredWithServer, workspaceId, userId)
    this.bind(DI_SERVICES.WorkspaceInfoStore, () => workspaceInfoStore)

    const keyStore = new KeyStore(keyRepository, workspaceInfoStore)
    this.bind(DI_SERVICES.KeyStore, () => keyStore)

    const syncStore = new SyncStore(workspaceStorage)

    // ========================================
    // Event Bus
    // ========================================
    const eventBus = new EventBus()
    this.bind(DI_SERVICES.EventBus, () => eventBus)

    // ========================================
    // Network Use Cases
    // ========================================
    this.bind(DI_USE_CASES.RefreshAuthTokens, () => new RefreshAuthTokens(accountStore))

    this.bind(
      DI_USE_CASES.MakeWorkspaceRequest,
      () =>
        new MakeWorkspaceRequest(
          accountStore.getHttpClient(),
          accountStore,
          this.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens),
          logger,
          workspaceId
        )
    )

    this.bind(
      DI_USE_CASES.CreateSSEConnection,
      () =>
        new CreateSSEConnection(
          accountStore.getHttpClient(),
          accountStore,
          new ExecuteAuthenticatedRequest(
            accountStore.getHttpClient(),
            accountStore,
            this.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens),
            logger
          ),
          logger
        )
    )

    // ========================================
    // SSE Connection Manager
    // ========================================
    this.bind(
      DI_SERVICES.SSEConnectionManager,
      () =>
        new SSEConnectionManager(
          this.get<CreateSSEConnection>(DI_USE_CASES.CreateSSEConnection),
          workspaceId,
          accountStore,
          eventBus
        )
    )

    // ========================================
    // Entity Realtime Sync
    // ========================================
    this.bind(
      DI_SERVICES.EntityRealtimeSync,
      () =>
        new HandleSSEEvents(
          this.get<SSEConnectionManager>(DI_SERVICES.SSEConnectionManager),
          this.get<PersistServerEntity>(DI_USE_CASES.PersistServerEntity),
          blockRepository,
          this.get<IndexBlockEntity>(DI_USE_CASES.IndexBlockEntity)
        )
    )

    // ========================================
    // Crypto Use Cases
    // ========================================
    this.bind(DI_USE_CASES.EncryptEntity, () => new EncryptEntity(crypto))
    this.bind(DI_USE_CASES.DecryptEntity, () => new DecryptEntity(crypto))
    this.bind(DI_USE_CASES.EncryptFileChunk, () => new EncryptFileChunk(crypto, workspaceId))
    this.bind(DI_USE_CASES.DecryptFileChunk, () => new DecryptFileChunk(crypto))
    this.bind(DI_USE_CASES.EncryptYjsDelta, () => new EncryptYjsDelta(crypto))
    this.bind(DI_USE_CASES.DecryptYjsDelta, () => new DecryptYjsDelta(crypto))

    // ========================================
    // Invite Use Cases
    // ========================================
    const buildKeyShareSignatureMessage = new BuildKeyShareSignatureMessage()

    this.bind(
      DI_USE_CASES.DecryptKeyFromShares,
      () => new DecryptKeyFromShares(crypto, accountStore, buildKeyShareSignatureMessage, logger)
    )

    // Create an ExecuteAuthenticatedRequest for use cases that need it
    const executeAuthenticatedRequest = new ExecuteAuthenticatedRequest(
      accountStore.getHttpClient(),
      accountStore,
      this.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens),
      logger
    )

    this.bind(
      DI_USE_CASES.CreateKeyShareForUser,
      () =>
        new CreateKeyShareForUser(
          crypto,
          executeAuthenticatedRequest,
          buildKeyShareSignatureMessage,
          accountStore,
          workspaceId
        )
    )

    // ========================================
    // Entity Use Cases (from entities.ts)
    // ========================================
    this.bind(DI_USE_CASES.GetWrappingKey, () => new GetWrappingKey(keyStore, cacheStores))

    this.bind(DI_USE_CASES.IndexClientEntity, () => new IndexClientEntity(searchIndex))

    this.bind(
      DI_USE_CASES.PersistServerEntity,
      () =>
        new PersistServerEntity(
          entityRepository,
          this.get<DecryptEntityWithKeyLookup>(DI_USE_CASES.DecryptEntityWithKeyLookup),
          cacheStores,
          this.get<IndexClientEntity>(DI_USE_CASES.IndexClientEntity)
        )
    )

    this.bind(
      DI_USE_CASES.ExecuteRemoteQuery,
      () => new ExecuteRemoteQuery(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.QueryEntitiesAndCache,
      () =>
        new QueryEntitiesAndCache(
          this.get<ExecuteRemoteQuery>(DI_USE_CASES.ExecuteRemoteQuery),
          this.get<PersistServerEntity>(DI_USE_CASES.PersistServerEntity)
        )
    )

    this.bind(
      DI_USE_CASES.QueryEntitiesByParent,
      () => new QueryEntitiesByParent(this.get<QueryEntitiesAndCache>(DI_USE_CASES.QueryEntitiesAndCache))
    )

    this.bind(
      DI_USE_CASES.QueryEntityById,
      () => new QueryEntityById(this.get<QueryEntitiesAndCache>(DI_USE_CASES.QueryEntitiesAndCache))
    )

    this.bind(
      DI_USE_CASES.DecryptEntityWithKeyLookup,
      () =>
        new DecryptEntityWithKeyLookup(
          this.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey),
          this.get<DecryptEntity>(DI_USE_CASES.DecryptEntity)
        )
    )

    this.bind(
      DI_USE_CASES.GetOrFetchEntity,
      () =>
        new GetOrFetchEntity(
          entityRepository,
          cacheStores,
          this.get<DecryptEntityWithKeyLookup>(DI_USE_CASES.DecryptEntityWithKeyLookup),
          this.get<QueryEntityById>(DI_USE_CASES.QueryEntityById)
        )
    )

    this.bind(
      DI_USE_CASES.ConstructYjsDocFromEncryptedBlocks,
      () =>
        new ConstructYjsDocFromEncryptedBlocks(
          this.get<DecryptYjsDelta>(DI_USE_CASES.DecryptYjsDelta),
          cacheStores
        )
    )

    this.bind(
      DI_USE_CASES.IndexBlockEntity,
      () =>
        new IndexBlockEntity(
          searchIndex,
          blockRepository,
          cacheStores,
          this.get<ConstructYjsDocFromEncryptedBlocks>(DI_USE_CASES.ConstructYjsDocFromEncryptedBlocks)
        )
    )

    // ========================================
    // Entity ACL Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.GetEntityACLEntries,
      () => new GetEntityACLEntries(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.CreateEntityACLEntry,
      () => new CreateEntityACLEntry(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.UpdateEntityACLEntry,
      () => new UpdateEntityACLEntry(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.DeleteEntityACLEntry,
      () => new DeleteEntityACLEntry(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.GetEntityACLMemberCount,
      () => new GetEntityACLMemberCount(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.GetAvailableSubjectsForEntity,
      () =>
        new GetAvailableSubjectsForEntity(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.GetEntityLinks,
      () => new GetEntityLinks(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.SyncEntityLinks,
      () => new SyncEntityLinks(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    // ========================================
    // Draft Use Cases
    // ========================================
    this.bind(DI_USE_CASES.PersistDraft, () => new PersistDraft(draftRepository, cacheStores))

    this.bind(
      DI_USE_CASES.SyncBlockDraft,
      () =>
        new SyncBlockDraft(
          blockRepository,
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          cacheStores
        )
    )

    this.bind(
      DI_USE_CASES.RemoveEntityLocally,
      () =>
        new RemoveEntityLocally(cacheStores, draftRepository, entityRepository, blockRepository, searchIndex)
    )

    this.bind(
      DI_USE_CASES.ClearDraft,
      () => new ClearDraft(cacheStores, draftRepository, blockRepository, eventBus)
    )

    this.bind(
      DI_USE_CASES.SyncDraft,
      () =>
        new SyncDraft(
          cacheStores,
          workspaceInfoStore,
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          this.get<RemoveEntityLocally>(DI_USE_CASES.RemoveEntityLocally),
          this.get<PersistServerEntity>(DI_USE_CASES.PersistServerEntity),
          this.get<ClearDraft>(DI_USE_CASES.ClearDraft),
          this.get<SyncBlockDraft>(DI_USE_CASES.SyncBlockDraft),
          this.get<PersistDraft>(DI_USE_CASES.PersistDraft),
          eventBus
        )
    )

    this.bind(
      DI_USE_CASES.CreateDraft,
      () =>
        new CreateDraft(
          this.get<SyncDraft>(DI_USE_CASES.SyncDraft),
          this.get<PersistDraft>(DI_USE_CASES.PersistDraft)
        )
    )

    this.bind(
      DI_USE_CASES.CreateBlockDraft,
      () =>
        new CreateBlockDraft(
          this.get<EncryptYjsDelta>(DI_USE_CASES.EncryptYjsDelta),
          cacheStores,
          draftBlockRepository,
          workspaceInfoStore,
          this.get<SyncBlockDraft>(DI_USE_CASES.SyncBlockDraft)
        )
    )

    this.bind(
      DI_USE_CASES.SyncAllDrafts,
      () =>
        new SyncAllDrafts(
          cacheStores,
          workspaceInfoStore,
          this.get<SyncDraft>(DI_USE_CASES.SyncDraft),
          this.get<SyncBlockDraft>(DI_USE_CASES.SyncBlockDraft)
        )
    )

    this.bind(
      DI_INITIALIZERS.InitializeWorkspace,
      () => new InitializeWorkspaceInitializer(cacheStores, repositoryStore, keyStore)
    )

    this.bind(
      DI_INITIALIZERS.HydrateSearchIndex,
      () =>
        new HydrateSearchIndexInitializer(
          cacheStores,
          entityRepository,
          this.get<GetOrFetchEntity>(DI_USE_CASES.GetOrFetchEntity),
          this.get<DecryptEntityWithKeyLookup>(DI_USE_CASES.DecryptEntityWithKeyLookup),
          searchIndex,
          this.get<IndexBlockEntity>(DI_USE_CASES.IndexBlockEntity)
        )
    )

    // ========================================
    // Entity CRUD Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.CreateEntityV2,
      () =>
        new CreateEntityV2(
          crypto,
          this.get<EncryptEntity>(DI_USE_CASES.EncryptEntity),
          this.get<CreateDraft>(DI_USE_CASES.CreateDraft),
          cacheStores,
          workspaceInfoStore,
          this.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey),
          this.get<IndexClientEntity>(DI_USE_CASES.IndexClientEntity)
        )
    )

    this.bind(
      DI_USE_CASES.UpdateEntity,
      () =>
        new UpdateEntity(
          this.get<CreateDraft>(DI_USE_CASES.CreateDraft),
          cacheStores,
          this.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey),
          this.get<EncryptEntity>(DI_USE_CASES.EncryptEntity),
          repositoryStore,
          this.get<IndexClientEntity>(DI_USE_CASES.IndexClientEntity)
        )
    )

    this.bind(
      DI_USE_CASES.DeleteEntity,
      () =>
        new DeleteEntity(
          cacheStores,
          entityRepository,
          blockRepository,
          searchIndex,
          this.get<SyncDraft>(DI_USE_CASES.SyncDraft),
          this.get<PersistDraft>(DI_USE_CASES.PersistDraft)
        )
    )

    // ========================================
    // User Profile Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.GetCachedUserProfileEntities,
      () => new GetCachedUserProfileEntities(cacheStores)
    )

    this.bind(
      DI_USE_CASES.GetCachedUserProfileEntityByUserId,
      () =>
        new GetCachedUserProfileEntityByUserId(
          this.get<GetCachedUserProfileEntities>(DI_USE_CASES.GetCachedUserProfileEntities)
        )
    )

    this.bind(
      DI_USE_CASES.FetchUserProfileEntityByUserId,
      () =>
        new FetchUserProfileEntityByUserId(
          this.get<QueryEntitiesAndCache>(DI_USE_CASES.QueryEntitiesAndCache)
        )
    )

    this.bind(
      DI_USE_CASES.BuildWorkspaceMemberProfile,
      () => new BuildWorkspaceMemberProfile()
    )

    this.bind(
      DI_USE_CASES.EnrichWorkspaceMemberWithUserProfile,
      () =>
        new EnrichWorkspaceMemberWithUserProfile(
          this.get<GetCachedUserProfileEntityByUserId>(DI_USE_CASES.GetCachedUserProfileEntityByUserId),
          this.get<BuildWorkspaceMemberProfile>(DI_USE_CASES.BuildWorkspaceMemberProfile)
        )
    )

    this.bind(
      DI_USE_CASES.UpsertCurrentUserProfile,
      () =>
        new UpsertCurrentUserProfile(
          this.get<CreateEntityV2>(DI_USE_CASES.CreateEntityV2),
          this.get<UpdateEntity>(DI_USE_CASES.UpdateEntity),
          this.get<GetCachedUserProfileEntityByUserId>(DI_USE_CASES.GetCachedUserProfileEntityByUserId),
          this.get<FetchUserProfileEntityByUserId>(DI_USE_CASES.FetchUserProfileEntityByUserId)
        )
    )

    // ========================================
    // Sync Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.Sync,
      () =>
        new Sync(
          syncStore,
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          this.get<RemoveEntityLocally>(DI_USE_CASES.RemoveEntityLocally),
          this.get<PersistServerEntity>(DI_USE_CASES.PersistServerEntity),
          blockRepository,
          this.get<IndexBlockEntity>(DI_USE_CASES.IndexBlockEntity),
          this.get<EventBus>(DI_SERVICES.EventBus)
        )
    )

    this.bind(
      DI_USE_CASES.FetchWorkspaceKeys,
      () =>
        new FetchWorkspaceKeys(
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          this.get<DecryptKeyFromShares>(DI_USE_CASES.DecryptKeyFromShares),
          keyStore
        )
    )

    // ========================================
    // File Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.RequestSingleUploadPartURL,
      () => new RequestSingleUploadPartURL(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.RecordUploadedMultipartPart,
      () => new RecordUploadedMultipartPart(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.CompleteMultipartUpload,
      () => new CompleteMultipartUpload(this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest))
    )

    this.bind(
      DI_USE_CASES.UploadEncryptedChunk,
      () =>
        new UploadEncryptedChunk(
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          this.get<EncryptFileChunk>(DI_USE_CASES.EncryptFileChunk),
          this.get<RequestSingleUploadPartURL>(DI_USE_CASES.RequestSingleUploadPartURL)
        )
    )

    this.bind(
      DI_USE_CASES.CreateBaseFile,
      () =>
        new CreateBaseFile(
          crypto,
          this.get<EncryptEntity>(DI_USE_CASES.EncryptEntity),
          this.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey),
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest)
        )
    )

    this.bind(
      DI_USE_CASES.UploadFile,
      () =>
        new UploadFile(
          this.get<UploadEncryptedChunk>(DI_USE_CASES.UploadEncryptedChunk),
          this.get<CompleteMultipartUpload>(DI_USE_CASES.CompleteMultipartUpload),
          cacheStores,
          this.get<IndexClientEntity>(DI_USE_CASES.IndexClientEntity),
          this.get<CreateBaseFile>(DI_USE_CASES.CreateBaseFile)
        )
    )

    this.bind(
      DI_USE_CASES.UploadFileFromStream,
      () =>
        new UploadFileFromStream(
          this.get<CreateBaseFile>(DI_USE_CASES.CreateBaseFile),
          this.get<UploadEncryptedChunk>(DI_USE_CASES.UploadEncryptedChunk),
          this.get<CompleteMultipartUpload>(DI_USE_CASES.CompleteMultipartUpload),
          cacheStores,
          this.get<IndexClientEntity>(DI_USE_CASES.IndexClientEntity)
        )
    )

    this.bind(
      DI_USE_CASES.DownloadFile,
      () =>
        new DownloadFile(
          crypto,
          this.get<MakeWorkspaceRequest>(DI_USE_CASES.MakeWorkspaceRequest),
          this.get<DecryptFileChunk>(DI_USE_CASES.DecryptFileChunk),
          this.get<DecryptEntity>(DI_USE_CASES.DecryptEntity),
          workspaceInfoStore,
          this.get<GetWrappingKey>(DI_USE_CASES.GetWrappingKey)
        )
    )

    // ========================================
    // Member Use Cases
    // ========================================
    this.bind(
      DI_USE_CASES.FetchWorkspaceMembers,
      () => new FetchWorkspaceMembers(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.GetWorkspacePendingInvites,
      () => new GetWorkspacePendingInvites(executeAuthenticatedRequest)
    )

    this.bind(DI_USE_CASES.AddMemberToWorkspace, () => new AddMemberToWorkspace(executeAuthenticatedRequest))

    this.bind(
      DI_USE_CASES.RemoveMemberFromWorkspace,
      () => new RemoveMemberFromWorkspace(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.UpdateWorkspaceMemberRole,
      () => new UpdateWorkspaceMemberRole(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.RevokeWorkspacePendingInvite,
      () => new RevokeWorkspacePendingInvite(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.GetWorkspaceUserInvites,
      () => new GetWorkspaceUserInvites(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.CreateWorkspaceInvite,
      () => new CreateWorkspaceInvite(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.GetWorkspaceInvites,
      () => new GetWorkspaceInvites(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.GetWorkspaceLinkInvites,
      () => new GetWorkspaceLinkInvites(executeAuthenticatedRequest)
    )

    this.bind(DI_USE_CASES.RevokeUserInvite, () => new RevokeUserInvite(executeAuthenticatedRequest))

    this.bind(
      DI_USE_CASES.RevokeWorkspaceInvite,
      () => new RevokeWorkspaceInvite(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.DeleteWorkspaceLinkInvite,
      () => new DeleteWorkspaceLinkInvite(executeAuthenticatedRequest)
    )

    this.bind(
      DI_USE_CASES.CreateUserInviteForEmailAddress,
      () => new CreateUserInviteForEmailAddress(executeAuthenticatedRequest)
    )

    // ========================================
    // Workspace Use Cases
    // ========================================
    this.bind(DI_USE_CASES.UpdateWorkspace, () => new UpdateWorkspace(executeAuthenticatedRequest))

    // ========================================
    // Individual Member Use Cases
    // ========================================
    this.bind(DI_USE_CASES.GetWorkspaceMember, () => new FetchWorkspaceMember(executeAuthenticatedRequest))

    // ========================================
    // Mentions Use Cases
    // ========================================
    this.bind(DI_USE_CASES.GetMentionableUserIds, () => new GetMentionableUserIds(executeAuthenticatedRequest))

    // ========================================
    // Team Use Cases
    // ========================================
    this.bind(DI_USE_CASES.GetWorkspaceTeams, () => new GetWorkspaceTeams(executeAuthenticatedRequest))

    // ========================================
    // Services
    // ========================================
    this.bind(
      DI_SERVICES.UserProfileProcess,
      () =>
        new UserProfileProcess(
          cacheStores,
          this.get<WorkspaceMemberManager>(DI_SERVICES.WorkspaceMemberManager)
        )
    )

    this.bind(
      DI_SERVICES.WorkspaceMemberManager,
      () =>
        new WorkspaceMemberManager(
          workspaceStore,
          isWorkspaceRegisteredWithServer ? userId : "",
          this.get<FetchWorkspaceMembers>(DI_USE_CASES.FetchWorkspaceMembers),
          this.get<GetWorkspacePendingInvites>(DI_USE_CASES.GetWorkspacePendingInvites),
          this.get<AddMemberToWorkspace>(DI_USE_CASES.AddMemberToWorkspace),
          this.get<RemoveMemberFromWorkspace>(DI_USE_CASES.RemoveMemberFromWorkspace),
          this.get<UpdateWorkspaceMemberRole>(DI_USE_CASES.UpdateWorkspaceMemberRole),
          this.get<RevokeWorkspacePendingInvite>(DI_USE_CASES.RevokeWorkspacePendingInvite),
          this.get<SSEConnectionManager>(DI_SERVICES.SSEConnectionManager),
          memberRepository,
          this.get<EnrichWorkspaceMemberWithUserProfile>(DI_USE_CASES.EnrichWorkspaceMemberWithUserProfile)
        )
    )

    this.bind(
      DI_SERVICES.NotificationService,
      () =>
        new NotificationService(
          new ExecuteAuthenticatedRequest(
            accountStore.getHttpClient(),
            accountStore,
            this.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens),
            logger
          ),
          this.get<SSEConnectionManager>(DI_SERVICES.SSEConnectionManager),
          workspaceId
        )
    )

    const inviteLinkBaseUrl = process.env.VITE_INVITE_LINK_BASE_URL?.trim() ?? ""
    if (!inviteLinkBaseUrl) {
      throw new Error("VITE_INVITE_LINK_BASE_URL environment variable is required")
    }
    const normalizedInviteLinkBaseUrl = inviteLinkBaseUrl.replace(/\/+$/, "")
    this.bind(
      DI_SERVICES.InviteService,
      () =>
        new InviteService(
          crypto,
          new ExecuteAuthenticatedRequest(
            accountStore.getHttpClient(),
            accountStore,
            this.get<RefreshAuthTokens>(DI_USE_CASES.RefreshAuthTokens),
            logger
          ),
          accountStore,
          normalizedInviteLinkBaseUrl,
          workspaceInfoStore,
          keyStore
        )
    )

    logger.debug("Container initialized", { workspaceId })
  }

  /**
   * Helper method to get a use case from the container.
   */
  public getUseCase<T>(symbol: symbol): T {
    return this.get<T>(symbol)
  }
}
