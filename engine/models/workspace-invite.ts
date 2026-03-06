import type { WorkspaceMemberRole } from "./workspace-member"

export interface WorkspaceInviteServerDto {
  token: string
  workspace_id: string
  created_by: string
  role: WorkspaceMemberRole
  expires_at?: string
  created_at: string
}

export class WorkspaceInvite {
  readonly token: string
  readonly workspaceId: string
  readonly createdBy: string
  readonly role: WorkspaceMemberRole
  readonly expiresAt?: Date
  readonly createdAt: Date

  private constructor(params: {
    token: string
    workspaceId: string
    createdBy: string
    role: WorkspaceMemberRole
    expiresAt?: Date
    createdAt: Date
  }) {
    this.token = params.token
    this.workspaceId = params.workspaceId
    this.createdBy = params.createdBy
    this.role = params.role
    this.expiresAt = params.expiresAt
    this.createdAt = params.createdAt
  }

  static fromServerDto(dto: WorkspaceInviteServerDto): WorkspaceInvite {
    return new WorkspaceInvite({
      token: dto.token,
      workspaceId: dto.workspace_id,
      createdBy: dto.created_by,
      role: dto.role,
      expiresAt: dto.expires_at ? new Date(dto.expires_at) : undefined,
      createdAt: new Date(dto.created_at),
    })
  }
}
