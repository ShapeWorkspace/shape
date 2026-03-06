export type ToolType =
  | "drafts"
  | "inbox"
  | "memos"
  | "contacts"
  | "groups"
  | "files"
  | "papers"
  | "forum"
  | "tasks"
  | "projects"
  | "settings"
  | "workspaces"

// Workspace (simplified version of engine's Workspace model for UI)
export interface WorkspaceInfo {
  uuid: string
  name: string
  subdomain: string
  isRegisteredWithServer: boolean
  workspaceEntryId: string
  accountId: string
  accountEmail: string | null
}

export interface ListItem {
  id: string
  title: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

// Notes
export interface NoteTag {
  id: string
  name: string
  color: string
}

export interface Note extends ListItem {
  tags: string[] // tag names
  /** Hash of encrypted content, used for conflict detection on updates */
  contentHash: string
}

// Contacts & Chat
export interface Contact extends ListItem {
  name: string
  avatar?: string
}

export interface Message {
  id: string
  senderId: string
  content: string
  timestamp: number
  threadId?: string
  replies?: Message[]
}

export interface Chat {
  contactId: string
  messages: Message[]
}

// Groups
export interface Group extends ListItem {
  name: string
  members: string[]
}

export interface GroupChat {
  groupId: string
  messages: Message[]
}

// Files
export interface FileItem extends ListItem {
  name: string
  type: string // 'folder' | 'pdf' | 'image' | 'video' | 'figma' | etc.
  size: number
  content: string
  parentId?: string // for files inside folders
}

// Papers (Rich text docs)
export interface Paper extends ListItem {
  content: string
}

// Comments (for Papers, Files, etc.)
export interface Comment {
  id: string
  itemId: string
  itemType: ToolType
  author: string
  content: string
  createdAt: number
  resolved?: boolean
}

// Forum
export interface ForumChannel extends ListItem {
  name: string
  description: string
}

export interface Discussion extends ListItem {
  channelId: string
  content: string
  author: string
  replies: Message[]
}

// Tasks
export interface ProjectTag {
  id: string
  name: string
  color: string
}

export interface Project extends ListItem {
  name: string
  tasks: Task[]
  projectTags: ProjectTag[]
}

export interface Task {
  id: string
  title: string
  completed: boolean
  tags: string[]
  projectId: string
  assignee?: string
  dueDate?: number
  createdAt: number
}

export interface Tag extends ListItem {
  name: string
  color: string
}

// Navigation
export interface NavigationItem {
  id: string
  tool: ToolType
  path: BreadcrumbItem[]
}

export interface BreadcrumbItem {
  id: string
  label: string
  tool: ToolType
  itemId?: string
  taskId?: string
  // For comment editing in tasks tool
  commentId?: string
  // For folder navigation in files tool
  folderId?: string
  // For forum discussion navigation (itemId = channelId, discussionId = discussion ID)
  discussionId?: string
  // For distinguishing item types in files tool (paper vs file)
  itemType?: "paper" | "file" | "video-recording" | "audio-recording"
}

// Window/Tab
export interface WindowTab {
  id: string
  tool: ToolType | null
  stack: BreadcrumbItem[]
  isActive: boolean
}

// Store
export interface AppStore {
  // Windows/Tabs
  windows: WindowTab[]
  activeWindowId: string | null

  // Workspaces
  workspaces: WorkspaceInfo[]
  currentWorkspace: WorkspaceInfo | null

  // Data
  notes: Note[]
  noteTags: NoteTag[]
  contacts: Contact[]
  chats: Chat[]
  groups: Group[]
  groupChats: GroupChat[]
  files: FileItem[]
  papers: Paper[]
  comments: Comment[]
  forumChannels: ForumChannel[]
  discussions: Discussion[]
  projects: Project[]
  tags: Tag[]

  // Current user ID (null if not authenticated)
  currentUserId: string | null
  // Actual user from engine (null if not authenticated)
  // Using unknown type to avoid circular dependency with engine
  currentUser: unknown | null
}
