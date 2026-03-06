import { Crypto } from "../../crypto/crypto"
import { Base64String } from "../../crypto/types"
import { isHexStringWithExpectedBytes, isNonEmptyString } from "../../crypto/utils"
import { CRYPTO_BOX_NONCE_BYTES, WORKSPACE_KEY_BYTES } from "../../models/workspace"
import { IdentityKeys } from "../../models/auth-types"
import { DecryptedWorkspaceKey, InitialWorkspaceKeyParams } from "../../models/workspace-key"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { BuildKeyShareSignatureMessage } from "../invites/BuildKeyShareSignatureMessage"

/**
 * Builds initial key params for an existing workspace key (used when registering local workspaces).
 */
export class BuildInitialWorkspaceKeyParamsFromExistingKey implements SyncUseCaseInterface<InitialWorkspaceKeyParams> {
  constructor(
    private readonly crypto: Crypto,
    private readonly buildKeyShareSignatureMessage: BuildKeyShareSignatureMessage
  ) {}

  public execute(
    workspaceId: string,
    identityKeys: IdentityKeys,
    workspaceKey: DecryptedWorkspaceKey
  ): Result<InitialWorkspaceKeyParams> {
    // Defensive validation before using the key in crypto_box.
    // This prevents cross-workspace key misuse and ensures the key material is well-formed.
    if (workspaceKey.workspaceId !== workspaceId) {
      return Result.fail("Workspace key scope mismatch for existing workspace registration")
    }
    if (!isNonEmptyString(workspaceKey.id)) {
      return Result.fail("Workspace key id is missing for existing workspace registration")
    }
    if (!isHexStringWithExpectedBytes(workspaceKey.key, WORKSPACE_KEY_BYTES)) {
      return Result.fail("Workspace key is not a 32-byte hex string")
    }

    const shareId = this.crypto.generateUUID()
    // Nonce for X25519 box encryption; required for deterministic decryption later.
    // This nonce is transmitted with the ciphertext as part of the key share.
    const nonce = this.crypto.generateRandomKey(CRYPTO_BOX_NONCE_BYTES)

    let ciphertext: Base64String
    try {
      // Encrypt the existing workspace key to the user's own box keypair.
      // This produces the initial key share that the server stores for recovery.
      ciphertext = this.crypto.sodiumCryptoBoxEasyEncrypt(
        workspaceKey.key,
        nonce,
        identityKeys.boxKeyPair.publicKey,
        identityKeys.boxKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to encrypt existing workspace key: ${message}`)
    }

    // Sign the key share payload (workspace + nonce + ciphertext + key id)
    // with the user's Ed25519 signing key to make the share tamper-evident.
    const signatureMessage = this.buildKeyShareSignatureMessage.execute(
      workspaceId,
      nonce,
      ciphertext,
      workspaceKey.id,
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
      return Result.fail(`Failed to sign existing workspace key share: ${message}`)
    }

    return Result.ok({
      id: workspaceKey.id,
      share: {
        id: shareId,
        sender_box_public_key: identityKeys.boxKeyPair.publicKey,
        sender_sign_public_key: identityKeys.signKeyPair.publicKey,
        nonce,
        ciphertext,
        share_signature: shareSignature,
      },
    })
  }
}
