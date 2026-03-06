// Dependency injection symbols for global services
// Note: WorkspaceKeyService and InviteService are per-workspace scoped (in Application DI)

export const DI_GLOBAL = {
  // Foundational services
  DeviceStorage: Symbol("DeviceStorage"),
  Crypto: Symbol("Crypto"),
  OfflineDatabase: Symbol("OfflineDatabase"),
  KeychainService: Symbol("KeychainService"),

  // Stores
  UsersStore: Symbol("UsersStore"),
  WorkspaceStore: Symbol("WorkspaceStore"),
  AccountStoreContainer: Symbol("AccountStoreContainer"),

  // Use cases (global scope - no workspace/identity context needed at construction)
  BuildKeyShareSignatureMessage: Symbol("BuildKeyShareSignatureMessage"),
  BuildUserKeyBundleAssociatedData: Symbol("BuildUserKeyBundleAssociatedData"),
  BuildCreateWorkspaceRequest: Symbol("BuildCreateWorkspaceRequest"),
  BuildInitialWorkspaceKeyParamsFromExistingKey: Symbol("BuildInitialWorkspaceKeyParamsFromExistingKey"),
  GenerateInitialWorkspaceKeyParams: Symbol("GenerateInitialWorkspaceKeyParams"),
  BuildAcceptLinkInviteRequestFromBundle: Symbol("BuildAcceptLinkInviteRequestFromBundle"),
  CreateWorkspace: Symbol("CreateWorkspace"),
  CreateLocalWorkspace: Symbol("CreateLocalWorkspace"),
  GetLocalWorkspaceKey: Symbol("GetLocalWorkspaceKey"),
  FetchWorkspaces: Symbol("FetchWorkspaces"),
  FetchAllWorkspaces: Symbol("FetchAllWorkspaces"),
  RemoveWorkspaceModel: Symbol("RemoveWorkspaceModel"),
  RenameLocalWorkspace: Symbol("RenameLocalWorkspace"),
  UpdateWorkspaceModel: Symbol("UpdateWorkspaceModel"),
  RegisterExistingWorkspaceWithServer: Symbol("RegisterExistingWorkspaceWithServer"),
  RequestLoginChallenge: Symbol("RequestLoginChallenge"),
  GenerateRegistrationKeyBundleAndIdentityKeys: Symbol("GenerateRegistrationKeyBundleAndIdentityKeys"),
  DeriveLoginKeysFromPasswordAndChallenge: Symbol("DeriveLoginKeysFromPasswordAndChallenge"),
  DecryptKeyBundleToPlaintextBundle: Symbol("DecryptKeyBundleToPlaintextBundle"),
  BuildIdentityKeysFromKeyBundle: Symbol("BuildIdentityKeysFromKeyBundle"),
  GeneratePasswordUpdateCryptoFieldsFromKeyBundle: Symbol("GeneratePasswordUpdateCryptoFieldsFromKeyBundle"),
  Register: Symbol("Register"),
  Login: Symbol("Login"),
  Logout: Symbol("Logout"),
  LogoutAllAccounts: Symbol("LogoutAllAccounts"),
  ChangePassword: Symbol("ChangePassword"),
  RequestPasswordReset: Symbol("RequestPasswordReset"),
  ResetPassword: Symbol("ResetPassword"),

  // Invite-related use cases (for accepting invites before Application exists)
  GetMyPendingInvites: Symbol("GetMyPendingInvites"),
  AcceptUserInvite: Symbol("AcceptUserInvite"),
  AcceptWorkspaceInvite: Symbol("AcceptWorkspaceInvite"),
  GetInvite: Symbol("GetInvite"),
  GetInviteStatus: Symbol("GetInviteStatus"),
  BuildInviteSignatureString: Symbol("BuildInviteSignatureString"),
  BuildInviteBundleAssociatedData: Symbol("BuildInviteBundleAssociatedData"),
  ValidateInviteBundlePlaintext: Symbol("ValidateInviteBundlePlaintext"),
  ParseInviteBundlePlaintext: Symbol("ParseInviteBundlePlaintext"),
  DecryptInviteBundle: Symbol("DecryptInviteBundle"),
  AcceptLinkInvite: Symbol("AcceptLinkInvite"),
}
