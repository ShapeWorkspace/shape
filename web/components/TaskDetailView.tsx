import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Editor } from "@tiptap/react"
import type { DecryptedProjectTask, DecryptedTaskComment } from "../../engine/models/entity"
import {
  useProjectTasks,
  useUpdateProjectTask,
  useUpdateProjectTaskMentions,
} from "../store/queries/use-project-tasks"
import { useTaskComments, useCreateTaskComment } from "../store/queries/use-task-comments"
import { useReactionBatchFetch } from "../store/queries/use-reactions"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { TaskSidecar } from "./TaskSidecar"
import { TaskCommentItem } from "./TaskCommentItem"
import { TaskCommentSidecar } from "./TaskCommentSidecar"
import { TaskCommentComposer } from "./TaskCommentComposer"
import { TipTapEditor } from "./TipTapEditor"
import { ReactionBar } from "./reactions/ReactionBar"
import type { MentionedUserIdChangeEvent } from "./tiptap-extensions/MentionMonitorPlugin"
import { useTaskYjs } from "../hooks/useTaskYjs"
import { useRegisterEntityExportSnapshot } from "../hooks/useRegisterEntityExportSnapshot"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import type { ReactionEntityReference } from "../types/reaction-entity-reference"
import * as styles from "../styles/taskDetail.css"

/**
 * TaskDetailView is a terminus view for viewing and editing a single task.
 * Displays:
 * - Editable title (inline editing)
 * - Editable description
 * - Comments list with real encrypted task comments
 * - Add comment composer with TipTapEditor
 *
 * Other task properties (assignee, due date, tags, etc.) remain in the sidecar.
 */
interface TaskDetailViewProps {
  projectId: string
  taskId: string
}

export function TaskDetailView({ projectId, taskId }: TaskDetailViewProps) {
  const { data: tasks = [] } = useProjectTasks(projectId)
  const { mutate: updateTask } = useUpdateProjectTask()
  const { mutate: updateTaskMentions } = useUpdateProjectTaskMentions()
  const { updateCurrentItemLabel } = useWindowStore()
  const { setSidecar, updateSidecarTitle, pushSidecar } = useSidecar()

  // Find the task from the project's task list
  const task = tasks.find((t: DecryptedProjectTask) => t.id === taskId)
  const taskTitle = task?.content.title

  // Fetch real comments for this task
  const { data: comments = [] } = useTaskComments(projectId, taskId)
  const { mutate: createComment, isPending: isCreatingComment } = useCreateTaskComment()

  const reactionEntityReferences = useMemo<ReactionEntityReference[]>(() => {
    const references: ReactionEntityReference[] = [
      {
        entityId: taskId,
        entityType: "task",
      },
    ]
    for (const comment of comments) {
      references.push({
        entityId: comment.id,
        entityType: "task-comment",
      })
    }
    return references
  }, [taskId, comments])

  useReactionBatchFetch(reactionEntityReferences, { isEnabled: !!taskId })

  // Set the TaskSidecar on mount to ensure it's always present.
  // This handles cases like page refresh or deep linking to a task.
  useEffect(() => {
    if (taskTitle !== undefined) {
      setSidecar(<TaskSidecar projectId={projectId} taskId={taskId} />, taskTitle)
    }
  }, [projectId, taskId, taskTitle, setSidecar])

  // Local state for title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [localTitle, setLocalTitle] = useState("")
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Local state for description editing
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const descriptionEditorRef = useRef<Editor | null>(null)
  const mentionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMentionedUserIdsRef = useRef<Set<string>>(new Set())
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(
    () => ({
      contextType: "acl",
      resourceType: "project",
      resourceId: projectId,
    }),
    [projectId]
  )

  // Sync local state when task changes
  useEffect(() => {
    if (taskTitle !== undefined) {
      setLocalTitle(taskTitle)
    }
  }, [taskTitle])

  // Reset description edit mode when switching tasks
  useEffect(() => {
    setIsEditingDescription(false)
  }, [taskId])

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // Focus description editor when editing starts
  useEffect(() => {
    if (isEditingDescription && descriptionEditorRef.current) {
      descriptionEditorRef.current.commands.focus("end")
    }
  }, [isEditingDescription])

  useEffect(() => {
    return () => {
      if (mentionSyncTimeoutRef.current) {
        clearTimeout(mentionSyncTimeoutRef.current)
      }
    }
  }, [])

  // Store description editor reference when ready
  const handleDescriptionEditorReady = useCallback(
    (editor: Editor) => {
      descriptionEditorRef.current = editor
      // Focus immediately when editor is ready in edit mode
      if (isEditingDescription) {
        editor.commands.focus("end")
      }
    },
    [isEditingDescription]
  )

  // Handle title save
  const handleTitleSave = useCallback(() => {
    if (!task) return

    const trimmedTitle = localTitle.trim()
    if (trimmedTitle && trimmedTitle !== task.content.title) {
      updateTask(
        {
          projectId,
          taskId,
          updates: { content: { title: trimmedTitle } },
        },
        {
          onSuccess: () => {
            // Update the breadcrumb label to reflect the new title
            updateCurrentItemLabel(trimmedTitle)
            // Update the sidecar title as well
            updateSidecarTitle(trimmedTitle)
          },
        }
      )
    } else {
      // Revert to original title if empty or unchanged
      setLocalTitle(task.content.title)
    }
    setIsEditingTitle(false)
  }, [task, localTitle, projectId, taskId, updateTask, updateCurrentItemLabel, updateSidecarTitle])

  // Handle title keyboard events
  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault()
        handleTitleSave()
      }
    },
    [handleTitleSave]
  )

  // Handle description content change
  // Handle description editor focus change - exit edit mode when losing focus
  const handleDescriptionFocusChange = useCallback(
    (focused: boolean) => {
      if (!focused && isEditingDescription) {
        setIsEditingDescription(false)
      }
    },
    [isEditingDescription]
  )

  // Handle description keyboard events - Escape to exit edit mode
  const handleDescriptionKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setIsEditingDescription(false)
      return true
    }
    return false
  }, [])

  const handleMentionedUserIdsChange = useCallback(
    (event: MentionedUserIdChangeEvent) => {
      const currentEditor = descriptionEditorRef.current
      if (!currentEditor || !currentEditor.isFocused) {
        return
      }

      if (event.addedUserIds.length === 0) {
        return
      }

      // Accumulate mention additions and debounce to avoid spamming the server.
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

        updateTaskMentions({
          projectId,
          taskId,
          mentionedUserIds,
        })
      }, 1000)
    },
    [projectId, taskId, updateTaskMentions]
  )

  // Handle creating a new comment via the composer
  const handleCreateComment = useCallback(
    (commentId: string, body: string) => {
      createComment({
        projectId,
        taskId,
        body,
        id: commentId,
      })
    },
    [createComment, projectId, taskId]
  )

  // Handle clicking on a comment - push TaskCommentSidecar for edit/delete actions
  const handleSelectComment = useCallback(
    (comment: DecryptedTaskComment) => {
      pushSidecar(<TaskCommentSidecar projectId={projectId} taskId={taskId} comment={comment} />, "Comment")
    },
    [pushSidecar, projectId, taskId]
  )

  const { ydoc, isSavingBlocks, error: yjsError } = useTaskYjs({
    taskId,
    projectId,
    title: localTitle,
    createdAt: task?.createdAt?.getTime() ?? 0,
    updatedAt: task?.updatedAt?.getTime() ?? 0,
  })

  // Track saving status with minimum display times to avoid flickering.
  // "Saving..." shows for at least 750ms, then "Saved." shows for 1s after completion.
  const [savingStatusText, setSavingStatusText] = useState<string | null>(null)
  const savingStartTimeRef = useRef<number>(0)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isSavingBlocks) {
      // Clear any pending hide timeout when saving starts
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
      savingStartTimeRef.current = Date.now()
      setSavingStatusText("Saving...")
    } else if (savingStatusText === "Saving...") {
      // Saving finished, calculate remaining time for minimum display
      const elapsed = Date.now() - savingStartTimeRef.current
      const remainingMinTime = Math.max(0, 750 - elapsed)

      // Show "Saving..." for remaining minimum time, then "Saved." for 1s
      hideTimeoutRef.current = setTimeout(() => {
        setSavingStatusText("Saved.")
        hideTimeoutRef.current = setTimeout(() => {
          setSavingStatusText(null)
          hideTimeoutRef.current = null
        }, 1000)
      }, remainingMinTime)
    }
  }, [isSavingBlocks, savingStatusText])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  useRegisterEntityExportSnapshot({
    entityType: "task",
    entityId: taskId,
    ydoc,
    title: localTitle,
  })

  if (!task) {
    return (
      <div className={styles.taskDetailContainer}>
        <div className={styles.taskDetailEmpty}>Task not found</div>
      </div>
    )
  }

  if (yjsError) {
    return (
      <div className={styles.taskDetailContainer}>
        <div className={styles.taskDetailEmpty}>Failed to load task description: {yjsError}</div>
      </div>
    )
  }

  return (
    <div className={styles.taskDetailContainer} data-testid="task-detail-view">
      {/* Scrollable content area */}
      <div className={styles.taskDetailContent}>
        {/* Editable Title */}
        <div className={styles.taskDetailHeader}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className={styles.taskDetailTitleInput}
              value={localTitle}
              onChange={e => setLocalTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              data-testid="task-detail-title-input"
            />
          ) : (
            <h1
              className={styles.taskDetailTitle}
              onClick={() => setIsEditingTitle(true)}
              data-testid="task-detail-title"
            >
              {task.content.title}
            </h1>
          )}
        </div>

        {/* Editable Description with TipTap */}
        <div className={styles.taskDetailSection}>
          <div className={styles.taskDetailSectionHeader}>
            <div className={styles.taskDetailSectionLabel}>Description</div>
            {savingStatusText && (
              <span className={styles.taskDetailSavingStatus} data-testid="task-description-saving-status">
                {savingStatusText}
              </span>
            )}
          </div>
          <div
            className={styles.taskDetailDescription}
            onClick={() => setIsEditingDescription(true)}
            data-testid="task-detail-description"
          >
            <div className={styles.taskDetailDescriptionEditor}>
              <TipTapEditor
                placeholder="Click to add a description..."
                autoFocus={isEditingDescription}
                showToolbar={isEditingDescription}
                disabled={!isEditingDescription}
                collaboration={{ ydoc }}
                fileAttachment={{
                  entityId: taskId,
                  entityType: "task_description",
                }}
                onEditorReady={handleDescriptionEditorReady}
                onFocusChange={handleDescriptionFocusChange}
                onKeyDown={handleDescriptionKeyDown}
                onMentionedUserIdsChange={handleMentionedUserIdsChange}
                mentionSuggestionContext={mentionSuggestionContext}
                testId="task-detail-description-editor"
              />
            </div>
          </div>
        </div>

        {/* Reaction bar for the task itself */}
        <div className={styles.taskDetailSection}>
          <ReactionBar
            entityId={taskId}
            entityType="task"
            testIdPrefix={`task-${taskId}`}
          />
        </div>

        {/* Comments Section */}
        <div className={styles.taskDetailSection}>
          <div className={styles.taskDetailSectionLabel}>Comments</div>

          {/* Comments List */}
          <div className={styles.taskDetailCommentsList} data-testid="task-detail-comments">
            {comments.length === 0 ? (
              <div className={styles.taskDetailCommentsEmpty}>No comments yet. Be the first to comment.</div>
            ) : (
              comments.map((comment: DecryptedTaskComment) => (
                <TaskCommentItem
                  key={comment.id}
                  comment={comment}
                  onClick={() => handleSelectComment(comment)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Comment Input Footer (fixed at bottom) */}
      <div className={styles.taskDetailCommentFooter}>
        <TaskCommentComposer
          isPending={isCreatingComment}
          onSend={handleCreateComment}
          mentionSuggestionContext={mentionSuggestionContext}
        />
      </div>
    </div>
  )
}
