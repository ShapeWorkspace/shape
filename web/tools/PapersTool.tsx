/**
 * PapersTool displays a flat list of all papers and individual paper editors.
 *
 * Papers are collaborative rich-text documents using TipTap + Yjs.
 * Content is encrypted and synchronized via SSE in realtime.
 *
 * This tool shows ALL papers in the workspace as a flat list, sorted by
 * most recently updated. Folder location is shown as an accessory label.
 * Folder navigation is handled by the Files tool.
 */

import { useState, useCallback, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useWindowStore } from "../store/window-store"
import { List, ListRow, ListSearch, ListEmpty, CustomListContent } from "../components/ListUI"
import { usePapers, usePaper, useCreatePaper } from "../store/queries/use-papers"
import type { DecryptedFolder, DecryptedPaper } from "../../engine/models/entity"
import { useFolders } from "../store/queries/use-folders"
import { useSidecar } from "../contexts/SidecarContext"
import { useDraftInfoMap, isDraftTransient } from "../hooks/useDraftInfoMap"
import { PaperSidecar } from "../components/PaperSidecar"
import { PaperEditor } from "../components/PaperEditor"
import { FileText, Plus, Loader2 } from "lucide-react"
import { Sidecar, SidecarRow, SidecarMenu } from "../components/SidecarUI"
import { getDefaultPaperTitle } from "../utils/default-entity-titles"
import * as paperStyles from "../styles/paper.css"

/**
 * Builds the folder path from a folder ID to the root.
 * Returns an array of folders from root to leaf.
 */
function buildFolderPath(folderId: string | null, folders: DecryptedFolder[]): DecryptedFolder[] {
  if (!folderId) return []

  const folderMap = new Map<string, DecryptedFolder>()
  for (const f of folders) {
    folderMap.set(f.id, f)
  }

  const path: DecryptedFolder[] = []
  let currentId: string | null = folderId

  // Walk up the tree to root
  while (currentId) {
    const folder = folderMap.get(currentId)
    if (!folder) break
    path.unshift(folder) // Add to beginning to get root-first order
    currentId = folder.parentId ?? null
  }

  return path
}

/**
 * Gets the folder path label for display in the accessory slot.
 * Returns null if paper is at root level.
 * Format for deep nesting: "Root > ... > Leaf"
 */
function getFolderPathLabel(folderId: string | null, folders: DecryptedFolder[]): string | null {
  if (!folderId) return null

  const path = buildFolderPath(folderId, folders)
  if (path.length === 0) return null
  if (path.length === 1) return path[0].content.name
  if (path.length === 2) return `${path[0].content.name} > ${path[1].content.name}`

  // Deep nesting: "Root > ... > Leaf"
  return `${path[0].content.name} > ... > ${path[path.length - 1].content.name}`
}

/**
 * PapersListSidecar displays the primary action for the Papers list view.
 * Shows only the "New paper" action since folder creation is handled in Files tool.
 */
function PapersListSidecar() {
  const navigate = useNavigate()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { navigateTo } = useWindowStore()
  const createPaperMutation = useCreatePaper()

  const handleNewPaper = useCallback(async () => {
    if (!workspaceId) return

    const defaultName = getDefaultPaperTitle()

    try {
      const createdPaper = createPaperMutation.createOptimistically({
        name: defaultName,
        folderId: null,
      })
      navigateTo({
        id: createdPaper.id,
        label: createdPaper.name,
        tool: "papers",
        itemId: createdPaper.id,
      })
      navigate(`/w/${workspaceId}/papers/${createdPaper.id}`)
      await createdPaper.promise
    } catch (err) {
      console.error("Failed to create paper:", err)
    }
  }, [workspaceId, createPaperMutation, navigateTo, navigate])

  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        handleNewPaper()
      }
    },
    [handleNewPaper]
  )

  return (
    <Sidecar itemCount={1} onSelect={handleSelect}>
      <SidecarMenu>
        <SidecarRow
          index={0}
          icon={<Plus size={14} />}
          title="New paper"
          onClick={handleNewPaper}
          testId="sidecar-new-paper"
        />
      </SidecarMenu>
    </Sidecar>
  )
}

/**
 * PapersTool displays a flat list of all papers with folder location metadata.
 * Uses the standard List pattern with ListRow children.
 *
 * Papers are sorted by most recently updated. Folder location is shown as
 * an accessory label on each row.
 */
export function PapersTool() {
  const navigate = useNavigate()
  const { workspaceId, itemId } = useParams<{ workspaceId: string; itemId?: string }>()
  const { navigateTo } = useWindowStore()
  const { setSidecar, clearSidecar } = useSidecar()
  const [searchQuery, setSearchQuery] = useState("")

  // Use real paper and folder data from engine
  const { data: papers = [], isLoading: papersLoading } = usePapers()
  const { data: folders = [], isLoading: foldersLoading } = useFolders()
  const createPaperMutation = useCreatePaper()

  const isLoading = papersLoading || foldersLoading

  // Build draft info map for papers (includes auto-refresh on transient window expiry)
  const paperDraftInfoById = useDraftInfoMap({ entityType: "paper" })

  // Clear sidecar when this tool unmounts
  useEffect(() => {
    return () => clearSidecar()
  }, [clearSidecar])

  // Display all papers, filtered by search query, sorted by most recent
  const displayPapers = useMemo(() => {
    return papers
      .filter((p: DecryptedPaper) => {
        if (!searchQuery) return true
        return p.content.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .sort((a: DecryptedPaper, b: DecryptedPaper) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }, [papers, searchQuery])

  const handleSelectPaper = useCallback(
    (paper: DecryptedPaper) => {
      if (!workspaceId) return
      // Set sidecar with paper actions
      setSidecar(
        <PaperSidecar paper={paper} currentTitle={paper.content.name} onTitleChange={() => {}} />,
        paper.content.name
      )
      // Update window store for breadcrumb tracking
      navigateTo({
        id: paper.id,
        label: paper.content.name,
        tool: "papers",
        itemId: paper.id,
      })
      // Navigate to paper editor
      navigate(`/w/${workspaceId}/papers/${paper.id}`)
    },
    [workspaceId, navigateTo, navigate, setSidecar]
  )

  const handleCreatePaper = useCallback(async () => {
    if (!workspaceId) return

    const defaultName = getDefaultPaperTitle()

    try {
      const createdPaper = createPaperMutation.createOptimistically({
        name: defaultName,
        folderId: null,
      })
      navigateTo({
        id: createdPaper.id,
        label: createdPaper.name,
        tool: "papers",
        itemId: createdPaper.id,
      })
      navigate(`/w/${workspaceId}/papers/${createdPaper.id}`)
      await createdPaper.promise
    } catch (err) {
      console.error("Failed to create paper:", err)
    }
  }, [workspaceId, createPaperMutation, navigateTo, navigate])

  // Update sidecar at root level
  // Skip when viewing a specific paper - PaperEditor handles its own sidecar
  useEffect(() => {
    if (itemId) return
    setSidecar(<PapersListSidecar />, "Actions")
  }, [setSidecar, itemId])

  // Total item count: 1 action button (New paper) + papers
  const itemCount = 1 + displayPapers.length

  const handleSelectByIndex = useCallback(
    (index: number) => {
      // Index 0 = New paper action
      if (index === 0) {
        handleCreatePaper()
        return
      }

      // Adjust for the New paper action button
      const paperIndex = index - 1

      // Check if it's a paper
      if (paperIndex < displayPapers.length) {
        const paper = displayPapers[paperIndex]
        if (paper) {
          handleSelectPaper(paper)
        }
      }
    },
    [displayPapers, handleSelectPaper, handleCreatePaper]
  )

  // If viewing a specific paper, show the editor wrapped in CustomListContent
  // This must come AFTER all hooks are called
  if (itemId) {
    return (
      <CustomListContent testId="papers-tool-container">
        <PaperEditorWrapper paperId={itemId} />
      </CustomListContent>
    )
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <>
      <List itemCount={itemCount} onSelect={handleSelectByIndex} testId="papers-tool-container">
        <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search papers..." />

        {/* New paper action in the primary list */}
        <ListRow
          index={0}
          icon={<Plus size={16} />}
          title="New paper"
          isCreateAction
          onClick={handleCreatePaper}
          testId="new-paper-button"
        />

        {isLoading ? (
          <div className={paperStyles.paperLoading}>
            <Loader2 size={24} className={paperStyles.paperLoadingIcon} />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            {/* Papers with folder location as accessory */}
            {displayPapers.map((paper: DecryptedPaper, index: number) => {
              const draftInfo = paperDraftInfoById.get(paper.id)
              const isTransient = isDraftTransient(draftInfo)
              const showDraftBadge = draftInfo?.hasDraft && !isTransient
              const showPendingDeletion = draftInfo?.deleteEntity && !isTransient
              const displayTitle = showPendingDeletion
                ? `${paper.content.name || "Untitled"} — Pending deletion`
                : paper.content.name || "Untitled"

              return (
                <ListRow
                  key={paper.id}
                  index={1 + index}
                  icon={<FileText size={16} />}
                  title={displayTitle}
                  meta={formatDate(paper.updatedAt.getTime())}
                  accessory={getFolderPathLabel(paper.metaFields.folder_id ?? null, folders)}
                  onClick={() => handleSelectPaper(paper)}
                  testId="paper-list-item"
                >
                  {showDraftBadge && (
                    <span className={paperStyles.paperDraftBadge} data-testid="paper-draft-badge">
                      Draft
                    </span>
                  )}
                </ListRow>
              )
            })}

            {/* Empty states */}
            {displayPapers.length === 0 && searchQuery && <ListEmpty message="No papers found" />}

            {displayPapers.length === 0 && !searchQuery && (
              <ListEmpty message="No papers yet. Create a paper to get started." />
            )}
          </>
        )}
      </List>
    </>
  )
}

interface PaperEditorWrapperProps {
  paperId: string
}

/**
 * Wrapper component that loads paper data before rendering the editor.
 */
function PaperEditorWrapper({ paperId }: PaperEditorWrapperProps) {
  const { data: paper, isLoading } = usePaper(paperId)

  if (isLoading) {
    return (
      <div className={paperStyles.paperLoading}>
        <Loader2 size={24} className={paperStyles.paperLoadingIcon} />
        <span>Loading paper...</span>
      </div>
    )
  }

  // Only show error when we have no cached data.
  // When offline, we may have network errors but still have valid cached/draft data.
  if (!paper) {
    return <div className={paperStyles.paperError}>Paper not found</div>
  }

  return <PaperEditor paper={paper} />
}
