import { useCallback, useMemo } from "react"
import { Folder, X } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { Sidecar, SidecarSection, SidecarRow, SidecarMenu, SidecarEmpty } from "./SidecarUI"
import { useFolders } from "../store/queries/use-folders"

/**
 * Type of resource being moved.
 */
export type MoveResourceType = "file" | "folder" | "paper"

/**
 * Props for MoveSidecar component.
 */
interface MoveSidecarProps {
  // Type of resource being moved
  resourceType: MoveResourceType
  // ID of the resource being moved
  resourceId: string
  // Current parent folder ID (null for root)
  currentParentId: string | null
  // Callback when a destination is selected (null = move to root)
  onSelectDestination: (folderId: string | null) => void
}

/**
 * MoveSidecar displays a folder picker for moving files, folders, or papers.
 *
 * Shows all folders in the workspace (no type filtering - folders are unified).
 * Includes a "Remove from folder" option when the resource is currently in a folder.
 * Disables invalid destinations (self, descendants for folders).
 */
export function MoveSidecar({
  resourceType,
  resourceId,
  currentParentId,
  onSelectDestination,
}: MoveSidecarProps) {
  const { popSidecar } = useSidecar()

  // Fetch all folders (no type filtering - folders are unified)
  const { data: allFolders, isLoading } = useFolders()

  // Memoize folders to prevent unnecessary recalculations in dependent useMemo hooks
  const folders = useMemo(() => allFolders ?? [], [allFolders])

  // Whether the resource is currently in a folder (vs root)
  const isInFolder = currentParentId !== null

  // Build a set of invalid destination IDs.
  // For folders: self and all descendants are invalid.
  // For files/papers: no restrictions beyond current parent.
  const invalidDestinations = useMemo(() => {
    const invalid = new Set<string>()

    if (resourceType === "folder" && folders) {
      // Add self
      invalid.add(resourceId)

      // Find all descendants of this folder
      const findDescendants = (parentId: string) => {
        for (const folder of folders) {
          if (folder.parentId === parentId) {
            invalid.add(folder.id)
            findDescendants(folder.id)
          }
        }
      }
      findDescendants(resourceId)
    }

    return invalid
  }, [resourceType, resourceId, folders])

  // Sort folders alphabetically by name, excluding invalid destinations
  const sortedFolders = useMemo(() => {
    if (!folders) return []

    return [...folders]
      .filter(f => !invalidDestinations.has(f.id))
      .sort((a, b) => a.content.name.localeCompare(b.content.name))
  }, [folders, invalidDestinations])

  // Total items:
  // - "Remove from folder" (only if currently in a folder): 1
  // - Sorted folders: sortedFolders.length
  const totalItems = (isInFolder ? 1 : 0) + sortedFolders.length

  // Handle "Remove from folder" (move to root)
  const handleRemoveFromFolder = useCallback(() => {
    if (currentParentId === null) {
      popSidecar()
      return
    }
    onSelectDestination(null)
    popSidecar()
  }, [currentParentId, onSelectDestination, popSidecar])

  // Handle selecting a folder
  const handleSelectFolder = useCallback(
    (folderId: string) => {
      if (folderId === currentParentId) {
        // Same parent, just close
        popSidecar()
        return
      }
      onSelectDestination(folderId)
      popSidecar()
    },
    [currentParentId, onSelectDestination, popSidecar]
  )

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (isInFolder) {
        if (index === 0) {
          handleRemoveFromFolder()
        } else {
          const folder = sortedFolders[index - 1]
          if (folder) {
            handleSelectFolder(folder.id)
          }
        }
      } else {
        const folder = sortedFolders[index]
        if (folder) {
          handleSelectFolder(folder.id)
        }
      }
    },
    [isInFolder, handleRemoveFromFolder, handleSelectFolder, sortedFolders]
  )

  if (isLoading) {
    return <SidecarEmpty message="Loading folders..." />
  }

  return (
    <Sidecar itemCount={totalItems} onSelect={handleSelect}>
      <SidecarSection title="Move to">
        <SidecarMenu>
          {/* "Remove from folder" option - only shown when in a folder */}
          {isInFolder && (
            <SidecarRow
              index={0}
              icon={<X size={14} />}
              title="Remove from folder"
              onClick={handleRemoveFromFolder}
              testId="move-destination-root"
            />
          )}

          {/* Folder options */}
          {sortedFolders.map((folder, index) => (
            <SidecarRow
              key={folder.id}
              index={isInFolder ? index + 1 : index}
              icon={<Folder size={14} />}
              title={folder.content.name}
              meta={folder.id === currentParentId ? "(current)" : undefined}
              onClick={() => handleSelectFolder(folder.id)}
              testId={`move-destination-${folder.id}`}
            />
          ))}
        </SidecarMenu>
      </SidecarSection>

      {sortedFolders.length === 0 && !isInFolder && <SidecarEmpty message="No folders available" />}
    </Sidecar>
  )
}
