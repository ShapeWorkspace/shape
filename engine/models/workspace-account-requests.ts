import type { WorkspaceServerDto } from "./workspace"
import type { WorkspaceSubscriptionServerDto } from "./workspace-subscription"
import type { HexString, Base64String } from "../crypto/types"

// Initial key share params sent to server during workspace creation.
export interface InitialWorkspaceKeyShareRequest {
  id: string
  sender_box_public_key: string
  sender_sign_public_key: string
  nonce: string
  ciphertext: string
  share_signature: string
}

// Initial key params sent to server during workspace creation.
export interface InitialWorkspaceKeyRequest {
  id: string
  share: InitialWorkspaceKeyShareRequest
}

export interface CreateWorkspaceRequest {
  // Client-generated workspace UUID, cryptographically bound in the initial key share signature.
  id: string
  name: string
  initial_key: InitialWorkspaceKeyRequest
}

export interface CreateWorkspaceResponse {
  workspace: WorkspaceServerDto
  subscription?: WorkspaceSubscriptionServerDto | null
}

// Request body for creating a self-share after invite acceptance
export interface AcceptLinkInviteShareRequest {
  id: string
  workspace_key_id: string
  sender_box_public_key: HexString
  sender_sign_public_key: HexString
  nonce: HexString
  ciphertext: Base64String
  share_signature: Base64String
}

// Request body for accepting a link invite
export interface AcceptLinkInviteRequest {
  shares: AcceptLinkInviteShareRequest[]
}
