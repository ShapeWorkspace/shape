import { useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from "react"
import { Users, User, X } from "lucide-react"
import { useWorkspaceTeams } from "../store/queries/use-project-acl"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import type { ACLPermission, ACLSubjectType } from "../../engine/models/acl-entry"
import type { Team } from "../../engine/models/team"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import * as styles from "../styles/sidecar.css"

/**
 * Represents a member selected for access to a resource.
 * Used to track pending ACL entries before the form is submitted.
 */
export interface SelectedMember {
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
  displayName: string
  // Additional display info
  teamMemberCount?: number
  email?: string
}

interface MemberSelectionFieldProps {
  // Currently selected members with their permissions
  selectedMembers: SelectedMember[]
  // Callback when members list changes
  onMembersChange: (members: SelectedMember[]) => void
  // Whether the field is disabled (e.g., during form submission)
  disabled?: boolean
}

/**
 * Ref handle exposed by MemberSelectionField for external focus control.
 */
export interface MemberSelectionFieldRef {
  // Focus the first available item in the list
  focusFirstAvailable: () => void
}

/**
 * MemberSelectionField renders a unified member selection interface.
 *
 * Two sections displayed inline:
 * 1. "Invited" (top): Members who have been added, with role select and remove button
 * 2. "Available" (bottom): Teams and members who can still be added
 *
 * Clicking an available member/team adds them to the invited section with default "Editor" role.
 * Role select uses native <select> styled like TaskSidecar for consistency.
 *
 * Supports keyboard navigation:
 * - Arrow Down/Up to navigate between available items
 * - Enter to select the focused item
 * - Exposes focusFirstAvailable() via ref for external focus control
 */
export const MemberSelectionField = forwardRef<MemberSelectionFieldRef, MemberSelectionFieldProps>(
  function MemberSelectionField({ selectedMembers, onMembersChange, disabled = false }, ref) {
    const { data: teams = [] } = useWorkspaceTeams()
    const { data: members = [] } = useWorkspaceMembers()

    // Refs for keyboard navigation across both sections
    const invitedItemsRef = useRef<(HTMLDivElement | null)[]>([])
    const availableItemsRef = useRef<(HTMLButtonElement | null)[]>([])

    // Expose focus methods to parent components
    useImperativeHandle(ref, () => ({
      focusFirstAvailable: () => {
        // First try invited items, then available items
        if (invitedItemsRef.current[0]) {
          invitedItemsRef.current[0].focus()
        } else if (availableItemsRef.current[0]) {
          availableItemsRef.current[0].focus()
        }
      },
    }))

  // Get IDs of already-selected members for filtering
  const selectedMemberIds = useMemo(
    () => new Set(selectedMembers.map(m => m.subjectId)),
    [selectedMembers]
  )

  // Filter out already-selected teams and sort with Everyone first
  const availableTeams = useMemo(() => {
    return teams
      .filter(team => !selectedMemberIds.has(team.id))
      .sort((a, b) => {
        // Everyone team comes first
        if (a.teamType === "everyone") return -1
        if (b.teamType === "everyone") return 1
        return a.name.localeCompare(b.name)
      })
  }, [teams, selectedMemberIds])

  // Filter out already-selected users and sort alphabetically
  const availableMembers = useMemo(() => {
    return members
      .filter(member => !selectedMemberIds.has(member.userId))
      .sort((a, b) => {
        const nameA = a.displayName || a.user?.email || ""
        const nameB = b.displayName || b.user?.email || ""
        return nameA.localeCompare(nameB)
      })
  }, [members, selectedMemberIds])

  // Update a member's permission
  const handlePermissionChange = useCallback(
    (subjectId: string, permission: ACLPermission) => {
      const updated = selectedMembers.map(m =>
        m.subjectId === subjectId ? { ...m, permission } : m
      )
      onMembersChange(updated)
    },
    [selectedMembers, onMembersChange]
  )

  // Remove a member from the selection
  const handleRemoveMember = useCallback(
    (subjectId: string) => {
      const updated = selectedMembers.filter(m => m.subjectId !== subjectId)
      onMembersChange(updated)
    },
    [selectedMembers, onMembersChange]
  )

  // Add a team to the selection
  const handleAddTeam = useCallback(
    (team: Team) => {
      if (disabled) return
      const newMember: SelectedMember = {
        subjectType: "team",
        subjectId: team.id,
        permission: "write", // Default to Editor
        displayName: team.name,
        teamMemberCount: team.memberCount,
      }
      onMembersChange([...selectedMembers, newMember])
    },
    [selectedMembers, onMembersChange, disabled]
  )

  // Add a user to the selection
  const handleAddUser = useCallback(
    (member: WorkspaceMember) => {
      if (disabled) return
      const newMember: SelectedMember = {
        subjectType: "user",
        subjectId: member.userId,
        permission: "write", // Default to Editor
        displayName: member.displayName || member.user?.email || "Unknown",
        email: member.user?.email,
      }
      onMembersChange([...selectedMembers, newMember])
    },
    [selectedMembers, onMembersChange, disabled]
  )

  const hasAvailable = availableTeams.length > 0 || availableMembers.length > 0
  const totalAvailableCount = availableTeams.length + availableMembers.length
  const totalInvitedCount = selectedMembers.length

  // Track which index to focus after an item is added/removed (when the list re-renders)
  const pendingFocusRef = useRef<{ section: "invited" | "available"; index: number } | null>(null)

  // Handle keyboard navigation within the invited items list
  const handleInvitedItemKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextIndex = index + 1
        if (nextIndex < totalInvitedCount) {
          // Move to next invited item
          invitedItemsRef.current[nextIndex]?.focus()
        } else if (totalAvailableCount > 0) {
          // Move to first available item
          availableItemsRef.current[0]?.focus()
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prevIndex = index - 1
        if (prevIndex >= 0) {
          invitedItemsRef.current[prevIndex]?.focus()
        }
      } else if (e.key === "Enter" || e.key === " ") {
        // Remove this member - focus next invited item or first available
        e.preventDefault()
        const subjectId = selectedMembers[index]?.subjectId
        if (subjectId) {
          const nextFocusIndex = index >= totalInvitedCount - 1 ? Math.max(0, index - 1) : index
          const hasMoreInvited = totalInvitedCount > 1
          pendingFocusRef.current = hasMoreInvited
            ? { section: "invited", index: nextFocusIndex }
            : totalAvailableCount > 0
              ? { section: "available", index: 0 }
              : null
          handleRemoveMember(subjectId)
          setTimeout(() => {
            if (pendingFocusRef.current) {
              const { section, index: focusIndex } = pendingFocusRef.current
              if (section === "invited") {
                invitedItemsRef.current[focusIndex]?.focus()
              } else {
                availableItemsRef.current[focusIndex]?.focus()
              }
              pendingFocusRef.current = null
            }
          }, 0)
        }
      }
    },
    [totalInvitedCount, totalAvailableCount, selectedMembers, handleRemoveMember]
  )

  // Handle keyboard navigation within the available items list
  const handleAvailableItemKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextIndex = index + 1
        if (nextIndex < totalAvailableCount) {
          availableItemsRef.current[nextIndex]?.focus()
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const prevIndex = index - 1
        if (prevIndex >= 0) {
          // Move to previous available item
          availableItemsRef.current[prevIndex]?.focus()
        } else if (totalInvitedCount > 0) {
          // Move to last invited item
          invitedItemsRef.current[totalInvitedCount - 1]?.focus()
        }
      } else if (e.key === "Enter" || e.key === " ") {
        // After adding, focus moves to invited section (new item at end)
        // or stay in available if we want to keep adding
        const newInvitedIndex = totalInvitedCount // Will be the index of the newly added item
        pendingFocusRef.current = { section: "invited", index: newInvitedIndex }
        setTimeout(() => {
          if (pendingFocusRef.current) {
            const { section, index: focusIndex } = pendingFocusRef.current
            if (section === "invited") {
              invitedItemsRef.current[focusIndex]?.focus()
            } else {
              availableItemsRef.current[focusIndex]?.focus()
            }
            pendingFocusRef.current = null
          }
        }, 0)
      }
    },
    [totalAvailableCount, totalInvitedCount]
  )

  return (
    <div className={styles.memberSelectionField}>
      {/* Invited section - members who have been added */}
      <div className={styles.memberSelectionSection}>
        <span className={styles.memberSelectionLabel}>Invited</span>
        {selectedMembers.length > 0 ? (
          <div className={styles.memberSelectionList}>
            {selectedMembers.map((member, index) => (
              <div
                key={member.subjectId}
                ref={el => {
                  invitedItemsRef.current[index] = el
                }}
                tabIndex={0}
                role="button"
                className={styles.memberSelectionItem}
                onKeyDown={e => handleInvitedItemKeyDown(e, index)}
                data-testid={`invited-member-${member.subjectId}`}
              >
                {/* Icon: Users for team, User for individual */}
                <span className={styles.memberSelectionItemIcon}>
                  {member.subjectType === "team" ? <Users size={14} /> : <User size={14} />}
                </span>

                {/* Name and optional meta info */}
                <div className={styles.memberSelectionItemInfo}>
                  <span className={styles.memberSelectionItemName}>{member.displayName}</span>
                  {member.subjectType === "team" && member.teamMemberCount !== undefined && (
                    <span className={styles.memberSelectionItemMeta}>
                      {member.teamMemberCount} {member.teamMemberCount === 1 ? "member" : "members"}
                    </span>
                  )}
                  {member.subjectType === "user" && member.email && member.displayName !== member.email && (
                    <span className={styles.memberSelectionItemMeta}>{member.email}</span>
                  )}
                </div>

                {/* Role selector - native select styled like TaskSidecar */}
                <select
                  value={member.permission}
                  onChange={e => handlePermissionChange(member.subjectId, e.target.value as ACLPermission)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                  disabled={disabled}
                  tabIndex={-1}
                  data-testid={`member-role-select-${member.subjectId}`}
                  className={styles.memberSelectionRoleSelect}
                >
                  <option value="read">Viewer</option>
                  <option value="write">Editor</option>
                  <option value="admin">Admin</option>
                </select>

                {/* Remove button */}
                <button
                  type="button"
                  className={styles.memberSelectionRemoveButton}
                  onClick={() => handleRemoveMember(member.subjectId)}
                  disabled={disabled}
                  tabIndex={-1}
                  data-testid={`remove-member-${member.subjectId}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.memberSelectionEmpty}>
            No members invited yet
          </div>
        )}
      </div>

      {/* Available section - teams and members who can be added */}
      {hasAvailable && (
        <div className={styles.memberSelectionSection}>
          <span className={styles.memberSelectionLabel}>Available</span>
          <div className={styles.memberSelectionList}>
            {/* Teams first - index starts at 0 */}
            {availableTeams.map((team, teamIndex) => (
              <button
                key={team.id}
                ref={el => {
                  availableItemsRef.current[teamIndex] = el
                }}
                type="button"
                className={styles.memberSelectionAvailableItem}
                onClick={() => handleAddTeam(team)}
                onKeyDown={e => handleAvailableItemKeyDown(e, teamIndex)}
                disabled={disabled}
                data-testid={`add-team-${team.id}`}
              >
                <span className={styles.memberSelectionItemIcon}>
                  <Users size={14} />
                </span>
                <div className={styles.memberSelectionItemInfo}>
                  <span className={styles.memberSelectionItemName}>{team.name}</span>
                  <span className={styles.memberSelectionItemMeta}>
                    {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
              </button>
            ))}

            {/* Then individual members - index continues from teams */}
            {availableMembers.map((member, memberIndex) => {
              const combinedIndex = availableTeams.length + memberIndex
              return (
                <button
                  key={member.userId}
                  ref={el => {
                    availableItemsRef.current[combinedIndex] = el
                  }}
                  type="button"
                  className={styles.memberSelectionAvailableItem}
                  onClick={() => handleAddUser(member)}
                  onKeyDown={e => handleAvailableItemKeyDown(e, combinedIndex)}
                  disabled={disabled}
                  data-testid={`add-member-${member.userId}`}
                >
                  <span className={styles.memberSelectionItemIcon}>
                    <User size={14} />
                  </span>
                  <div className={styles.memberSelectionItemInfo}>
                    <span className={styles.memberSelectionItemName}>
                      {member.displayName || member.user?.email || "Unknown"}
                    </span>
                    {member.user?.email && member.displayName && member.displayName !== member.user.email && (
                      <span className={styles.memberSelectionItemMeta}>{member.user.email}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
)
