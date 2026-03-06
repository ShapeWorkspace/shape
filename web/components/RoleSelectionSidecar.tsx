import { useCallback } from "react"
import { Eye, Pencil, Shield, Trash2 } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { Sidecar, SidecarSection, SidecarRow, SidecarMenu, SidecarDescription } from "./SidecarUI"
import { ACL_ROLE_DISPLAY, type ACLPermission } from "../../engine/models/acl-entry"

/**
 * Props for RoleSelectionSidecar component.
 */
interface RoleSelectionSidecarProps {
  // Currently selected permission level (null if adding new member)
  currentPermission: ACLPermission | null
  // Callback when user selects a permission level
  onSelectPermission: (permission: ACLPermission) => void
  // Callback when user removes the member (only shown for existing entries)
  onRemove?: () => void
  // Display name of the subject being edited (for context)
  subjectName?: string
  // Whether this is for an existing entry (shows remove option) or new entry
  isExisting?: boolean
}

/**
 * RoleSelectionSidecar allows selecting a permission level for an ACL entry.
 * Shows three permission levels: Viewer (read), Editor (write), Admin (admin).
 * For existing entries, also shows a "Remove" option.
 */
export function RoleSelectionSidecar({
  currentPermission,
  onSelectPermission,
  onRemove,
  subjectName,
  isExisting = false,
}: RoleSelectionSidecarProps) {
  const { popSidecar } = useSidecar()

  // Icons for each permission level
  const permissionIcons: Record<ACLPermission, JSX.Element> = {
    read: <Eye size={14} />,
    write: <Pencil size={14} />,
    admin: <Shield size={14} />,
  }

  // Calculate item count: 3 permissions + 1 remove (if existing)
  const itemCount = isExisting && onRemove ? 4 : 3

  // Handle permission selection - call callback and pop sidecar
  const handleSelectPermission = useCallback(
    (permission: ACLPermission) => {
      onSelectPermission(permission)
      popSidecar()
    },
    [onSelectPermission, popSidecar]
  )

  // Handle remove - call callback and pop sidecar
  const handleRemove = useCallback(() => {
    if (onRemove) {
      onRemove()
      popSidecar()
    }
  }, [onRemove, popSidecar])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      const permissions: ACLPermission[] = ["read", "write", "admin"]
      if (index < permissions.length) {
        const permission = permissions[index]
        if (permission) {
          handleSelectPermission(permission)
        }
      } else if (isExisting && onRemove) {
        handleRemove()
      }
    },
    [handleSelectPermission, handleRemove, isExisting, onRemove]
  )

  return (
    <Sidecar itemCount={itemCount} onSelect={handleSelect}>
      {/* Context description */}
      {subjectName && (
        <SidecarDescription>
          {isExisting ? `Change role for ${subjectName}` : `Select role for ${subjectName}`}
        </SidecarDescription>
      )}

      {/* Permission options */}
      <SidecarSection title="Select Role">
        <SidecarMenu>
          {(["read", "write", "admin"] as ACLPermission[]).map((permission, index) => {
            const display = ACL_ROLE_DISPLAY[permission]
            const isCurrentRole = currentPermission === permission
            return (
              <SidecarRow
                key={permission}
                index={index}
                icon={permissionIcons[permission]}
                title={display.label}
                meta={isCurrentRole ? "Current" : undefined}
                onClick={() => handleSelectPermission(permission)}
                disabled={isCurrentRole}
                testId={`role-option-${permission}`}
              />
            )
          })}
        </SidecarMenu>
      </SidecarSection>

      {/* Remove option for existing entries */}
      {isExisting && onRemove && (
        <SidecarSection title="Danger Zone">
          <SidecarMenu>
            <SidecarRow
              index={3}
              icon={<Trash2 size={14} />}
              title="Remove access"
              onClick={handleRemove}
              testId="role-remove-access"
            />
          </SidecarMenu>
        </SidecarSection>
      )}
    </Sidecar>
  )
}
