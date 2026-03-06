import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore, type WorkspaceStore } from "../store/workspace-store"
import type { WorkspaceInfo } from "../store/types"
import { Plus, Building2 } from "lucide-react"
import { ListContainer, List, ListRow, ListHeader, ListRowWithChevron, ListSectionHeader } from "./ListUI"
import { Sidebar } from "./Sidebar"
import * as modalStyles from "../styles/modal.css"

/**
 * WorkspaceSelector is shown when a user is authenticated but has no workspace selected.
 * It displays:
 * - A list of existing workspaces the user belongs to
 * - An option to create a new workspace (with modal input)
 *
 * Per the app flow spec (18 BOOK OF APP FLOW):
 * "Once a user is authenticated, the home page of the PUI stack would be a list of workspaces,
 * with the first row being an option to create a new workspace."
 */
export function WorkspaceSelector() {
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((state: WorkspaceStore) => state.workspaces)
  const createWorkspace = useWorkspaceStore((state: WorkspaceStore) => state.createWorkspace)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens
  useEffect(() => {
    if (showCreateModal && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showCreateModal])

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

  const orderedWorkspaces = useMemo(
    () => workspaceGroups.flatMap(group => group.workspaces),
    [workspaceGroups]
  )

  // Total items: "Create new workspace" + existing workspaces
  const itemCount = orderedWorkspaces.length + 1

  // Handle selecting an item.
  // Navigation is enough; WorkspaceGuard selects the workspace once the route updates.
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        // Create new workspace
        setShowCreateModal(true)
        setError(null)
      } else {
        // Select existing workspace
        const workspace = orderedWorkspaces[index - 1]
        if (workspace) {
          // Navigate immediately and allow WorkspaceGuard to perform selection.
          navigate(`/w/${workspace.uuid}`, {
            state: {
              accountId: workspace.accountId,
              workspaceEntryId: workspace.workspaceEntryId,
            },
          })
        }
      }
    },
    [orderedWorkspaces, navigate]
  )

  // Create a new workspace and navigate to it
  const handleCreateWorkspace = async () => {
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
      // Navigate to the newly created workspace
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
  }

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isCreating) {
      e.preventDefault()
      handleCreateWorkspace()
    } else if (e.key === "Escape") {
      setShowCreateModal(false)
      setNewWorkspaceName("")
      setError(null)
    }
  }

  const handleCloseModal = () => {
    setShowCreateModal(false)
    setNewWorkspaceName("")
    setError(null)
  }

  return (
    <ListContainer navigationDrawer={<Sidebar />}>
      <List
        itemCount={itemCount}
        onSelect={handleSelect}
        disableKeyboard={showCreateModal}
        testId="workspace-selector"
      >
        <ListHeader title="Select a workspace" />

        {/* Create new workspace row */}
        <ListRow
          index={0}
          icon={<Plus size={18} />}
          title="Create new workspace"
          isCreateAction
          onClick={() => handleSelect(0)}
          testId="create-workspace-option"
        />

        {/* Existing workspaces grouped by account */}
        {(() => {
          let rowIndex = 1
          return workspaceGroups.map(group => (
            <div key={group.label}>
              <ListSectionHeader title={group.label} />
              {group.workspaces.map((workspace: WorkspaceInfo) => {
                const currentIndex = rowIndex
                rowIndex += 1
                return (
                  <ListRowWithChevron
                    key={workspace.workspaceEntryId}
                    index={currentIndex}
                    icon={<Building2 size={18} />}
                    title={workspace.name}
                    onClick={() => handleSelect(currentIndex)}
                    testId={`workspace-row-${workspace.workspaceEntryId
                      .replace(/[^a-z0-9]/gi, "-")
                      .toLowerCase()}`}
                  />
                )
              })}
            </div>
          ))
        })()}
      </List>

      {/* Create workspace modal */}
      {showCreateModal && (
        <div className={modalStyles.modalOverlay} onClick={handleCloseModal}>
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
                onClick={handleCloseModal}
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
    </ListContainer>
  )
}
