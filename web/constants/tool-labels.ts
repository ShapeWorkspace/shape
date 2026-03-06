/**
 * Centralized display labels for tools.
 * These are the user-facing names shown in the UI (sidebar, breadcrumbs, search, etc.).
 * To rename a tool across the entire app, change it here.
 */
import { ToolType } from "../store/types"

/**
 * Maps tool types to their user-facing display labels.
 */
export const TOOL_LABELS: Record<ToolType, string> = {
  drafts: "Drafts",
  inbox: "Inbox",
  memos: "Memos",
  contacts: "Contacts",
  groups: "Groups",
  files: "Files",
  papers: "Papers",
  forum: "Forum",
  tasks: "Tasks",
  projects: "Projects",
  settings: "Settings",
  workspaces: "Workspaces",
}

/**
 * Description text shown alongside tool labels (e.g., in tool selector).
 */
export const TOOL_DESCRIPTIONS: Record<ToolType, string> = {
  drafts: "Offline changes",
  inbox: "Notifications",
  memos: "Personal scratchpad",
  contacts: "Team members",
  groups: "Group chats",
  files: "Shared files",
  papers: "Shared context",
  forum: "Discussions",
  tasks: "Task list",
  projects: "Task management",
  settings: "Account settings",
  workspaces: "Your workspaces",
}

/**
 * Singular form of tool labels for use in sentences.
 * e.g., "This memo does not link to..."
 */
export const TOOL_LABELS_SINGULAR: Record<ToolType, string> = {
  drafts: "draft",
  inbox: "inbox",
  memos: "memo",
  contacts: "contact",
  groups: "group",
  files: "file",
  papers: "paper",
  forum: "forum",
  tasks: "task",
  projects: "project",
  settings: "settings",
  workspaces: "workspace",
}

/**
 * Standalone memo label constants for direct use in UI copy.
 */
export const MEMO_LABEL = "Memo"
export const MEMOS_LABEL = "Memos"

/**
 * Maps entity type strings (used in LinksSidecarSection) to user-facing singular labels.
 * Used in sentences like "This memo does not link to..."
 */
export const ENTITY_TYPE_SINGULAR_LABELS: Record<string, string> = {
  note: "memo",
  group: "group",
  comment: "comment",
  project: "project",
  file: "file",
  folder: "folder",
  task: "task",
  paper: "paper",
}
