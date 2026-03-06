import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

export class BuildInviteBundleAssociatedData implements SyncUseCaseInterface<string> {
  /**
   * Builds the associated data string for invite bundle encryption/decryption.
   * Format: shape:v1:workspace:<workspaceId>:invite:<inviteId>
   */
  public execute(workspaceId: string, inviteId: string): Result<string> {
    return Result.ok(`shape:v1:workspace:${workspaceId}:invite:${inviteId}`)
  }
}
