/**
 * Hook for fetching entity link preview data.
 *
 * Used by entity link chips to display the entity's title or a preview
 * of its content. Handles different entity types (tasks, papers, notes, etc.)
 * by routing to the appropriate service/hook.
 */

import { useMemo } from "react"
import { useNote } from "./use-notes"
import { useProject } from "./use-projects"
import { useProjectTask } from "./use-project-tasks"
import { useTaskComments } from "./use-task-comments"
import { useFile } from "./use-files"
import { usePaper } from "./use-papers"
import { usePaperComments, usePaperCommentReplies } from "./use-paper-comments"
import { useForumDiscussion, useForumReplies } from "./use-forum-channels"
import { useGroupMessages } from "./use-group-chats"
import { normalizeHtmlStringForPlaintextDisplay, truncateText } from "../../utils/text-utils"
import { MEMO_LABEL } from "../../constants/tool-labels"
import type { WebEntityType } from "../../lib/entity-link-utils"
import type { SourceContext } from "../../../engine/models/entity-link"
import type { DecryptedTaskComment, DecryptedForumDiscussionReply, DecryptedGroupMessage } from "../../../engine/models/entity"
import { extractPlaintextFromTipTapJson } from "../../lib/tiptap-json"

/**
 * Maximum length for body preview when no title is available.
 */
const MAX_PREVIEW_LENGTH = 60

/**
 * Human-readable labels for entity types (used as sublabels for backlinks).
 * Defined outside the hook to avoid recreating on each render.
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  task: "Task",
  paper: "Paper",
  note: MEMO_LABEL,
  file: "File",
  folder: "Folder",
  discussion: "Discussion",
  reply: "Forum Reply",
  channel: "Channel",
  project: "Project",
  contact: "Contact",
  group: "Group Chat",
  comment: "Task Comment",
  "paper-comment": "Paper Comment",
  "paper-comment-reply": "Comment Reply",
  message: "Group Message",
}

/**
 * Get a preview from body content, stripping HTML and truncating.
 */
function getBodyPreview(body: string | null | undefined): string {
  if (!body) return ""
  const plainText = normalizeHtmlStringForPlaintextDisplay(body)
  return truncateText(plainText, MAX_PREVIEW_LENGTH)
}

/**
 * Result of entity link preview query.
 */
export interface EntityLinkPreviewResult {
  /** Display title for the entity link chip (content preview for backlinks) */
  title: string
  /** Secondary label showing the entity type (e.g., "Forum Reply") */
  sublabel?: string
  /** Whether the data is still loading */
  isLoading: boolean
  /** Whether the query failed */
  isError: boolean
}

/**
 * Hook to fetch entity link preview data.
 *
 * Returns the entity's title if available, otherwise a preview of its body content.
 * Falls back to the entity type name if no content is available.
 *
 * For child entities (reply, comment, message), uses sourceContext to fetch from
 * the parent's list and extract the specific item's content.
 *
 * @param entityType - Type of entity (task, paper, note, file, discussion, reply, comment, message)
 * @param entityId - ID of the entity (task ID for task links)
 * @param projectId - Optional project ID for task entities
 * @param channelId - Optional channel ID for discussion entities
 * @param fallbackTitle - Fallback title to use while loading or on error
 * @param sourceContext - Optional context for child entities (provides parent IDs)
 */
export function useEntityLinkPreview(
  entityType: WebEntityType,
  entityId: string,
  projectId?: string | null,
  channelId?: string | null,
  fallbackTitle?: string,
  sourceContext?: SourceContext
): EntityLinkPreviewResult {
  // Query for notes
  const noteQuery = useNote(entityType === "note" ? entityId : "")

  // Query for projects
  const projectQuery = useProject(entityType === "project" ? entityId : "")

  // Query for tasks (need both projectId and taskId)
  const taskQuery = useProjectTask(
    entityType === "task" && projectId ? projectId : "",
    entityType === "task" ? entityId : ""
  )

  // Query for files
  const fileQuery = useFile(entityType === "file" ? entityId : "")

  // Query for papers
  const paperQuery = usePaper(entityType === "paper" ? entityId : "")

  // Query for paper comments (uses sourceContext for paper ID)
  const commentPaperId =
    entityType === "paper-comment" || entityType === "paper-comment-reply"
      ? sourceContext?.paper_id
      : undefined
  const commentThreadId = entityType === "paper-comment-reply" ? sourceContext?.paper_comment_id : undefined
  const paperForCommentQuery = usePaper(commentPaperId ?? "")
  const paperCommentsQuery = usePaperComments(commentPaperId ?? "")
  const paperCommentRepliesQuery = usePaperCommentReplies(commentThreadId ?? "")

  // Query for discussions (need channelId)
  const discussionQuery = useForumDiscussion(
    entityType === "discussion" && channelId ? channelId : "",
    entityType === "discussion" ? entityId : ""
  )

  // Query for forum replies (uses sourceContext to get channel and discussion IDs)
  const replyChannelId = entityType === "reply" ? sourceContext?.channel_id : undefined
  const replyDiscussionId = entityType === "reply" ? sourceContext?.discussion_id : undefined
  const repliesQuery = useForumReplies(replyChannelId ?? "", replyDiscussionId ?? "")

  // Query for task comments (uses sourceContext to get project and task IDs)
  const commentProjectId = entityType === "comment" ? sourceContext?.project_id : undefined
  const commentTaskId = entityType === "comment" ? sourceContext?.task_id : undefined
  const commentsQuery = useTaskComments(commentProjectId ?? "", commentTaskId ?? "")

  // Query for group messages (uses sourceContext to get group ID)
  const messageGroupId = entityType === "message" ? sourceContext?.group_id : undefined
  const messagesQuery = useGroupMessages(messageGroupId ?? "")

  // Memoize the result based on entity type
  return useMemo(() => {
    const defaultLabel =
      ENTITY_TYPE_LABELS[entityType] || entityType.charAt(0).toUpperCase() + entityType.slice(1)
    const defaultResult: EntityLinkPreviewResult = {
      title: fallbackTitle || defaultLabel,
      isLoading: false,
      isError: false,
    }

    switch (entityType) {
      case "note": {
        if (noteQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (noteQuery.isError || !noteQuery.data) {
          return { ...defaultResult, isError: noteQuery.isError }
        }
        const note = noteQuery.data
        const title = note.title || MEMO_LABEL
        return { title, isLoading: false, isError: false }
      }

      case "project": {
        if (projectQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (projectQuery.isError || !projectQuery.data) {
          return { ...defaultResult, isError: projectQuery.isError }
        }
        return { title: projectQuery.data.content.name || "Project", isLoading: false, isError: false }
      }

      case "task": {
        if (!projectId) {
          return defaultResult
        }
        if (taskQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (taskQuery.isError || !taskQuery.data) {
          return { ...defaultResult, isError: taskQuery.isError }
        }
        const task = taskQuery.data
        const title = task.content.title || "Task"
        return { title, isLoading: false, isError: false }
      }

      case "file": {
        if (fileQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (fileQuery.isError || !fileQuery.data) {
          return { ...defaultResult, isError: fileQuery.isError }
        }
        return { title: fileQuery.data.content.name || "File", isLoading: false, isError: false }
      }

      case "paper": {
        if (paperQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (paperQuery.isError || !paperQuery.data) {
          return { ...defaultResult, isError: paperQuery.isError }
        }
        return { title: paperQuery.data.content.name || "Paper", isLoading: false, isError: false }
      }

      case "paper-comment": {
        if (!commentPaperId) {
          return defaultResult
        }
        if (paperCommentsQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (paperCommentsQuery.isError || !paperCommentsQuery.data) {
          return { ...defaultResult, isError: paperCommentsQuery.isError }
        }

        const comment = paperCommentsQuery.data.find(entry => entry.id === entityId)
        if (!comment) {
          return defaultResult
        }

        const title = extractPlaintextFromTipTapJson(comment.content.body) || "Paper Comment"
        const paperName = paperForCommentQuery.data?.content.name ?? "Paper"
        return { title, sublabel: paperName, isLoading: false, isError: false }
      }

      case "paper-comment-reply": {
        if (!commentPaperId) {
          return defaultResult
        }
        if (paperCommentRepliesQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (paperCommentRepliesQuery.isError || !paperCommentRepliesQuery.data) {
          return { ...defaultResult, isError: paperCommentRepliesQuery.isError }
        }

        const reply = paperCommentRepliesQuery.data.find(entry => entry.id === entityId) ?? null
        if (!reply) {
          return defaultResult
        }

        const title = extractPlaintextFromTipTapJson(reply.content.body) || "Comment Reply"
        const paperName = paperForCommentQuery.data?.content.name ?? "Paper"
        return { title, sublabel: paperName, isLoading: false, isError: false }
      }

      case "discussion": {
        if (!channelId) {
          return defaultResult
        }
        if (discussionQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (discussionQuery.isError || !discussionQuery.data) {
          return { ...defaultResult, isError: discussionQuery.isError }
        }
        const discussion = discussionQuery.data
        const title = discussion.content.title || getBodyPreview(discussion.content.body) || "Discussion"
        return { title, isLoading: false, isError: false }
      }

      // Forum reply: fetch from replies list and find by ID
      case "reply": {
        if (!replyChannelId || !replyDiscussionId) {
          // No source context - fall back to just showing "Forum Reply"
          return defaultResult
        }
        if (repliesQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (repliesQuery.isError || !repliesQuery.data) {
          return { ...defaultResult, isError: repliesQuery.isError }
        }
        // Find the specific reply by ID
        const reply = repliesQuery.data.find((r: DecryptedForumDiscussionReply) => r.id === entityId)
        if (!reply) {
          return defaultResult
        }
        // Show content preview with entity type as sublabel
        const title = getBodyPreview(reply.content.body) || "Forum Reply"
        return { title, sublabel: "Forum Reply", isLoading: false, isError: false }
      }

      // Task comment: fetch from comments list and find by ID
      case "comment": {
        if (!commentProjectId || !commentTaskId) {
          return defaultResult
        }
        if (commentsQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (commentsQuery.isError || !commentsQuery.data) {
          return { ...defaultResult, isError: commentsQuery.isError }
        }
        // Find the specific comment by ID
        const comment = commentsQuery.data.find((c: DecryptedTaskComment) => c.id === entityId)
        if (!comment) {
          return defaultResult
        }
        const title = getBodyPreview(comment.content.body) || "Task Comment"
        return { title, sublabel: "Task Comment", isLoading: false, isError: false }
      }

      // Group message: fetch from messages list and find by ID
      case "message": {
        if (!messageGroupId) {
          return defaultResult
        }
        if (messagesQuery.isLoading) {
          return { ...defaultResult, isLoading: true }
        }
        if (messagesQuery.isError || !messagesQuery.data) {
          return { ...defaultResult, isError: messagesQuery.isError }
        }
        // Find the specific message by ID
        const message = messagesQuery.data.find((m: DecryptedGroupMessage) => m.id === entityId)
        if (!message) {
          return defaultResult
        }
        const title = getBodyPreview(message.content.text) || "Group Message"
        return { title, sublabel: "Group Message", isLoading: false, isError: false }
      }

      // Fallback for unsupported entity types
      default:
        return defaultResult
    }
  }, [
    entityType,
    entityId,
    projectId,
    channelId,
    fallbackTitle,
    noteQuery.isLoading,
    noteQuery.isError,
    noteQuery.data,
    projectQuery.isLoading,
    projectQuery.isError,
    projectQuery.data,
    taskQuery.isLoading,
    taskQuery.isError,
    taskQuery.data,
    fileQuery.isLoading,
    fileQuery.isError,
    fileQuery.data,
    paperQuery.isLoading,
    paperQuery.isError,
    paperQuery.data,
    commentPaperId,
    commentThreadId,
    paperForCommentQuery.data,
    paperCommentsQuery.isLoading,
    paperCommentsQuery.isError,
    paperCommentsQuery.data,
    paperCommentRepliesQuery.isLoading,
    paperCommentRepliesQuery.isError,
    paperCommentRepliesQuery.data,
    discussionQuery.isLoading,
    discussionQuery.isError,
    discussionQuery.data,
    replyChannelId,
    replyDiscussionId,
    repliesQuery.isLoading,
    repliesQuery.isError,
    repliesQuery.data,
    commentProjectId,
    commentTaskId,
    commentsQuery.isLoading,
    commentsQuery.isError,
    commentsQuery.data,
    messageGroupId,
    messagesQuery.isLoading,
    messagesQuery.isError,
    messagesQuery.data,
  ])
}
