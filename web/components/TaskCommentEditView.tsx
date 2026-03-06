/**
 * TaskCommentEditView is a terminus view for editing a task comment.
 *
 * Features:
 * - TipTapEditor with full toolbar for editing comment body
 * - File attachment support (files bound to comment ID)
 * - Save and Cancel buttons
 * - Navigates back after save
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import type { Editor } from "@tiptap/react"
import type { TaskCommentContent, TaskCommentMetaFields } from "../../engine/models/entity"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { TipTapEditor } from "./TipTapEditor"
import { useTaskComment, useTaskComments, useUpdateTaskComment } from "../store/queries/use-task-comments"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import * as styles from "../styles/sidecar.css"
import * as forumStyles from "../styles/forum.css"

/**
 * Props for TaskCommentEditView component.
 */
interface TaskCommentEditViewProps {
  projectId: string
  taskId: string
  commentId: string
}

/**
 * TaskCommentEditView renders a full-screen editor for editing a task comment.
 */
export function TaskCommentEditView({ projectId, taskId, commentId }: TaskCommentEditViewProps) {
  const { navigateBack } = useWindowStore()
  const { application } = useEngineStore()
  const { data: taskCommentFromQuery, isLoading } = useTaskComment(projectId, taskId, commentId)
  const { data: cachedTaskComments = [] } = useTaskComments(projectId, taskId)
  const { mutateAsync: updateComment, isPending: isSaveInFlight } = useUpdateTaskComment()
  const [commentBodyHtml, setCommentBodyHtml] = useState("")
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const commentEditorRef = useRef<Editor | null>(null)
  const pendingEditorBodyHtmlRef = useRef<string | null>(null)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(
    () => ({
      contextType: "acl",
      resourceType: "project",
      resourceId: projectId,
    }),
    [projectId]
  )

  // Pull from query, list cache, and entity store so we always have a canonical comment.
  const cachedTaskCommentFromList = cachedTaskComments.find(item => item.id === commentId)
  const cachedTaskCommentFromStore = useMemo(() => {
    if (!application || !commentId) return undefined
    return application.getCacheStores().entityStore.get<TaskCommentContent, TaskCommentMetaFields>(commentId)
  }, [application, commentId])
  const resolvedTaskComment =
    taskCommentFromQuery ?? cachedTaskCommentFromList ?? cachedTaskCommentFromStore

  // Initialize editor state from the loaded comment once.
  useEffect(() => {
    if (!resolvedTaskComment) return

    const initialBodyHtml = resolvedTaskComment.content.body || ""
    setCommentBodyHtml(initialBodyHtml)

    if (commentEditorRef.current) {
      // Avoid emitting updates while seeding initial content.
      commentEditorRef.current.commands.setContent(initialBodyHtml, { emitUpdate: false })
    } else {
      pendingEditorBodyHtmlRef.current = initialBodyHtml
    }
  }, [resolvedTaskComment])

  const handleEditorReady = useCallback((editor: Editor) => {
    commentEditorRef.current = editor

    if (pendingEditorBodyHtmlRef.current !== null) {
      // Apply any comment content that arrived before the editor mounted.
      editor.commands.setContent(pendingEditorBodyHtmlRef.current, { emitUpdate: false })
      pendingEditorBodyHtmlRef.current = null
    }
  }, [])

  const handleCommentBodyChange = useCallback((nextBodyHtml: string) => {
    setCommentBodyHtml(nextBodyHtml)
  }, [])

  const normalizeCommentBodyForSave = useCallback((rawBodyHtml: string) => {
    const trimmedBody = rawBodyHtml.trim()
    if (!trimmedBody || trimmedBody === "<p></p>" || trimmedBody === "<p><br></p>") {
      return ""
    }
    return rawBodyHtml
  }, [])

  // Handle save
  const handleSave = useCallback(async () => {
    if (isSaveInFlight) return

    setSaveErrorMessage(null)

    // Prefer the editor HTML, but fall back to state if the editor hasn't flushed yet.
    const editorBodyHtml = commentEditorRef.current ? commentEditorRef.current.getHTML() : ""
    const normalizedEditorBodyHtml = normalizeCommentBodyForSave(editorBodyHtml)
    const normalizedStateBodyHtml = normalizeCommentBodyForSave(commentBodyHtml)
    const effectiveCommentBodyHtml = normalizedEditorBodyHtml || normalizedStateBodyHtml

    if (!resolvedTaskComment) {
      navigateBack()
      return
    }

    // Use the most reliable content hash we can find for conflict detection.
    const expectedContentHash =
      resolvedTaskComment.contentHash ||
      cachedTaskCommentFromList?.contentHash ||
      cachedTaskCommentFromStore?.contentHash ||
      ""

    try {
      await updateComment({
        projectId,
        taskId,
        commentId,
        body: effectiveCommentBodyHtml,
        contentHash: expectedContentHash,
      })
      navigateBack()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save comment."
      setSaveErrorMessage(message)
    }
  }, [
    commentBodyHtml,
    resolvedTaskComment,
    cachedTaskCommentFromList,
    cachedTaskCommentFromStore,
    projectId,
    taskId,
    commentId,
    navigateBack,
    isSaveInFlight,
    normalizeCommentBodyForSave,
    updateComment,
  ])

  // Handle cancel
  const handleCancel = useCallback(() => {
    navigateBack()
  }, [navigateBack])

  // Handle keyboard shortcuts from TipTapEditor
  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape to cancel
      if (e.key === "Escape") {
        handleCancel()
        return true
      }
      return false
    },
    [handleCancel]
  )

  if (isLoading && !resolvedTaskComment) {
    return (
      <div data-testid="task-comment-edit-view">
        <p>Loading comment...</p>
      </div>
    )
  }

  if (!resolvedTaskComment) {
    return (
      <div data-testid="task-comment-edit-view">
        <p>Loading comment...</p>
      </div>
    )
  }

  return (
    <div className={forumStyles.newDiscussionView} data-testid="task-comment-edit-view">
      <div className={forumStyles.newDiscussionHeader}>
        <span className={forumStyles.newDiscussionTitle}>Edit Comment</span>
      </div>

      <div className={forumStyles.newDiscussionForm}>
        <div className={forumStyles.newDiscussionEditorWrapper}>
          <div className={forumStyles.newDiscussionEditorLabel}>Comment</div>
          <div className={forumStyles.newDiscussionEditor}>
            <TipTapEditor
              content={commentBodyHtml}
              placeholder="Write your comment..."
              onChange={handleCommentBodyChange}
              showToolbar={true}
              disabled={isSaveInFlight}
              fileAttachment={{
                entityId: commentId,
                entityType: "task_comment",
              }}
              onKeyDown={handleEditorKeyDown}
              onEditorReady={handleEditorReady}
              mentionSuggestionContext={mentionSuggestionContext}
              testId="task-comment-edit-editor"
            />
          </div>
        </div>

        <div className={styles.sidecarInputActions}>
          <button
            className={styles.sidecarCancelButton}
            onClick={handleCancel}
            disabled={isSaveInFlight}
            data-testid="task-comment-edit-cancel"
          >
            Cancel
          </button>
          <button
            className={styles.sidecarConfirmButton}
            onClick={handleSave}
            disabled={isSaveInFlight}
            data-testid="task-comment-edit-save"
          >
            {isSaveInFlight ? "Saving..." : "Save"}
          </button>
        </div>
        {saveErrorMessage && (
          <div className={styles.sidecarInputError} data-testid="task-comment-edit-error">
            {saveErrorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
