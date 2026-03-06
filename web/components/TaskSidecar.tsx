import { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useParams } from "react-router-dom"
import type { DecryptedProjectTask, DecryptedProjectTag, TaskStatus } from "../../engine/models/entity"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import { Calendar, User, Tag, ListTodo, Plus, Trash2, ArrowLeft, Download } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useDrafts } from "../contexts/DraftContext"
import { useDraftState } from "../hooks/useDraftState"
import { useWindowStore } from "../store/window-store"
import { DraftSidecarSection } from "./DraftSidecarSection"
import {
  useProjectTasks,
  useUpdateProjectTask,
  useDeleteProjectTask,
} from "../store/queries/use-project-tasks"
import { useProjectTags, useCreateProjectTag } from "../store/queries/use-project-tags"
import { useProjectACLEntries } from "../store/queries/use-project-acl"
import { useWorkspaceMembersSync } from "../store/queries/use-workspace-members"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import { TaskMarkdownExportSidecar } from "./MarkdownExportSidecar"
import * as styles from "../styles/sidecar.css"

/**
 * TaskSidecar displays contextual information and actions for a project task.
 * Uses the stack-based sidecar navigation - clicking an action pushes
 * a new view onto the stack, and breadcrumbs are rendered automatically.
 *
 * Sections:
 * - Details: status, assignee, tag (native select), due date, created
 * - Actions: Export, Subscribe, Delete
 *
 * Tag selection uses a native select component with options:
 * - "Create new tag" (first option) - pushes CreateTagSidecar form
 * - Existing project tags
 * - "Remove tag" (when task has a tag assigned)
 *
 * Note: Title and description editing is handled in TaskDetailView terminus.
 */
interface TaskSidecarProps {
  projectId: string
  taskId: string
}

export function TaskSidecar({ projectId, taskId }: TaskSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { pushSidecar, clearSidecar } = useSidecar()
  const { navigateBack } = useWindowStore()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const workspaceMembers = useWorkspaceMembersSync()
  // Get current user for creator name resolution
  const activeUser = currentUser
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()
  const { data: tasks = [] } = useProjectTasks(projectId)
  const { data: projectTagsUnsorted = [] } = useProjectTags(projectId)

  // Sort tags alphabetically by name for consistent display
  const projectTags = useMemo(() => {
    const uniqueTagsById = new Map<string, DecryptedProjectTag>()
    for (const tag of projectTagsUnsorted) {
      uniqueTagsById.set(tag.id, tag)
    }
    return Array.from(uniqueTagsById.values()).sort((a, b) => a.content.name.localeCompare(b.content.name))
  }, [projectTagsUnsorted])
  const { mutate: updateTask } = useUpdateProjectTask()
  const { mutate: deleteTask } = useDeleteProjectTask()
  const { data: aclEntries = [] } = useProjectACLEntries(projectId)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Find the task from the tasks list
  const task = tasks.find((t: DecryptedProjectTask) => t.id === taskId)

  // Get canonical task for draft conflict detection
  const canonicalTask = useMemo((): DecryptedProjectTask | null => {
    if (!application) return null
    return application.getCacheStores().entityStore.getCanonical<DecryptedProjectTask>(taskId) ?? null
  }, [application, taskId])

  // Draft state for offline/conflict handling
  const draftState = useDraftState({
    entityType: "task",
    entityId: taskId,
    canonicalContentHash: canonicalTask?.contentHash,
    canonicalExists: Boolean(canonicalTask),
  })

  // Count of draft action rows for keyboard navigation
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle("task", taskId)
  const isSubscriptionDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = "Sync required to manage notifications."

  // Get count of entity links for keyboard navigation
  // Uses 'task' (client type) - server maps to 'project_task' for aggregation
  const linksItemCount = useLinksSidecarItemCount(taskId, "task")

  const statusSelectRef = useRef<HTMLSelectElement>(null)
  const assigneeSelectRef = useRef<HTMLSelectElement>(null)
  const tagSelectRef = useRef<HTMLSelectElement>(null)
  const dueDateInputRef = useRef<HTMLInputElement>(null)

  // Format date for display (without time - used for created date)
  const formatDate = (date: Date | null) => {
    if (!date) return "Not set"
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Format date with time for due date display
  const formatDateTime = (date: string | undefined) => {
    if (!date) return "Not set"
    const d = new Date(date)
    const dateStr = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
    return `${dateStr}, ${timeStr}`
  }

  // Convert Date to datetime-local input format (YYYY-MM-DDTHH:mm)
  const formatDateForInput = (date: string | undefined): string => {
    if (!date) return ""
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Build list of assignable users from ACL entries + current user
  const assignableUsers = useMemo(() => {
    const userMap = new Map<string, { id: string; email: string; displayName: string }>()
    const displayNameByUserId = new Map<string, string>()

    for (const member of workspaceMembers) {
      displayNameByUserId.set(member.userId, member.displayName ?? "Unknown")
    }

    // Add users from ACL entries
    for (const entry of aclEntries) {
      if (entry.subjectType === "user" && entry.user) {
        const displayName = displayNameByUserId.get(entry.user.id) ?? entry.user.email
        userMap.set(entry.user.id, { id: entry.user.id, email: entry.user.email, displayName })
      }
    }

    // Add current user if not already present (creator always has access)
    if (currentUser && !userMap.has(currentUser.uuid)) {
      const displayName = displayNameByUserId.get(currentUser.uuid) ?? currentUser.email
      userMap.set(currentUser.uuid, { id: currentUser.uuid, email: currentUser.email, displayName })
    }

    // Sort alphabetically by name
    return Array.from(userMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [aclEntries, currentUser, workspaceMembers])

  // Get the creator name from workspace members or current user
  const creatorName = useMemo(() => {
    if (!task?.creatorId) return "Unknown"

    // Check if creator is the active user
    if (activeUser && activeUser.uuid === task.creatorId) {
      return "You"
    }

    // Look up creator from workspace members
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find((m: WorkspaceMember) => m.userId === task.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [task?.creatorId, activeUser, workspaceMemberManager])

  // Handle status change from native select
  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as TaskStatus
      updateTask({
        projectId,
        taskId,
        updates: { content: { status: value } },
      })
    },
    [projectId, taskId, updateTask]
  )

  // Handle assignee change from native select
  const handleAssigneeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      updateTask({
        projectId,
        taskId,
        updates: { metaFields: { assignee_id: value === "" ? null : value } },
      })
    },
    [projectId, taskId, updateTask]
  )

  // Handle tag change from native select
  // Special values: '__create__' opens tag creation sidecar, '' removes the tag
  const handleTagChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      if (value === "__create__") {
        // Reset select to current value and push create tag sidecar
        e.target.value = task?.metaFields.project_tag_id ?? ""
        pushSidecar(<CreateTagSidecar projectId={projectId} taskId={taskId} />, "New Tag")
      } else {
        // Update task with selected tag (empty string = remove tag)
        updateTask({
          projectId,
          taskId,
          updates: { metaFields: { project_tag_id: value === "" ? null : value } },
        })
      }
    },
    [projectId, taskId, task?.metaFields.project_tag_id, updateTask, pushSidecar]
  )

  // Handle due date change from datetime-local input
  const handleDueDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      // Empty value means user cleared the date
      const newDueDate = value ? new Date(value).toISOString() : null
      updateTask({
        projectId,
        taskId,
        updates: { metaFields: { due_date: newDueDate } },
      })
    },
    [projectId, taskId, updateTask]
  )

  // Perform the actual delete after confirmation
  const handleConfirmDelete = useCallback(() => {
    if (isDeleting) return
    setIsDeleting(true)
    deleteTask(
      { projectId, taskId },
      {
        onSuccess: () => {
          // Navigate back to project view and clear sidecar
          setShowDeleteConfirm(false)
          navigateBack()
          clearSidecar()
        },
        onError: () => {
          setIsDeleting(false)
          setShowDeleteConfirm(false)
        },
      }
    )
  }, [deleteTask, projectId, taskId, navigateBack, clearSidecar, isDeleting])

  // Show delete confirmation sub-rows
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  // Handle export click - opens markdown export sidecar
  const handleExportClick = useCallback(() => {
    if (!task) {
      return
    }

    pushSidecar(
      <TaskMarkdownExportSidecar projectId={projectId} taskId={taskId} taskTitle={task.content.title} />,
      "Export"
    )
  }, [pushSidecar, projectId, taskId, task])

  // Handle opening status select (for keyboard navigation - Enter key)
  const handleStatusOpen = useCallback(() => {
    if (statusSelectRef.current) {
      statusSelectRef.current.focus()
      statusSelectRef.current.showPicker()
    }
  }, [])

  // Handle opening assignee select (for keyboard navigation - Enter key)
  const handleAssigneeOpen = useCallback(() => {
    if (assigneeSelectRef.current) {
      assigneeSelectRef.current.focus()
      assigneeSelectRef.current.showPicker()
    }
  }, [])

  // Handle opening tag select (for keyboard navigation - Enter key)
  const handleTagOpen = useCallback(() => {
    if (tagSelectRef.current) {
      tagSelectRef.current.focus()
      tagSelectRef.current.showPicker()
    }
  }, [])

  // Handle opening due date picker (for keyboard navigation - Enter key)
  const handleDueDateOpen = useCallback(() => {
    if (dueDateInputRef.current) {
      dueDateInputRef.current.focus()
      dueDateInputRef.current.showPicker()
    }
  }, [])

  // Draft action handlers
  const handleRetryDraft = useCallback(() => {
    retryDraft("task", taskId)
  }, [retryDraft, taskId])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("task", taskId)
  }, [discardDraft, taskId])

  const handleForceSave = useCallback(() => {
    if (canonicalTask) {
      forceSaveWithExpectedHash("task", taskId, canonicalTask.contentHash)
    }
  }, [forceSaveWithExpectedHash, taskId, canonicalTask])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("task", taskId)
  }, [restoreDraftAsNew, taskId])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  // Handle select via keyboard - maps index to action, accounting for draft actions
  // Order: [Draft actions...], Status, Assignee, Tag, Due Date, Export, Subscribe, Delete, [Confirm, Cancel], [Copy Link]
  const handleSelect = useCallback(
    (index: number) => {
      const adjustedIndex = index - draftActionCount
      if (adjustedIndex === 0) {
        handleStatusOpen()
      } else if (adjustedIndex === 1) {
        handleAssigneeOpen()
      } else if (adjustedIndex === 2) {
        handleTagOpen()
      } else if (adjustedIndex === 3) {
        handleDueDateOpen()
      } else if (adjustedIndex === 4) {
        handleExportClick()
      } else if (adjustedIndex === 5) {
        if (!isSubscriptionDisabled) {
          toggleSubscription()
        }
      } else if (adjustedIndex === 6) {
        handleDeleteClick()
      } else if (adjustedIndex === 7 && showDeleteConfirm) {
        handleConfirmDelete()
      } else if (adjustedIndex === 8 && showDeleteConfirm) {
        handleCancelDelete()
      }
    },
    [
      handleStatusOpen,
      handleAssigneeOpen,
      handleTagOpen,
      handleDueDateOpen,
      handleExportClick,
      toggleSubscription,
      handleDeleteClick,
      handleConfirmDelete,
      handleCancelDelete,
      showDeleteConfirm,
      draftActionCount,
      isSubscriptionDisabled,
    ]
  )

  // Build diff rows for conflict display
  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalTask || !task) return []
    return [
      {
        label: "Title",
        localValue: task.content.title,
        serverValue: canonicalTask.content.title,
      },
    ]
  }, [draftState.isConflict, canonicalTask, task])

  if (!task) {
    return <div className={styles.sidecarEmpty}>Task not found</div>
  }

  const hasCopyLink = typeof workspaceId === "string" && workspaceId.length > 0
  const copyLinkIndex = hasCopyLink ? draftActionCount + (showDeleteConfirm ? 9 : 7) : null
  const linksStartIndex =
    hasCopyLink && copyLinkIndex !== null ? copyLinkIndex + 1 : draftActionCount + (showDeleteConfirm ? 9 : 7)
  const totalItemCount = linksStartIndex + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft Section - shown when there's a draft */}
      <DraftSidecarSection
        entityLabel="task"
        draftState={draftState}
        canonicalUpdatedAt={canonicalTask?.updatedAt}
        localUpdatedAt={draftState.draftEntity ? new Date(draftState.draftEntity.entity.updated_at) : task.updatedAt}
        diffRows={diffRows}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onForceSave={handleForceSave}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />

      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem
            icon={<ListTodo size={12} />}
            label="Status"
            index={draftActionCount}
            onClick={handleStatusOpen}
            testId="task-status-row"
            value={
              <select
                ref={statusSelectRef}
                value={task.content.status}
                onChange={handleStatusChange}
                onClick={e => e.stopPropagation()}
                data-testid="task-status"
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  outline: "none",
                  font: "inherit",
                  cursor: "pointer",
                  textAlign: "right",
                }}
              >
                <option key="status-backlog" value="backlog" data-testid="task-status-backlog">
                  Backlog
                </option>
                <option key="status-in-progress" value="in_progress" data-testid="task-status-in-progress">
                  In Progress
                </option>
                <option key="status-done" value="done" data-testid="task-status-done">
                  Done
                </option>
              </select>
            }
          />
          <SidecarMetaItem
            icon={<User size={12} />}
            label="Assignee"
            index={draftActionCount + 1}
            onClick={handleAssigneeOpen}
            testId="task-assignee-row"
            value={
              <select
                ref={assigneeSelectRef}
                value={task.metaFields.assignee_id ?? ""}
                onChange={handleAssigneeChange}
                onClick={e => e.stopPropagation()}
                data-testid="task-assignee"
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  outline: "none",
                  font: "inherit",
                  cursor: "pointer",
                  textAlign: "right",
                }}
              >
                <option key="assignee-unassigned" value="" data-testid="task-assignee-unassigned">
                  Unassigned
                </option>
                {assignableUsers.map(user => (
                  <option
                    key={`assignee-${user.id}`}
                    value={user.id}
                    data-testid={`task-assignee-${user.id}`}
                  >
                    {user.displayName || user.email}
                  </option>
                ))}
              </select>
            }
          />
          <SidecarMetaItem
            icon={<Tag size={12} />}
            label="Tag"
            index={draftActionCount + 2}
            onClick={handleTagOpen}
            testId="task-tag-row"
            value={
              <select
                ref={tagSelectRef}
                value={task.metaFields.project_tag_id ?? ""}
                onChange={handleTagChange}
                onClick={e => e.stopPropagation()}
                data-testid="task-tag"
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  outline: "none",
                  font: "inherit",
                  cursor: "pointer",
                  textAlign: "right",
                }}
              >
                <option key="tag-create" value="__create__" data-testid="task-tag-create">
                  Create new tag
                </option>
                {projectTags.map((tag: DecryptedProjectTag) => (
                  <option key={`tag-${tag.id}`} value={tag.id} data-testid={`task-tag-${tag.id}`}>
                    {tag.content.name}
                  </option>
                ))}
                {task.metaFields.project_tag_id && (
                  <option key="tag-remove" value="" data-testid="task-tag-remove">
                    Remove tag
                  </option>
                )}
                {!task.metaFields.project_tag_id && projectTags.length === 0 && (
                  <option key="tag-none-disabled" value="" disabled>
                    No tags available
                  </option>
                )}
                {!task.metaFields.project_tag_id && projectTags.length > 0 && (
                  <option key="tag-none" value="" data-testid="task-tag-none">
                    No tag
                  </option>
                )}
              </select>
            }
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Due"
            index={draftActionCount + 3}
            onClick={handleDueDateOpen}
            testId="task-due-date-row"
            value={
              <>
                {/* Hidden datetime input - pointer-events:none so clicks go through to parent */}
                <input
                  ref={dueDateInputRef}
                  type="datetime-local"
                  value={formatDateForInput(task.metaFields.due_date)}
                  onChange={handleDueDateChange}
                  data-testid="task-due-date"
                  style={{
                    position: "absolute",
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
                {/* Display text that shows formatted date/time or "Not set" */}
                <span style={{ cursor: "pointer" }}>
                  {task.metaFields.due_date ? formatDateTime(task.metaFields.due_date) : "Not set"}
                </span>
              </>
            }
          />
          <SidecarMetaItem
            icon={<User size={12} />}
            label="Created by"
            value={creatorName}
            testId="task-creator-row"
          />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Created" value={formatDate(task.createdAt)} />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={draftActionCount + 4}
            icon={<Download size={14} />}
            title="Export"
            onClick={handleExportClick}
            testId="task-export-open"
          />
          <NotificationSubscriptionSidecarRow
            index={draftActionCount + 5}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isSubscriptionDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="task-subscription-toggle"
          />
          <SidecarRow
            index={draftActionCount + 6}
            icon={<Trash2 size={14} />}
            title={isDeleting ? "Deleting..." : "Delete task"}
            onClick={handleDeleteClick}
            isDestructive
            testId="task-delete"
          />
          {showDeleteConfirm && (
            <>
              <SidecarRow
                index={draftActionCount + 7}
                title={isDeleting ? "Deleting..." : "Confirm"}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                isDestructive
                isSubRow
                testId="confirm-delete-task"
              />
              <SidecarRow
                index={draftActionCount + 8}
                title="Cancel"
                onClick={handleCancelDelete}
                disabled={isDeleting}
                isSubRow
                testId="task-delete-cancel"
              />
            </>
          )}
          {hasCopyLink && copyLinkIndex !== null && workspaceId && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="projects"
              entityId={projectId}
              taskId={taskId}
              index={copyLinkIndex}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={taskId} entityType="task" startIndex={linksStartIndex} />
    </Sidecar>
  )
}

/**
 * CreateTagSidecar provides a form for creating a new tag.
 * After successful creation, the tag is automatically assigned to the task.
 */
interface CreateTagSidecarProps {
  projectId: string
  taskId: string
}

function CreateTagSidecar({ projectId, taskId }: CreateTagSidecarProps) {
  const { popSidecar } = useSidecar()
  const { mutate: updateTask } = useUpdateProjectTask()
  const { mutateAsync: createTagAsync } = useCreateProjectTag()
  const [newTagName, setNewTagName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Create a new tag and assign it to the task, then pop the sidecar
  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim() || isSubmitting) return

    setIsSubmitting(true)
    const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1"]
    const color = colors[Math.floor(Math.random() * colors.length)]

    try {
      const newTag = await createTagAsync({ projectId, name: newTagName.trim(), color })
      // Assign the newly created tag to the task
      updateTask({
        projectId,
        taskId,
        updates: { metaFields: { project_tag_id: newTag.id } },
      })
      popSidecar()
    } catch {
      // Tag creation failed - allow retry
      setIsSubmitting(false)
    }
  }, [newTagName, isSubmitting, projectId, taskId, createTagAsync, updateTask, popSidecar])

  // Handle cancel - just pop the sidecar
  const handleCancel = useCallback(() => {
    popSidecar()
  }, [popSidecar])

  return (
    <Sidecar itemCount={0}>
      <SidecarSection title="Create Tag">
        <div className={styles.sidecarTagInput}>
          <input
            ref={inputRef}
            type="text"
            className={styles.sidecarTagInputField}
            placeholder="Tag name..."
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                handleCreateTag()
              } else if (e.key === "Escape") {
                handleCancel()
              }
            }}
            disabled={isSubmitting}
            data-testid="create-tag-input"
          />
        </div>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Plus size={14} />}
            title={isSubmitting ? "Creating..." : "Create"}
            onClick={handleCreateTag}
            testId="create-tag-submit"
          />
          <SidecarRow
            index={1}
            icon={<ArrowLeft size={14} />}
            title="Cancel"
            onClick={handleCancel}
            testId="create-tag-cancel"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
