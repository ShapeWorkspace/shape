import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FileText, StickyNote, FolderKanban, CheckSquare } from "lucide-react"
import { List, ListRow, ListEmpty } from "../components/ListUI"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useNotes } from "../store/queries/use-notes"
import { usePapers } from "../store/queries/use-papers"
import { useProjects } from "../store/queries/use-projects"
import { useDrafts } from "../contexts/DraftContext"
import type { BlockDraft } from "../../engine/models/entity"
import { hasDraftSettled } from "../utils/drafts"
import type { EntityType } from "../../engine/utils/encryption-types"
import type { ToolType } from "../store/types"
import { getEntityBody, getEntityName, getEntityTitle } from "../utils/entity-content"

interface DraftListItem {
  entityType: EntityType
  entityId: string
  title: string
  subtitle: string
  /** For tasks: the parent project ID needed for navigation */
  projectId?: string
  /** For task comments: the parent task ID needed for navigation */
  taskId?: string
  /** For forum discussions and replies: parent channel ID */
  forumChannelId?: string
  /** For forum replies: parent discussion ID */
  forumDiscussionId?: string
}

/**
 * Builds a short plaintext preview for HTML-backed bodies.
 */
function buildDraftBodyPreview(body: string | null | undefined, maxLength = 60): string {
  if (!body) {
    return ""
  }
  const plainText = body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!plainText) {
    return ""
  }
  if (plainText.length <= maxLength) {
    return plainText
  }
  return `${plainText.substring(0, maxLength).trim()}...`
}

function getToolForDraftEntity(entityType: EntityType): ToolType {
  switch (entityType) {
    case "note":
      return "memos"
    case "block":
    case "paper":
    case "paper-comment":
    case "paper-comment-reply":
      return "papers"
    case "project":
    case "project-tag":
    case "task":
    case "task-comment":
      return "projects"
    case "direct-message":
      return "contacts"
    case "group-chat":
    case "group-message":
      return "groups"
    case "forum-channel":
    case "forum-discussion":
    case "forum-reply":
      return "forum"
    case "folder":
    case "file":
      return "files"
    case "workspace-member":
    case "user-profile":
      // Workspace member profiles are edited in settings, not a dedicated tool.
      return "settings"
    case "entity-link":
    case "reaction":
      // Entity links and reactions are cross-cutting and don't have a dedicated tool.
      // Default to notes as a reasonable fallback for navigation.
      return "memos"
    default: {
      const _exhaustiveCheck: never = entityType
      throw new Error(`Unhandled draft entity type: ${_exhaustiveCheck}`)
    }
  }
}

export function DraftsTool() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { navigateTo } = useWindowStore()
  const { application } = useEngineStore()
  const { draftEntities, draftBlocks } = useDrafts()
  const { data: notes = [] } = useNotes()
  const { data: papers = [] } = usePapers()
  const { data: projects = [] } = useProjects()
  const cacheStores = application?.getCacheStores()
  const entityStore = cacheStores?.entityStore
  const [entityStoreVersion, setEntityStoreVersion] = useState(0)

  useEffect(() => {
    if (!entityStore) return undefined
    const unsubscribe = entityStore.subscribe(() => {
      setEntityStoreVersion(version => version + 1)
    })
    return unsubscribe
  }, [entityStore])

  // Group draft blocks by entity_id only (UUIDs are globally unique).
  // This allows entity drafts to find their blocks.
  const draftBlocksByEntityId = useMemo(() => {
    const map = new Map<string, BlockDraft[]>()
    for (const block of draftBlocks) {
      const blocks = map.get(block.entityId) ?? []
      blocks.push(block)
      map.set(block.entityId, blocks)
    }
    return map
  }, [draftBlocks])

  const noteTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const note of notes) {
      map.set(note.id, note.title || "Untitled")
    }
    return map
  }, [notes])

  const paperTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const paper of papers) {
      map.set(paper.id, paper.content.name || "Untitled")
    }
    return map
  }, [papers])

  const projectTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.id, project.content.name || "Untitled")
    }
    return map
  }, [projects])

  // For tasks, we look up titles from the engine's task cache (includes draft tasks).
  // We also build a map of task ID -> project ID for navigation purposes.
  const { taskTitleById, taskProjectById } = useMemo(() => {
    const titleMap = new Map<string, string>()
    const projectMap = new Map<string, string>()

    if (!entityStore) {
      return { taskTitleById: titleMap, taskProjectById: projectMap }
    }

    const tasks = entityStore.getAllByEntityType("task")
    for (const task of tasks) {
      const title = getEntityTitle(task)
      titleMap.set(task.id, title && title.trim() ? title : "Untitled Task")
      if (task.parentId && task.parentType === "project") {
        projectMap.set(task.id, task.parentId)
      }
    }

    return { taskTitleById: titleMap, taskProjectById: projectMap }
  }, [entityStore, entityStoreVersion])

  const draftItems = useMemo<DraftListItem[]>(() => {
    const items: DraftListItem[] = []
    // Deduplicate by entity_id only - UUIDs are globally unique across all entity types.
    const seenEntityIds = new Set<string>()

    // Process entity drafts first (they contain parent relationships needed for navigation)
    for (const draft of draftEntities) {
      const blocksForEntity = draftBlocksByEntityId.get(draft.id) ?? []
      if (!hasDraftSettled(draft, blocksForEntity)) {
        continue
      }
      if (seenEntityIds.has(draft.id)) continue
      seenEntityIds.add(draft.id)

      // Get title based on entity type
      let title = "Draft"
      let projectId: string | undefined
      let taskId: string | undefined
      let forumChannelId: string | undefined
      let forumDiscussionId: string | undefined

      if (draft.entity.entity_type === "note") {
        title = noteTitleById.get(draft.id) ?? "Untitled"
      } else if (draft.entity.entity_type === "paper") {
        title = paperTitleById.get(draft.id) ?? "Untitled"
      } else if (draft.entity.entity_type === "project") {
        title = projectTitleById.get(draft.id) ?? "Untitled"
      } else if (draft.entity.entity_type === "task") {
        title = taskTitleById.get(draft.id) ?? "Untitled Task"
        projectId = taskProjectById.get(draft.id)
      } else if (draft.entity.entity_type === "task-comment") {
        taskId = draft.entity.parent_id ?? undefined
        projectId = taskId ? taskProjectById.get(taskId) : undefined
        const commentPreview = buildDraftBodyPreview(getEntityBody(entityStore?.get(draft.id)))
        title = commentPreview || "Task Comment"
      } else if (draft.entity.entity_type === "forum-channel") {
        const channelName = getEntityName(entityStore?.get(draft.id))
        title = channelName ?? "Untitled Channel"
      } else if (draft.entity.entity_type === "forum-discussion") {
        const discussionTitle = getEntityTitle(entityStore?.get(draft.id))
        title = discussionTitle ?? "Untitled Discussion"
        forumChannelId =
          draft.entity.parent_type === "forum-channel" ? (draft.entity.parent_id ?? undefined) : undefined
      } else if (draft.entity.entity_type === "forum-reply") {
        forumDiscussionId =
          draft.entity.parent_type === "forum-discussion"
            ? (draft.entity.parent_id ?? undefined)
            : undefined
        const discussionEntity = forumDiscussionId ? entityStore?.get(forumDiscussionId) : undefined
        forumChannelId =
          discussionEntity && discussionEntity.parentType === "forum-channel"
            ? discussionEntity.parentId
            : undefined
        const replyPreview = buildDraftBodyPreview(getEntityBody(entityStore?.get(draft.id)))
        title = replyPreview || "Reply"
      }

      items.push({
        entityType: draft.entity.entity_type,
        entityId: draft.id,
        title,
        subtitle: draft.entity.entity_type.replace("-", " "),
        projectId,
        taskId,
        forumChannelId,
        forumDiscussionId,
      })
    }

    // Process block-only drafts (entities with blocks but no entity draft)
    for (const block of draftBlocks) {
      if (seenEntityIds.has(block.entityId)) continue

      const blocksForEntity = draftBlocksByEntityId.get(block.entityId) ?? []
      if (!hasDraftSettled(null, blocksForEntity)) {
        continue
      }
      seenEntityIds.add(block.entityId)

      // Map block entity_type to display entity_type.
      let title = "Draft"
      let projectId: string | undefined
      const displayEntityType: EntityType = block.entityType

      if (block.entityType === "note") {
        title = noteTitleById.get(block.entityId) ?? "Untitled"
      } else if (block.entityType === "paper") {
        title = paperTitleById.get(block.entityId) ?? "Untitled"
      } else if (block.entityType === "task") {
        title = taskTitleById.get(block.entityId) ?? "Untitled Task"
        projectId = taskProjectById.get(block.entityId)
      }

      items.push({
        entityType: displayEntityType,
        entityId: block.entityId,
        title,
        subtitle: displayEntityType.replace("-", " "),
        projectId,
      })
    }

    return items
  }, [
    draftBlocks,
    draftBlocksByEntityId,
    draftEntities,
    entityStore,
    entityStoreVersion,
    noteTitleById,
    paperTitleById,
    projectTitleById,
    taskTitleById,
    taskProjectById,
  ])

  const handleSelect = useCallback(
    (item: DraftListItem) => {
      if (!workspaceId) return

      const tool = getToolForDraftEntity(item.entityType)

      // Tasks need special handling: navigate to /projects/{projectId}/tasks/{taskId}
      if (item.entityType === "task" && item.projectId) {
        navigateTo({
          id: `${item.projectId}-${item.entityId}`,
          label: item.title,
          tool,
          itemId: item.projectId,
          taskId: item.entityId,
        })
        navigate(`/w/${workspaceId}/${tool}/${item.projectId}/tasks/${item.entityId}`)
        return
      }

      if (item.entityType === "task-comment" && item.projectId && item.taskId) {
        navigateTo({
          id: `${item.taskId}-${item.entityId}`,
          label: item.title,
          tool,
          itemId: item.projectId,
          taskId: item.taskId,
          commentId: item.entityId,
        })
        navigate(
          `/w/${workspaceId}/${tool}/${item.projectId}/tasks/${item.taskId}?commentId=${item.entityId}`
        )
        return
      }

      if (item.entityType === "forum-discussion" && item.forumChannelId) {
        navigateTo({
          id: item.entityId,
          label: item.title,
          tool,
          itemId: item.forumChannelId,
          discussionId: item.entityId,
        })
        navigate(`/w/${workspaceId}/${tool}/${item.forumChannelId}/discussions/${item.entityId}`)
        return
      }

      if (item.entityType === "forum-reply" && item.forumChannelId && item.forumDiscussionId) {
        const discussionTitle = getEntityTitle(entityStore?.get(item.forumDiscussionId)) ?? "Discussion"
        navigateTo({
          id: item.forumDiscussionId,
          label: discussionTitle,
          tool,
          itemId: item.forumChannelId,
          discussionId: item.forumDiscussionId,
        })
        navigate(`/w/${workspaceId}/${tool}/${item.forumChannelId}/discussions/${item.forumDiscussionId}`)
        return
      }

      navigateTo({
        id: item.entityId,
        label: item.title,
        tool,
        itemId: item.entityId,
      })

      navigate(`/w/${workspaceId}/${tool}/${item.entityId}`)
    },
    [workspaceId, navigateTo, navigate, entityStore]
  )

  if (draftItems.length === 0) {
    return (
      <List itemCount={0} testId="drafts-tool-container">
        <ListEmpty message="No drafts yet" />
      </List>
    )
  }

  return (
    <List
      itemCount={draftItems.length}
      onSelect={index => {
        const item = draftItems[index]
        if (item) {
          handleSelect(item)
        }
      }}
      testId="drafts-tool-container"
    >
      {draftItems.map((item, index) => {
        // Select icon based on entity type
        let icon = <FileText size={16} />
        if (item.entityType === "note") {
          icon = <StickyNote size={16} />
        } else if (item.entityType === "project") {
          icon = <FolderKanban size={16} />
        } else if (item.entityType === "task") {
          icon = <CheckSquare size={16} />
        }

        return (
          <ListRow
            key={`${item.entityType}-${item.entityId}`}
            index={index}
            icon={icon}
            title={item.title}
            meta={item.subtitle}
            onClick={() => handleSelect(item)}
            testId="draft-list-item"
          />
        )
      })}
    </List>
  )
}
