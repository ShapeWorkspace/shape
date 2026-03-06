import { GlobalStorage } from "../storage/global-storage"
import { StorageProvider } from "../storage/storage-provider"
import { IOfflineDatabase } from "../repositories"
import { Crypto } from "../crypto/crypto"
import { KeychainService } from "../utils/tauri-keychain"
import { GlobalContainer } from "./global-container"
import { DI_GLOBAL } from "./global-di"
import { UsersStore } from "../store/users-store"
import { WorkspaceStore } from "../store/workspace-store"
import { AccountStoreContainer } from "../store/account-store-container"
import { CreateWorkspace } from "../usecase/workspace/CreateWorkspace"
import { CreateLocalWorkspace } from "../usecase/workspace/CreateLocalWorkspace"
import { GetLocalWorkspaceKey } from "../usecase/workspace/GetLocalWorkspaceKey"
import { FetchAllWorkspaces } from "../usecase/workspace/FetchAllWorkspaces"
import { RemoveWorkspaceModel } from "../usecase/workspace/RemoveWorkspaceModel"
import { RenameLocalWorkspace } from "../usecase/workspace/RenameLocalWorkspace"
import { UpdateWorkspaceModel } from "../usecase/workspace/UpdateWorkspaceModel"
import { RegisterExistingWorkspaceWithServer } from "../usecase/workspace/RegisterExistingWorkspaceWithServer"
import { Register } from "../usecase/user/Register"
import { Login } from "../usecase/user/Login"
import { Logout } from "../usecase/user/Logout"
import { LogoutAllAccounts } from "../usecase/user/LogoutAllAccounts"
import { ChangePassword } from "../usecase/user/ChangePassword"
import { RequestPasswordReset } from "../usecase/user/RequestPasswordReset"
import { ResetPassword } from "../usecase/user/ResetPassword"
import { GetMyPendingInvites } from "../usecase/invites/GetMyPendingInvites"
import { AcceptUserInvite } from "../usecase/invites/AcceptUserInvite"
import { AcceptWorkspaceInviteForAccount } from "../usecase/invites/AcceptWorkspaceInviteForAccount"
import { GetInvite } from "../usecase/invites/GetInvite"
import { GetInviteStatus } from "../usecase/invites/GetInviteStatus"
import { DecryptInviteBundle } from "../usecase/invites/DecryptInviteBundle"
import { AcceptLinkInvite } from "../usecase/invites/AcceptLinkInvite"



/**
 * GlobalClient manages all global services and their initialization.
 * One per client instance, used to represent a single client that can manage workspaces and users.
 * Unlike Application instances where a user can have multiple applications each signed into a different workspace,
 * a GlobalClient instance is used to represent a single client and can manage workspaces and users.
 */
export class GlobalClient {
  private container: GlobalContainer

  constructor(
    storageFunctions: StorageProvider,
    defaultBaseUrl: string,
    /**
     * Database for offline entity caching. Persists encrypted entities in local storage
     * for instant display via stale-while-revalidate pattern.
     */
    offlineDatabase: IOfflineDatabase,
    /**
     * This can be overriden for use in tests to allow multiple users to be signed in using different storage namespaces
     * For real use, there would never be more than one client.
     */
    clientKey = "global"
  ) {
    this.container = new GlobalContainer({
      storageFunctions,
      defaultBaseUrl,
      offlineDatabase,
      clientKey,
    })
  }

  public async initialize(): Promise<void> {
    await this.getCrypto().initialize()

    // Initialize stores that need to hydrate from storage.
    // Order matters: UsersStore must be initialized before AccountStoreContainer
    // since AccountStoreContainer creates AccountStores based on persisted users.
    await this.getUsersStore().initialize()
    await this.getAccountStoreContainer().initialize()
    await this.getWorkspaceStore().initialize()
  }

  // ========================================
  // Public accessors for services
  // ========================================

  public getDeviceStorage(): GlobalStorage {
    return this.container.get<GlobalStorage>(DI_GLOBAL.DeviceStorage)
  }

  public getCrypto(): Crypto {
    return this.container.get<Crypto>(DI_GLOBAL.Crypto)
  }

  public getKeychainService(): KeychainService {
    return this.container.get<KeychainService>(DI_GLOBAL.KeychainService)
  }

  public getOfflineDatabase(): IOfflineDatabase {
    return this.container.get<IOfflineDatabase>(DI_GLOBAL.OfflineDatabase)
  }

  public getCreateWorkspace(): CreateWorkspace {
    return this.container.get<CreateWorkspace>(DI_GLOBAL.CreateWorkspace)
  }

  public getGetLocalWorkspaceKey(): GetLocalWorkspaceKey {
    return this.container.get<GetLocalWorkspaceKey>(DI_GLOBAL.GetLocalWorkspaceKey)
  }

  public getUsersStore(): UsersStore {
    return this.container.get<UsersStore>(DI_GLOBAL.UsersStore)
  }

  public getWorkspaceStore(): WorkspaceStore {
    return this.container.get<WorkspaceStore>(DI_GLOBAL.WorkspaceStore)
  }

  public getAccountStoreContainer(): AccountStoreContainer {
    return this.container.get<AccountStoreContainer>(DI_GLOBAL.AccountStoreContainer)
  }

  public getCreateLocalWorkspace(): CreateLocalWorkspace {
    return this.container.get<CreateLocalWorkspace>(DI_GLOBAL.CreateLocalWorkspace)
  }

  public getFetchAllWorkspaces(): FetchAllWorkspaces {
    return this.container.get<FetchAllWorkspaces>(DI_GLOBAL.FetchAllWorkspaces)
  }

  public getRemoveWorkspaceModel(): RemoveWorkspaceModel {
    return this.container.get<RemoveWorkspaceModel>(DI_GLOBAL.RemoveWorkspaceModel)
  }

  public getRenameLocalWorkspace(): RenameLocalWorkspace {
    return this.container.get<RenameLocalWorkspace>(DI_GLOBAL.RenameLocalWorkspace)
  }

  public getUpdateWorkspaceModel(): UpdateWorkspaceModel {
    return this.container.get<UpdateWorkspaceModel>(DI_GLOBAL.UpdateWorkspaceModel)
  }

  public getRegisterExistingWorkspaceWithServer(): RegisterExistingWorkspaceWithServer {
    return this.container.get<RegisterExistingWorkspaceWithServer>(
      DI_GLOBAL.RegisterExistingWorkspaceWithServer
    )
  }

  public getRegister(): Register {
    return this.container.get<Register>(DI_GLOBAL.Register)
  }

  public getLogin(): Login {
    return this.container.get<Login>(DI_GLOBAL.Login)
  }

  public getLogout(): Logout {
    return this.container.get<Logout>(DI_GLOBAL.Logout)
  }

  public getLogoutAllAccounts(): LogoutAllAccounts {
    return this.container.get<LogoutAllAccounts>(DI_GLOBAL.LogoutAllAccounts)
  }

  public getChangePassword(): ChangePassword {
    return this.container.get<ChangePassword>(DI_GLOBAL.ChangePassword)
  }

  public getRequestPasswordReset(): RequestPasswordReset {
    return this.container.get<RequestPasswordReset>(DI_GLOBAL.RequestPasswordReset)
  }

  public getResetPassword(): ResetPassword {
    return this.container.get<ResetPassword>(DI_GLOBAL.ResetPassword)
  }

  public getMyPendingInvites(): GetMyPendingInvites {
    return this.container.get<GetMyPendingInvites>(DI_GLOBAL.GetMyPendingInvites)
  }

  public getAcceptUserInvite(): AcceptUserInvite {
    return this.container.get<AcceptUserInvite>(DI_GLOBAL.AcceptUserInvite)
  }

  public getAcceptWorkspaceInvite(): AcceptWorkspaceInviteForAccount {
    return this.container.get<AcceptWorkspaceInviteForAccount>(DI_GLOBAL.AcceptWorkspaceInvite)
  }

  public getGetInvite(): GetInvite {
    return this.container.get<GetInvite>(DI_GLOBAL.GetInvite)
  }

  public getGetInviteStatus(): GetInviteStatus {
    return this.container.get<GetInviteStatus>(DI_GLOBAL.GetInviteStatus)
  }

  public getDecryptInviteBundle(): DecryptInviteBundle {
    return this.container.get<DecryptInviteBundle>(DI_GLOBAL.DecryptInviteBundle)
  }

  public getAcceptLinkInvite(): AcceptLinkInvite {
    return this.container.get<AcceptLinkInvite>(DI_GLOBAL.AcceptLinkInvite)
  }

  /**
   * Cleans up all services managed by this client.
   */
  public destroy(): void {
    this.container.deinit()
  }
}
