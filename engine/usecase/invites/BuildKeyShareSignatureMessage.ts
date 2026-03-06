import { Base64String, HexString } from "../../crypto/types"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { Result } from "../../utils/Result"

/**
 * Constructs the associated data string for workspace key share signatures.
 * This binds the signature to all relevant identifiers, preventing substitution attacks.
 * Format: workspaceId + nonce + ciphertext + workspaceKeyId + recipientUserId
 */
export class BuildKeyShareSignatureMessage implements SyncUseCaseInterface<string> {
  public execute(
    workspaceId: string,
    nonce: HexString,
    ciphertext: Base64String,
    workspaceKeyId: string,
    recipientUserId: string
  ): Result<string> {
    return Result.ok(`${workspaceId}${nonce}${ciphertext}${workspaceKeyId}${recipientUserId}`)
  }
}
