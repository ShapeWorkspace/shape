import { CacheStores } from "../store/cache-stores"
import { WorkspaceMemberManager } from "../services/workspace-member-manager"

export class UserProfileProcess {
  private unsubscribeFromUserProfiles?: () => void

  constructor(
    private readonly cacheStores: CacheStores,
    private readonly workspaceMemberManager: WorkspaceMemberManager
  ) {}

  public initialize(): void {
    this.unsubscribeFromUserProfiles?.()
    this.unsubscribeFromUserProfiles = this.cacheStores.entityStore.subscribeToEntityType("user-profile", () => {
      this.workspaceMemberManager.handleUserProfileEntitiesChanged()
    })
  }

  public destroy(): void {
    this.unsubscribeFromUserProfiles?.()
    this.unsubscribeFromUserProfiles = undefined
  }
}
