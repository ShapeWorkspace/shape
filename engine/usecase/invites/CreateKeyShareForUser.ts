import { Crypto } from "../../crypto/crypto"
import { Base64String, HexString } from "../../crypto/types"
import { CRYPTO_BOX_NONCE_BYTES } from "../../models/workspace"
import { CreateShareRequest } from "../../models/workspace-key"
import { AccountStore } from "../../store/account-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "../network/ExecuteAuthenticatedRequest"
import { BuildKeyShareSignatureMessage } from "./BuildKeyShareSignatureMessage"

export class CreateKeyShareForUser implements UseCaseInterface<void> {
  constructor(
    private readonly crypto: Crypto,
    private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest,
    private readonly buildKeyShareSignatureMessage: BuildKeyShareSignatureMessage,
    private readonly accountStore: AccountStore,
    private readonly workspaceId: string
  ) {}
  /**
   * Creates a key share for a user.
   * Called when creating a new key or adding a user to a workspace.
   */
  async execute(
    workspaceKeyId: string,
    recipientUserId: string,
    recipientBoxPublicKey: HexString,
    symmetricKey: HexString
  ): Promise<Result<void>> {
    const shareId = this.crypto.generateUUID()
    const nonce = this.crypto.generateRandomKey(CRYPTO_BOX_NONCE_BYTES)

    // Encrypt the symmetric key using crypto_box (X25519 + XSalsa20-Poly1305)
    let ciphertext: Base64String
    try {
      ciphertext = this.crypto.sodiumCryptoBoxEasyEncrypt(
        symmetricKey,
        nonce,
        recipientBoxPublicKey,
        this.accountStore.getSureIdentityKeys().boxKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to encrypt key share: ${message}`)
    }

    // Build signature message binding the share to workspace, key, and recipient
    const signatureMessage = this.buildKeyShareSignatureMessage.execute(
      this.workspaceId,
      nonce,
      ciphertext,
      workspaceKeyId,
      recipientUserId
    )
    if (signatureMessage.isFailed()) {
      return Result.fail(signatureMessage.getError())
    }
    let shareSignature: Base64String
    try {
      shareSignature = this.crypto.sodiumCryptoSign(
        signatureMessage.getValue(),
        this.accountStore.getSureIdentityKeys().signKeyPair.privateKey
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to sign key share: ${message}`)
    }

    const request: CreateShareRequest = {
      id: shareId,
      recipient_user_id: recipientUserId,
      sender_box_public_key: this.accountStore.getSureIdentityKeys().boxKeyPair.publicKey,
      sender_sign_public_key: this.accountStore.getSureIdentityKeys().signKeyPair.publicKey,
      nonce,
      ciphertext,
      share_signature: shareSignature,
    }

    try {
      await this.executeAuthenticatedRequest.executePost(
        `/workspaces/${this.workspaceId}/keys/${workspaceKeyId}/shares`,
        JSON.stringify(request)
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to upload key share: ${message}`)
    }

    return Result.ok(undefined)
  }
}
