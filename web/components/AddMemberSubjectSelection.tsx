import { useCallback, useMemo } from "react"
import { Users, User } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { Sidecar, SidecarSection, SidecarRow, SidecarMenu, SidecarEmpty } from "./SidecarUI"
import { useAvailableSubjectsForProject, useCreateProjectACLEntry } from "../store/queries/use-project-acl"
import {
  useAvailableSubjectsForGroupChat,
  useCreateGroupChatACLEntry,
} from "../store/queries/use-group-chat-acl"
import { useAvailableSubjectsForFolder, useCreateFolderACLEntry } from "../store/queries/use-folder-acl"
import { useAvailableSubjectsForFile, useCreateFileACLEntry } from "../store/queries/use-file-acl"
import { useAvailableSubjectsForPaper, useCreatePaperACLEntry } from "../store/queries/use-paper-acl"
import {
  useAvailableSubjectsForForumChannel,
  useCreateForumChannelACLEntry,
} from "../store/queries/use-forum-channel-acl"
import { useWorkspaceMembersSync } from "../store/queries/use-workspace-members"
import type { ACLSubjectType } from "../../engine/models/acl-entry"
import type { Team } from "../../engine/models/team"
import type { AvailableSubjectMember } from "../../engine/models/team"
import type { ACLResourceType } from "./ManageMembersSidecarMenu"

/**
 * Props for AddMemberSubjectSelection component.
 */
interface AddMemberSubjectSelectionProps {
  // Type of resource to add members to (project or group_chat)
  resourceType: ACLResourceType
  // Resource ID to add members to
  resourceId: string
}

/**
 * AddMemberSubjectSelection displays teams and members that can be added to a resource.
 * Teams are shown first (with Everyone team at the top), followed by individual members.
 * Selecting a subject immediately adds them as an Editor - users can change the role
 * later from the member list if needed (reduces steps to add someone).
 *
 * Supports both projects and group chats via the resourceType prop.
 */
export function AddMemberSubjectSelection({ resourceType, resourceId }: AddMemberSubjectSelectionProps) {
  const workspaceMembers = useWorkspaceMembersSync()
  const memberDisplayNameById = useMemo(() => {
    const map = new Map<string, string>()
    workspaceMembers.forEach(member => {
      map.set(member.userId, member.displayName ?? "Unknown")
    })
    return map
  }, [workspaceMembers])
  const { popSidecar } = useSidecar()

  // Use the appropriate hooks based on resource type
  const projectSubjects = useAvailableSubjectsForProject(resourceType === "project" ? resourceId : "")
  const groupChatSubjects = useAvailableSubjectsForGroupChat(resourceType === "group_chat" ? resourceId : "")
  const folderSubjects = useAvailableSubjectsForFolder(resourceType === "folder" ? resourceId : "")
  const fileSubjects = useAvailableSubjectsForFile(resourceType === "file" ? resourceId : "")
  const paperSubjects = useAvailableSubjectsForPaper(resourceType === "paper" ? resourceId : "")
  const forumChannelSubjects = useAvailableSubjectsForForumChannel(
    resourceType === "forum_channel" ? resourceId : ""
  )

  const { mutate: createProjectACLEntry } = useCreateProjectACLEntry()
  const { mutate: createGroupChatACLEntry } = useCreateGroupChatACLEntry()
  const { mutate: createFolderACLEntry } = useCreateFolderACLEntry()
  const { mutate: createFileACLEntry } = useCreateFileACLEntry()
  const { mutate: createPaperACLEntry } = useCreatePaperACLEntry()
  const { mutate: createForumChannelACLEntry } = useCreateForumChannelACLEntry()

  // Select the appropriate data based on resource type
  const getSubjectsData = () => {
    switch (resourceType) {
      case "project":
        return { subjects: projectSubjects.data, loading: projectSubjects.isLoading }
      case "group_chat":
        return { subjects: groupChatSubjects.data, loading: groupChatSubjects.isLoading }
      case "folder":
        return { subjects: folderSubjects.data, loading: folderSubjects.isLoading }
      case "file":
        return { subjects: fileSubjects.data, loading: fileSubjects.isLoading }
      case "paper":
        return { subjects: paperSubjects.data, loading: paperSubjects.isLoading }
      case "forum_channel":
        return { subjects: forumChannelSubjects.data, loading: forumChannelSubjects.isLoading }
    }
  }
  const { subjects: availableSubjects, loading: isLoading } = getSubjectsData()

  // Sort teams with Everyone first, then alphabetically
  const sortedTeams = useMemo(() => {
    if (!availableSubjects?.teams) return []
    return [...availableSubjects.teams].sort((a, b) => {
      // Everyone team comes first
      if (a.teamType === "everyone") return -1
      if (b.teamType === "everyone") return 1
      // Then sort alphabetically
      return a.name.localeCompare(b.name)
    })
  }, [availableSubjects?.teams])

  // Sort members alphabetically by name
  const sortedMembers = useMemo(() => {
    if (!availableSubjects?.members) return []
    return [...availableSubjects.members].sort((a, b) => {
      const nameA = memberDisplayNameById.get(a.userId) ?? a.user.email
      const nameB = memberDisplayNameById.get(b.userId) ?? b.user.email
      return nameA.localeCompare(nameB)
    })
  }, [availableSubjects?.members, memberDisplayNameById])

  // Total selectable items: teams + members
  const totalItems = sortedTeams.length + sortedMembers.length

  /**
   * Creates an ACL entry with "write" (Editor) permission by default.
   * Users can change the role later from the member list if needed.
   */
  const handleCreateEntry = useCallback(
    (subjectType: ACLSubjectType, subjectId: string) => {
      const permission = "write" // Default to Editor role for faster workflow
      switch (resourceType) {
        case "project":
          createProjectACLEntry({ projectId: resourceId, subjectType, subjectId, permission })
          break
        case "group_chat":
          createGroupChatACLEntry({ groupChatId: resourceId, subjectType, subjectId, permission })
          break
        case "folder":
          createFolderACLEntry({ folderId: resourceId, subjectType, subjectId, permission })
          break
        case "file":
          createFileACLEntry({ fileId: resourceId, subjectType, subjectId, permission })
          break
        case "paper":
          createPaperACLEntry({ paperId: resourceId, subjectType, subjectId, permission })
          break
        case "forum_channel":
          createForumChannelACLEntry({ channelId: resourceId, subjectType, subjectId, permission })
          break
      }
      // Pop to get back to ManageMembersSidecarMenu
      popSidecar()
    },
    [
      resourceType,
      resourceId,
      createProjectACLEntry,
      createGroupChatACLEntry,
      createFolderACLEntry,
      createFileACLEntry,
      createPaperACLEntry,
      createForumChannelACLEntry,
      popSidecar,
    ]
  )

  // Handle selecting a team - immediately add as Editor
  const handleSelectTeam = useCallback(
    (team: Team) => {
      handleCreateEntry("team", team.id)
    },
    [handleCreateEntry]
  )

  // Handle selecting a member - immediately add as Editor
  const handleSelectMember = useCallback(
    (member: AvailableSubjectMember) => {
      handleCreateEntry("user", member.userId)
    },
    [handleCreateEntry]
  )

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (index < sortedTeams.length) {
        const team = sortedTeams[index]
        if (team) {
          handleSelectTeam(team)
        }
      } else {
        const memberIndex = index - sortedTeams.length
        const member = sortedMembers[memberIndex]
        if (member) {
          handleSelectMember(member)
        }
      }
    },
    [sortedTeams, sortedMembers, handleSelectTeam, handleSelectMember]
  )

  if (isLoading) {
    return <SidecarEmpty message="Loading..." />
  }

  if (totalItems === 0) {
    return (
      <Sidecar>
        <SidecarEmpty message="Everyone already has access" />
      </Sidecar>
    )
  }

  return (
    <Sidecar itemCount={totalItems} onSelect={handleSelect}>
      {/* Teams section */}
      {sortedTeams.length > 0 && (
        <SidecarSection title="Teams">
          <SidecarMenu>
            {sortedTeams.map((team, index) => (
              <SidecarRow
                key={team.id}
                index={index}
                icon={<Users size={14} />}
                title={team.name}
                meta={`${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
                onClick={() => handleSelectTeam(team)}
                testId={`add-subject-team-${team.id}`}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* Members section */}
      {sortedMembers.length > 0 && (
        <SidecarSection title="Members">
          <SidecarMenu>
            {sortedMembers.map((member, index) => (
              <SidecarRow
                key={member.userId}
                index={sortedTeams.length + index}
                icon={<User size={14} />}
                title={memberDisplayNameById.get(member.userId) ?? member.user.email}
                meta={memberDisplayNameById.get(member.userId) ? member.user.email : undefined}
                onClick={() => handleSelectMember(member)}
                testId={`add-subject-member-${member.userId}`}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      )}
    </Sidecar>
  )
}
