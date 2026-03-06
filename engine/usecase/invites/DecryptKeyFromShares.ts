import { Crypto } from "../../crypto/crypto"
import { HexString } from "../../crypto/types"
import { DecryptedWorkspaceKey, WorkspaceKeyWithShares } from "../../models/workspace-key"
import { AccountStore } from "../../store/account-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { BuildKeyShareSignatureMessage } from "./BuildKeyShareSignatureMessage"

/**
 * Decrypts a workspace key from its shares.
 * Looks for a share addressed to the current user.
 */
export class DecryptKeyFromShares implements SyncUseCaseInterface<DecryptedWorkspaceKey | null> {
  constructor(
    private readonly crypto: Crypto,
    private readonly accountStore: AccountStore,
    private readonly buildKeyShareSignatureMessage: BuildKeyShareSignatureMessage,
    private readonly logger: Logger
  ) {}

  public execute(keyWithShares: WorkspaceKeyWithShares): Result<DecryptedWorkspaceKey | null> {
    const ourShare = keyWithShares.shares.find(
      share => share.recipient_user_id === this.accountStore.getSureIdentityKeys().userId
    )

    if (!ourShare) {
      this.logger.warn(
        `No share found for user ${this.accountStore.getSureIdentityKeys().userId} in key ${keyWithShares.id}`
      )
      return Result.ok(null)
    }

    const signatureMessage = this.buildKeyShareSignatureMessage.execute(
      ourShare.workspace_id,
      ourShare.nonce,
      ourShare.ciphertext,
      ourShare.workspace_key_id,
      ourShare.recipient_user_id
    )
    if (signatureMessage.isFailed()) {
      return Result.fail(signatureMessage.getError())
    }
    const isValidSignature = this.crypto.sodiumCryptoSignVerify(
      signatureMessage.getValue(),
      ourShare.share_signature,
      ourShare.sender_sign_public_key
    )

    if (!isValidSignature) {
      this.logger.error(`Invalid signature on share ${ourShare.id}`)
      return Result.fail(`Invalid signature on share ${ourShare.id}`)
    }

    let decryptedKey: HexString
    try {
      decryptedKey = this.crypto.sodiumCryptoBoxEasyDecrypt(
        ourShare.ciphertext,
        ourShare.nonce,
        ourShare.sender_box_public_key,
        this.accountStore.getSureIdentityKeys().boxKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      this.logger.error(`Failed to decrypt share ${ourShare.id}: ${message}`)
      return Result.fail(`Failed to decrypt share ${ourShare.id}: ${message}`)
    }

    return Result.ok({
      id: keyWithShares.id,
      workspaceId: keyWithShares.workspace_id,
      generation: keyWithShares.generation,
      key: decryptedKey,
    })
  }
}
