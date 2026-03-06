export enum WorkspaceMemberRole {
  Admin = "admin",
  Member = "member",
  SuperAdmin = "super_admin",
}

export const isWorkspaceAdminRole = (role: WorkspaceMemberRole | undefined | null): boolean => {
  return role === WorkspaceMemberRole.Admin || role === WorkspaceMemberRole.SuperAdmin
}

export interface WorkspaceMemberServer {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  user?: {
    uuid: string
    email: string
  }
}

export interface WorkspaceMemberProfile {
  name?: string
  bio?: string
  avatar?: string
  avatarType?: string
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: WorkspaceMemberRole
  displayName?: string
  user?: {
    email?: string
  }
  profile?: WorkspaceMemberProfile
  avatarDataUrl?: string
  profileNeedsSetup?: boolean
}

function deriveFallbackDisplayNameFromEmail(email: string | undefined): string | undefined {
  if (!email) {
    return undefined
  }
  const atIndex = email.indexOf("@")
  if (atIndex <= 0) {
    return email
  }
  return email.slice(0, atIndex)
}

export function WorkspaceMemberFromServerDto(dto: WorkspaceMemberServer): WorkspaceMember {
  const email = dto.user?.email
  return {
    id: dto.id,
    workspaceId: dto.workspace_id,
    userId: dto.user_id,
    role: dto.role,
    displayName: deriveFallbackDisplayNameFromEmail(email),
    user: email ? { email } : undefined,
  }
}
