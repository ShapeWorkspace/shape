// Dependency injection symbols for workspace-scoped services

export const DI_SERVICES = {
  // Infrastructure services
  SSEConnectionManager: Symbol("SSEConnectionManager"),
  EventBus: Symbol("EventBus"),
  EntityRealtimeSync: Symbol("EntityRealtimeSync"),

  // Stores
  KeyStore: Symbol("KeyStore"),
  WorkspaceInfoStore: Symbol("WorkspaceInfoStore"),
  CacheStores: Symbol("CacheStores"),
  RepositoryStore: Symbol("RepositoryStore"),

  // Core services
  InviteService: Symbol("InviteService"),
  UserProfileProcess: Symbol("UserProfileProcess"),
  WorkspaceMemberManager: Symbol("WorkspaceMemberManager"),
  NotificationService: Symbol("NotificationService"),
}

export const DI_INITIALIZERS = {
  InitializeWorkspace: Symbol("InitializeWorkspace"),
  HydrateSearchIndex: Symbol("HydrateSearchIndex"),
}

export const DI_USE_CASES = {
  // Network
  MakeWorkspaceRequest: Symbol("MakeWorkspaceRequest"),
  RefreshAuthTokens: Symbol("RefreshAuthTokens"),
  CreateSSEConnection: Symbol("CreateSSEConnection"),

  // Crypto usecases
  EncryptEntity: Symbol("EncryptEntity"),
  DecryptEntity: Symbol("DecryptEntity"),
  EncryptFileChunk: Symbol("EncryptFileChunk"),
  DecryptFileChunk: Symbol("DecryptFileChunk"),
  EncryptYjsDelta: Symbol("EncryptYjsDelta"),
  DecryptYjsDelta: Symbol("DecryptYjsDelta"),

  // Entity usecases
  GetWrappingKey: Symbol("GetWrappingKey"),
  IndexClientEntity: Symbol("IndexClientEntity"),
  PersistServerEntity: Symbol("PersistServerEntity"),
  ExecuteRemoteQuery: Symbol("ExecuteRemoteQuery"),
  QueryEntitiesAndCache: Symbol("QueryEntitiesAndCache"),
  QueryEntitiesByParent: Symbol("QueryEntitiesByParent"),
  QueryEntityById: Symbol("QueryEntityById"),
  GetOrFetchEntity: Symbol("GetOrFetchEntity"),
  CreateEntityV2: Symbol("CreateEntityV2"),
  UpdateEntity: Symbol("UpdateEntity"),
  DeleteEntity: Symbol("DeleteEntity"),
  RemoveEntityLocally: Symbol("RemoveEntityLocally"),
  DecryptEntityWithKeyLookup: Symbol("DecryptEntityWithKeyLookup"),
  ConstructYjsDocFromEncryptedBlocks: Symbol("ConstructYjsDocFromEncryptedBlocks"),
  IndexBlockEntity: Symbol("IndexBlockEntity"),

  // User profile usecases
  GetCachedUserProfileEntities: Symbol("GetCachedUserProfileEntities"),
  GetCachedUserProfileEntityByUserId: Symbol("GetCachedUserProfileEntityByUserId"),
  FetchUserProfileEntityByUserId: Symbol("FetchUserProfileEntityByUserId"),
  BuildWorkspaceMemberProfile: Symbol("BuildWorkspaceMemberProfile"),
  EnrichWorkspaceMemberWithUserProfile: Symbol("EnrichWorkspaceMemberWithUserProfile"),
  UpsertCurrentUserProfile: Symbol("UpsertCurrentUserProfile"),

  // Entity ACL usecases
  GetEntityACLEntries: Symbol("GetEntityACLEntries"),
  CreateEntityACLEntry: Symbol("CreateEntityACLEntry"),
  UpdateEntityACLEntry: Symbol("UpdateEntityACLEntry"),
  DeleteEntityACLEntry: Symbol("DeleteEntityACLEntry"),
  GetEntityACLMemberCount: Symbol("GetEntityACLMemberCount"),
  GetAvailableSubjectsForEntity: Symbol("GetAvailableSubjectsForEntity"),
  GetEntityLinks: Symbol("GetEntityLinks"),
  SyncEntityLinks: Symbol("SyncEntityLinks"),

  // Draft usecases
  CreateDraft: Symbol("CreateDraft"),
  PersistDraft: Symbol("PersistDraft"),
  SyncDraft: Symbol("SyncDraft"),
  ClearDraft: Symbol("ClearDraft"),
  CreateBlockDraft: Symbol("CreateBlockDraft"),
  SyncBlockDraft: Symbol("SyncBlockDraft"),
  SyncAllDrafts: Symbol("SyncAllDrafts"),

  // Sync usecases
  Sync: Symbol("Sync"),
  FetchWorkspaceKeys: Symbol("FetchWorkspaceKeys"),

  // File usecases
  CreateBaseFile: Symbol("CreateBaseFile"),
  UploadFile: Symbol("UploadFile"),
  UploadFileFromStream: Symbol("UploadFileFromStream"),
  DownloadFile: Symbol("DownloadFile"),
  RequestSingleUploadPartURL: Symbol("RequestSingleUploadPartURL"),
  RecordUploadedMultipartPart: Symbol("RecordUploadedMultipartPart"),
  CompleteMultipartUpload: Symbol("CompleteMultipartUpload"),
  UploadEncryptedChunk: Symbol("UploadEncryptedChunk"),

  // Member usecases
  FetchWorkspaceMembers: Symbol("FetchWorkspaceMembers"),
  GetWorkspacePendingInvites: Symbol("GetWorkspacePendingInvites"),
  AddMemberToWorkspace: Symbol("AddMemberToWorkspace"),
  RemoveMemberFromWorkspace: Symbol("RemoveMemberFromWorkspace"),
  UpdateWorkspaceMemberRole: Symbol("UpdateWorkspaceMemberRole"),
  RevokeWorkspacePendingInvite: Symbol("RevokeWorkspacePendingInvite"),

  // Invites usecases
  DecryptKeyFromShares: Symbol("DecryptKeyFromShares"),
  CreateKeyShareForUser: Symbol("CreateKeyShareForUser"),
  GetWorkspaceUserInvites: Symbol("GetWorkspaceUserInvites"),
  CreateWorkspaceInvite: Symbol("CreateWorkspaceInvite"),
  GetWorkspaceInvites: Symbol("GetWorkspaceInvites"),
  GetWorkspaceLinkInvites: Symbol("GetWorkspaceLinkInvites"),
  RevokeUserInvite: Symbol("RevokeUserInvite"),
  RevokeWorkspaceInvite: Symbol("RevokeWorkspaceInvite"),
  DeleteWorkspaceLinkInvite: Symbol("DeleteWorkspaceLinkInvite"),
  CreateUserInviteForEmailAddress: Symbol("CreateUserInviteForEmailAddress"),

  // Workspace usecases
  UpdateWorkspace: Symbol("UpdateWorkspace"),

  // Member usecases (individual)
  GetWorkspaceMember: Symbol("GetWorkspaceMember"),

  // Mentions usecases
  GetMentionableUserIds: Symbol("GetMentionableUserIds"),

  // Team usecases
  GetWorkspaceTeams: Symbol("GetWorkspaceTeams"),
}
