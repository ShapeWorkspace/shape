/**
 * ACL Entry model for managing resource-level access control.
 *
 * ACL entries grant permissions to users or teams on specific resources (projects, etc.).
 * Permission levels: read (viewer), write (editor), admin (full access).
 */

/**
 * Permission levels for ACL entries.
 */
export type ACLPermission = "read" | "write" | "admin"

/**
 * Subject types that can be granted access.
 */
export type ACLSubjectType = "user" | "team"

/**
 * Display labels and descriptions for ACL permission levels.
 */
export const ACL_ROLE_DISPLAY: Record<ACLPermission, { label: string; description: string }> = {
  read: { label: "Viewer", description: "Can view only" },
  write: { label: "Editor", description: "Can view and edit" },
  admin: { label: "Admin", description: "Full access" },
}

/**
 * User data as returned in ACL entry responses.
 */
export interface ACLUserDto {
  id: string
  email: string
}

/**
 * Team data as returned in ACL entry responses.
 */
export interface ACLTeamDto {
  id: string
  name: string
  team_type: "everyone" | "custom"
  member_count: number
}

/**
 * ACL entry as returned from the server.
 */
export interface ACLEntryServerDto {
  id: string
  subject_type: ACLSubjectType
  subject_id: string
  permission: ACLPermission
  user?: ACLUserDto
  team?: ACLTeamDto
  created_at: string
}

/**
 * ACL entry client interface.
 */
export interface ACLEntry {
  id: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
  user: ACLUser | null
  team: ACLTeam | null
  createdAt: Date
}

/**
 * User representation in ACL context.
 */
export interface ACLUser {
  id: string
  email: string
}

/**
 * Team representation in ACL context.
 */
export interface ACLTeam {
  id: string
  name: string
  teamType: "everyone" | "custom"
  memberCount: number
}

/**
 * Converts an ACL entry server DTO to a client-side ACLEntry.
 */
export function aclEntryFromServerDto(dto: ACLEntryServerDto): ACLEntry {
  return {
    id: dto.id,
    subjectType: dto.subject_type,
    subjectId: dto.subject_id,
    permission: dto.permission,
    user: dto.user
      ? {
          id: dto.user.id,
          email: dto.user.email,
        }
      : null,
    team: dto.team
      ? {
          id: dto.team.id,
          name: dto.team.name,
          teamType: dto.team.team_type,
          memberCount: dto.team.member_count,
        }
      : null,
    createdAt: new Date(dto.created_at),
  }
}

/**
 * Gets the display name for an ACL entry (user name or team name).
 */
export function getACLEntryDisplayName(entry: ACLEntry): string {
  if (entry.user) {
    return entry.user.email
  }
  if (entry.team) {
    return entry.team.name
  }
  return "Unknown"
}

/**
 * Gets the role label for an ACL entry's permission level.
 */
export function getACLEntryRoleLabel(entry: ACLEntry): string {
  return ACL_ROLE_DISPLAY[entry.permission]?.label ?? entry.permission
}

/**
 * Response from GET /api/workspaces/{workspaceId}/projects/{projectId}/acl
 */
export interface GetACLEntriesResponse {
  entries: ACLEntryServerDto[]
}

/**
 * Response from GET /api/workspaces/{workspaceId}/projects/{projectId}/acl/count
 */
export interface GetACLMemberCountResponse {
  count: number
}

/**
 * Request body for POST /api/workspaces/{workspaceId}/projects/{projectId}/acl
 */
export interface CreateACLEntryRequest {
  subject_type: ACLSubjectType
  subject_id: string
  permission: ACLPermission
}

/**
 * Request body for PUT /api/workspaces/{workspaceId}/projects/{projectId}/acl/{entryId}
 */
export interface UpdateACLEntryRequest {
  permission: ACLPermission
}
