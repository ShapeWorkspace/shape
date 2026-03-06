import { InviteSignatureParams } from "../../models/invite-types"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Builds the signature string for invite verification.
 *
 * Per BOOK OF ENCRYPTION, format:
 * SHAPE-INVITE-V1\nworkspace_id=...\ninvite_id=...\nnonce=...\nciphertext=...\n...
 */
export class BuildInviteSignatureString implements SyncUseCaseInterface<string> {
  public execute(params: InviteSignatureParams): Result<string> {
    return Result.ok(
      [
        "SHAPE-INVITE-V1",
        `workspace_id=${params.workspaceId}`,
        `invite_id=${params.inviteId}`,
        `nonce=${params.nonce}`,
        `ciphertext=${params.ciphertext}`,
        `inviter_sign_public_key=${params.inviterSignPublicKey}`,
        `created_at=${params.createdAt}`,
      ].join("\n")
    )
  }
}
