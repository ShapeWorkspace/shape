import { HexString, Base64String } from "../crypto/types"

/**
 * A workspace key share as returned from the server.
 */

export interface WorkspaceKeyShare {
  id: string
  workspace_id: string
  workspace_key_id: string
  recipient_user_id: string
  sender_user_id: string
  sender_box_public_key: HexString // 32 bytes hex
  sender_sign_public_key: HexString // 32 bytes hex
  nonce: HexString // 24 bytes hex
  ciphertext: Base64String // Encrypted workspace key
  share_signature: Base64String // Ed25519 signature
  created_at: string
}
/**
 * A workspace key with its shares.
 */

export interface WorkspaceKeyWithShares {
  id: string
  workspace_id: string
  generation: number
  created_by_user_id: string
  created_at: string
  shares: WorkspaceKeyShare[]
}
/**
 * Response from GET /api/workspaces/{workspaceId}/keys
 */
export interface GetWorkspaceKeysResponse {
  keys: WorkspaceKeyWithShares[]
}
/**
 * Response from POST /api/workspaces/{workspaceId}/keys
 */
export interface CreateWorkspaceKeyResponse {
  id: string
  workspace_id: string
  generation: number
  created_by_user_id: string
  created_at: string
}
/**
 * A decrypted workspace key in the keyring.
 */

export interface DecryptedWorkspaceKey {
  id: string // workspace_key_id
  workspaceId: string
  generation: number
  key: HexString // 32 bytes hex - the actual symmetric key
}
/**
 * Request body for creating a key share.
 */
export interface CreateShareRequest {
  id: string
  recipient_user_id: string
  sender_box_public_key: HexString
  sender_sign_public_key: HexString
  nonce: HexString
  ciphertext: Base64String
  share_signature: Base64String
}
/**
 * Initial workspace key share params for workspace creation.
 */

export interface InitialWorkspaceKeyShareParams {
  id: string
  sender_box_public_key: HexString
  sender_sign_public_key: HexString
  nonce: HexString
  ciphertext: Base64String
  share_signature: Base64String
}
/**
 * Initial workspace key params for workspace creation.
 * These are generated client-side and sent with the create workspace request.
 */

export interface InitialWorkspaceKeyParams {
  id: string
  share: InitialWorkspaceKeyShareParams
}
/**
 * Result of generating initial workspace key params.
 * Includes the workspace ID, params to send to the server, and the decrypted key to store locally.
 */

export interface GeneratedInitialKeyResult {
  workspaceId: string
  params: InitialWorkspaceKeyParams
  decryptedKey: DecryptedWorkspaceKey
}
