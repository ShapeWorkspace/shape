import { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Calendar, Tag, Plus, X, Trash2, Save, Loader2, Download } from "lucide-react"
import type { DecryptedNote } from "@shape/engine/models/entity"
import { Note, NoteTag } from "../store/types"
import { useUIStore } from "../store/ui-store"
import { useNotes, useUpdateNote, useDeleteNote } from "../store/queries/use-notes"
import { useEngineStore } from "../store/engine-store"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useDrafts } from "../contexts/DraftContext"
import { useDraftState } from "../hooks/useDraftState"
import { MEMO_LABEL, TOOL_LABELS_SINGULAR } from "../constants/tool-labels"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { RelativeTimestamp } from "./RelativeTimestamp"
import { useEntitySave } from "../contexts/EntitySaveContext"
import { NoteMarkdownExportSidecar } from "./MarkdownExportSidecar"
import * as styles from "../styles/sidecar.css"

/**
 * NoteSidecar displays contextual information and actions for a note.
 * Uses the stack-based sidecar navigation - clicking an action pushes
 * a new view onto the stack, and breadcrumbs are rendered automatically.
 */
interface NoteSidecarProps {
  note: Note
}

export function NoteSidecar({ note }: NoteSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { application } = useEngineStore()
  const { navigateBack } = useWindowStore()
  const { pushSidecar } = useSidecar()
  const { noteTags } = useUIStore()
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()
  const { mutate: deleteNote, isPending: isDeleting } = useDeleteNote()

  // Delete confirmation state - shows explicit confirm/cancel sub-rows.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const canonicalNote = useMemo((): DecryptedNote | null => {
    if (!application) {
      return null
    }
    return application.getCacheStores().entityStore.getCanonical<DecryptedNote>(note.id) ?? null
  }, [application, note.id])

  const draftState = useDraftState({
    entityType: "note",
    entityId: note.id,
    canonicalContentHash: canonicalNote?.contentHash,
    canonicalExists: Boolean(canonicalNote),
  })

  // Get save state from EntitySaveContext for "Last saved" display
  const { getSaveState } = useEntitySave()
  const saveState = getSaveState("note", note.id)

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(note.id, "note")

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Get current tags for the note
  const currentTags = note.tags || []
  const displayTags = currentTags
    .map(tagName => noteTags.find(t => t.name === tagName))
    .filter(Boolean) as NoteTag[]

  // Handle navigating to tags view
  const handleTagsClick = useCallback(() => {
    pushSidecar(<NoteTagsSidecar noteId={note.id} />, "Tags")
  }, [pushSidecar, note.id])

  const handleExportClick = useCallback(() => {
    pushSidecar(<NoteMarkdownExportSidecar noteId={note.id} noteTitle={note.title} />, "Export")
  }, [pushSidecar, note.id, note.title])

  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    deleteNote(note.id, {
      onSuccess: () => {
        navigateBack()
        if (workspaceId) {
          navigate(`/w/${workspaceId}/memos`)
        }
      },
    })
  }, [deleteNote, navigate, navigateBack, note.id, workspaceId])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  const baseActions = useMemo(() => {
    const actions: Array<{ key: string; onSelect: () => void }> = [
      { key: "tags", onSelect: handleTagsClick },
      { key: "export", onSelect: handleExportClick },
    ]

    if (workspaceId) {
      actions.push({
        key: "copy",
        onSelect: () => {
          const url = `${window.location.origin}/w/${workspaceId}/memos/${note.id}`
          navigator.clipboard.writeText(url).catch(() => {})
        },
      })
    }

    actions.push({
      key: "delete",
      onSelect: handleDeleteClick,
    })

    return actions
  }, [handleDeleteClick, handleTagsClick, handleExportClick, note.id, workspaceId])

  const baseActionStartIndex = draftActionCount
  const linksStartIndex = baseActionStartIndex + baseActions.length
  const deleteActionIndex = baseActionStartIndex + (workspaceId ? 3 : 2)
  const confirmDeleteIndex = deleteActionIndex + 1
  const cancelDeleteIndex = deleteActionIndex + 2
  const linksStartIndexWithDeleteRows = linksStartIndex + (showDeleteConfirm ? 2 : 0)

  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalNote) {
      return []
    }

    return [
      {
        label: "Title",
        localValue: note.title || "Untitled",
        serverValue: canonicalNote.content.title || "Untitled",
      },
    ]
  }, [draftState.isConflict, canonicalNote, note.title])

  const handleRetryDraft = useCallback(() => {
    retryDraft("note", note.id)
  }, [retryDraft, note.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("note", note.id)
  }, [discardDraft, note.id])

  const handleForceSave = useCallback(() => {
    if (!canonicalNote?.contentHash) {
      return
    }
    forceSaveWithExpectedHash("note", note.id, canonicalNote.contentHash)
  }, [canonicalNote?.contentHash, forceSaveWithExpectedHash, note.id])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("note", note.id)
  }, [restoreDraftAsNew, note.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  // Handle select via keyboard - maps index to action
  const handleSelect = useCallback(
    (index: number) => {
      if (index < draftActionCount) {
        if (draftState.isConflict) {
          if (index === 0) {
            handleForceSave()
          } else if (index === 1) {
            handleDiscardDraft()
          }
          return
        }

        if (draftState.isOrphaned) {
          if (index === 0) {
            handleRestore()
          } else if (index === 1) {
            handleDiscardDraft()
          }
          return
        }

        handleRetryDraft()
        return
      }

      if (index >= baseActionStartIndex && index < baseActionStartIndex + baseActions.length) {
        const action = baseActions[index - baseActionStartIndex]
        action?.onSelect()
        return
      }

      if (showDeleteConfirm) {
        if (index === confirmDeleteIndex) {
          handleConfirmDelete()
          return
        }
        if (index === cancelDeleteIndex) {
          handleCancelDelete()
        }
      }
    },
    [
      draftActionCount,
      draftState.isConflict,
      draftState.isOrphaned,
      handleDiscardDraft,
      handleForceSave,
      handleRestore,
      handleRetryDraft,
      baseActions,
      baseActionStartIndex,
      showDeleteConfirm,
      confirmDeleteIndex,
      cancelDeleteIndex,
      handleConfirmDelete,
      handleCancelDelete,
    ]
  )

  // Total item count: draft actions + base actions + links
  const totalItemCount = draftActionCount + baseActions.length + (showDeleteConfirm ? 2 : 0) + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      <DraftSidecarSection
        entityLabel={TOOL_LABELS_SINGULAR.memos}
        draftState={draftState}
        canonicalUpdatedAt={canonicalNote?.updatedAt}
        localUpdatedAt={
          draftState.draftEntity
            ? new Date(draftState.draftEntity.entity.updated_at)
            : note.updatedAt
              ? new Date(note.updatedAt)
              : undefined
        }
        diffRows={diffRows}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onForceSave={handleForceSave}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<Calendar size={12} />} label="Created" value={formatDate(note.createdAt)} />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Updated" value={formatDate(note.updatedAt)} />
          <SidecarMetaItem
            icon={
              saveState.isSaving ? (
                <Loader2 size={12} className={styles.sidecarSpinner} />
              ) : (
                <Save size={12} />
              )
            }
            label="Last saved"
            value={
              saveState.isSaving ? (
                "Saving..."
              ) : saveState.lastSavedAt ? (
                <RelativeTimestamp timestamp={saveState.lastSavedAt} />
              ) : (
                "—"
              )
            }
          />
          {displayTags.length > 0 && (
            <SidecarMetaItem
              icon={<Tag size={12} />}
              label="Tags"
              value={
                <div className={styles.sidecarTagsList}>
                  {displayTags.map(tag => (
                    <span key={tag.id} className={styles.sidecarTag} style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              }
            />
          )}
        </SidecarMetaList>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={baseActionStartIndex}
            icon={<Tag size={14} />}
            title="Tags"
            meta={currentTags.length > 0 ? String(currentTags.length) : undefined}
            onClick={handleTagsClick}
          />
          <SidecarRow
            index={baseActionStartIndex + 1}
            icon={<Download size={14} />}
            title="Export"
            onClick={handleExportClick}
            testId="note-export-open"
          />
          {workspaceId && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="memos"
              entityId={note.id}
              index={baseActionStartIndex + 2}
            />
          )}
          <SidecarRow
            index={baseActionStartIndex + (workspaceId ? 3 : 2)}
            icon={<Trash2 size={14} />}
            title="Delete"
            isDestructive
            onClick={handleDeleteClick}
            disabled={isDeleting}
            testId="note-delete-button"
          />
          {showDeleteConfirm && (
            <>
              <SidecarRow
                index={confirmDeleteIndex}
                title="Confirm"
                onClick={handleConfirmDelete}
                isDestructive
                isSubRow
                disabled={isDeleting}
                testId="note-delete-confirm"
              />
              <SidecarRow
                index={cancelDeleteIndex}
                title="Cancel"
                onClick={handleCancelDelete}
                isSubRow
                disabled={isDeleting}
                testId="note-delete-cancel"
              />
            </>
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={note.id} entityType="note" startIndex={linksStartIndexWithDeleteRows} />
    </Sidecar>
  )
}

/**
 * NoteTagsSidecar allows adding/removing tags from a note.
 * This is a deeper view pushed onto the sidecar stack.
 */
interface NoteTagsSidecarProps {
  noteId: string
}

function NoteTagsSidecar({ noteId }: NoteTagsSidecarProps) {
  const { noteTags, createNoteTag } = useUIStore()
  const { data: notes = [] } = useNotes()
  const { mutate: updateNote } = useUpdateNote()
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Get current note and its tags (memoized to prevent useCallback dependency issues)
  const note = notes.find((n: Note) => n.id === noteId)
  const currentTags = useMemo(() => note?.tags || [], [note?.tags])

  // Available tags that aren't already on the note
  const availableTags = noteTags.filter(t => !currentTags.includes(t.name))
  const totalSelectableItems = availableTags.length + 1 // +1 for "Create new tag"

  // Focus input when creating
  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  // Add a tag to the note
  const handleAddTag = useCallback(
    (tagName: string) => {
      if (note) {
        updateNote({ noteId, updates: { tags: [...currentTags, tagName] } })
      }
    },
    [note, noteId, currentTags, updateNote]
  )

  // Remove a tag from the note
  const handleRemoveTag = useCallback(
    (tagName: string) => {
      if (note) {
        updateNote({
          noteId,
          updates: { tags: currentTags.filter((t: string) => t !== tagName) },
        })
      }
    },
    [note, noteId, currentTags, updateNote]
  )

  // Create a new tag and add it to the note
  const handleCreateTag = useCallback(() => {
    if (newTagName.trim()) {
      const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1"]
      const color = colors[Math.floor(Math.random() * colors.length)]
      const newTag = createNoteTag(newTagName.trim(), color)
      handleAddTag(newTag.name)
      setNewTagName("")
      setIsCreating(false)
    }
  }, [newTagName, createNoteTag, handleAddTag])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (isCreating) return
      if (index === availableTags.length) {
        // Create new tag button
        setIsCreating(true)
      } else if (index < availableTags.length) {
        const tag = availableTags[index]
        if (tag) {
          handleAddTag(tag.name)
        }
      }
    },
    [isCreating, availableTags, handleAddTag]
  )

  if (!note) {
    return <div className={styles.sidecarEmpty}>{MEMO_LABEL} not found</div>
  }

  return (
    <Sidecar itemCount={totalSelectableItems} onSelect={handleSelect}>
      {/* Current tags section - shows tags already on the note with remove buttons */}
      {currentTags.length > 0 && (
        <SidecarSection title="Current Tags">
          <div className={styles.sidecarCurrentTags}>
            {currentTags.map((tagName: string) => {
              const tag = noteTags.find(t => t.name === tagName)
              return (
                <div key={tagName} className={styles.sidecarCurrentTag}>
                  <span className={styles.sidecarTag} style={{ backgroundColor: tag?.color || "#6b7280" }}>
                    {tagName}
                  </span>
                  <button
                    className={styles.sidecarTagRemove}
                    onClick={() => handleRemoveTag(tagName)}
                    title="Remove tag"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </SidecarSection>
      )}

      {/* Add tags section */}
      <SidecarSection title="Add Tags">
        {isCreating ? (
          <div className={styles.sidecarTagInput}>
            <input
              ref={inputRef}
              type="text"
              className={styles.sidecarTagInputField}
              placeholder="New tag name..."
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  handleCreateTag()
                } else if (e.key === "Escape") {
                  setIsCreating(false)
                  setNewTagName("")
                }
              }}
            />
          </div>
        ) : (
          <SidecarMenu>
            {availableTags.map((tag, index) => (
              <SidecarRow
                key={tag.id}
                index={index}
                icon={<span className={styles.sidecarTagColor} style={{ backgroundColor: tag.color }} />}
                title={tag.name}
                onClick={() => handleAddTag(tag.name)}
              />
            ))}

            <SidecarRow
              index={availableTags.length}
              icon={<Plus size={14} />}
              title="Create new tag"
              onClick={() => setIsCreating(true)}
            />
          </SidecarMenu>
        )}

        {availableTags.length === 0 && !isCreating && (
          <div className={styles.sidecarEmpty}>All tags have been added</div>
        )}
      </SidecarSection>
    </Sidecar>
  )
}
