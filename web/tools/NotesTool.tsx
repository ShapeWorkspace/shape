import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useNotes, useCreateNote, useUpdateNote, useNoteBlocksFromCacheOnly } from "../store/queries/use-notes"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useUIStore } from "../store/ui-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useDraftInfoMap, isDraftTransient, type DraftInfo } from "../hooks/useDraftInfoMap"
import { Note, NoteTag } from "../store/types"
import { StickyNote, Plus, Pin } from "lucide-react"
import { List, ListRow, ListHeader, ListSearch, ListEmpty, CustomListContent, ListStickyHeader } from "../components/ListUI"
import { NoteSidecar } from "../components/NoteSidecar"
import { SearchResults } from "../components/SearchResults"
import { TipTapEditor } from "../components/TipTapEditor"
import { useAppSearch, type EnrichedSearchResult } from "../hooks/use-search"
import { useNoteYjs } from "../hooks/useNoteYjs"
import { useSyncEntityLinks } from "../store/queries/use-entity-links"
import { useEntitySave } from "../contexts/EntitySaveContext"
import { extractLinkedEntitiesFromMonitor } from "../lib/extract-entity-links"
import type { LinkChangeEvent } from "../components/tiptap-extensions/EntityLinkMonitorPlugin"
import { AUTOSAVE_DEBOUNCE_MS } from "../constants/save"
import { TOOL_LABELS, MEMO_LABEL, MEMOS_LABEL } from "../constants/tool-labels"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { useRegisterEntityExportSnapshot } from "../hooks/useRegisterEntityExportSnapshot"
import { useExportPlaintextSnapshot } from "../store/export-snapshot-store"
import { useEntityBlocksPlaintext } from "../hooks/useEntityBlocksPlaintext"
import { truncateText } from "../utils/text-utils"
import * as noteStyles from "../styles/notes.css"
import * as listStyles from "../styles/list.css"

/**
 * Maximum characters for an untitled note's body preview in the list.
 */
const NOTE_LIST_BODY_PREVIEW_MAX_LENGTH = 80

/**
 * Normalize plaintext for single-line list display and clamp length.
 */
function buildNoteListBodyPreviewFromPlaintext(plaintext: string): string {
  const normalizedPlaintext = plaintext.replace(/\s+/g, " ").trim()
  if (!normalizedPlaintext) {
    return ""
  }
  return truncateText(normalizedPlaintext, NOTE_LIST_BODY_PREVIEW_MAX_LENGTH)
}

interface UseNoteBodyPreviewFromBlocksOptions {
  noteId: string
  shouldLoadBodyPreviewFromBlocks: boolean
}

/**
 * Build a plaintext preview for an untitled note by decoding its encrypted blocks.
 * This runs only when the note has no title to avoid unnecessary decryption work.
 */
function useNoteBodyPreviewFromBlocks({
  noteId,
  shouldLoadBodyPreviewFromBlocks,
}: UseNoteBodyPreviewFromBlocksOptions) {
  const {
    data: blocks,
    isLoading: isBlocksLoading,
    error: blocksError,
  } = useNoteBlocksFromCacheOnly(noteId, { enabled: shouldLoadBodyPreviewFromBlocks })
  const { plaintext, isLoading: isPlaintextLoading } = useEntityBlocksPlaintext({
    blocks,
    isBlocksLoading: isBlocksLoading,
    blocksError: blocksError instanceof Error ? blocksError : null,
  })

  const bodyPreviewText = useMemo(() => buildNoteListBodyPreviewFromPlaintext(plaintext), [plaintext])

  return {
    previewText: bodyPreviewText,
    isLoading: isBlocksLoading || isPlaintextLoading,
  }
}

/**
 * NotesTool displays and manages notes.
 * Uses the standard List pattern with ListRow children.
 * When viewing a specific note, displays NoteEditor wrapped in CustomListContent.
 */
export function NotesTool() {
  const { itemId } = useParams<{ itemId?: string }>()
  const navigate = useNavigate()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const { navigateTo } = useWindowStore()
  const { noteTags, togglePin } = useUIStore()
  const { setSidecar, clearSidecar } = useSidecar()

  // Build draft info map for notes (includes auto-refresh on transient window expiry)
  const noteDraftInfoById = useDraftInfoMap({ entityType: "note" })

  // TanStack Query hooks for data fetching and mutations
  const { data: notes = [], isLoading } = useNotes()
  const createNoteMutation = useCreateNote()
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  // FlexSearch-based search for notes
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isActive: isSearchActive,
  } = useAppSearch({
    entityTypes: ["note"],
  })

  // Handle search input focus
  const handleSearchFocusChange = useCallback(
    (focused: boolean) => {
      setIsSearchFocused(focused)
    },
    []
  )

  // Show sidecar when viewing a specific note
  useEffect(() => {
    if (itemId) {
      const note = notes.find((n: Note) => n.id === itemId)
      if (note) {
        setSidecar(<NoteSidecar note={note} />, "Info")
      }
    } else {
      // Clear sidecar when not viewing a specific note
      clearSidecar()
    }
  }, [itemId, notes, setSidecar, clearSidecar])

  // Clear sidecar on unmount
  useEffect(() => {
    return () => clearSidecar()
  }, [clearSidecar])

  // Creates a new note and navigates to it via URL
  const handleCreate = useCallback(async () => {
    if (!workspaceId) return

    try {
      const createdNote = createNoteMutation.createOptimistically({ title: "" })
      navigateTo({
        id: createdNote.id,
        label: createdNote.title,
        tool: "memos",
        itemId: createdNote.id,
      })
      navigate(`/w/${workspaceId}/memos/${createdNote.id}`)
      await createdNote.promise
    } catch (error) {
      console.error("Failed to create note:", error)
    }
  }, [createNoteMutation, navigateTo, navigate, workspaceId])

  // Selects and navigates to a note via URL
  const handleSelect = useCallback(
    (note: Note, displayLabelOverride?: string) => {
      if (!workspaceId) return
      const resolvedDisplayLabel = displayLabelOverride ?? note.title
      navigateTo({
        id: note.id,
        label: resolvedDisplayLabel,
        tool: "memos",
        itemId: note.id,
      })
      navigate(`/w/${workspaceId}/memos/${note.id}`)
    },
    [navigateTo, navigate, workspaceId]
  )

  // Handles clicking on a search result to navigate to the note
  const handleSearchResultClick = useCallback(
    (result: EnrichedSearchResult) => {
      if (!workspaceId) return
      navigateTo({
        id: result.entityId,
        label: result.title,
        tool: "memos",
        itemId: result.entityId,
      })
      navigate(`/w/${workspaceId}/memos/${result.entityId}`)
    },
    [navigateTo, navigate, workspaceId]
  )

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Filter notes by tag (search is now handled by FlexSearch)
  const filterNotes = useCallback(
    (notesToFilter: Note[]) => {
      let filtered = notesToFilter
      if (activeTagFilter) {
        filtered = filtered.filter(n => n.tags?.includes(activeTagFilter))
      }
      return filtered
    },
    [activeTagFilter]
  )

  // Sort: draft creates first, then pinned, then by updatedAt
  const sortedNotes = [...notes].sort((a, b) => {
    const aDraftCreate = noteDraftInfoById.get(a.id)?.formedOnHash === null
    const bDraftCreate = noteDraftInfoById.get(b.id)?.formedOnHash === null
    if (aDraftCreate && !bDraftCreate) return -1
    if (!aDraftCreate && bDraftCreate) return 1
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.updatedAt - a.updatedAt
  })

  const filteredNotes = filterNotes(sortedNotes).filter(note => {
    const draftInfo = noteDraftInfoById.get(note.id)
    // Hide notes with pending deletion drafts only after the transient window
    if (!draftInfo?.deleteEntity) {
      return true
    }
    return isDraftTransient(draftInfo)
  })
  const pinnedNotes = filteredNotes.filter(n => n.pinned)
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned)

  // Build flat list for keyboard navigation, memoized to avoid recreation on each render
  // Index assignment: create button (0), then pinnedNotes..., unpinnedNotes...
  const allItems = useMemo(() => [...pinnedNotes, ...unpinnedNotes], [pinnedNotes, unpinnedNotes])
  const itemCount = 1 + allItems.length // 1 for "new note" at the top

  // Handle selection by index
  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index === 0) {
        handleCreate()
        return
      }
      const noteIndex = index - 1
      if (noteIndex < allItems.length) {
        const note = allItems[noteIndex]
        if (note) {
          handleSelect(note)
        }
      }
    },
    [allItems, handleSelect, handleCreate]
  )

  // If viewing a specific note, render the editor wrapped in CustomListContent
  if (itemId) {
    const note = notes.find((n: Note) => n.id === itemId)
    if (!note)
      return (
        <CustomListContent testId="notes-tool-container">
          <div>{MEMO_LABEL} not found</div>
        </CustomListContent>
      )
    return (
      <CustomListContent testId="notes-tool-container">
        <NoteEditor key={note.id} note={note} />
      </CustomListContent>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <List itemCount={0} testId="notes-tool-container">
        <ListEmpty message={`Loading ${MEMOS_LABEL.toLowerCase()}...`} />
      </List>
    )
  }

  return (
    <List
      itemCount={itemCount}
      onSelect={handleSelectByIndex}
      disableKeyboard={isSearchFocused}
      testId="notes-tool-container"
    >
      {/* Sticky header with tag filters, search, and new memo action */}
      <ListStickyHeader>
        {/* Tag Filters */}
        {noteTags.length > 0 && (
          <div className={noteStyles.noteTagsFilter}>
            <button
              className={noteStyles.noteTagBtn}
              data-active={activeTagFilter === null}
              onClick={() => setActiveTagFilter(null)}
            >
              All
            </button>
            {noteTags.map((tag: NoteTag) => (
              <button
                key={tag.id}
                className={noteStyles.noteTagBtn}
                data-active={activeTagFilter === tag.name}
                onClick={() => setActiveTagFilter(activeTagFilter === tag.name ? null : tag.name)}
                style={
                  activeTagFilter === tag.name
                    ? { backgroundColor: tag.color, borderColor: tag.color }
                    : undefined
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <ListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={`Search ${MEMOS_LABEL.toLowerCase()}...`}
          onFocusChange={handleSearchFocusChange}
          testId="notes-search-input"
        />

        {/* New memo action at top */}
        <ListRow
          index={0}
          icon={<Plus size={16} />}
          title="New memo"
          isCreateAction
          onClick={handleCreate}
          testId="new-note-button"
        />
      </ListStickyHeader>

      {/* FlexSearch Results - shown when search is active */}
      {isSearchActive && (
        <SearchResults results={searchResults} onResultClick={handleSearchResultClick} groupByType={false} />
      )}

      {/* Normal Note List - hidden when search is active */}
      {!isSearchActive && (
        <>
          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && <ListHeader title="Pinned" />}
          {pinnedNotes.map((note, idx) => (
            <NoteListRow
              key={note.id}
              note={note}
              index={1 + idx}
              noteTags={noteTags}
              formatDate={formatDate}
              onSelect={displayLabel => handleSelect(note, displayLabel)}
              onTogglePin={() => togglePin("memos", note.id)}
              draftInfo={noteDraftInfoById.get(note.id)}
            />
          ))}

          {/* Unpinned Notes */}
          {unpinnedNotes.length > 0 && pinnedNotes.length > 0 && <ListHeader title={TOOL_LABELS.memos} />}
          {unpinnedNotes.map((note, idx) => (
            <NoteListRow
              key={note.id}
              note={note}
              index={1 + pinnedNotes.length + idx}
              noteTags={noteTags}
              formatDate={formatDate}
              onSelect={displayLabel => handleSelect(note, displayLabel)}
              onTogglePin={() => togglePin("memos", note.id)}
              draftInfo={noteDraftInfoById.get(note.id)}
            />
          ))}

          {/* Empty State */}
          {allItems.length === 0 && (
            <ListEmpty message={activeTagFilter ? `No ${TOOL_LABELS.memos.toLowerCase()} with this tag` : `No ${TOOL_LABELS.memos.toLowerCase()} yet`} />
          )}
        </>
      )}
    </List>
  )
}

/**
 * Props for NoteListRow component.
 */
interface NoteListRowProps {
  note: Note
  index: number
  noteTags: NoteTag[]
  formatDate: (timestamp: number) => string
  onSelect: (label: string) => void
  onTogglePin: () => void
  draftInfo?: DraftInfo
}

/**
 * NoteListRow displays a single note in the list with tags and pin button.
 * Uses ListRow as base with custom accessory for pin button.
 */
function NoteListRow({
  note,
  index,
  noteTags,
  formatDate,
  onSelect,
  onTogglePin,
  draftInfo,
}: NoteListRowProps) {
  const tags = note.tags?.map(tagName => noteTags.find(t => t.name === tagName)).filter(Boolean) || []
  const isTransient = isDraftTransient(draftInfo)
  const showDraftBadge = draftInfo?.hasDraft && !isTransient
  const showPendingDeletion = draftInfo?.deleteEntity && !isTransient
  const rawTitle = note.title
  const shouldUseBodyPreviewAsTitle = rawTitle.trim().length === 0
  const { previewText: bodyPreviewText } = useNoteBodyPreviewFromBlocks({
    noteId: note.id,
    shouldLoadBodyPreviewFromBlocks: shouldUseBodyPreviewAsTitle,
  })
  const baseTitle = shouldUseBodyPreviewAsTitle ? bodyPreviewText : rawTitle
  const displayTitle = showPendingDeletion
    ? baseTitle
      ? `${baseTitle} — Pending deletion`
      : "Pending deletion"
    : baseTitle

  return (
    <ListRow
      index={index}
      icon={<StickyNote size={16} />}
      title={displayTitle}
      meta={formatDate(note.updatedAt)}
      onClick={() => onSelect(displayTitle)}
      testId="note-list-item"
      accessory={
        <button
          className={listStyles.listItemPin}
          data-pinned={note.pinned}
          onClick={e => {
            e.stopPropagation()
            onTogglePin()
          }}
          title={note.pinned ? "Unpin" : "Pin"}
        >
          <Pin size={14} />
        </button>
      }
    >
      {/* Tags rendered between title and meta */}
      {tags.length > 0 && (
        <div className={noteStyles.noteTags}>
          {tags.map(
            tag =>
              tag && (
                <span key={tag.id} className={noteStyles.noteTag} style={{ backgroundColor: tag.color }}>
                  {tag.name}
                </span>
              )
          )}
        </div>
      )}
      {showDraftBadge && (
        <span className={noteStyles.noteDraftBadge} data-testid="note-draft-badge">
          Draft
        </span>
      )}
    </ListRow>
  )
}

interface NoteEditorProps {
  note: Note
}

/**
 * NoteEditor component with debounced autosave.
 * Updates are persisted to the server after 750ms of idle time.
 * This is a "terminus" view - the end of the navigation stack.
 */
function NoteEditor({ note }: NoteEditorProps) {
  const { currentUser } = useAuthStore()
  const currentUserId = currentUser?.uuid
  const mentionSuggestionContext = useMemo<MentionSuggestionContext | undefined>(() => {
    if (!currentUserId) {
      return undefined
    }
    return {
      contextType: "static",
      userIds: [currentUserId],
    }
  }, [currentUserId])
  const { updateCurrentItemLabel } = useWindowStore()
  const updateNoteMutation = useUpdateNote()
  const { mutate: syncLinks } = useSyncEntityLinks()
  const { reportSavingStarted, reportSavingCompleted } = useEntitySave()

  // Local state for immediate UI updates
  const [localTitle, setLocalTitle] = useState(note.title)
  const linkSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAttemptedTitleRef = useRef<string | null>(null)

  // Sync local state when note prop changes (e.g., navigating between notes)
  useEffect(() => {
    setLocalTitle(note.title)
  }, [note.id, note.title])

  const {
    ydoc,
    error: yjsError,
    isSavingBlocks,
  } = useNoteYjs({
    noteId: note.id,
    title: localTitle,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  })

  useRegisterEntityExportSnapshot({
    entityType: "note",
    entityId: note.id,
    ydoc,
    title: localTitle,
  })

  const plaintextSnapshotForNote = useExportPlaintextSnapshot("note", note.id) ?? ""
  const bodyPreviewForUntitledNote = useMemo(() => {
    return buildNoteListBodyPreviewFromPlaintext(plaintextSnapshotForNote)
  }, [plaintextSnapshotForNote])
  // Use the body preview for breadcrumbs/window labels when the title is blank.
  const displayLabelForBreadcrumbsAndWindows =
    localTitle.trim().length > 0 ? localTitle : bodyPreviewForUntitledNote

  const isSavingTitle = updateNoteMutation.isPending
  const isSaving = isSavingTitle || isSavingBlocks

  // Track previous saving state to detect transitions
  const wasSavingRef = useRef(false)

  // Report save state changes to EntitySaveContext for sidecar display
  useEffect(() => {
    if (isSaving && !wasSavingRef.current) {
      // Transition from not saving to saving
      reportSavingStarted("note", note.id)
    } else if (!isSaving && wasSavingRef.current) {
      // Transition from saving to not saving
      reportSavingCompleted("note", note.id)
    }
    wasSavingRef.current = isSaving
  }, [isSaving, note.id, reportSavingStarted, reportSavingCompleted])

  // Keep breadcrumbs and window labels in sync with the live title or body preview.
  useEffect(() => {
    updateCurrentItemLabel(displayLabelForBreadcrumbsAndWindows)
  }, [displayLabelForBreadcrumbsAndWindows, updateCurrentItemLabel])

  useEffect(() => {
    const pendingTitle = localTitle

    if (pendingTitle === note.title) {
      lastAttemptedTitleRef.current = null
      return
    }

    if (pendingTitle === lastAttemptedTitleRef.current) {
      return
    }

    if (updateNoteMutation.isPending) {
      return
    }

    const timeoutId = setTimeout(() => {
      lastAttemptedTitleRef.current = pendingTitle
      updateNoteMutation.mutate(
        { noteId: note.id, updates: { title: pendingTitle } },
        {
          onSuccess: () => {
            lastAttemptedTitleRef.current = null
          },
        }
      )
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timeoutId)
  }, [localTitle, note.id, note.title, note.contentHash, updateNoteMutation])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setLocalTitle(newTitle)
  }

  const handleLinkChange = useCallback(
    (event: LinkChangeEvent) => {
      if (linkSyncTimeoutRef.current) {
        clearTimeout(linkSyncTimeoutRef.current)
      }

      linkSyncTimeoutRef.current = setTimeout(() => {
        const linkedEntities = extractLinkedEntitiesFromMonitor(event.allLinks)
        syncLinks({
          entityId: note.id,
          sourceEntityType: "note",
          linkedEntities,
        })
      }, 1000)
    },
    [note.id, syncLinks]
  )

  useEffect(() => {
    return () => {
      if (linkSyncTimeoutRef.current) {
        clearTimeout(linkSyncTimeoutRef.current)
      }
    }
  }, [])

  if (yjsError) {
    return <div className={noteStyles.noteEditor}>Failed to load note: {yjsError}</div>
  }

  return (
    <div className={noteStyles.noteEditor}>
      {/* Scroll area containing title and editor */}
      <div className={noteStyles.noteEditorScrollArea}>
        <input
          className={noteStyles.noteTitle}
          type="text"
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Add a title"
          data-testid="note-title-input"
        />
        {/* TipTap editor - frameless, no toolbar */}
        <TipTapEditor
          placeholder="Start typing..."
          autoFocus
          showToolbar={false}
          collaboration={{ ydoc }}
          onLinkChange={handleLinkChange}
          fileAttachment={{
            entityId: note.id,
            entityType: "note",
          }}
          mentionSuggestionContext={mentionSuggestionContext}
          className={noteStyles.noteEditorContent}
          testId="note-content"
        />
      </div>
    </div>
  )
}
