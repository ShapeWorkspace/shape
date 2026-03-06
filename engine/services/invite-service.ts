import { Crypto } from "../crypto/crypto"
import { HexString, Base64String } from "../crypto/types"
import { ExecuteAuthenticatedRequest } from "../usecase/network/ExecuteAuthenticatedRequest"
import { Result } from "../utils/Result"
import { logger } from "../utils/logger"
import { buildApiWorkspacePath } from "../utils/workspace-routes"
import {
  CreateLinkInviteResult,
  InviteBundlePlaintext,
  InviteSignatureParams,
  CreateLinkInviteRequest,
  LinkInviteResponse,
} from "../models/invite-types"
import { AccountStore } from "../store/account-store"
import { INVITE_BUNDLE_VERSION, INVITE_SECRET_BYTES, XCHACHA20_NONCE_BYTES } from "../crypto/constants"
import { WorkspaceInfoStore } from "../store/workspace-info-store"
import { KeyStore } from "../store/key-store"

export class InviteService {
  constructor(
    private readonly crypto: Crypto,
    private readonly networkService: ExecuteAuthenticatedRequest,
    private readonly accountStore: AccountStore,
    private readonly appBaseUrl: string,
    private readonly workspaceInfoStore: WorkspaceInfoStore,
    private readonly keyStore: KeyStore
  ) {}

  async createLinkInvite(): Promise<Result<CreateLinkInviteResult>> {
    const workspaceId = this.workspaceInfoStore.workspaceId
    const identityKeys = this.accountStore.getSureIdentityKeys()

    const inviteSecret = this.crypto.generateRandomKey(INVITE_SECRET_BYTES)
    const inviteId = this.crypto.generateUUID()
    const nonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)
    const createdAt = new Date().toISOString()

    const keys = this.keyStore.getAllKeys()
    const bundle: InviteBundlePlaintext = {
      v: INVITE_BUNDLE_VERSION,
      workspaceId,
      inviteId,
      createdAt,
      keys: keys.map(key => ({
        workspaceKeyId: key.id,
        generation: key.generation,
        workspaceKey: key.key,
      })),
    }

    const associatedData = this.buildInviteBundleAssociatedData(workspaceId, inviteId)

    let ciphertext: Base64String
    try {
      ciphertext = this.crypto.xchacha20Encrypt(JSON.stringify(bundle), nonce, inviteSecret, associatedData)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to encrypt invite bundle: ${message}`)
    }

    const signatureParams: InviteSignatureParams = {
      workspaceId,
      inviteId,
      nonce,
      ciphertext,
      inviterSignPublicKey: identityKeys.signKeyPair.publicKey,
      createdAt,
    }
    const signatureString = this.buildInviteSignatureString(signatureParams)

    let signature: Base64String
    try {
      signature = this.crypto.sodiumCryptoSign(signatureString, identityKeys.signKeyPair.privateKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to sign invite: ${message}`)
    }

    const request: CreateLinkInviteRequest = {
      crypto_fields: {
        id: inviteId,
        wrapped_workspace_keys_v: INVITE_BUNDLE_VERSION,
        wrapped_workspace_keys_nonce: nonce,
        wrapped_workspace_keys_ciphertext: ciphertext,
        inviter_sign_public_key: identityKeys.signKeyPair.publicKey,
        invite_signature: signature,
        created_at: createdAt,
      },
    }

    try {
      const url = buildApiWorkspacePath(workspaceId, "/link-invites")
      await this.networkService.executePost(url, JSON.stringify(request))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to create link invite: ${message}`)
    }

    const inviteUrl = `${this.appBaseUrl}/invite/${inviteId}?pub=${identityKeys.signKeyPair.publicKey}#sk=${inviteSecret}`

    return Result.ok({
      inviteId,
      inviteSecret,
      inviteUrl,
    })
  }

  async fetchInvite(inviteId: string): Promise<Result<LinkInviteResponse>> {
    try {
      const response = await this.networkService.executeGet<LinkInviteResponse>(`/link-invites/${inviteId}`)
      return Result.ok(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to get invite: ${message}`)
    }
  }

  async decryptInviteBundle(
    inviteId: string,
    inviteSecret: HexString,
    inviterSignPublicKey: HexString
  ): Promise<Result<InviteBundlePlaintext>> {
    const inviteResult = await this.fetchInvite(inviteId)
    if (inviteResult.isFailed()) {
      return Result.fail(inviteResult.getError())
    }
    const invite = inviteResult.getValue()

    if (invite.crypto_fields.inviter_sign_public_key !== inviterSignPublicKey) {
      logger.error("Inviter public key mismatch - possible tampering")
      return Result.fail("Inviter public key mismatch - invite may have been tampered with")
    }

    const signatureParams: InviteSignatureParams = {
      workspaceId: invite.workspace_id,
      inviteId: invite.id,
      nonce: invite.crypto_fields.wrapped_workspace_keys_nonce,
      ciphertext: invite.crypto_fields.wrapped_workspace_keys_ciphertext,
      inviterSignPublicKey: invite.crypto_fields.inviter_sign_public_key,
      createdAt: invite.crypto_fields.signed_at,
    }
    const signatureString = this.buildInviteSignatureString(signatureParams)

    const isValidSignature = this.crypto.sodiumCryptoSignVerify(
      signatureString,
      invite.crypto_fields.invite_signature,
      invite.crypto_fields.inviter_sign_public_key
    )

    if (!isValidSignature) {
      logger.error("Invalid invite signature")
      return Result.fail("Invalid invite signature - invite may have been tampered with")
    }

    const associatedData = this.buildInviteBundleAssociatedData(invite.workspace_id, invite.id)

    const decryptedJson = this.crypto.xchacha20Decrypt(
      invite.crypto_fields.wrapped_workspace_keys_ciphertext,
      invite.crypto_fields.wrapped_workspace_keys_nonce,
      inviteSecret,
      associatedData
    )

    if (decryptedJson === null) {
      logger.error("Failed to decrypt invite bundle - wrong secret or corrupted data")
      return Result.fail("Failed to decrypt invite - the invite link may be invalid or corrupted")
    }

    const bundle: InviteBundlePlaintext = JSON.parse(decryptedJson)

    if (bundle.workspaceId !== invite.workspace_id || bundle.inviteId !== invite.id) {
      logger.error("Bundle contents don't match invite metadata")
      return Result.fail("Invite data mismatch - invite may have been tampered with")
    }

    return Result.ok(bundle)
  }

  private buildInviteBundleAssociatedData(workspaceId: string, inviteId: string): string {
    return `shape:v1:workspace:${workspaceId}:invite:${inviteId}`
  }

  buildInviteSignatureString(params: InviteSignatureParams): string {
    return [
      "SHAPE-INVITE-V1",
      `workspace_id=${params.workspaceId}`,
      `invite_id=${params.inviteId}`,
      `nonce=${params.nonce}`,
      `ciphertext=${params.ciphertext}`,
      `inviter_sign_public_key=${params.inviterSignPublicKey}`,
      `created_at=${params.createdAt}`,
    ].join("\n")
  }
}
