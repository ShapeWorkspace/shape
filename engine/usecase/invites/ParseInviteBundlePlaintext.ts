import { InviteBundlePlaintext } from "../../models/invite-types"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { ValidateInviteBundlePlaintext } from "./ValidateInviteBundlePlaintext"

export class ParseInviteBundlePlaintext implements SyncUseCaseInterface<InviteBundlePlaintext> {
  constructor(private readonly validateInviteBundlePlaintext: ValidateInviteBundlePlaintext) {}
  /**
   * Parse and validate the invite bundle payload.
   * Ensures all cryptographic material is structurally sound before use.
   */
  execute(
    decryptedJson: string,
    expectedWorkspaceId: string,
    expectedInviteId: string,
    expectedVersion: number
  ): Result<InviteBundlePlaintext> {
    let parsed: unknown

    try {
      parsed = JSON.parse(decryptedJson)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Invite bundle JSON is invalid: ${message}`)
    }

    return this.validateInviteBundlePlaintext.execute(
      parsed,
      expectedWorkspaceId,
      expectedInviteId,
      expectedVersion
    )
  }
}
