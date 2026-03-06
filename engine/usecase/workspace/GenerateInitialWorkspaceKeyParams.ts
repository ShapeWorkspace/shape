import { Crypto } from "../../crypto/crypto"
import { Base64String } from "../../crypto/types"
import { CRYPTO_BOX_NONCE_BYTES, WORKSPACE_KEY_BYTES } from "../../models/workspace"
import { IdentityKeys } from "../../models/auth-types"
import {
  DecryptedWorkspaceKey,
  GeneratedInitialKeyResult,
  InitialWorkspaceKeyParams,
} from "../../models/workspace-key"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"
import { BuildKeyShareSignatureMessage } from "../invites/BuildKeyShareSignatureMessage"

export class GenerateInitialWorkspaceKeyParams implements SyncUseCaseInterface<GeneratedInitialKeyResult> {
  constructor(
    private readonly crypto: Crypto,
    private readonly buildKeyShareSignatureMessage: BuildKeyShareSignatureMessage
  ) {}

  /**
   * Generates initial workspace key params for workspace creation.
   *
   * This creates:
   * - A client-generated workspace UUID
   * - A new workspace key (generation 1)
   * - A self-encrypted share of that key
   *
   * The workspace UUID is cryptographically bound in the key share signature,
   * preventing substitution attacks where a malicious server might try to
   * reuse a key share for a different workspace.
   */
  public execute(identityKeys: IdentityKeys): Result<GeneratedInitialKeyResult> {
    // Generate client-side workspace UUID - this will be sent in the create request
    const workspaceId = this.crypto.generateUUID()
    const workspaceKeyId = this.crypto.generateUUID()
    const shareId = this.crypto.generateUUID()

    // Generate random workspace key (32 bytes for XChaCha20-Poly1305)
    const symmetricKey = this.crypto.generateRandomKey(WORKSPACE_KEY_BYTES)

    // Generate nonce for crypto_box encryption
    const nonce = this.crypto.generateRandomKey(CRYPTO_BOX_NONCE_BYTES)

    // Encrypt the workspace key using crypto_box (X25519 + XSalsa20-Poly1305)
    // This is a self-share: encrypted to our own public key
    let ciphertext: Base64String
    try {
      ciphertext = this.crypto.sodiumCryptoBoxEasyEncrypt(
        symmetricKey,
        nonce,
        identityKeys.boxKeyPair.publicKey,
        identityKeys.boxKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to encrypt initial workspace key: ${message}`)
    }

    // Build signature message binding the share to workspace, key, and recipient
    const signatureMessage = this.buildKeyShareSignatureMessage.execute(
      workspaceId,
      nonce,
      ciphertext,
      workspaceKeyId,
      identityKeys.userId
    )
    if (signatureMessage.isFailed()) {
      return Result.fail(signatureMessage.getError())
    }

    // Sign the key share to prove authenticity
    let shareSignature: Base64String
    try {
      shareSignature = this.crypto.sodiumCryptoSign(
        signatureMessage.getValue(),
        identityKeys.signKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to sign initial workspace key share: ${message}`)
    }

    const params: InitialWorkspaceKeyParams = {
      id: workspaceKeyId,
      share: {
        id: shareId,
        sender_box_public_key: identityKeys.boxKeyPair.publicKey,
        sender_sign_public_key: identityKeys.signKeyPair.publicKey,
        nonce,
        ciphertext,
        share_signature: shareSignature,
      },
    }

    const decryptedKey: DecryptedWorkspaceKey = {
      id: workspaceKeyId,
      workspaceId,
      generation: 1, // Initial key is always generation 1
      key: symmetricKey,
    }

    return Result.ok({
      workspaceId,
      params,
      decryptedKey,
    })
  }
}
