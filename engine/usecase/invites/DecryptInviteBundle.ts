import { Crypto } from "../../crypto/crypto"
import { Base64String, HexString } from "../../crypto/types"
import { InviteBundlePlaintext } from "../../models/invite-types"
import { INVITE_BUNDLE_VERSION_FALLBACK } from "../../models/workspace"
import { AccountStoreContainer } from "../../store/account-store-container"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { BuildInviteBundleAssociatedData } from "./BuildInviteBundleAssociatedData"
import { BuildInviteSignatureString } from "./BuildInviteSignatureString"
import { GetInvite } from "./GetInvite"
import { ParseInviteBundlePlaintext } from "./ParseInviteBundlePlaintext"

// Parameters for building the invite signature string
interface InviteSignatureParams {
  workspaceId: string
  inviteId: string
  nonce: HexString
  ciphertext: Base64String
  inviterSignPublicKey: HexString
  createdAt: string
}

/**
 * Decrypts an invite bundle using the invite secret.
 *
 * Per BOOK OF ENCRYPTION:
 * 1. Fetch invite crypto_fields from server
 * 2. Verify the signature using inviter's public key from URL
 * 3. Decrypt the bundle using invite_secret
 * 4. Return the decrypted bundle with all workspace keys
 */
export class DecryptInviteBundle implements UseCaseInterface<InviteBundlePlaintext> {
  constructor(
    private readonly crypto: Crypto,
    private readonly getInvite: GetInvite,
    private readonly buildInviteSignatureString: BuildInviteSignatureString,
    private readonly buildInviteBundleAssociatedData: BuildInviteBundleAssociatedData,
    private readonly parseInviteBundlePlaintext: ParseInviteBundlePlaintext,
    private readonly accountStoreContainer: AccountStoreContainer,
    private readonly logger: Logger
  ) {}

  async execute(params: {
    accountUserId: string
    inviteId: string
    inviteSecret: HexString
    inviterSignPublicKey: HexString
  }): Promise<Result<InviteBundlePlaintext>> {
    const { accountUserId, inviteId, inviteSecret, inviterSignPublicKey } = params

    const accountStore = this.accountStoreContainer.getSureAccountStore(accountUserId)
    // Fetch invite from server
    const inviteResult = await this.getInvite.execute({ inviteId, accountStore })
    if (inviteResult.isFailed()) {
      return Result.fail(inviteResult.getError())
    }
    const invite = inviteResult.getValue()

    // Verify inviter's public key matches what's in the URL
    if (invite.crypto_fields.inviter_sign_public_key !== inviterSignPublicKey) {
      this.logger.error("Inviter public key mismatch - possible tampering")
      return Result.fail("Inviter public key mismatch - invite may have been tampered with")
    }

    // Build signature string and verify
    const signatureParams: InviteSignatureParams = {
      workspaceId: invite.workspace_id,
      inviteId: invite.id,
      nonce: invite.crypto_fields.wrapped_workspace_keys_nonce,
      ciphertext: invite.crypto_fields.wrapped_workspace_keys_ciphertext,
      inviterSignPublicKey: invite.crypto_fields.inviter_sign_public_key,
      createdAt: invite.crypto_fields.signed_at,
    }
    const signatureString = this.buildInviteSignatureString.execute(signatureParams)
    if (signatureString.isFailed()) {
      return Result.fail(signatureString.getError())
    }

    const isValidSignature = this.crypto.sodiumCryptoSignVerify(
      signatureString.getValue(),
      invite.crypto_fields.invite_signature,
      invite.crypto_fields.inviter_sign_public_key
    )

    if (!isValidSignature) {
      this.logger.error("Invalid invite signature")
      return Result.fail("Invalid invite signature - invite may have been tampered with")
    }

    const expectedVersionResult = this.resolveInviteBundleVersion(
      invite.crypto_fields.wrapped_workspace_keys_v
    )
    if (expectedVersionResult.isFailed()) {
      return Result.fail(expectedVersionResult.getError())
    }
    const expectedVersion = expectedVersionResult.getValue()

    // Decrypt the bundle
    const associatedData = this.buildInviteBundleAssociatedData.execute(invite.workspace_id, invite.id)
    if (associatedData.isFailed()) {
      return Result.fail(associatedData.getError())
    }

    const decryptedJson = this.crypto.xchacha20Decrypt(
      invite.crypto_fields.wrapped_workspace_keys_ciphertext,
      invite.crypto_fields.wrapped_workspace_keys_nonce,
      inviteSecret,
      associatedData.getValue()
    )

    if (decryptedJson === null) {
      this.logger.error("Failed to decrypt invite bundle - wrong secret or corrupted data")
      return Result.fail("Failed to decrypt invite - the invite link may be invalid or corrupted")
    }

    const bundleResult = this.parseInviteBundlePlaintext.execute(
      decryptedJson,
      invite.workspace_id,
      invite.id,
      expectedVersion
    )
    if (bundleResult.isFailed()) {
      return Result.fail(bundleResult.getError())
    }

    return Result.ok(bundleResult.getValue())
  }

  /**
   * Resolve the expected invite bundle version from server metadata.
   * Falls back to v1 for legacy invites that omit the version field.
   */
  private resolveInviteBundleVersion(wrappedVersion: number | null | undefined): Result<number> {
    if (wrappedVersion === undefined || wrappedVersion === null) {
      return Result.ok(INVITE_BUNDLE_VERSION_FALLBACK)
    }

    if (!Number.isInteger(wrappedVersion) || wrappedVersion < 1) {
      return Result.fail("Invite bundle version is invalid")
    }

    return Result.ok(wrappedVersion)
  }
}
