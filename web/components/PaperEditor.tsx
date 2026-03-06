/**
 * PaperEditor renders the shared rich text document editor for papers.
 * Used by both PapersTool and FilesTool.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { SelectionBookmark } from "@tiptap/pm/state"
import { useWindowStore } from "../store/window-store"
import { useFocus } from "../contexts/FocusContext"
import { useSidecar, useSidecarLayout } from "../contexts/SidecarContext"
import { useEntitySave } from "../contexts/EntitySaveContext"
import { usePaperYjs } from "../hooks/usePaperYjs"
import { useRegisterEntityExportSnapshot } from "../hooks/useRegisterEntityExportSnapshot"
import { useUpdatePaper, useUpdatePaperMentions } from "../store/queries/use-papers"
import {
  usePaperComments,
  usePaperCommentReplies,
  useCreatePaperComment,
  useUpdatePaperComment,
  useDeletePaperComment,
  useCreatePaperCommentReply,
  useUpdatePaperCommentReply,
  useDeletePaperCommentReply,
} from "../store/queries/use-paper-comments"
import { usePaperACLEntries } from "../store/queries/use-paper-acl"
import { useSyncEntityLinks } from "../store/queries/use-entity-links"
import { extractLinkedEntitiesFromMonitor } from "../lib/extract-entity-links"
import type { LinkChangeEvent } from "./tiptap-extensions/EntityLinkMonitorPlugin"
import type { MentionedUserIdChangeEvent } from "./tiptap-extensions/MentionMonitorPlugin"
import { PaperSidecar } from "./PaperSidecar"
import { PaperCommentsSidecar } from "./PaperCommentsSidecar"
import { PaperCommentDetailSidecar, PaperCommentReplyDetailSidecar } from "./PaperCommentDetailSidecar"
import { TipTapEditor } from "./TipTapEditor"
import { EditorToolbar } from "./EditorToolbar"
import { AUTOSAVE_DEBOUNCE_MS } from "../constants/save"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { useAuthStore } from "../store/auth-store"
import type { DecryptedPaper, DecryptedPaperComment, DecryptedPaperCommentReply } from "../../engine/models/entity"
import * as paperStyles from "../styles/paper.css"
import { useEngineStore } from "@/store"

interface PaperEditorProps {
  paper: DecryptedPaper
}

const PAPER_COMMENT_MARK_NAME = "paperComment"

function buildPaperCommentAnchorData(doc: ProseMirrorNode): {
  anchorPreviewByCommentId: Map<string, string>
  anchorPositionByCommentId: Map<string, number>
} {
  const anchorPreviewByCommentId = new Map<string, string>()
  const anchorPositionByCommentId = new Map<string, number>()
  const previewChunksByCommentId = new Map<string, string[]>()

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText) {
      return
    }

    for (const mark of node.marks) {
      if (mark.type.name !== PAPER_COMMENT_MARK_NAME) {
        continue
      }

      const commentId = typeof mark.attrs.commentId === "string" ? mark.attrs.commentId : null
      if (!commentId) {
        continue
      }

      const existingPosition = anchorPositionByCommentId.get(commentId)
      if (existingPosition === undefined || pos < existingPosition) {
        anchorPositionByCommentId.set(commentId, pos)
      }

      const textValue = node.text ?? ""
      if (textValue.trim().length > 0) {
        const chunks = previewChunksByCommentId.get(commentId) ?? []
        chunks.push(textValue)
        previewChunksByCommentId.set(commentId, chunks)
      }
    }
  })

  for (const [commentId, chunks] of previewChunksByCommentId.entries()) {
    const previewText = chunks.join("").replace(/\s+/g, " ").trim()
    if (previewText) {
      anchorPreviewByCommentId.set(commentId, previewText)
    }
  }

  return { anchorPreviewByCommentId, anchorPositionByCommentId }
}

// Overlap detection considers only unresolved comment marks.
function doesSelectionOverlapComment(editor: Editor): boolean {
  const { selection } = editor.state
  if (selection.empty) {
    return false
  }

  let hasOverlap = false

  editor.state.doc.nodesBetween(selection.from, selection.to, node => {
    if (hasOverlap || !node.isText) {
      return
    }

    for (const mark of node.marks) {
      if (mark.type.name !== PAPER_COMMENT_MARK_NAME) {
        continue
      }
      if (mark.attrs?.resolved === true) {
        continue
      }
      hasOverlap = true
      return
    }
  })

  return hasOverlap
}

function applyPaperCommentMarkFromBookmark(
  editor: Editor,
  bookmark: SelectionBookmark | null,
  commentId: string
): boolean {
  if (!bookmark) {
    return false
  }

  try {
    const resolvedSelection = bookmark.resolve(editor.state.doc)
    if (resolvedSelection.empty) {
      return false
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: resolvedSelection.from, to: resolvedSelection.to })
      .setMark(PAPER_COMMENT_MARK_NAME, { commentId, resolved: false })
      .run()

    return true
  } catch {
    return false
  }
}

function updatePaperCommentMarkResolvedState(editor: Editor, commentId: string, resolved: boolean): void {
  const markType = editor.schema.marks[PAPER_COMMENT_MARK_NAME]
  if (!markType) {
    return
  }

  const tr = editor.state.tr

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (!node.isText) {
      return
    }

    const hasCommentMark = node.marks.some(mark => {
      return mark.type === markType && mark.attrs.commentId === commentId
    })

    if (!hasCommentMark) {
      return
    }

    const from = pos
    const to = pos + node.nodeSize
    tr.removeMark(from, to, markType)
    tr.addMark(from, to, markType.create({ commentId, resolved }))
  })

  if (tr.steps.length > 0) {
    editor.view.dispatch(tr)
  }
}

function removePaperCommentMark(editor: Editor, commentId: string): void {
  const markType = editor.schema.marks[PAPER_COMMENT_MARK_NAME]
  if (!markType) {
    return
  }

  const tr = editor.state.tr

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (!node.isText) {
      return
    }

    const hasCommentMark = node.marks.some(mark => {
      return mark.type === markType && mark.attrs.commentId === commentId
    })

    if (!hasCommentMark) {
      return
    }

    tr.removeMark(pos, pos + node.nodeSize, markType)
  })

  if (tr.steps.length > 0) {
    editor.view.dispatch(tr)
  }
}

function getSelectionPreviewTextForComment(editor: Editor): string | null {
  const { selection } = editor.state
  if (selection.empty) {
    return null
  }

  const rawPreview = editor.state.doc.textBetween(selection.from, selection.to, " ")
  const normalizedPreview = rawPreview.replace(/\s+/g, " ").trim()
  return normalizedPreview.length > 0 ? normalizedPreview : null
}

function syncPaperCommentResolvedStateInDocument(
  editor: Editor,
  resolvedStateByCommentId: Map<string, boolean>
): void {
  const markType = editor.schema.marks[PAPER_COMMENT_MARK_NAME]
  if (!markType) {
    return
  }

  let transaction = editor.state.tr
  let hasChanges = false

  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, pos) => {
    if (!node.isText) {
      return
    }

    for (const mark of node.marks) {
      if (mark.type !== markType) {
        continue
      }

      const commentId = typeof mark.attrs.commentId === "string" ? mark.attrs.commentId : null
      if (!commentId) {
        continue
      }

      const desiredResolved = resolvedStateByCommentId.get(commentId)
      if (desiredResolved === undefined) {
        continue
      }

      const currentResolved = mark.attrs.resolved === true
      if (currentResolved === desiredResolved) {
        continue
      }

      transaction = transaction.removeMark(pos, pos + node.nodeSize, markType)
      transaction = transaction.addMark(
        pos,
        pos + node.nodeSize,
        markType.create({ commentId, resolved: desiredResolved })
      )
      hasChanges = true
    }
  })

  if (hasChanges) {
    editor.view.dispatch(transaction)
  }
}

function pickOldestCommentId(commentIds: string[], comments: DecryptedPaperComment[]): string | null {
  if (commentIds.length === 0) {
    return null
  }

  const commentsById = new Map<string, DecryptedPaperComment>()
  for (const comment of comments) {
    commentsById.set(comment.id, comment)
  }

  let oldest: DecryptedPaperComment | null = null
  for (const commentId of commentIds) {
    const comment = commentsById.get(commentId)
    if (!comment) {
      continue
    }
    if (!oldest || comment.createdAt.getTime() < oldest.createdAt.getTime()) {
      oldest = comment
    }
  }

  return oldest?.id ?? commentIds[0]
}

function getEventTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target
  }
  return null
}

/**
 * PaperEditor is a terminus view for rich text document editing with TipTap + Yjs.
 * Sets the sidecar with paper metadata and actions when mounted.
 */
export function PaperEditor({ paper }: PaperEditorProps) {
  const [title, setTitle] = useState(paper.content.name)
  const [editor, setEditor] = useState<Editor | null>(null)
  const updatePaperMutation = useUpdatePaper()
  const updatePaperMentionsMutation = useUpdatePaperMentions()
  const { mutate: syncLinks } = useSyncEntityLinks()
  const { setSidecar, clearSidecar, replaceSidecarStack } = useSidecar()
  const { stack: sidecarStack } = useSidecarLayout()
  const { isContentFocused } = useFocus()
  const { reportSavingStarted, reportSavingCompleted } = useEntitySave()
  const { currentUser } = useAuthStore()
  const { application } = useEngineStore()
  const { updateCurrentItemLabel, updateCurrentItemContext, getCurrentItem } = useWindowStore()
  const currentNavigationItem = getCurrentItem()
  const commentIdFromNavigation = currentNavigationItem?.commentId ?? null
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const linkSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mentionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMentionedUserIdsRef = useRef<Set<string>>(new Set())
  const pendingCommentSelectionRef = useRef<SelectionBookmark | null>(null)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(() => {
    return {
      contextType: "acl",
      resourceType: "paper",
      resourceId: paper.id,
    }
  }, [paper.id])
  const { data: paperAclEntries = [] } = usePaperACLEntries(paper.id)
  const { data: paperComments = [] } = usePaperComments(paper.id)
  const createPaperCommentMutation = useCreatePaperComment()
  const updatePaperCommentMutation = useUpdatePaperComment()
  const deletePaperCommentMutation = useDeletePaperComment()
  const createPaperCommentReplyMutation = useCreatePaperCommentReply()
  const updatePaperCommentReplyMutation = useUpdatePaperCommentReply()
  const deletePaperCommentReplyMutation = useDeletePaperCommentReply()
  const [commentSidecarMode, setCommentSidecarMode] = useState<"none" | "list" | "detail" | "new">("none")
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null)
  const [pendingCommentAnchorPreview, setPendingCommentAnchorPreview] = useState<string | null>(null)
  const [commentAnchorDocVersion, setCommentAnchorDocVersion] = useState(0)
  const [editorUpdateVersion, setEditorUpdateVersion] = useState(0)
  const [isCreateCommentDisabled, setIsCreateCommentDisabled] = useState(true)
  const { data: activeCommentReplies = [] } = usePaperCommentReplies(activeCommentId ?? "")
  const activeComment = useMemo(() => {
    if (!activeCommentId) {
      return null
    }
    return paperComments.find(comment => comment.id === activeCommentId) ?? null
  }, [activeCommentId, paperComments])
  const activeReply = useMemo(() => {
    if (!activeReplyId) {
      return null
    }
    return activeCommentReplies.find(reply => reply.id === activeReplyId) ?? null
  }, [activeCommentReplies, activeReplyId])
  const replyNavigationPendingRef = useRef(false)
  const commentDetailNavigationPendingRef = useRef(false)

  useEffect(() => {
    setActiveReplyId(null)
    replyNavigationPendingRef.current = false
  }, [activeCommentId])

  useEffect(() => {
    if (!activeReplyId) {
      return
    }
    const stillExists = activeCommentReplies.some(reply => reply.id === activeReplyId)
    if (!stillExists) {
      setActiveReplyId(null)
    }
  }, [activeCommentReplies, activeReplyId])
  const previousCommentSidecarModeRef = useRef(commentSidecarMode)
  const unresolvedCommentCount = useMemo(() => {
    return paperComments.filter(comment => !(comment.metaFields.resolved ?? false)).length
  }, [paperComments])
  const hasWriteAccessToPaper = useMemo(() => {
    if (!currentUser) {
      return false
    }
    if (!application?.isWorkspaceRemote()) {
      return true
    }
    if (paper.creatorId === currentUser.uuid) {
      return true
    }

    const userEntry = paperAclEntries.find(
      entry => entry.subjectType === "user" && entry.subjectId === currentUser.uuid
    )
    if (userEntry && (userEntry.permission === "write" || userEntry.permission === "admin")) {
      return true
    }

    const everyoneTeamEntry = paperAclEntries.find(entry => {
      if (entry.subjectType !== "team") {
        return false
      }
      if (entry.team?.teamType !== "everyone") {
        return false
      }
      return entry.permission === "write" || entry.permission === "admin"
    })

    return Boolean(everyoneTeamEntry)
  }, [application, currentUser, paper.creatorId, paperAclEntries])

  const { anchorPreviewByCommentId, anchorPositionByCommentId } = useMemo(() => {
    if (!editor) {
      return {
        anchorPreviewByCommentId: new Map<string, string>(),
        anchorPositionByCommentId: new Map<string, number>(),
      }
    }
    return buildPaperCommentAnchorData(editor.state.doc)
  }, [editor, paperComments, commentAnchorDocVersion])

  useEffect(() => {
    if (!editor) {
      return
    }

    const handleEditorTransaction = () => {
      if (commentSidecarMode === "none") {
        return
      }
      setCommentAnchorDocVersion(version => version + 1)
    }

    editor.on("transaction", handleEditorTransaction)
    return () => {
      editor.off("transaction", handleEditorTransaction)
    }
  }, [editor, commentSidecarMode])

  const activeCommentAnchorPreview = useMemo(() => {
    if (!activeCommentId) {
      return null
    }
    return anchorPreviewByCommentId.get(activeCommentId) ?? null
  }, [activeCommentId, anchorPreviewByCommentId])

  const resolvedStateByCommentId = useMemo(() => {
    const resolvedMap = new Map<string, boolean>()
    for (const comment of paperComments) {
      resolvedMap.set(comment.id, comment.metaFields.resolved ?? false)
    }
    return resolvedMap
  }, [paperComments])

  const isCommentMutationPending =
    createPaperCommentMutation.isPending ||
    updatePaperCommentMutation.isPending ||
    deletePaperCommentMutation.isPending ||
    createPaperCommentReplyMutation.isPending ||
    updatePaperCommentReplyMutation.isPending ||
    deletePaperCommentReplyMutation.isPending

  // Track whether the component has mounted to prevent state updates before mount.
  // TipTap's useEditor can call onCreate before React considers the component mounted,
  // which triggers "Can't perform a React state update on a component that hasn't mounted" warnings.
  const isMountedRef = useRef(false)
  useLayoutEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Track the last title we attempted to save to prevent infinite retry loops on error.
  // When mutation fails, rollback changes paper.content.name back to old value, which would
  // trigger another save attempt. This ref prevents that.
  const lastAttemptedTitleRef = useRef<string | null>(null)

  // Get Yjs document from hook.
  // Pass title so indexing uses the latest local state, not stale paper.content.name.
  // This prevents race conditions where content save triggers indexing before
  // the title mutation completes (which would index the old default title).
  const {
    ydoc,
    isSavingBlocks,
    error: yjsError,
  } = usePaperYjs({
    paperId: paper.id,
    title,
    folderId: paper.metaFields.folder_id ?? null,
    createdAt: paper.createdAt.getTime(),
    updatedAt: paper.updatedAt.getTime(),
  })

  useRegisterEntityExportSnapshot({
    entityType: "paper",
    entityId: paper.id,
    ydoc,
    title,
  })

  // Combined save state: either saving title or saving content blocks
  const isSavingTitle = updatePaperMutation.isPending
  const isSaving = isSavingTitle || isSavingBlocks

  // Track previous saving state to detect transitions
  const wasSavingRef = useRef(false)

  // Report save state changes to EntitySaveContext for sidecar display
  useEffect(() => {
    if (isSaving && !wasSavingRef.current) {
      // Transition from not saving to saving
      reportSavingStarted("paper", paper.id)
    } else if (!isSaving && wasSavingRef.current) {
      // Transition from saving to not saving
      reportSavingCompleted("paper", paper.id)
    }
    wasSavingRef.current = isSaving
  }, [isSaving, paper.id, reportSavingStarted, reportSavingCompleted])

  // Callback for sidecar to update title
  const handleTitleChangeFromSidecar = useCallback((newTitle: string) => {
    setTitle(newTitle)
  }, [])

  const handleOpenComments = useCallback(() => {
    pendingCommentSelectionRef.current = null
    setPendingCommentAnchorPreview(null)
    setActiveCommentId(null)
    setCommentSidecarMode("list")
    commentDetailNavigationPendingRef.current = false
    updateCurrentItemContext({ commentId: null })
  }, [updateCurrentItemContext])

  // Update breadcrumb label to reflect the current title.
  useEffect(() => {
    updateCurrentItemLabel(title)
  }, [title, updateCurrentItemLabel])

  const baseSidecar = useMemo(() => {
    return (
      <PaperSidecar
        paper={paper}
        currentTitle={title}
        onTitleChange={handleTitleChangeFromSidecar}
        onOpenComments={handleOpenComments}
        unresolvedCommentCount={unresolvedCommentCount}
      />
    )
  }, [paper, title, handleTitleChangeFromSidecar, handleOpenComments, unresolvedCommentCount])

  // Keep the base paper sidecar in sync when comments are not open.
  useEffect(() => {
    if (commentSidecarMode !== "none") {
      return
    }

    setSidecar(baseSidecar, "Info")
  }, [commentSidecarMode, baseSidecar, setSidecar])

  // Ensure the sidecar is cleared when unmounting.
  useEffect(() => {
    return () => {
      clearSidecar()
    }
  }, [clearSidecar])

  // Handle editor ready - store ref for keyboard navigation and state for toolbar.
  // Defer setEditor to next frame if component hasn't mounted yet, to avoid
  // "Can't perform a React state update on a component that hasn't mounted" warnings.
  const handleEditorReady = useCallback((editorInstance: Editor) => {
    editorRef.current = editorInstance
    if (isMountedRef.current) {
      setEditor(editorInstance)
    } else {
      requestAnimationFrame(() => setEditor(editorInstance))
    }
  }, [])

  /**
   * Handle entity link changes from the EntityLinkMonitor.
   * Debounces updates to avoid excessive server calls during editing.
   */
  const handleLinkChange = useCallback(
    (event: LinkChangeEvent) => {
      // Clear any pending sync
      if (linkSyncTimeoutRef.current) {
        clearTimeout(linkSyncTimeoutRef.current)
      }

      // Debounce the sync to avoid excessive calls during rapid editing
      linkSyncTimeoutRef.current = setTimeout(() => {
        const linkedEntities = extractLinkedEntitiesFromMonitor(event.allLinks)
        syncLinks({
          entityId: paper.id,
          sourceEntityType: "paper",
          linkedEntities,
        })
      }, 1000)
    },
    [paper.id, syncLinks]
  )

  // Cleanup link sync timeout on unmount
  useEffect(() => {
    return () => {
      if (linkSyncTimeoutRef.current) {
        clearTimeout(linkSyncTimeoutRef.current)
      }
      if (mentionSyncTimeoutRef.current) {
        clearTimeout(mentionSyncTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Handle mention changes and notify the paper entity for notifications.
   * Only newly added mentions are sent to avoid duplicate notifications.
   */
  const handleMentionedUserIdsChange = useCallback(
    (event: MentionedUserIdChangeEvent) => {
      const currentEditor = editorRef.current
      if (!currentEditor || !currentEditor.isFocused) {
        return
      }

      if (event.addedUserIds.length === 0) {
        return
      }

      for (const userId of event.addedUserIds) {
        pendingMentionedUserIdsRef.current.add(userId)
      }

      if (mentionSyncTimeoutRef.current) {
        clearTimeout(mentionSyncTimeoutRef.current)
      }

      mentionSyncTimeoutRef.current = setTimeout(() => {
        const mentionedUserIds = Array.from(pendingMentionedUserIdsRef.current)
        pendingMentionedUserIdsRef.current.clear()

        if (mentionedUserIds.length === 0) {
          return
        }

        updatePaperMentionsMutation.mutate({
          paperId: paper.id,
          mentionedUserIds,
        })
      }, 1000)
    },
    [paper.id, updatePaperMentionsMutation]
  )

  const updateCreateCommentButtonState = useCallback(() => {
    if (!editor) {
      setIsCreateCommentDisabled(true)
      return
    }

    const isSelectionEmpty = editor.state.selection.empty
    const hasOverlap = doesSelectionOverlapComment(editor)
    const isDisabled = !hasWriteAccessToPaper || isSelectionEmpty || hasOverlap
    setIsCreateCommentDisabled(isDisabled)
  }, [editor, hasWriteAccessToPaper])

  useEffect(() => {
    updateCreateCommentButtonState()
  }, [updateCreateCommentButtonState, paperComments])

  useEffect(() => {
    if (!editor) {
      return
    }

    const handleUpdate = () => {
      setEditorUpdateVersion(version => version + 1)
    }

    const handleSelectionUpdate = () => {
      updateCreateCommentButtonState()

      const { selection, storedMarks } = editor.state
      if (!selection.empty) {
        return
      }

      // Prevent resolved comment marks from extending into new text at the cursor.
      const marksAtCursor = storedMarks ?? selection.$from.marks()
      const hasResolvedCommentMark = marksAtCursor.some(mark => {
        return mark.type.name === PAPER_COMMENT_MARK_NAME && mark.attrs?.resolved === true
      })
      if (!hasResolvedCommentMark) {
        return
      }

      const filteredMarks = marksAtCursor.filter(mark => {
        return !(mark.type.name === PAPER_COMMENT_MARK_NAME && mark.attrs?.resolved === true)
      })
      editor.view.dispatch(editor.state.tr.setStoredMarks(filteredMarks))
    }

    editor.on("update", handleUpdate)
    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("update", handleUpdate)
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, updateCreateCommentButtonState])

  useEffect(() => {
    if (!editor) {
      return
    }

    syncPaperCommentResolvedStateInDocument(editor, resolvedStateByCommentId)
  }, [editor, resolvedStateByCommentId, editorUpdateVersion])

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.commands.setActivePaperComment(activeCommentId)
  }, [editor, activeCommentId])

  const openCommentDetail = useCallback(
    (commentId: string) => {
      commentDetailNavigationPendingRef.current = true
      setActiveReplyId(null)
      replyNavigationPendingRef.current = false
      setActiveCommentId(commentId)
      setCommentSidecarMode("detail")
      updateCurrentItemContext({ commentId })
    },
    [updateCurrentItemContext]
  )

  const handleSelectCommentFromList = useCallback(
    (commentId: string) => {
      pendingCommentSelectionRef.current = null
      setPendingCommentAnchorPreview(null)
      openCommentDetail(commentId)
    },
    [openCommentDetail]
  )

  const handleCommentMarkClick = useCallback(
    (commentIds: string[]) => {
      const unresolvedCommentIds = commentIds.filter(commentId => {
        const comment = paperComments.find(entry => entry.id === commentId)
        return comment ? !(comment.metaFields.resolved ?? false) : false
      })
      let selectedCommentId = pickOldestCommentId(unresolvedCommentIds, paperComments)
      if (!selectedCommentId && paperComments.length === 0 && commentIds.length > 0) {
        // If comment cache hasn't populated yet, fall back to the clicked mark's ID.
        selectedCommentId = commentIds[0] ?? null
      }
      if (!selectedCommentId) {
        return
      }
      pendingCommentSelectionRef.current = null
      setPendingCommentAnchorPreview(null)
      openCommentDetail(selectedCommentId)
    },
    [paperComments, openCommentDetail]
  )

  const handleStartNewComment = useCallback(() => {
    if (!editor || isCreateCommentDisabled) {
      return
    }

    const previewText = getSelectionPreviewTextForComment(editor)
    if (!previewText) {
      return
    }

    pendingCommentSelectionRef.current = editor.state.selection.getBookmark()
    setPendingCommentAnchorPreview(previewText)
    setActiveReplyId(null)
    replyNavigationPendingRef.current = false
    setActiveCommentId(null)
    commentDetailNavigationPendingRef.current = true
    setCommentSidecarMode("new")
    updateCurrentItemContext({ commentId: null })
  }, [editor, isCreateCommentDisabled, updateCurrentItemContext])

  const handleCancelNewComment = useCallback(() => {
    pendingCommentSelectionRef.current = null
    setPendingCommentAnchorPreview(null)
    setActiveReplyId(null)
    replyNavigationPendingRef.current = false
    commentDetailNavigationPendingRef.current = false
    setCommentSidecarMode("list")
  }, [])

  const handleCreateComment = useCallback(
    (commentId: string, content: JSONContent) => {
      if (!editor) {
        return
      }

      const selectionBookmark = pendingCommentSelectionRef.current
      const markApplied = applyPaperCommentMarkFromBookmark(editor, selectionBookmark, commentId)
      if (!markApplied) {
        pendingCommentSelectionRef.current = null
        setPendingCommentAnchorPreview(null)
        setCommentSidecarMode("list")
        return
      }

      const body = JSON.stringify(content)
      createPaperCommentMutation.mutate(
        {
          paperId: paper.id,
          body,
          id: commentId,
        },
        {
          onSuccess: newComment => {
            pendingCommentSelectionRef.current = null
            setPendingCommentAnchorPreview(null)
            setActiveCommentId(newComment.id)
            setActiveReplyId(null)
            replyNavigationPendingRef.current = false
            setCommentSidecarMode("detail")
            updateCurrentItemContext({ commentId: newComment.id })
          },
          onError: () => {
            removePaperCommentMark(editor, commentId)
            pendingCommentSelectionRef.current = null
            setPendingCommentAnchorPreview(null)
            setCommentSidecarMode("list")
          },
        }
      )
    },
    [createPaperCommentMutation, editor, paper.id, updateCurrentItemContext]
  )

  const handleUpdateComment = useCallback(
    (comment: DecryptedPaperComment, content: JSONContent) => {
      const body = JSON.stringify(content)
      updatePaperCommentMutation.mutate({
        commentId: comment.id,
        body,
      })
    },
    [updatePaperCommentMutation]
  )

  const handleDeleteComment = useCallback(
    (comment: DecryptedPaperComment) => {
      deletePaperCommentMutation.mutate(
        { commentId: comment.id },
        {
          onSuccess: () => {
            if (editor) {
              removePaperCommentMark(editor, comment.id)
            }
            setActiveCommentId(null)
            setActiveReplyId(null)
            replyNavigationPendingRef.current = false
            commentDetailNavigationPendingRef.current = false
            setCommentSidecarMode("list")
            updateCurrentItemContext({ commentId: null })
          },
        }
      )
    },
    [deletePaperCommentMutation, editor, updateCurrentItemContext]
  )

  const handleToggleResolved = useCallback(
    (comment: DecryptedPaperComment, resolved: boolean) => {
      updatePaperCommentMutation.mutate(
        {
          commentId: comment.id,
          resolved,
        },
        {
          onSuccess: () => {
            if (editor) {
              updatePaperCommentMarkResolvedState(editor, comment.id, resolved)
            }
          },
        }
      )
    },
    [updatePaperCommentMutation, editor]
  )

  const handleCreateReply = useCallback(
    (comment: DecryptedPaperComment, replyId: string, content: JSONContent) => {
      const body = JSON.stringify(content)
      createPaperCommentReplyMutation.mutate({
        commentId: comment.id,
        body,
        id: replyId,
      })
    },
    [createPaperCommentReplyMutation]
  )

  const handleUpdateReply = useCallback(
    (_comment: DecryptedPaperComment, reply: DecryptedPaperCommentReply, content: JSONContent) => {
      const body = JSON.stringify(content)
      updatePaperCommentReplyMutation.mutate({
        replyId: reply.id,
        body,
      })
    },
    [updatePaperCommentReplyMutation]
  )

  const handleDeleteReply = useCallback(
    (_comment: DecryptedPaperComment, reply: DecryptedPaperCommentReply) => {
      deletePaperCommentReplyMutation.mutate({
        replyId: reply.id,
      })
    },
    [deletePaperCommentReplyMutation]
  )

  const handleSelectReplyFromDetail = useCallback((replyId: string) => {
    replyNavigationPendingRef.current = true
    setActiveReplyId(replyId)
  }, [])

  useEffect(() => {
    if (!commentIdFromNavigation) {
      if (commentSidecarMode === "detail") {
        setCommentSidecarMode("list")
        setActiveCommentId(null)
        setActiveReplyId(null)
        replyNavigationPendingRef.current = false
        commentDetailNavigationPendingRef.current = false
      }
      return
    }

    if (commentIdFromNavigation === activeCommentId && commentSidecarMode === "detail") {
      return
    }

    setActiveReplyId(null)
    replyNavigationPendingRef.current = false
    setCommentSidecarMode("detail")
    setActiveCommentId(commentIdFromNavigation)
  }, [commentIdFromNavigation, commentSidecarMode, activeCommentId])

  useEffect(() => {
    if (commentSidecarMode === "none") {
      return
    }

    const previousCommentSidecarMode = previousCommentSidecarModeRef.current
    // Avoid resetting during the initial stack swap when opening comments.
    const isOpeningComments = previousCommentSidecarMode === "none"

    if (sidecarStack.length === 0) {
      if (isOpeningComments) {
        return
      }
      setCommentSidecarMode("none")
      setActiveCommentId(null)
      setActiveReplyId(null)
      replyNavigationPendingRef.current = false
      setPendingCommentAnchorPreview(null)
      pendingCommentSelectionRef.current = null
      updateCurrentItemContext({ commentId: null })
      return
    }

    const commentsIndex = sidecarStack.findIndex(item => item.title === "Comments")
    if (commentsIndex === -1) {
      if (isOpeningComments) {
        return
      }
      setCommentSidecarMode("none")
      setActiveCommentId(null)
      setActiveReplyId(null)
      replyNavigationPendingRef.current = false
      setPendingCommentAnchorPreview(null)
      pendingCommentSelectionRef.current = null
      updateCurrentItemContext({ commentId: null })
      return
    }

    const replyIndex = sidecarStack.findIndex(item => item.title === "Reply")
    if (replyIndex === -1) {
      if (activeReplyId && !replyNavigationPendingRef.current) {
        setActiveReplyId(null)
      }
    } else if (replyNavigationPendingRef.current) {
      replyNavigationPendingRef.current = false
    }

    if (commentsIndex < sidecarStack.length - 1 && commentDetailNavigationPendingRef.current) {
      commentDetailNavigationPendingRef.current = false
    }

    if (commentsIndex === sidecarStack.length - 1 && commentSidecarMode !== "list") {
      const isTransitioningToDetail =
        previousCommentSidecarMode === "list" &&
        (commentSidecarMode === "detail" || commentSidecarMode === "new")
      if (replyNavigationPendingRef.current || commentDetailNavigationPendingRef.current) {
        return
      }
      if (isTransitioningToDetail) {
        return
      }
      setCommentSidecarMode("list")
      setActiveCommentId(null)
      setActiveReplyId(null)
      replyNavigationPendingRef.current = false
      commentDetailNavigationPendingRef.current = false
      setPendingCommentAnchorPreview(null)
      pendingCommentSelectionRef.current = null
      updateCurrentItemContext({ commentId: null })
    }
  }, [sidecarStack, commentSidecarMode, updateCurrentItemContext, activeReplyId])

  useEffect(() => {
    previousCommentSidecarModeRef.current = commentSidecarMode
  }, [commentSidecarMode])

  useEffect(() => {
    if (commentSidecarMode === "list" || commentSidecarMode === "none") {
      commentDetailNavigationPendingRef.current = false
    }
  }, [commentSidecarMode])

  const commentSidecarStackItems = useMemo(() => {
    if (commentSidecarMode === "none") {
      return null
    }

    const listSidecar = (
      <PaperCommentsSidecar
        paperId={paper.id}
        comments={paperComments}
        activeCommentId={activeCommentId}
        anchorPreviewByCommentId={anchorPreviewByCommentId}
        anchorPositionByCommentId={anchorPositionByCommentId}
        onSelectComment={handleSelectCommentFromList}
      />
    )

    const stackItems = [
      { title: "Info", content: baseSidecar },
      { title: "Comments", content: listSidecar },
    ]

    if (commentSidecarMode === "detail" || commentSidecarMode === "new") {
      const detailAnchorPreview =
        commentSidecarMode === "new" ? pendingCommentAnchorPreview : activeCommentAnchorPreview
      stackItems.push({
        title: commentSidecarMode === "new" ? "New Comment" : "Comment",
        content: (
          <PaperCommentDetailSidecar
            paperId={paper.id}
            comment={commentSidecarMode === "new" ? null : activeComment}
            replies={activeCommentReplies}
            isNewThread={commentSidecarMode === "new"}
            anchorPreview={detailAnchorPreview}
            canWrite={hasWriteAccessToPaper}
            currentUserId={currentUser?.uuid ?? null}
            paperCreatorId={paper.creatorId}
            activeReplyId={activeReplyId}
            mentionSuggestionContext={mentionSuggestionContext}
            onCreateComment={handleCreateComment}
            onUpdateComment={handleUpdateComment}
            onDeleteComment={handleDeleteComment}
            onToggleResolved={handleToggleResolved}
            onSelectReply={handleSelectReplyFromDetail}
            onCreateReply={handleCreateReply}
            onCancelNewComment={commentSidecarMode === "new" ? handleCancelNewComment : undefined}
            isCommentMutationPending={isCommentMutationPending}
          />
        ),
      })
    }

    if (commentSidecarMode === "detail" && activeComment && activeReplyId) {
      stackItems.push({
        title: "Reply",
        content: (
          <PaperCommentReplyDetailSidecar
            comment={activeComment}
            reply={activeReply}
            currentUserId={currentUser?.uuid ?? null}
            paperCreatorId={paper.creatorId}
            mentionSuggestionContext={mentionSuggestionContext}
            onUpdateReply={handleUpdateReply}
            onDeleteReply={handleDeleteReply}
            isCommentMutationPending={isCommentMutationPending}
          />
        ),
      })
    }

    return stackItems
  }, [
    commentSidecarMode,
    paper.id,
    paperComments,
    activeCommentReplies,
    activeCommentId,
    activeReplyId,
    anchorPreviewByCommentId,
    anchorPositionByCommentId,
    baseSidecar,
    handleSelectCommentFromList,
    pendingCommentAnchorPreview,
    activeCommentAnchorPreview,
    hasWriteAccessToPaper,
    currentUser?.uuid,
    paper.creatorId,
    activeComment,
    activeReply,
    mentionSuggestionContext,
    handleCreateComment,
    handleUpdateComment,
    handleDeleteComment,
    handleToggleResolved,
    handleSelectReplyFromDetail,
    handleCreateReply,
    handleUpdateReply,
    handleDeleteReply,
    handleCancelNewComment,
    isCommentMutationPending,
  ])

  const commentSidecarStackKey = useMemo(() => {
    if (commentSidecarMode === "none") {
      return null
    }

    const commentStateKey = paperComments
      .map(comment => {
        return `${comment.id}:${comment.updatedAt.getTime()}:${comment.metaFields.resolved ?? false}`
      })
      .join("|")

    const replyStateKey = activeCommentReplies
      .map(reply => `${reply.id}:${reply.updatedAt.getTime()}`)
      .join(",")

    const previewKey = Array.from(anchorPreviewByCommentId.entries())
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([commentId, text]) => `${commentId}:${text.length}:${text.slice(0, 32)}`)
      .join("|")

    const positionKey = Array.from(anchorPositionByCommentId.entries())
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([commentId, pos]) => `${commentId}:${pos}`)
      .join("|")

    const pendingPreviewKey = pendingCommentAnchorPreview
      ? `${pendingCommentAnchorPreview.length}:${pendingCommentAnchorPreview.slice(0, 32)}`
      : "none"

    const activePreviewKey = activeCommentAnchorPreview
      ? `${activeCommentAnchorPreview.length}:${activeCommentAnchorPreview.slice(0, 32)}`
      : "none"

    return [
      commentSidecarMode,
      activeCommentId ?? "none",
      activeReplyId ?? "none",
      pendingPreviewKey,
      activePreviewKey,
      hasWriteAccessToPaper ? "write" : "read",
      isCommentMutationPending ? "pending" : "ready",
      "info",
      commentStateKey,
      replyStateKey,
      previewKey,
      positionKey,
    ].join("|")
  }, [
    commentSidecarMode,
    paperComments,
    activeCommentReplies,
    activeCommentId,
    activeReplyId,
    pendingCommentAnchorPreview,
    activeCommentAnchorPreview,
    hasWriteAccessToPaper,
    isCommentMutationPending,
    anchorPreviewByCommentId,
    anchorPositionByCommentId,
  ])

  const lastSidecarStackKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (commentSidecarMode !== "none") {
      return
    }
    lastSidecarStackKeyRef.current = null
  }, [commentSidecarMode])

  useEffect(() => {
    if (!commentSidecarStackItems || commentSidecarMode === "none") {
      return
    }

    if (commentSidecarStackKey && lastSidecarStackKeyRef.current === commentSidecarStackKey) {
      return
    }

    lastSidecarStackKeyRef.current = commentSidecarStackKey
    replaceSidecarStack(commentSidecarStackItems)
  }, [commentSidecarStackItems, commentSidecarMode, commentSidecarStackKey, replaceSidecarStack])

  // Handle keyboard events in the editor (ArrowUp at start navigates to title)
  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.key.toLowerCase() === "c") {
        event.preventDefault()
        handleStartNewComment()
        return true
      }

      if (event.key === "ArrowUp") {
        const currentEditor = editorRef.current
        if (currentEditor) {
          const { from } = currentEditor.state.selection
          // Position 0 is before the first node, position 1 is at the start of first paragraph.
          // Navigate to title if cursor is at or before the start of content.
          if (from <= 1) {
            event.preventDefault()
            titleInputRef.current?.focus()
            return true
          }
        }
      }
      return false
    },
    [handleStartNewComment]
  )

  // Handle title changes with debounce.
  // Uses lastAttemptedTitleRef to prevent infinite retry loops when the server
  // returns an error (which rolls back paper.content.name, triggering this effect again).
  useEffect(() => {
    const trimmedTitle = title.trim()

    // Don't save if title hasn't changed from what's on the server
    if (trimmedTitle === paper.content.name) {
      lastAttemptedTitleRef.current = null
      return
    }

    // Don't save if we already attempted this exact title (prevents retry loop on error)
    if (trimmedTitle === lastAttemptedTitleRef.current) {
      return
    }

    // Don't save empty titles or while another mutation is in progress
    if (!trimmedTitle || updatePaperMutation.isPending) {
      return
    }

    const timeoutId = setTimeout(() => {
      lastAttemptedTitleRef.current = trimmedTitle
      updatePaperMutation.mutate(
        { paperId: paper.id, name: trimmedTitle },
        {
          onSuccess: () => {
            // Clear the ref on success so user can change title back to previous values
            lastAttemptedTitleRef.current = null
          },
        }
      )
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timeoutId)
  }, [title, paper.id, paper.content.name, updatePaperMutation])

  // Keyboard navigation: ArrowDown focuses the title when content area is focused
  // but neither title nor editor is focused
  useEffect(() => {
    if (!isContentFocused) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if event was already handled
      if (e.defaultPrevented) return

      const targetElement = getEventTargetElement(e.target)
      const isInTitle = targetElement === titleInputRef.current
      const isInEditor = targetElement ? targetElement.closest(".ProseMirror") !== null : false

      // If not in title or editor, ArrowDown focuses the title
      if (e.key === "ArrowDown" && !isInTitle && !isInEditor) {
        e.preventDefault()
        titleInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isContentFocused])

  // Handle title input keyboard navigation
  const handleTitleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      // Focus the TipTap editor
      editorRef.current?.commands.focus("start")
    }
  }

  if (yjsError) {
    return <div className={paperStyles.paperError}>Failed to load paper: {yjsError}</div>
  }

  return (
    <div className={paperStyles.paperEditor} data-testid="paper-editor">
      {/* Rich text formatting toolbar (fixed at top, doesn't scroll) */}
      <EditorToolbar editor={editor} className={paperStyles.paperToolbar} />

      {/* Scrollable content area */}
      <div className={paperStyles.paperScrollContent}>
        {/* Title input above editor content */}
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          className={paperStyles.paperTitle}
          placeholder="Untitled"
          data-testid="paper-title"
        />

        {/* TipTap Editor with Yjs collaboration (toolbar rendered externally above) */}
        <TipTapEditor
          collaboration={{ ydoc, field: "content" }}
          placeholder="Start writing..."
          showToolbar={false}
          onEditorReady={handleEditorReady}
          onKeyDown={handleEditorKeyDown}
          onLinkChange={handleLinkChange}
          onMentionedUserIdsChange={handleMentionedUserIdsChange}
          mentionSuggestionContext={mentionSuggestionContext}
          selectionBubbleMenu={{
            onCreateComment: handleStartNewComment,
            isCreateCommentDisabled,
            commentButtonTestId: "paper-comment-bubble-button",
          }}
          commentMarkConfig={{
            onCommentClick: handleCommentMarkClick,
          }}
          className={paperStyles.paperEditorWrapper}
          contentClassName={paperStyles.paperEditorContent}
          testId="paper-tiptap-editor"
          fileAttachment={{
            entityId: paper.id,
            entityType: "paper",
          }}
        />
      </div>
    </div>
  )
}
