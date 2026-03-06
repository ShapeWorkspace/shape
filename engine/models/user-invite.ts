import type { WorkspaceMemberRole } from "./workspace-member"

// User invite response for existing user invitations.
export interface UserInviteResponse {
  id: string
  workspace_id: string
  workspace_name?: string
  invitee_user_id: string
  invitee_email?: string
  invitee_user_name?: string
  invitee_box_public_key?: string
  invitee_sign_public_key?: string
  inviter_user_id: string
  inviter_user_name?: string
  role: WorkspaceMemberRole
  created_at: string
}

export interface UserInvitesListResponse {
  invites: UserInviteResponse[]
}
