import { Crypto } from "../../crypto/crypto"
import { Base64String } from "../../crypto/types"
import { InviteBundlePlaintext } from "../../models/invite-types"
import { CRYPTO_BOX_NONCE_BYTES } from "../../models/workspace"
import { AcceptLinkInviteRequest, AcceptLinkInviteShareRequest } from "../../models/workspace-account-requests"
import { IdentityKeys } from "../../models/auth-types"
import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { BuildKeyShareSignatureMessage } from "./BuildKeyShareSignatureMessage"

type ResultType = {
  request: AcceptLinkInviteRequest
  decryptedWorkspaceKeys: DecryptedWorkspaceKey[]
}

/**
 * Builds the request payload for accepting a link invite and returns decrypted keys.
 * The caller is responsible for sending the request and persisting keys.
 */
export class BuildAcceptLinkInviteRequestFromBundle implements SyncUseCaseInterface<ResultType> {
  constructor(
    private crypto: Crypto,
    private readonly buildKeyShareSignatureMessage: BuildKeyShareSignatureMessage
  ) {}

  public execute(bundle: InviteBundlePlaintext, identityKeys: IdentityKeys): Result<ResultType> {
    const shares: AcceptLinkInviteShareRequest[] = []
    const decryptedWorkspaceKeys: DecryptedWorkspaceKey[] = []

    for (const bundleKey of bundle.keys) {
      const shareId = this.crypto.generateUUID()
      const nonce = this.crypto.generateRandomKey(CRYPTO_BOX_NONCE_BYTES)

      // Encrypt the workspace key using crypto_box (self-encryption)
      let ciphertext: Base64String
      try {
        ciphertext = this.crypto.sodiumCryptoBoxEasyEncrypt(
          bundleKey.workspaceKey,
          nonce,
          identityKeys.boxKeyPair.publicKey,
          identityKeys.boxKeyPair.privateKey
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return Result.fail(`Failed to encrypt workspace key: ${message}`)
      }

      // Build signature message binding the share to workspace, key, and recipient
      const signatureMessage = this.buildKeyShareSignatureMessage.execute(
        bundle.workspaceId,
        nonce,
        ciphertext,
        bundleKey.workspaceKeyId,
        identityKeys.userId
      )
      if (signatureMessage.isFailed()) {
        return Result.fail(signatureMessage.getError())
      }

      let shareSignature: Base64String
      try {
        shareSignature = this.crypto.sodiumCryptoSign(
          signatureMessage.getValue(),
          identityKeys.signKeyPair.privateKey
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return Result.fail(`Failed to sign key share: ${message}`)
      }

      shares.push({
        id: shareId,
        workspace_key_id: bundleKey.workspaceKeyId,
        sender_box_public_key: identityKeys.boxKeyPair.publicKey,
        sender_sign_public_key: identityKeys.signKeyPair.publicKey,
        nonce,
        ciphertext,
        share_signature: shareSignature,
      })

      decryptedWorkspaceKeys.push({
        id: bundleKey.workspaceKeyId,
        workspaceId: bundle.workspaceId,
        generation: bundleKey.generation,
        key: bundleKey.workspaceKey,
      })
    }

    return Result.ok({
      request: { shares },
      decryptedWorkspaceKeys,
    })
  }
}
