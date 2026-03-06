import { useCallback, useState } from "react"
import { Pencil, Building2, Crown, Shield, Users } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useEngineStore } from "../store/engine-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { useCurrentUserWorkspaceMember } from "../store/queries/use-workspace-members"
import { WorkspaceMemberRole } from "../../engine/models/workspace-member"
import { FormSidecar } from "./FormSidecar"
import { Sidecar, SidecarSection, SidecarRow, SidecarMenu, SidecarMetaList, SidecarMetaItem } from "./SidecarUI"
import { useActiveWorkspaceInfo } from "../hooks/use-active-workspace-info"

/**
 * Props for the rename workspace form sidecar.
 */
interface WorkspaceRenameSidecarProps {
  onCancel: () => void
}

/**
 * Sidecar form for renaming the current workspace.
 * Uses FormSidecar for consistent form handling.
 */
function WorkspaceRenameSidecar({ onCancel }: WorkspaceRenameSidecarProps) {
  const activeWorkspaceInfo = useActiveWorkspaceInfo()
  const renameWorkspace = useWorkspaceStore(state => state.renameWorkspace)
  const { updateSidecarTitle } = useSidecar()
  const [isRenaming, setIsRenaming] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      if (!activeWorkspaceInfo) {
        setErrorMessage("Workspace not available")
        return
      }

      const nameValue = values.name
      if (typeof nameValue !== "string") {
        setErrorMessage("Workspace name is required")
        return
      }

      setIsRenaming(true)
      setErrorMessage(null)

      try {
        await renameWorkspace(activeWorkspaceInfo.uuid, nameValue)
        // Update the sidecar title to reflect the new workspace name
        updateSidecarTitle(nameValue)
        onCancel()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to rename workspace"
        setErrorMessage(message)
      } finally {
        setIsRenaming(false)
      }
    },
    [activeWorkspaceInfo, renameWorkspace, updateSidecarTitle, onCancel]
  )

  return (
    <FormSidecar
      title="Rename Workspace"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Workspace name",
          required: true,
          placeholder: "Untitled Workspace",
          defaultValue: activeWorkspaceInfo?.name ?? "",
          testId: "workspace-rename-input",
          autoFocus: true,
        },
      ]}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="Save"
      cancelLabel="Cancel"
      isPending={isRenaming}
      errorMessage={errorMessage}
    />
  )
}

/**
 * Helper function to get human-readable role label.
 */
function getRoleLabel(role: WorkspaceMemberRole): string {
  switch (role) {
    case WorkspaceMemberRole.SuperAdmin:
      return "Super Admin"
    case WorkspaceMemberRole.Admin:
      return "Admin"
    case WorkspaceMemberRole.Member:
      return "Member"
    default:
      return "Unknown"
  }
}

/**
 * Helper function to get the appropriate icon for a role.
 */
function getRoleIcon(role: WorkspaceMemberRole) {
  switch (role) {
    case WorkspaceMemberRole.SuperAdmin:
      return <Crown size={12} />
    case WorkspaceMemberRole.Admin:
      return <Shield size={12} />
    case WorkspaceMemberRole.Member:
      return <Users size={12} />
    default:
      return null
  }
}

/**
 * WorkspaceInfoSidecar displays basic workspace information and allows
 * super admins to rename the workspace.
 *
 * Shown when the Settings tool is selected (on the root settings view).
 *
 * Sections:
 * - Workspace Info: name, user's role
 * - Actions: Rename (only for super admins)
 */
export function WorkspaceInfoSidecar() {
  const { application } = useEngineStore()
  const activeWorkspaceInfo = useActiveWorkspaceInfo()
  const { pushSidecar, popSidecar } = useSidecar()
  const currentUserMember = useCurrentUserWorkspaceMember()

  // Only super admins can rename the workspace (matches server permission check)
  const isSuperAdmin = currentUserMember?.role === WorkspaceMemberRole.SuperAdmin
  // For local (unregistered) workspaces, allow rename without checking role
  const isLocalWorkspace = !application?.isWorkspaceRemote()
  const canRename = isSuperAdmin || isLocalWorkspace

  // Handler to open the rename form sidecar
  const handleOpenRenameSidecar = useCallback(() => {
    pushSidecar(<WorkspaceRenameSidecar onCancel={popSidecar} />, "Rename Workspace")
  }, [pushSidecar, popSidecar])

  // Item count for keyboard navigation
  // Only 1 action row (Rename) when user can rename, otherwise 0
  const actionCount = canRename ? 1 : 0

  return (
    <Sidecar itemCount={actionCount} onSelect={() => canRename && handleOpenRenameSidecar()}>
      {/* Workspace Info section */}
      <SidecarSection title="Workspace">
        <SidecarMetaList>
          <SidecarMetaItem
            icon={<Building2 size={12} />}
            label="Name"
            value={activeWorkspaceInfo?.name ?? "Unknown"}
            testId="workspace-info-name"
          />
          {/* Show role only for registered workspaces where we have member data */}
          {currentUserMember && application?.isWorkspaceRemote() && (
            <SidecarMetaItem
              icon={getRoleIcon(currentUserMember.role)}
              label="Your Role"
              value={getRoleLabel(currentUserMember.role)}
              testId="workspace-info-role"
            />
          )}
          {isLocalWorkspace && (
            <SidecarMetaItem label="Status" value="Local only" testId="workspace-info-status" />
          )}
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions section - only show if there are available actions */}
      {canRename && (
        <SidecarSection title="Actions">
          <SidecarMenu>
            <SidecarRow
              index={0}
              icon={<Pencil size={14} />}
              title="Rename"
              onClick={handleOpenRenameSidecar}
              testId="workspace-rename-button"
            />
          </SidecarMenu>
        </SidecarSection>
      )}
    </Sidecar>
  )
}
