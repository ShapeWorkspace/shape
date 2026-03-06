import type { WorkspaceEmailInviteServerDto } from "../../models/workspace-email-invite"
import type { WorkspaceMemberRole, WorkspaceMemberServer } from "../../models/workspace-member"

/**
 * Server response for adding a workspace member.
 * The server either creates a member immediately or records a pending invite.
 */
export type AddWorkspaceMemberServerResponse =
  | { status: "member_created"; member: WorkspaceMemberServer }
  | { status: "invite_pending"; invite: WorkspaceEmailInviteServerDto }

/**
 * Request payload for inviting a workspace member by email.
 */
export interface AddMemberToWorkspaceRequest {
  email: string
  role: WorkspaceMemberRole
}

/**
 * Request payload for updating a workspace member's role.
 */
export interface UpdateWorkspaceMemberRoleRequest {
  role: WorkspaceMemberRole
}
