import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useWindowStore } from "../store/window-store"
import { useSidecar } from "../contexts/SidecarContext"
import { useFocus } from "../contexts/FocusContext"
import { useAuthStore } from "../store/auth-store"
import { useDraftInfoMap, isDraftSettled, type DraftInfo } from "../hooks/useDraftInfoMap"
import type { Draft } from "../../engine/models/entity"
import { List, ListRow, ListSearch, ListEmpty, CustomListContent } from "../components/ListUI"
import { TaskSidecar } from "../components/TaskSidecar"
import { TaskDetailView } from "../components/TaskDetailView"
import { TaskCommentEditView } from "../components/TaskCommentEditView"
import { Confetti } from "../components/Confetti"
import { ProjectSidecar, CreateProjectSidecar } from "../components/ProjectSidecar"
import { TagSidecar } from "../components/TagSidecar"
import { useProjects } from "../store/queries/use-projects"
import {
  useProjectTasks,
  useCreateProjectTask,
  useUpdateTaskStatus,
} from "../store/queries/use-project-tasks"
import { useTaskCommentCount } from "../store/queries/use-task-comments"
import { useProjectACLEntries } from "../store/queries/use-project-acl"
import { useProjectTags } from "../store/queries/use-project-tags"
import { useWorkspaceMembers } from "../store/queries/use-workspace-members"
import type { DecryptedProjectTask, DecryptedProject, DecryptedProjectTag, TaskStatus } from "../../engine/models/entity"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import { FolderKanban, Circle, CheckCircle2, Plus, MessageCircle } from "lucide-react"
import * as appStyles from "../styles/app.css"
import * as chatStyles from "../styles/chat.css"
import * as taskStyles from "../styles/tasks.css"


/**
 * TasksTool displays project list and individual project task views.
 * Uses E2EE-backed hooks for server-synced encrypted data.
 */
export function TasksTool() {
  // All hooks must be called before any early returns
  const navigate = useNavigate()
  const {
    workspaceId,
    itemId,
    taskId: urlTaskId,
  } = useParams<{ workspaceId: string; itemId?: string; taskId?: string }>()
  const { navigateTo, getCurrentItem } = useWindowStore()
  const { setSidecar, clearSidecar } = useSidecar()
  const { data: projects = [], isLoading } = useProjects()

  // Build draft info map for projects (includes auto-refresh on transient window expiry)
  const projectDraftInfoById = useDraftInfoMap({ entityType: "project" })

  // Check if we're viewing a specific task or editing a comment.
  // Prefer taskId from URL params, fall back to breadcrumb for comment editing.
  const currentItem = getCurrentItem()
  const currentTaskId = urlTaskId || currentItem?.taskId
  const currentCommentId = currentItem?.commentId
  const [searchQuery, setSearchQuery] = useState("")

  // Memoized sorted projects list
  const sortedProjects = useMemo(() => {
    const filtered = projects.filter((p: DecryptedProject) => {
      if (!searchQuery) return true
      return p.content.name.toLowerCase().includes(searchQuery.toLowerCase())
    })
    return [...filtered].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }, [projects, searchQuery])

  // Handler callbacks - must be defined before early returns
  const handleSelect = useCallback(
    (project: DecryptedProject) => {
      if (!workspaceId) return
      navigateTo({
        id: project.id,
        label: project.content.name,
        tool: "projects",
        itemId: project.id,
      })
      navigate(`/w/${workspaceId}/projects/${project.id}`)
    },
    [workspaceId, navigateTo, navigate]
  )

  // Handler for opening the create project sidecar form
  const handleCreate = useCallback(() => {
    setSidecar(<CreateProjectSidecar onCancel={clearSidecar} />, "New Project")
  }, [setSidecar, clearSidecar])

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index === 0) {
        handleCreate()
        return
      }
      const projectIndex = index - 1
      if (projectIndex < sortedProjects.length) {
        const project = sortedProjects[projectIndex]
        if (project) {
          handleSelect(project)
        }
      }
    },
    [sortedProjects, handleSelect, handleCreate]
  )

  // If viewing a specific project, show the project view or task detail view
  if (itemId && workspaceId) {
    const project = projects.find((p: DecryptedProject) => p.id === itemId)
    if (!project && !isLoading) {
      return (
        <CustomListContent testId="tasks-tool-container">
          <div>Project not found</div>
        </CustomListContent>
      )
    }
    if (!project) {
      return (
        <CustomListContent testId="tasks-tool-container">
          <div className={appStyles.emptyState}>
            <p className={appStyles.emptyStateText}>Loading...</p>
          </div>
        </CustomListContent>
      )
    }

    // If we have a commentId in the breadcrumb, render the TaskCommentEditView terminus
    if (currentCommentId && currentTaskId) {
      return (
        <CustomListContent testId="tasks-tool-container">
          <TaskCommentEditView projectId={project.id} taskId={currentTaskId} commentId={currentCommentId} />
        </CustomListContent>
      )
    }

    // If we have a taskId in the breadcrumb, render the TaskDetailView terminus
    if (currentTaskId) {
      return (
        <CustomListContent testId="tasks-tool-container">
          <TaskDetailView key={currentTaskId} projectId={project.id} taskId={currentTaskId} />
        </CustomListContent>
      )
    }

    return (
      <CustomListContent testId="tasks-tool-container">
        <ProjectView project={project} workspaceId={workspaceId} />
      </CustomListContent>
    )
  }

  // Total items: create button + projects
  const itemCount = 1 + sortedProjects.length

  return (
    <List itemCount={itemCount} onSelect={handleSelectByIndex} testId="tasks-tool-container">
      <ListSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search projects..." />

      <ListRow
        index={0}
        icon={<Plus size={16} />}
        title="New project"
        isCreateAction
        onClick={handleCreate}
        testId="new-project-button"
      />

      {sortedProjects.map((project, index) => (
        <ProjectListRow
          key={project.id}
          project={project}
          index={1 + index}
          onSelect={() => handleSelect(project)}
          draftInfo={projectDraftInfoById.get(project.id)}
        />
      ))}

      {sortedProjects.length === 0 && searchQuery && <ListEmpty message="No projects found" />}

      {sortedProjects.length === 0 && !searchQuery && !isLoading && <ListEmpty message="No projects yet" />}

      {isLoading && <ListEmpty message="Loading projects..." />}
    </List>
  )
}

/**
 * ProjectListRow displays a project with its task count.
 * Separated to enable task count fetching per project.
 */
interface ProjectListRowProps {
  project: DecryptedProject
  index: number
  onSelect: () => void
  draftInfo?: DraftInfo
}

function ProjectListRow({ project, index, onSelect, draftInfo }: ProjectListRowProps) {
  const { data: tasks = [] } = useProjectTasks(project.id)

  const taskCount = useMemo(() => {
    const done = tasks.filter((t: DecryptedProjectTask) => t.content.status === "done").length
    const total = tasks.length
    return `${done}/${total} tasks`
  }, [tasks])

  // Show draft badge if draft exists and has settled (past transient window)
  const showDraftBadge = isDraftSettled(draftInfo)

  return (
    <ListRow
      index={index}
      icon={<FolderKanban size={16} />}
      title={project.content.name}
      meta={taskCount}
      onClick={onSelect}
      testId={`project-item-${project.id}`}
      accessory={
        showDraftBadge ? (
          <span className={taskStyles.projectDraftBadge} data-testid="project-draft-badge">
            Draft
          </span>
        ) : undefined
      }
    />
  )
}

/**
 * ProjectView is a terminus view for task management within a project.
 */
interface ProjectViewProps {
  project: DecryptedProject
  workspaceId: string
}

function ProjectView({ project, workspaceId }: ProjectViewProps) {
  const navigate = useNavigate()
  const { setSidecar, clearSidecar } = useSidecar()
  const { isContentFocused } = useFocus()
  const { navigateToOrReplace } = useWindowStore()
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(project.id)
  const { data: projectTags = [] } = useProjectTags(project.id)
  // Use reactive workspace members so assignee display names update after refresh/decryption.
  const { data: workspaceMembers = [] } = useWorkspaceMembers()
  const { mutate: createTask } = useCreateProjectTask()
  const { mutate: updateStatus } = useUpdateTaskStatus()

  // Filter to only include tasks for this project
  const taskEntityFilter = useCallback(
    (draft: Draft) => draft.entity.parent_id === project.id && draft.entity.parent_type === "project",
    [project.id]
  )

  // Build draft info map for tasks in this project (includes auto-refresh on transient window expiry).
  const taskDraftInfoById = useDraftInfoMap({
    entityType: "task",
    blockType: "task",
    entityFilter: taskEntityFilter,
  })

  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isInputFocused, setIsInputFocused] = useState(false)
  // Track which tag is selected for keyboard navigation (-1 = none, 0 = "All", 1+ = tags)
  const [selectedTagIndex, setSelectedTagIndex] = useState(-1)
  // Track tasks that are currently celebrating completion (showing confetti)
  const [celebratingTaskIds, setCelebratingTaskIds] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tagsContainerRef = useRef<HTMLDivElement>(null)

  // Set ProjectSidecar when entering project view (no task selected).
  // Only re-run when the project ID changes, not when the project object changes
  // (e.g., due to optimistic updates during rename) to avoid resetting the sidecar stack.
  useEffect(() => {
    setSidecar(<ProjectSidecar project={project} />, project.content.name)
    return () => clearSidecar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, setSidecar, clearSidecar])

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      createTask({
        projectId: project.id,
        title: newTaskTitle.trim(),
      })
      setNewTaskTitle("")
    }
  }

  // Handle checkbox toggle - cycles between backlog and done
  // Clicking checkbox on backlog/in_progress task marks it done (with celebration)
  // Clicking checkbox on done task marks it backlog
  const handleToggleTask = useCallback(
    (taskId: string, status: TaskStatus) => {
      // If not done, mark as done with celebration
      if (status !== "done") {
        // Add to celebrating set to show confetti animation
        setCelebratingTaskIds(prev => new Set(prev).add(taskId))

        // After 500ms celebration, actually update status and remove from celebrating
        setTimeout(() => {
          updateStatus({
            projectId: project.id,
            taskId,
            status: "done",
          })
          setCelebratingTaskIds(prev => {
            const next = new Set(prev)
            next.delete(taskId)
            return next
          })
        }, 500)
      } else {
        // Currently done - move back to backlog immediately (no celebration)
        updateStatus({
          projectId: project.id,
          taskId,
          status: "backlog",
        })
      }
    },
    [project.id, updateStatus]
  )

  // Handle clicking on a tag - shows tag sidecar and filters by it
  const handleSelectTag = useCallback(
    (tag: DecryptedProjectTag) => {
      // Toggle filter or set it if different tag
      setActiveTagFilter(current => (current === tag.id ? null : tag.id))
      // Show the tag sidecar
      setSidecar(<TagSidecar projectId={project.id} tag={tag} />, tag.content.name)
    },
    [project.id, setSidecar]
  )

  // Activate a tag filter by index (0 = "All", 1+ = projectTags)
  const activateTagByIndex = useCallback(
    (index: number) => {
      if (index === 0) {
        // "All" filter
        setActiveTagFilter(null)
        setSidecar(<ProjectSidecar project={project} />, project.content.name)
      } else {
        const tag = projectTags[index - 1]
        if (tag) {
          handleSelectTag(tag)
        }
      }
    },
    [projectTags, project, setSidecar, handleSelectTag]
  )

  // Total number of tag buttons (1 for "All" + projectTags)
  const totalTagButtons = 1 + projectTags.length

  // Handle keyboard navigation in tags area
  const handleTagsKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          if (selectedTagIndex === 0) {
            // At first tag, let event bubble to move focus to navigation sidebar
            setSelectedTagIndex(-1)
            return
          }
          e.preventDefault()
          e.stopPropagation()
          setSelectedTagIndex(i => Math.max(i - 1, 0))
          break
        case "ArrowRight":
          if (selectedTagIndex === totalTagButtons - 1) {
            // At last tag, let event bubble to move focus to sidecar
            setSelectedTagIndex(-1)
            return
          }
          e.preventDefault()
          e.stopPropagation()
          setSelectedTagIndex(i => Math.min(i + 1, totalTagButtons - 1))
          break
        case "ArrowUp":
          // Let event bubble to move focus to navigation sidebar
          setSelectedTagIndex(-1)
          return
        case "ArrowDown":
          e.preventDefault()
          e.stopPropagation()
          setSelectedTagIndex(-1)
          inputRef.current?.focus()
          break
        case "Enter":
          e.preventDefault()
          e.stopPropagation()
          if (selectedTagIndex >= 0) {
            activateTagByIndex(selectedTagIndex)
          }
          break
      }
    },
    [totalTagButtons, selectedTagIndex, activateTagByIndex]
  )

  // Filter tasks by active tag
  const filterTasks = useCallback(
    (taskList: DecryptedProjectTask[]) => {
      if (!activeTagFilter) return taskList
      return taskList.filter(t => t.metaFields.project_tag_id === activeTagFilter)
    },
    [activeTagFilter]
  )

  // Sort incomplete tasks: in_progress first, then by due date (nearest first, null last), then by createdAt descending
  const incompleteTasks = useMemo(
    () =>
      filterTasks(tasks.filter((t: DecryptedProjectTask) => t.content.status !== "done")).sort((a, b) => {
        // In Progress tasks come before Backlog tasks
        if (a.content.status === "in_progress" && b.content.status !== "in_progress") return -1
        if (b.content.status === "in_progress" && a.content.status !== "in_progress") return 1
        // Both have due dates - sort by nearest first
        if (a.metaFields.due_date && b.metaFields.due_date) {
          return new Date(a.metaFields.due_date!).getTime() - new Date(b.metaFields.due_date!).getTime()
        }
        // Only a has due date - a comes first
        if (a.metaFields.due_date && !b.metaFields.due_date) return -1
        // Only b has due date - b comes first
        if (!a.metaFields.due_date && b.metaFields.due_date) return 1
        // Neither has due date - sort by createdAt descending (newest first)
        return b.createdAt.getTime() - a.createdAt.getTime()
      }),
    [tasks, filterTasks]
  )
  // Sort done tasks by createdAt descending (newest first)
  const doneTasks = useMemo(
    () =>
      filterTasks(tasks.filter((t: DecryptedProjectTask) => t.content.status === "done")).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      ),
    [tasks, filterTasks]
  )
  const allTasks = useMemo(() => [...incompleteTasks, ...doneTasks], [incompleteTasks, doneTasks])

  // Handle task selection - update navigation, URL, and sidecar.
  // Uses navigateToOrReplace to replace existing task selection rather than stacking.
  const handleSelectTask = useCallback(
    (task: DecryptedProjectTask, index: number) => {
      setSelectedIndex(index)
      // Update navigation for breadcrumb - replaces if already at task level
      navigateToOrReplace({
        id: `${project.id}-${task.id}`,
        label: task.content.title,
        tool: "projects",
        itemId: project.id,
        taskId: task.id,
      })
      // Update URL to reflect selected task
      navigate(`/w/${workspaceId}/projects/${project.id}/tasks/${task.id}`)
      // Set the sidecar content
      setSidecar(<TaskSidecar projectId={project.id} taskId={task.id} />, task.content.title)
    },
    [project.id, workspaceId, navigateToOrReplace, navigate, setSidecar]
  )

  // Keyboard navigation - only active when content area is focused
  useEffect(() => {
    if (isInputFocused || !isContentFocused) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if event was already handled by another component (e.g., sidebar navigation)
      if (e.defaultPrevented) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, allTasks.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          if (selectedIndex === 0) {
            // At first task, move focus to input
            setSelectedIndex(-1)
            inputRef.current?.focus()
          } else {
            setSelectedIndex(i => Math.max(i - 1, -1))
          }
          break
        case "Enter":
          e.preventDefault()
          if (selectedIndex >= 0 && selectedIndex < allTasks.length) {
            const task = allTasks[selectedIndex]
            if (task) {
              handleSelectTask(task, selectedIndex)
            }
          } else if (selectedIndex === -1) {
            inputRef.current?.focus()
          }
          break
        case " ":
          if (selectedIndex >= 0 && selectedIndex < allTasks.length) {
            e.preventDefault()
            const task = allTasks[selectedIndex]
            if (task) {
              handleToggleTask(task.id, task.content.status)
            }
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isInputFocused, isContentFocused, selectedIndex, allTasks, handleSelectTask, handleToggleTask])

  // Get tag name from ID for filtering button labels
  const getTagById = useCallback(
    (tagId: string) => projectTags.find((t: DecryptedProjectTag) => t.id === tagId),
    [projectTags]
  )

  return (
    <div ref={containerRef}>
      <h2 className={taskStyles.projectViewHeader} data-testid="project-view-header">
        {project.content.name}
      </h2>

      {/* Project Tags Filter */}
      {projectTags.length > 0 && (
        <div
          ref={tagsContainerRef}
          className={taskStyles.projectTagsFilter}
          tabIndex={-1}
          onKeyDown={handleTagsKeyDown}
          onBlur={() => setSelectedTagIndex(-1)}
        >
          <button
            className={taskStyles.projectTagBtn}
            data-active={activeTagFilter === null}
            data-selected={selectedTagIndex === 0}
            onClick={() => {
              setActiveTagFilter(null)
              setSidecar(<ProjectSidecar project={project} />, project.content.name)
            }}
            data-testid="tag-filter-all"
          >
            All
          </button>
          {projectTags.map((tag: DecryptedProjectTag, index: number) => (
            <button
              key={tag.id}
              className={taskStyles.projectTagBtn}
              data-active={activeTagFilter === tag.id}
              data-selected={selectedTagIndex === index + 1}
              onClick={() => handleSelectTag(tag)}
              style={
                {
                  "--tag-color": tag.content.color,
                  "--tag-text-color": "white",
                } as React.CSSProperties
              }
              data-testid={`tag-filter-${tag.id}`}
            >
              {tag.content.name}
            </button>
          ))}
        </div>
      )}

      <div className={taskStyles.taskInputContainer}>
        <input
          ref={inputRef}
          className={`${chatStyles.chatInput} ${taskStyles.taskInput}`}
          type="text"
          placeholder="Add a task..."
          value={newTaskTitle}
          data-testid="task-create-input"
          onChange={e => setNewTaskTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleAddTask()
            if (e.key === "Escape") {
              setIsInputFocused(false)
              inputRef.current?.blur()
            }
            if (e.key === "ArrowDown" && allTasks.length > 0) {
              e.preventDefault()
              setSelectedIndex(0)
              inputRef.current?.blur()
            }
            if (e.key === "ArrowUp" && projectTags.length > 0) {
              e.preventDefault()
              setSelectedTagIndex(0)
              inputRef.current?.blur()
              tagsContainerRef.current?.focus()
            }
          }}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
        />
        <button className={chatStyles.chatSend} onClick={handleAddTask} data-testid="task-add-button">
          <Plus size={16} />
        </button>
      </div>

      <div className={taskStyles.tasksContainer}>
        {incompleteTasks.map((task, idx) => (
          <TaskItem
            key={task.id}
            task={task}
            projectId={project.id}
            tag={task.metaFields.project_tag_id ? getTagById(task.metaFields.project_tag_id!) : undefined}
            workspaceMembers={workspaceMembers}
            isSelected={selectedIndex === idx}
            isCelebrating={celebratingTaskIds.has(task.id)}
            onToggle={() => handleToggleTask(task.id, task.content.status)}
            onSelect={() => handleSelectTask(task, idx)}
            draftInfo={taskDraftInfoById.get(task.id)}
          />
        ))}

        {doneTasks.length > 0 && (
          <>
            <div className={taskStyles.sectionHeaderWithMargin}>Done ({doneTasks.length})</div>
            {doneTasks.map((task, idx) => (
              <TaskItem
                key={task.id}
                task={task}
                projectId={project.id}
                tag={task.metaFields.project_tag_id ? getTagById(task.metaFields.project_tag_id!) : undefined}
                workspaceMembers={workspaceMembers}
                isSelected={selectedIndex === incompleteTasks.length + idx}
                onToggle={() => handleToggleTask(task.id, task.content.status)}
                onSelect={() => handleSelectTask(task, incompleteTasks.length + idx)}
                draftInfo={taskDraftInfoById.get(task.id)}
              />
            ))}
          </>
        )}

        {incompleteTasks.length === 0 && doneTasks.length === 0 && !tasksLoading && (
          <div className={appStyles.emptyState}>
            <p className={appStyles.emptyStateText}>
              {activeTagFilter ? "No tasks with this tag" : "No tasks yet"}
            </p>
          </div>
        )}

        {tasksLoading && (
          <div className={appStyles.emptyState}>
            <p className={appStyles.emptyStateText}>Loading tasks...</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface TaskItemProps {
  task: DecryptedProjectTask
  projectId: string
  tag?: DecryptedProjectTag
  workspaceMembers: WorkspaceMember[]
  isSelected?: boolean
  isCelebrating?: boolean
  onToggle: () => void
  onSelect: () => void
  draftInfo?: DraftInfo
}

function TaskItem({
  task,
  projectId,
  tag,
  workspaceMembers,
  isSelected,
  isCelebrating,
  onToggle,
  onSelect,
  draftInfo,
}: TaskItemProps) {
  const { currentUser } = useAuthStore()
  const { data: aclEntries = [] } = useProjectACLEntries(projectId)
  const commentCount = useTaskCommentCount(task.id)
  // workspaceMembers passed from ProjectView to keep list items reactive to member hydration.

  // Get assignee's first name for display - check current user first, then workspace members, then ACL entries
  const assigneeFirstName = useMemo(() => {
    if (!task.metaFields.assignee_id) return null
    // Check if assignee is current user
    if (currentUser && currentUser.uuid === task.metaFields.assignee_id) {
      const currentMember = workspaceMembers.find(member => member.userId === currentUser.uuid)
      const fullName = currentMember?.displayName || currentUser.email || "Unknown"
      return fullName.split(" ")[0]
    }
    // Check workspace members
    const member = workspaceMembers.find(entry => entry.userId === task.metaFields.assignee_id)
    if (member) {
      return (member.displayName ?? "").split(" ")[0]
    }
    // Fall back to ACL entries for the user email
    for (const entry of aclEntries) {
      if (entry.subjectType === "user" && entry.user?.id === task.metaFields.assignee_id) {
        return entry.user.email.split("@")[0] || entry.user.email
      }
    }
    return null
  }, [task, currentUser, aclEntries, workspaceMembers])

  // Format due date for display - "Dec 25" or "Dec 25, 2024" if not current year
  const formattedDueDate = useMemo(() => {
    if (!task.metaFields.due_date) return null
    const dueDate = new Date(task.metaFields.due_date!)
    const currentYear = new Date().getFullYear()
    const dueYear = dueDate.getFullYear()
    const options: Intl.DateTimeFormatOptions =
      dueYear === currentYear
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" }
    return dueDate.toLocaleDateString("en-US", options)
  }, [task])

  // Check if task is overdue (past due date and not done)
  const isOverdue = useMemo(() => {
    if (!task.metaFields.due_date || task.content.status === "done") return false
    return new Date(task.metaFields.due_date!) < new Date()
  }, [task])

  // Show draft badge if draft exists and has settled (past transient window)
  const showDraftBadge = isDraftSettled(draftInfo)

  return (
    <div
      className={taskStyles.taskItem}
      data-selected={isSelected}
      onClick={onSelect}
      data-testid={`task-item-${task.id}`}
    >
      <button
        className={taskStyles.taskCheckButton}
        onClick={e => {
          e.stopPropagation()
          onToggle()
        }}
        data-testid={`task-check-${task.id}`}
      >
        {isCelebrating && <Confetti />}
        {isCelebrating || task.content.status === "done" ? (
          <CheckCircle2
            size={18}
            className={isCelebrating ? taskStyles.checkIconCelebrating : taskStyles.checkIconCompleted}
          />
        ) : (
          <Circle size={18} className={taskStyles.checkIconPending} />
        )}
      </button>
      <span
        className={
          isCelebrating
            ? `${taskStyles.taskTitle} ${taskStyles.taskTitleCelebrating}`
            : task.content.status === "done"
              ? `${taskStyles.taskTitle} ${taskStyles.taskTitleCompleted}`
              : taskStyles.taskTitle
        }
        data-testid={`task-title-${task.id}`}
        data-status={task.content.status}
      >
        {task.content.title}
      </span>
      {task.content.status === "in_progress" && (
        <span className={taskStyles.taskStatusLabel} data-testid={`task-status-badge-${task.id}`}>
          In Progress
        </span>
      )}
      {assigneeFirstName && <span className={taskStyles.taskAssignee}>{assigneeFirstName}</span>}
      {formattedDueDate && (
        <span
          className={isOverdue ? taskStyles.taskDueDateOverdue : taskStyles.taskDueDate}
          data-testid={`task-due-date-${task.id}`}
        >
          {formattedDueDate}
        </span>
      )}
      {tag && (
        <span
          className={taskStyles.taskTag}
          style={{ "--tag-bg": tag.content.color } as React.CSSProperties}
          data-testid={`task-tag-${task.id}`}
        >
          {tag.content.name}
        </span>
      )}
      {showDraftBadge && (
        <span className={taskStyles.taskDraftBadge} data-testid="task-draft-badge">
          Draft
        </span>
      )}
      {commentCount > 0 && (
        <span className={taskStyles.taskCommentCount} data-testid={`task-comment-count-${task.id}`}>
          <MessageCircle size={12} />
          {commentCount}
        </span>
      )}
    </div>
  )
}
