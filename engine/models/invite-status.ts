import type { WorkspaceMemberRole } from "./workspace-member"

export type InviteStatusType = "workspace" | "email"

export interface InviteStatusResponse {
  workspace_id: string
  workspace_name?: string
  role: WorkspaceMemberRole
  type: InviteStatusType
  email?: string
  expires_at?: string
}
