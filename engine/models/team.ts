/**
 * Team model for workspace teams.
 *
 * Teams allow granting permissions to groups of users.
 * The "everyone" team type is auto-created per workspace and includes all members.
 */

import { ACLUser, ACLUserDto } from "./acl-entry"

/**
 * Team type distinguishes system-managed teams from user-created ones.
 */
export type TeamType = "everyone" | "custom"

/**
 * Team as returned from the server.
 */
export interface TeamServerDto {
  id: string
  name: string
  team_type: TeamType
  member_count: number
}

/**
 * Team client interface.
 */
export interface Team {
  id: string
  name: string
  teamType: TeamType
  memberCount: number
}

/**
 * Converts a team server DTO to a client-side Team.
 */
export function teamFromServerDto(dto: TeamServerDto): Team {
  return {
    id: dto.id,
    name: dto.name,
    teamType: dto.team_type,
    memberCount: dto.member_count,
  }
}

/**
 * Response from GET /api/workspaces/{workspaceId}/teams
 */
export interface GetTeamsResponse {
  teams: TeamServerDto[]
}

/**
 * Workspace member as returned in available subjects response.
 */
export interface AvailableSubjectMemberDto {
  user_id: string
  user: ACLUserDto
}

/**
 * Workspace member representation for ACL subject selection.
 */
export interface AvailableSubjectMember {
  userId: string
  user: ACLUser
}

/**
 * Converts an available subject member DTO to client format.
 */
export function availableSubjectMemberFromServerDto(dto: AvailableSubjectMemberDto): AvailableSubjectMember {
  return {
    userId: dto.user_id,
    user: {
      id: dto.user.id,
      email: dto.user.email,
    },
  }
}

/**
 * Response from GET /api/workspaces/{workspaceId}/projects/{projectId}/acl/available-subjects
 */
export interface AvailableSubjectsResponse {
  teams: TeamServerDto[]
  members: AvailableSubjectMemberDto[]
}

/**
 * Client-side available subjects representation.
 */
export interface AvailableSubjects {
  teams: Team[]
  members: AvailableSubjectMember[]
}

/**
 * Converts available subjects server response to client format.
 */
export function availableSubjectsFromServerDto(dto: AvailableSubjectsResponse): AvailableSubjects {
  return {
    teams: dto.teams.map(teamFromServerDto),
    members: dto.members.map(availableSubjectMemberFromServerDto),
  }
}
