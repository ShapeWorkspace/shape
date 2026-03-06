import { HexString, Base64String } from "../crypto/types"

/**
 * Structure of the plaintext invite bundle (encrypted with invite_secret).
 * Contains all workspace keys so the invitee can decrypt workspace content.
 */

export interface InviteBundlePlaintext {
  v: number // Protocol version
  workspaceId: string // Workspace UUID
  inviteId: string // Invite UUID (for binding)
  createdAt: string // ISO 8601 timestamp
  keys: InviteBundleKey[] // All workspace keys
}
/**
 * A single workspace key in the invite bundle.
 */

export interface InviteBundleKey {
  workspaceKeyId: string // Workspace key UUID
  generation: number // Key generation number
  workspaceKey: HexString // 32 bytes hex - the actual symmetric key
}
/**
 * Result of creating a link invite.
 */

export interface CreateLinkInviteResult {
  inviteId: string
  inviteSecret: HexString // 32 bytes hex - NEVER sent to server
  inviteUrl: string // Full URL with secret in fragment
}
/**
 * Crypto fields stored on the server for a link invite.
 */

export interface LinkInviteCryptoFields {
  wrapped_workspace_keys_v: number
  wrapped_workspace_keys_nonce: HexString
  wrapped_workspace_keys_ciphertext: Base64String
  inviter_sign_public_key: HexString
  invite_signature: Base64String
  signed_at: string // Client-provided timestamp (included in signature)
}
/**
 * Response from GET /api/link-invites/{inviteId}
 */

export interface LinkInviteResponse {
  id: string
  workspace_id: string
  workspace_name?: string
  role: string
  inviter_user_id: string
  inviter_user_name?: string
  crypto_fields: LinkInviteCryptoFields
  expires_at: string
  created_at: string
}
/**
 * Parameters for building the invite signature string.
 */
export interface InviteSignatureParams {
  workspaceId: string
  inviteId: string
  nonce: HexString
  ciphertext: Base64String
  inviterSignPublicKey: HexString
  createdAt: string
}
/**
 * Request body for creating a link invite.
 */
export interface CreateLinkInviteRequest {
  crypto_fields: {
    id: string
    wrapped_workspace_keys_v: number
    wrapped_workspace_keys_nonce: HexString
    wrapped_workspace_keys_ciphertext: Base64String
    inviter_sign_public_key: HexString
    invite_signature: Base64String
    created_at: string // Client-provided timestamp (included in signature)
  }
}
