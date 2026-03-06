import { DependencyContainer } from "../utils/DependencyContainer"
import { GlobalStorage } from "../storage/global-storage"
import { StorageProvider } from "../storage/storage-provider"
import { IOfflineDatabase, WorkspaceKeyRepository } from "../repositories"
import { Crypto } from "../crypto/crypto"
import { keychainProviderRegistry } from "../utils/keychain/keychain-provider"
import { KeychainService } from "../utils/tauri-keychain"
import { DI_GLOBAL } from "./global-di"
import { UsersStore } from "../store/users-store"
import { WorkspaceStore } from "../store/workspace-store"
import { AccountStoreContainer } from "../store/account-store-container"
import { logger } from "../utils/logger"

// Use cases
import { BuildKeyShareSignatureMessage } from "../usecase/invites/BuildKeyShareSignatureMessage"
import { BuildUserKeyBundleAssociatedData } from "../usecase/user/BuildUserKeyBundleAssociatedData"
import { BuildCreateWorkspaceRequest } from "../usecase/workspace/BuildCreateWorkspaceRequest"
import { BuildInitialWorkspaceKeyParamsFromExistingKey } from "../usecase/workspace/BuildInitialWorkspaceKeyParamsFromExistingKey"
import { GenerateInitialWorkspaceKeyParams } from "../usecase/workspace/GenerateInitialWorkspaceKeyParams"
import { BuildAcceptLinkInviteRequestFromBundle } from "../usecase/invites/BuildAcceptLinkInviteRequestFromBundle"
import { CreateWorkspace } from "../usecase/workspace/CreateWorkspace"
import { CreateLocalWorkspace } from "../usecase/workspace/CreateLocalWorkspace"
import { GetLocalWorkspaceKey } from "../usecase/workspace/GetLocalWorkspaceKey"
import { FetchWorkspaces } from "../usecase/workspace/FetchWorkspaces"
import { FetchAllWorkspaces } from "../usecase/workspace/FetchAllWorkspaces"
import { RemoveWorkspaceModel } from "../usecase/workspace/RemoveWorkspaceModel"
import { RenameLocalWorkspace } from "../usecase/workspace/RenameLocalWorkspace"
import { UpdateWorkspaceModel } from "../usecase/workspace/UpdateWorkspaceModel"
import { RegisterExistingWorkspaceWithServer } from "../usecase/workspace/RegisterExistingWorkspaceWithServer"
import { RequestLoginChallenge } from "../usecase/user/RequestLoginChallenge"
import { GenerateRegistrationKeyBundleAndIdentityKeys } from "../usecase/user/GenerateRegistrationKeyBundleAndIdentityKeys"
import { DeriveLoginKeysFromPasswordAndChallenge } from "../usecase/user/DeriveLoginKeysFromPasswordAndChallenge"
import { DecryptKeyBundleToPlaintextBundle } from "../usecase/invites/DecryptKeyBundleToPlaintextBundle"
import { BuildIdentityKeysFromKeyBundle } from "../usecase/user/BuildIdentityKeysFromKeyBundle"
import { GeneratePasswordUpdateCryptoFieldsFromKeyBundle } from "../usecase/user/GeneratePasswordUpdateCryptoFieldsFromKeyBundle"
import { Register } from "../usecase/user/Register"
import { Login } from "../usecase/user/Login"
import { Logout } from "../usecase/user/Logout"
import { LogoutAllAccounts } from "../usecase/user/LogoutAllAccounts"
import { ChangePassword } from "../usecase/user/ChangePassword"
import { RequestPasswordReset } from "../usecase/user/RequestPasswordReset"
import { ResetPassword } from "../usecase/user/ResetPassword"
import { GetInvite } from "../usecase/invites/GetInvite"
import { GetInviteStatus } from "../usecase/invites/GetInviteStatus"
import { BuildInviteSignatureString } from "../usecase/invites/BuildInviteSignatureString"
import { GetMyPendingInvites } from "../usecase/invites/GetMyPendingInvites"
import { AcceptUserInvite } from "../usecase/invites/AcceptUserInvite"
import { AcceptWorkspaceInviteForAccount } from "../usecase/invites/AcceptWorkspaceInviteForAccount"
import { BuildInviteBundleAssociatedData } from "../usecase/invites/BuildInviteBundleAssociatedData"
import { ValidateInviteBundlePlaintext } from "../usecase/invites/ValidateInviteBundlePlaintext"
import { ParseInviteBundlePlaintext } from "../usecase/invites/ParseInviteBundlePlaintext"
import { DecryptInviteBundle } from "../usecase/invites/DecryptInviteBundle"
import { AcceptLinkInvite } from "../usecase/invites/AcceptLinkInvite"

/**
 * Configuration options for GlobalContainer.
 */
export interface GlobalContainerConfig {
  storageFunctions: StorageProvider
  defaultBaseUrl: string
  offlineDatabase: IOfflineDatabase
  clientKey: string
}

/**
 * Global-scoped container for foundational services and use cases.
 * Binds all global services with their dependencies.
 *
 * Note: WorkspaceKeyService and InviteService are per-workspace scoped
 * and created inside Application's DI container, not here.
 */
export class GlobalContainer extends DependencyContainer {
  constructor(config: GlobalContainerConfig) {
    super()

    const { storageFunctions, defaultBaseUrl, offlineDatabase, clientKey } = config

    // ========================================
    // Foundational services (no dependencies)
    // ========================================

    const globalStorage = new GlobalStorage(storageFunctions, clientKey)
    this.bind(DI_GLOBAL.DeviceStorage, () => globalStorage)
    this.bind(DI_GLOBAL.Crypto, () => new Crypto())
    this.bind(DI_GLOBAL.OfflineDatabase, () => offlineDatabase)

    // Configure keychain provider for web platform
    keychainProviderRegistry.configureWebKeychainProvider(globalStorage)
    this.bind(DI_GLOBAL.KeychainService, () => new KeychainService(keychainProviderRegistry))

    // ========================================
    // Use cases (stateless, no context needed at construction)
    // ========================================

    this.bind(DI_GLOBAL.BuildKeyShareSignatureMessage, () => new BuildKeyShareSignatureMessage())
    this.bind(DI_GLOBAL.BuildUserKeyBundleAssociatedData, () => new BuildUserKeyBundleAssociatedData())
    this.bind(DI_GLOBAL.BuildCreateWorkspaceRequest, () => new BuildCreateWorkspaceRequest())

    this.bind(DI_GLOBAL.BuildInitialWorkspaceKeyParamsFromExistingKey, () => {
      return new BuildInitialWorkspaceKeyParamsFromExistingKey(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildKeyShareSignatureMessage>(DI_GLOBAL.BuildKeyShareSignatureMessage)
      )
    })

    this.bind(DI_GLOBAL.GenerateInitialWorkspaceKeyParams, () => {
      return new GenerateInitialWorkspaceKeyParams(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildKeyShareSignatureMessage>(DI_GLOBAL.BuildKeyShareSignatureMessage)
      )
    })

    this.bind(DI_GLOBAL.BuildAcceptLinkInviteRequestFromBundle, () => {
      return new BuildAcceptLinkInviteRequestFromBundle(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildKeyShareSignatureMessage>(DI_GLOBAL.BuildKeyShareSignatureMessage)
      )
    })

    this.bind(DI_GLOBAL.GetLocalWorkspaceKey, () => {
      return new GetLocalWorkspaceKey(new WorkspaceKeyRepository(offlineDatabase))
    })

    // ========================================
    // Stores
    // ========================================

    this.bind(DI_GLOBAL.UsersStore, () => {
      return new UsersStore(globalStorage, logger)
    })

    this.bind(DI_GLOBAL.WorkspaceStore, () => {
      return new WorkspaceStore(globalStorage, storageFunctions, logger)
    })

    this.bind(DI_GLOBAL.AccountStoreContainer, () => {
      return new AccountStoreContainer(
        this.get<UsersStore>(DI_GLOBAL.UsersStore),
        this.get<KeychainService>(DI_GLOBAL.KeychainService),
        this.get<Crypto>(DI_GLOBAL.Crypto),
        storageFunctions,
        defaultBaseUrl
      )
    })

    // ========================================
    // Global services
    // ========================================

    // Use case: CreateWorkspace - creates a workspace on the server and applies response locally
    this.bind(DI_GLOBAL.CreateWorkspace, () => {
      return new CreateWorkspace(
        this.get<GenerateInitialWorkspaceKeyParams>(DI_GLOBAL.GenerateInitialWorkspaceKeyParams),
        this.get<BuildCreateWorkspaceRequest>(DI_GLOBAL.BuildCreateWorkspaceRequest),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        new WorkspaceKeyRepository(offlineDatabase),
        logger
      )
    })

    // Use case: CreateLocalWorkspace - creates a local-only workspace for anonymous usage
    this.bind(DI_GLOBAL.CreateLocalWorkspace, () => {
      return new CreateLocalWorkspace(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        new WorkspaceKeyRepository(offlineDatabase),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore)
      )
    })

    // Use case: FetchWorkspaces - fetches workspaces for a single account
    this.bind(DI_GLOBAL.FetchWorkspaces, () => {
      return new FetchWorkspaces(this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore), logger)
    })

    // Use case: FetchAllWorkspaces - fetches workspaces for all accounts
    this.bind(DI_GLOBAL.FetchAllWorkspaces, () => {
      return new FetchAllWorkspaces(
        this.get<FetchWorkspaces>(DI_GLOBAL.FetchWorkspaces),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        logger
      )
    })

    // Use case: RemoveWorkspaceModel - removes a workspace from local state
    this.bind(DI_GLOBAL.RemoveWorkspaceModel, () => {
      return new RemoveWorkspaceModel(this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore), logger)
    })

    // Use case: RenameLocalWorkspace - renames a local-only workspace
    this.bind(DI_GLOBAL.RenameLocalWorkspace, () => {
      return new RenameLocalWorkspace(this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore))
    })

    // Use case: UpdateWorkspaceModel - updates a workspace model in local state
    this.bind(DI_GLOBAL.UpdateWorkspaceModel, () => {
      return new UpdateWorkspaceModel(this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore))
    })

    // Use case: RegisterExistingWorkspaceWithServer - registers a local workspace on the server
    this.bind(DI_GLOBAL.RegisterExistingWorkspaceWithServer, () => {
      return new RegisterExistingWorkspaceWithServer(
        this.get<BuildInitialWorkspaceKeyParamsFromExistingKey>(
          DI_GLOBAL.BuildInitialWorkspaceKeyParamsFromExistingKey
        ),
        this.get<BuildCreateWorkspaceRequest>(DI_GLOBAL.BuildCreateWorkspaceRequest),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        new WorkspaceKeyRepository(offlineDatabase),
        logger
      )
    })

    // ========================================
    // Auth use cases
    // ========================================

    // Use case: RequestLoginChallenge - gets KDF params for login
    this.bind(DI_GLOBAL.RequestLoginChallenge, () => {
      return new RequestLoginChallenge()
    })

    // Use case: GenerateRegistrationKeyBundleAndIdentityKeys - registration crypto material
    this.bind(DI_GLOBAL.GenerateRegistrationKeyBundleAndIdentityKeys, () => {
      return new GenerateRegistrationKeyBundleAndIdentityKeys(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildUserKeyBundleAssociatedData>(DI_GLOBAL.BuildUserKeyBundleAssociatedData)
      )
    })

    // Use case: DeriveLoginKeysFromPasswordAndChallenge - login subkeys
    this.bind(DI_GLOBAL.DeriveLoginKeysFromPasswordAndChallenge, () => {
      return new DeriveLoginKeysFromPasswordAndChallenge(this.get<Crypto>(DI_GLOBAL.Crypto))
    })

    // Use case: DecryptKeyBundleToPlaintextBundle - decrypts identity bundle
    this.bind(DI_GLOBAL.DecryptKeyBundleToPlaintextBundle, () => {
      return new DecryptKeyBundleToPlaintextBundle(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildUserKeyBundleAssociatedData>(DI_GLOBAL.BuildUserKeyBundleAssociatedData)
      )
    })

    // Use case: BuildIdentityKeysFromKeyBundle - regenerates identity keys
    this.bind(DI_GLOBAL.BuildIdentityKeysFromKeyBundle, () => {
      return new BuildIdentityKeysFromKeyBundle(this.get<Crypto>(DI_GLOBAL.Crypto))
    })

    // Use case: GeneratePasswordUpdateCryptoFieldsFromKeyBundle - password change/reset wrapper
    this.bind(DI_GLOBAL.GeneratePasswordUpdateCryptoFieldsFromKeyBundle, () => {
      return new GeneratePasswordUpdateCryptoFieldsFromKeyBundle(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<BuildUserKeyBundleAssociatedData>(DI_GLOBAL.BuildUserKeyBundleAssociatedData)
      )
    })

    // Use case: Register - registers a new user with E2EE identity
    this.bind(DI_GLOBAL.Register, () => {
      return new Register(
        this.get<GenerateRegistrationKeyBundleAndIdentityKeys>(
          DI_GLOBAL.GenerateRegistrationKeyBundleAndIdentityKeys
        ),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore)
      )
    })

    // Use case: Login - authenticates user and decrypts key bundle
    this.bind(DI_GLOBAL.Login, () => {
      return new Login(
        this.get<RequestLoginChallenge>(DI_GLOBAL.RequestLoginChallenge),
        this.get<DeriveLoginKeysFromPasswordAndChallenge>(DI_GLOBAL.DeriveLoginKeysFromPasswordAndChallenge),
        this.get<DecryptKeyBundleToPlaintextBundle>(DI_GLOBAL.DecryptKeyBundleToPlaintextBundle),
        this.get<BuildIdentityKeysFromKeyBundle>(DI_GLOBAL.BuildIdentityKeysFromKeyBundle),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore),
        logger
      )
    })

    // Use case: Logout - logs out a single account
    this.bind(DI_GLOBAL.Logout, () => {
      return new Logout(
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        logger
      )
    })

    // Use case: LogoutAllAccounts - logs out all authenticated accounts
    this.bind(DI_GLOBAL.LogoutAllAccounts, () => {
      return new LogoutAllAccounts(
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        logger
      )
    })

    // Use case: ChangePassword - changes the account password and rewraps identity keys
    this.bind(DI_GLOBAL.ChangePassword, () => {
      return new ChangePassword(
        this.get<DeriveLoginKeysFromPasswordAndChallenge>(DI_GLOBAL.DeriveLoginKeysFromPasswordAndChallenge),
        this.get<GeneratePasswordUpdateCryptoFieldsFromKeyBundle>(
          DI_GLOBAL.GeneratePasswordUpdateCryptoFieldsFromKeyBundle
        ),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore),
        this.get<RequestLoginChallenge>(DI_GLOBAL.RequestLoginChallenge)
      )
    })

    // Use case: RequestPasswordReset - requests a password reset token
    this.bind(DI_GLOBAL.RequestPasswordReset, () => {
      return new RequestPasswordReset()
    })

    // Use case: ResetPassword - resets password using a reset token
    this.bind(DI_GLOBAL.ResetPassword, () => {
      return new ResetPassword(
        this.get<GeneratePasswordUpdateCryptoFieldsFromKeyBundle>(
          DI_GLOBAL.GeneratePasswordUpdateCryptoFieldsFromKeyBundle
        ),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        this.get<UsersStore>(DI_GLOBAL.UsersStore)
      )
    })

    // ========================================
    // Invite-related use cases
    // ========================================

    // Use case: GetInvite - fetches invite metadata from server (public endpoint)
    this.bind(DI_GLOBAL.GetInvite, () => {
      return new GetInvite()
    })

    // Use case: GetInviteStatus - fetches metadata for token-based invites (public endpoint)
    this.bind(DI_GLOBAL.GetInviteStatus, () => {
      return new GetInviteStatus()
    })

    // Use case: GetMyPendingInvites - fetches pending invites for a user
    this.bind(DI_GLOBAL.GetMyPendingInvites, () => {
      return new GetMyPendingInvites(this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer), logger)
    })

    // Use case: AcceptUserInvite - accepts a pending user invite
    this.bind(DI_GLOBAL.AcceptUserInvite, () => {
      return new AcceptUserInvite(this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer), logger)
    })

    // Use case: AcceptWorkspaceInvite - accepts token invite for an authenticated account
    this.bind(DI_GLOBAL.AcceptWorkspaceInvite, () => {
      return new AcceptWorkspaceInviteForAccount(
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        logger
      )
    })

    // Use case: BuildInviteSignatureString - builds signature string for verification
    this.bind(DI_GLOBAL.BuildInviteSignatureString, () => {
      return new BuildInviteSignatureString()
    })

    // Use case: BuildInviteBundleAssociatedData - builds AAD for invite encryption
    this.bind(DI_GLOBAL.BuildInviteBundleAssociatedData, () => {
      return new BuildInviteBundleAssociatedData()
    })

    // Use case: ValidateInviteBundlePlaintext - validates invite bundle structure
    this.bind(DI_GLOBAL.ValidateInviteBundlePlaintext, () => {
      return new ValidateInviteBundlePlaintext()
    })

    // Use case: ParseInviteBundlePlaintext - parses and validates invite bundle JSON
    this.bind(DI_GLOBAL.ParseInviteBundlePlaintext, () => {
      return new ParseInviteBundlePlaintext(
        this.get<ValidateInviteBundlePlaintext>(DI_GLOBAL.ValidateInviteBundlePlaintext)
      )
    })

    // Use case: DecryptInviteBundle - decrypts invite bundle using invite secret
    this.bind(DI_GLOBAL.DecryptInviteBundle, () => {
      return new DecryptInviteBundle(
        this.get<Crypto>(DI_GLOBAL.Crypto),
        this.get<GetInvite>(DI_GLOBAL.GetInvite),
        this.get<BuildInviteSignatureString>(DI_GLOBAL.BuildInviteSignatureString),
        this.get<BuildInviteBundleAssociatedData>(DI_GLOBAL.BuildInviteBundleAssociatedData),
        this.get<ParseInviteBundlePlaintext>(DI_GLOBAL.ParseInviteBundlePlaintext),
        this.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer),
        logger
      )
    })

    // Use case: AcceptLinkInvite - accepts invite, persists keys, and refreshes workspaces
    this.bind(DI_GLOBAL.AcceptLinkInvite, () => {
      return new AcceptLinkInvite(
        this.get<BuildAcceptLinkInviteRequestFromBundle>(DI_GLOBAL.BuildAcceptLinkInviteRequestFromBundle),
        this.get<FetchWorkspaces>(DI_GLOBAL.FetchWorkspaces),
        this.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore),
        new WorkspaceKeyRepository(offlineDatabase),
        logger
      )
    })
  }
}
