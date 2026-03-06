import { useCallback, useMemo } from "react"
import { Users, User, Plus, Crown } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
  SidecarEmpty,
} from "./SidecarUI"
import { RoleSelectionSidecar } from "./RoleSelectionSidecar"
import { AddMemberSubjectSelection } from "./AddMemberSubjectSelection"
import {
  useProjectACLEntries,
  useUpdateProjectACLEntry,
  useDeleteProjectACLEntry,
} from "../store/queries/use-project-acl"
import {
  useGroupChatACLEntries,
  useUpdateGroupChatACLEntry,
  useDeleteGroupChatACLEntry,
} from "../store/queries/use-group-chat-acl"
import {
  useFolderACLEntries,
  useUpdateFolderACLEntry,
  useDeleteFolderACLEntry,
} from "../store/queries/use-folder-acl"
import {
  useFileACLEntries,
  useUpdateFileACLEntry,
  useDeleteFileACLEntry,
} from "../store/queries/use-file-acl"
import {
  usePaperACLEntries,
  useUpdatePaperACLEntry,
  useDeletePaperACLEntry,
} from "../store/queries/use-paper-acl"
import {
  useForumChannelACLEntries,
  useUpdateForumChannelACLEntry,
  useDeleteForumChannelACLEntry,
} from "../store/queries/use-forum-channel-acl"
import { useWorkspaceMembersSync } from "../store/queries/use-workspace-members"
import {
  type ACLEntry,
  type ACLPermission,
  getACLEntryDisplayName,
  getACLEntryRoleLabel,
} from "../../engine/models/acl-entry"

/**
 * Supported resource types for ACL management.
 */
export type ACLResourceType = "project" | "group_chat" | "folder" | "file" | "paper" | "forum_channel"

/**
 * Props for ManageMembersSidecarMenu component.
 */
interface ManageMembersSidecarMenuProps {
  // Type of resource to manage (project or group_chat)
  resourceType: ACLResourceType
  // Resource ID to manage members for
  resourceId: string
  // User ID of the resource creator (for display purposes)
  creatorId?: string
  // Creator's display name
  creatorName?: string
}

/**
 * ManageMembersSidecarMenu displays the list of users and teams with access to a resource.
 * Shows the creator at the top (implicit access, cannot be removed), followed by
 * ACL entries (teams first, then users), and an "Add members" row.
 *
 * Clicking an existing entry opens RoleSelectionSidecar to change/remove access.
 * Clicking "Add members" opens AddMemberSubjectSelection.
 *
 * Supports both projects and group chats via the resourceType prop.
 */
export function ManageMembersSidecarMenu({
  resourceType,
  resourceId,
  creatorId,
  creatorName,
}: ManageMembersSidecarMenuProps) {
  const { pushSidecar } = useSidecar()

  // Use the appropriate hooks based on resource type
  const projectACLEntries = useProjectACLEntries(resourceType === "project" ? resourceId : "")
  const groupChatACLEntries = useGroupChatACLEntries(resourceType === "group_chat" ? resourceId : "")
  const folderACLEntries = useFolderACLEntries(resourceType === "folder" ? resourceId : "")
  const fileACLEntries = useFileACLEntries(resourceType === "file" ? resourceId : "")
  const paperACLEntries = usePaperACLEntries(resourceType === "paper" ? resourceId : "")
  const forumChannelACLEntries = useForumChannelACLEntries(resourceType === "forum_channel" ? resourceId : "")

  const { mutate: updateProjectACLEntry } = useUpdateProjectACLEntry()
  const { mutate: deleteProjectACLEntry } = useDeleteProjectACLEntry()
  const { mutate: updateGroupChatACLEntry } = useUpdateGroupChatACLEntry()
  const { mutate: deleteGroupChatACLEntry } = useDeleteGroupChatACLEntry()
  const { mutate: updateFolderACLEntry } = useUpdateFolderACLEntry()
  const { mutate: deleteFolderACLEntry } = useDeleteFolderACLEntry()
  const { mutate: updateFileACLEntry } = useUpdateFileACLEntry()
  const { mutate: deleteFileACLEntry } = useDeleteFileACLEntry()
  const { mutate: updatePaperACLEntry } = useUpdatePaperACLEntry()
  const { mutate: deletePaperACLEntry } = useDeletePaperACLEntry()
  const { mutate: updateForumChannelACLEntry } = useUpdateForumChannelACLEntry()
  const { mutate: deleteForumChannelACLEntry } = useDeleteForumChannelACLEntry()
  const workspaceMembers = useWorkspaceMembersSync()

  const workspaceMemberNameByUserId = useMemo(() => {
    const map = new Map<string, string>()
    workspaceMembers.forEach(member => {
      map.set(member.userId, member.displayName ?? "Unknown")
    })
    return map
  }, [workspaceMembers])

  const resolveUserEntryDisplayName = useCallback(
    (entry: ACLEntry): string => {
      if (entry.subjectType !== "user") {
        return getACLEntryDisplayName(entry)
      }
      const memberName = workspaceMemberNameByUserId.get(entry.subjectId)
      return memberName || entry.user?.email || "Unknown"
    },
    [workspaceMemberNameByUserId]
  )

  // Select the appropriate data based on resource type
  const getACLData = () => {
    switch (resourceType) {
      case "project":
        return { entries: projectACLEntries.data ?? [], loading: projectACLEntries.isLoading }
      case "group_chat":
        return { entries: groupChatACLEntries.data ?? [], loading: groupChatACLEntries.isLoading }
      case "folder":
        return { entries: folderACLEntries.data ?? [], loading: folderACLEntries.isLoading }
      case "file":
        return { entries: fileACLEntries.data ?? [], loading: fileACLEntries.isLoading }
      case "paper":
        return { entries: paperACLEntries.data ?? [], loading: paperACLEntries.isLoading }
      case "forum_channel":
        return { entries: forumChannelACLEntries.data ?? [], loading: forumChannelACLEntries.isLoading }
    }
  }
  const { entries: aclEntries, loading: isLoading } = getACLData()

  // Separate team entries and user entries, sort appropriately
  const { teamEntries, userEntries } = useMemo(() => {
    const teams = aclEntries.filter((e: ACLEntry) => e.subjectType === "team")
    const users = aclEntries.filter((e: ACLEntry) => e.subjectType === "user")

    // Sort teams: Everyone first, then alphabetically
    teams.sort((a: ACLEntry, b: ACLEntry) => {
      if (a.team?.teamType === "everyone") return -1
      if (b.team?.teamType === "everyone") return 1
      return (a.team?.name ?? "").localeCompare(b.team?.name ?? "")
    })

    // Sort users alphabetically by display name
    users.sort((a: ACLEntry, b: ACLEntry) => {
      return resolveUserEntryDisplayName(a).localeCompare(resolveUserEntryDisplayName(b))
    })

    return { teamEntries: teams, userEntries: users }
  }, [aclEntries, resolveUserEntryDisplayName])

  // Total selectable items: team entries + user entries + 1 (add members)
  // Creator row is not selectable (just display)
  const totalItems = teamEntries.length + userEntries.length + 1

  // Handle updating an ACL entry's permission
  const handleUpdatePermission = useCallback(
    (entry: ACLEntry, permission: ACLPermission) => {
      switch (resourceType) {
        case "project":
          updateProjectACLEntry({ projectId: resourceId, entryId: entry.id, permission })
          break
        case "group_chat":
          updateGroupChatACLEntry({ groupChatId: resourceId, entryId: entry.id, permission })
          break
        case "folder":
          updateFolderACLEntry({ folderId: resourceId, entryId: entry.id, permission })
          break
        case "file":
          updateFileACLEntry({ fileId: resourceId, entryId: entry.id, permission })
          break
        case "paper":
          updatePaperACLEntry({ paperId: resourceId, entryId: entry.id, permission })
          break
        case "forum_channel":
          updateForumChannelACLEntry({ channelId: resourceId, entryId: entry.id, permission })
          break
      }
    },
    [
      resourceType,
      resourceId,
      updateProjectACLEntry,
      updateGroupChatACLEntry,
      updateFolderACLEntry,
      updateFileACLEntry,
      updatePaperACLEntry,
      updateForumChannelACLEntry,
    ]
  )

  // Handle deleting an ACL entry
  const handleDeleteEntry = useCallback(
    (entry: ACLEntry) => {
      switch (resourceType) {
        case "project":
          deleteProjectACLEntry({ projectId: resourceId, entryId: entry.id })
          break
        case "group_chat":
          deleteGroupChatACLEntry({ groupChatId: resourceId, entryId: entry.id })
          break
        case "folder":
          deleteFolderACLEntry({ folderId: resourceId, entryId: entry.id })
          break
        case "file":
          deleteFileACLEntry({ fileId: resourceId, entryId: entry.id })
          break
        case "paper":
          deletePaperACLEntry({ paperId: resourceId, entryId: entry.id })
          break
        case "forum_channel":
          deleteForumChannelACLEntry({ channelId: resourceId, entryId: entry.id })
          break
      }
    },
    [
      resourceType,
      resourceId,
      deleteProjectACLEntry,
      deleteGroupChatACLEntry,
      deleteFolderACLEntry,
      deleteFileACLEntry,
      deletePaperACLEntry,
      deleteForumChannelACLEntry,
    ]
  )

  // Handle clicking an existing entry - push role selection
  const handleClickEntry = useCallback(
    (entry: ACLEntry) => {
      pushSidecar(
        <RoleSelectionSidecar
          currentPermission={entry.permission}
          onSelectPermission={permission => handleUpdatePermission(entry, permission)}
          onRemove={() => handleDeleteEntry(entry)}
          subjectName={resolveUserEntryDisplayName(entry)}
          isExisting
        />,
        "Change Role"
      )
    },
    [pushSidecar, handleUpdatePermission, handleDeleteEntry, resolveUserEntryDisplayName]
  )

  // Handle clicking "Add members" - push subject selection
  const handleAddMembers = useCallback(() => {
    pushSidecar(
      <AddMemberSubjectSelection resourceType={resourceType} resourceId={resourceId} />,
      "Add Members"
    )
  }, [pushSidecar, resourceType, resourceId])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      const allEntries = [...teamEntries, ...userEntries]
      if (index < allEntries.length) {
        const entry = allEntries[index]
        if (entry) {
          handleClickEntry(entry)
        }
      } else {
        // Last item is "Add members"
        handleAddMembers()
      }
    },
    [teamEntries, userEntries, handleClickEntry, handleAddMembers]
  )

  // Get icon for entry based on subject type
  const getEntryIcon = (entry: ACLEntry) => {
    if (entry.subjectType === "team") {
      return <Users size={14} />
    }
    return <User size={14} />
  }

  if (isLoading) {
    return <SidecarEmpty message="Loading..." />
  }

  return (
    <Sidecar itemCount={totalItems} onSelect={handleSelect}>
      {/* Creator section - always shown, not editable */}
      {creatorId && (
        <SidecarSection title="Owner">
          <SidecarMetaList>
            <SidecarMetaItem
              icon={<Crown size={12} />}
              label={creatorName || "Creator"}
              value="Full access"
            />
          </SidecarMetaList>
        </SidecarSection>
      )}

      {/* Team entries */}
      {teamEntries.length > 0 && (
        <SidecarSection title="Teams">
          <SidecarMenu>
            {teamEntries.map((entry: ACLEntry, index: number) => (
              <SidecarRow
                key={entry.id}
                index={index}
                icon={getEntryIcon(entry)}
                title={resolveUserEntryDisplayName(entry)}
                meta={getACLEntryRoleLabel(entry)}
                onClick={() => handleClickEntry(entry)}
                testId={`acl-entry-${entry.id}`}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* User entries */}
      {userEntries.length > 0 && (
        <SidecarSection title="Members">
          <SidecarMenu>
            {userEntries.map((entry: ACLEntry, index: number) => (
              <SidecarRow
                key={entry.id}
                index={teamEntries.length + index}
                icon={getEntryIcon(entry)}
                title={resolveUserEntryDisplayName(entry)}
                meta={getACLEntryRoleLabel(entry)}
                onClick={() => handleClickEntry(entry)}
                testId={`acl-entry-${entry.id}`}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* Add members action */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={teamEntries.length + userEntries.length}
            icon={<Plus size={14} />}
            title="Add members"
            onClick={handleAddMembers}
            testId="acl-add-members"
          />
        </SidecarMenu>
      </SidecarSection>

      {/* Empty state if no entries yet */}
      {aclEntries.length === 0 && !creatorId && <SidecarEmpty message="No members have been added yet" />}
    </Sidecar>
  )
}
