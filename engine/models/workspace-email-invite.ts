import { WorkspaceMemberRole } from "./workspace-member"

export interface WorkspaceEmailInviteServerDto {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceMemberRole
  expires_at: string
  created_at?: string
  created_by?: string
}

export class WorkspaceEmailInvite {
  readonly id: string
  readonly workspaceId: string
  readonly email: string
  readonly role: WorkspaceMemberRole
  readonly expiresAt: Date
  readonly createdAt: Date
  readonly createdBy: string

  private constructor(params: {
    id: string
    workspaceId: string
    email: string
    role: WorkspaceMemberRole
    expiresAt: Date
    createdAt: Date
    createdBy: string
  }) {
    this.id = params.id
    this.workspaceId = params.workspaceId
    this.email = params.email
    this.role = params.role
    this.expiresAt = params.expiresAt
    this.createdAt = params.createdAt
    this.createdBy = params.createdBy
  }

  static fromServerDto(dto: WorkspaceEmailInviteServerDto): WorkspaceEmailInvite {
    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : new Date()
    const createdAt = dto.created_at ? new Date(dto.created_at) : new Date()
    return new WorkspaceEmailInvite({
      id: dto.id,
      workspaceId: dto.workspace_id,
      email: dto.email,
      role: dto.role,
      expiresAt,
      createdAt,
      createdBy: dto.created_by ?? "",
    })
  }
}
