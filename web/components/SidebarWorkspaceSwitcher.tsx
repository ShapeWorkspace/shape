import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useWorkspaceStore, type WorkspaceStore } from "../store/workspace-store"
import type { WorkspaceInfo } from "../store/types"
import { Building2, ChevronDown, Check, Plus } from "lucide-react"
import * as styles from "../styles/sidebar-workspace-switcher.css"
import * as modalStyles from "../styles/modal.css"

/**
 * SidebarWorkspaceSwitcher is a dropdown component displayed in the sidebar
 * that allows users to:
 * - See the current workspace
 * - Switch between existing workspaces
 * - Create a new workspace
 *
 * This differs from WorkspaceSelector which is the full-page initial workspace selection.
 */
export function SidebarWorkspaceSwitcher() {
  const navigate = useNavigate()
  const hasAuthenticatedAccounts = useAuthStore(state => state.hasAuthenticatedAccounts)
  const workspaces = useWorkspaceStore((state: WorkspaceStore) => state.workspaces)
  const currentWorkspace = useWorkspaceStore((state: WorkspaceStore) => state.currentWorkspace)
  const createWorkspace = useWorkspaceStore((state: WorkspaceStore) => state.createWorkspace)

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const isWorkspaceCreationDisabled = !hasAuthenticatedAccounts

  // Create workspace modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs for click-outside handling
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isDropdownOpen])

  /**
   * Focus input when create modal opens
   */
  useEffect(() => {
    if (showCreateModal && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showCreateModal])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Switches to a different workspace via URL navigation.
   * WorkspaceGuard owns the selection to avoid URL/currentWorkspace mismatch loops.
   */
  const handleSelectWorkspace = useCallback(
    (workspace: WorkspaceInfo) => {
      setIsDropdownOpen(false)
      // Navigate immediately and let WorkspaceGuard perform selection to avoid
      // blocking navigation on Application initialization.
      navigate(`/w/${workspace.uuid}`, {
        state: {
          accountId: workspace.accountId,
          workspaceEntryId: workspace.workspaceEntryId,
        },
      })
    },
    [navigate]
  )

  /**
   * Opens the create workspace modal
   */
  const handleOpenCreateModal = useCallback(() => {
    if (isWorkspaceCreationDisabled) {
      return
    }
    setIsDropdownOpen(false)
    setShowCreateModal(true)
    setError(null)
  }, [isWorkspaceCreationDisabled])

  /**
   * Creates a new workspace and navigates to it
   */
  const handleCreateWorkspace = useCallback(async () => {
    const name = newWorkspaceName.trim()
    if (!name) {
      setError("Workspace name cannot be empty")
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const workspace = await createWorkspace(name)
      setShowCreateModal(false)
      setNewWorkspaceName("")
      navigate(`/w/${workspace.uuid}`, {
        state: {
          accountId: workspace.accountId,
          workspaceEntryId: workspace.workspaceEntryId,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace")
    } finally {
      setIsCreating(false)
    }
  }, [newWorkspaceName, createWorkspace, navigate])

  /**
   * Handles keyboard events in the create modal
   */
  const handleModalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isCreating) {
        e.preventDefault()
        handleCreateWorkspace()
      } else if (e.key === "Escape") {
        setShowCreateModal(false)
        setNewWorkspaceName("")
        setError(null)
      }
    },
    [isCreating, handleCreateWorkspace]
  )

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generates a test ID for a workspace item based on its composite entry ID.
   */
  const getWorkspaceItemTestId = (workspace: WorkspaceInfo): string => {
    const slug = workspace.workspaceEntryId.replace(/[^a-z0-9]/gi, "-").toLowerCase()
    return `sidebar-workspace-item-${slug}`
  }

  const workspaceGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceInfo[]>()

    workspaces.forEach((workspace: WorkspaceInfo) => {
      const label = workspace.accountEmail ?? "Local workspaces"
      const existingGroup = groups.get(label) ?? []
      groups.set(label, [...existingGroup, workspace])
    })

    return Array.from(groups.entries()).map(([label, groupedWorkspaces]) => ({
      label,
      workspaces: groupedWorkspaces,
    }))
  }, [workspaces])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Don't render if no workspace is selected (user should see full WorkspaceSelector)
  if (!currentWorkspace) {
    return null
  }

  return (
    <>
      <div className={styles.workspaceSwitcherContainer} ref={dropdownRef}>
        {/* Main switcher button */}
        <button
          className={styles.workspaceSwitcherButton}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          data-testid="sidebar-workspace-switcher"
          aria-expanded={isDropdownOpen}
          aria-haspopup="listbox"
        >
          <Building2 size={14} className={styles.workspaceSwitcherIcon} />
          <span className={styles.workspaceSwitcherName}>{currentWorkspace.name}</span>
          <ChevronDown
            size={14}
            className={`${styles.workspaceSwitcherChevron} ${isDropdownOpen ? styles.workspaceSwitcherChevronOpen : ""}`}
          />
        </button>

        {/* Dropdown menu */}
        {isDropdownOpen && (
          <div className={styles.workspaceSwitcherDropdown} role="listbox">
            {/* Workspace list */}
            {workspaces.length > 0 ? (
              <div className={styles.workspaceSwitcherList}>
                {workspaceGroups.map(group => (
                  <div key={group.label} className={styles.workspaceSwitcherGroup}>
                    <div className={styles.workspaceSwitcherGroupLabel}>{group.label}</div>
                    <div className={styles.workspaceSwitcherGroupList}>
                      {group.workspaces.map((workspace: WorkspaceInfo) => (
                        <button
                          key={workspace.workspaceEntryId}
                          className={`${styles.workspaceSwitcherItem} ${
                            currentWorkspace?.workspaceEntryId === workspace.workspaceEntryId
                              ? styles.workspaceSwitcherItemSelected
                              : ""
                          }`}
                          onClick={() => handleSelectWorkspace(workspace)}
                          data-testid={getWorkspaceItemTestId(workspace)}
                          role="option"
                          aria-selected={currentWorkspace?.workspaceEntryId === workspace.workspaceEntryId}
                        >
                          {currentWorkspace?.workspaceEntryId === workspace.workspaceEntryId && (
                            <Check size={14} className={styles.workspaceSwitcherCheck} />
                          )}
                          <span className={styles.workspaceSwitcherItemName}>{workspace.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.workspaceSwitcherEmpty}>
                <span>No other workspaces</span>
              </div>
            )}

            {/* Divider */}
            <div className={styles.workspaceSwitcherDivider} />

            {/* Create workspace button */}
            <button
              className={
                isWorkspaceCreationDisabled
                  ? `${styles.workspaceSwitcherCreate} ${styles.workspaceSwitcherCreateDisabled}`
                  : styles.workspaceSwitcherCreate
              }
              onClick={handleOpenCreateModal}
              disabled={isWorkspaceCreationDisabled}
              aria-disabled={isWorkspaceCreationDisabled}
              data-testid="sidebar-workspace-create-button"
            >
              <Plus size={14} />
              <span>Create Workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Create workspace dialog */}
      {showCreateModal && (
        <div className={modalStyles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <div className={modalStyles.modalTitle}>Create new workspace</div>
            <input
              ref={inputRef}
              type="text"
              className={modalStyles.modalInput}
              placeholder="Workspace name"
              value={newWorkspaceName}
              onChange={e => setNewWorkspaceName(e.target.value)}
              onKeyDown={handleModalKeyDown}
              disabled={isCreating}
              data-testid="workspace-name-input"
            />
            {error && <div style={{ color: "#e53935", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}
            <div className={modalStyles.modalButtons}>
              <button
                className={modalStyles.modalButtonCancel}
                onClick={() => {
                  setShowCreateModal(false)
                  setNewWorkspaceName("")
                  setError(null)
                }}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                className={modalStyles.modalButtonConfirm}
                onClick={handleCreateWorkspace}
                disabled={isCreating}
                data-testid="create-workspace-button"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
