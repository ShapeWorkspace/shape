/**
 * Centralized query key factory for TanStack Query.
 * Using a factory pattern ensures consistent key generation and
 * makes cache invalidation predictable.
 *
 * Keys follow a hierarchical structure:
 * - [domain] for listing all items in a domain
 * - [domain, workspaceId] for workspace-scoped lists
 * - [domain, workspaceId, itemId] for individual items
 */
export const queryKeys = {
  // Notes (E2EE encrypted)
  notes: {
    all: () => ["notes"] as const,
    byWorkspace: (workspaceId: string) => ["notes", workspaceId] as const,
    detail: (workspaceId: string, noteId: string) => ["notes", workspaceId, noteId] as const,
    blocks: (workspaceId: string, noteId: string) => ["notes", workspaceId, noteId, "blocks"] as const,
    blocksCacheOnly: (workspaceId: string, noteId: string) =>
      ["notes", workspaceId, noteId, "blocks", "cache-only"] as const,
  },

  // Direct Messages (E2EE encrypted, conversations between two users)
  directMessages: {
    all: () => ["directMessages"] as const,
    conversation: (workspaceId: string, recipientId: string) =>
      ["directMessages", workspaceId, recipientId] as const,
    detail: (workspaceId: string, messageId: string) =>
      ["directMessages", workspaceId, "message", messageId] as const,
  },

  // Group Chats (E2EE encrypted, ACL-based access)
  groupChats: {
    all: () => ["groupChats"] as const,
    byWorkspace: (workspaceId: string) => ["groupChats", workspaceId] as const,
    detail: (workspaceId: string, groupChatId: string) => ["groupChats", workspaceId, groupChatId] as const,
    messages: (workspaceId: string, groupChatId: string) =>
      ["groupChats", workspaceId, groupChatId, "messages"] as const,
  },

  // Group Chat ACL (access control for group chats)
  groupChatAcl: {
    all: () => ["groupChatAcl"] as const,
    byGroupChat: (workspaceId: string, groupChatId: string) =>
      ["groupChatAcl", workspaceId, groupChatId] as const,
    count: (workspaceId: string, groupChatId: string) =>
      ["groupChatAcl", workspaceId, groupChatId, "count"] as const,
    availableSubjects: (workspaceId: string, groupChatId: string) =>
      ["groupChatAcl", workspaceId, groupChatId, "availableSubjects"] as const,
  },

  // Projects (E2EE encrypted)
  projects: {
    all: () => ["projects"] as const,
    byWorkspace: (workspaceId: string) => ["projects", workspaceId] as const,
    detail: (workspaceId: string, projectId: string) => ["projects", workspaceId, projectId] as const,
  },

  // Project Tags (E2EE encrypted, scoped to project)
  projectTags: {
    all: () => ["projectTags"] as const,
    byProject: (workspaceId: string, projectId: string) => ["projectTags", workspaceId, projectId] as const,
  },

  // Project Tasks (E2EE encrypted, scoped to project)
  projectTasks: {
    all: () => ["projectTasks"] as const,
    byProject: (workspaceId: string, projectId: string) => ["projectTasks", workspaceId, projectId] as const,
    detail: (workspaceId: string, projectId: string, taskId: string) =>
      ["projectTasks", workspaceId, projectId, taskId] as const,
    blocks: (workspaceId: string, projectId: string, taskId: string) =>
      ["projectTasks", workspaceId, projectId, taskId, "blocks"] as const,
  },

  // Project ACL (access control for projects)
  projectAcl: {
    all: () => ["projectAcl"] as const,
    byProject: (workspaceId: string, projectId: string) => ["projectAcl", workspaceId, projectId] as const,
    count: (workspaceId: string, projectId: string) =>
      ["projectAcl", workspaceId, projectId, "count"] as const,
    availableSubjects: (workspaceId: string, projectId: string) =>
      ["projectAcl", workspaceId, projectId, "availableSubjects"] as const,
  },

  // Teams (workspace-level groups for ACL)
  teams: {
    all: () => ["teams"] as const,
    byWorkspace: (workspaceId: string) => ["teams", workspaceId] as const,
  },

  // Workspace Members (cached for offline access)
  members: {
    all: () => ["members"] as const,
    byWorkspace: (workspaceId: string) => ["members", workspaceId] as const,
    detail: (workspaceId: string, userId: string) => ["members", workspaceId, userId] as const,
  },

  // Mention suggestions (ACL-scoped user IDs)
  mentionSuggestions: {
    byResource: (workspaceId: string, resourceType: string, resourceId: string) =>
      ["mentionSuggestions", workspaceId, resourceType, resourceId] as const,
  },

  // Workspaces
  workspaces: {
    all: () => ["workspaces"] as const,
    detail: (workspaceId: string) => ["workspaces", workspaceId] as const,
    subscription: (workspaceId: string) => ["workspaces", workspaceId, "subscription"] as const,
  },

  // User
  user: {
    current: () => ["user", "current"] as const,
    profile: (userId: string) => ["user", userId] as const,
  },

  // Files (E2EE encrypted, stored in S3)
  files: {
    all: () => ["files"] as const,
    byWorkspace: (workspaceId: string) => ["files", workspaceId] as const,
    byEntity: (workspaceId: string, entityId: string, entityType: string) =>
      ["files", workspaceId, "entity", entityId, entityType] as const,
    detail: (workspaceId: string, fileId: string) => ["files", workspaceId, fileId] as const,
    download: (workspaceId: string, fileId: string) => ["files", workspaceId, fileId, "download"] as const,
  },

  // File ACL (access control for files)
  fileAcl: {
    all: () => ["fileAcl"] as const,
    byFile: (workspaceId: string, fileId: string) => ["fileAcl", workspaceId, fileId] as const,
    count: (workspaceId: string, fileId: string) => ["fileAcl", workspaceId, fileId, "count"] as const,
    availableSubjects: (workspaceId: string, fileId: string) =>
      ["fileAcl", workspaceId, fileId, "availableSubjects"] as const,
  },

  // Folders (E2EE encrypted, part of file system)
  folders: {
    all: () => ["folders"] as const,
    byWorkspace: (workspaceId: string) => ["folders", workspaceId] as const,
    detail: (workspaceId: string, folderId: string) => ["folders", workspaceId, folderId] as const,
    contents: (workspaceId: string, folderId: string) =>
      ["folders", workspaceId, folderId, "contents"] as const,
  },

  // Folder ACL (access control for folders)
  folderAcl: {
    all: () => ["folderAcl"] as const,
    byFolder: (workspaceId: string, folderId: string) => ["folderAcl", workspaceId, folderId] as const,
    count: (workspaceId: string, folderId: string) => ["folderAcl", workspaceId, folderId, "count"] as const,
    availableSubjects: (workspaceId: string, folderId: string) =>
      ["folderAcl", workspaceId, folderId, "availableSubjects"] as const,
  },

  // Papers (E2EE encrypted, collaborative documents with TipTap + Yjs)
  papers: {
    all: () => ["papers"] as const,
    byWorkspace: (workspaceId: string) => ["papers", workspaceId] as const,
    detail: (workspaceId: string, paperId: string) => ["papers", workspaceId, paperId] as const,
    blocks: (workspaceId: string, paperId: string) => ["papers", workspaceId, paperId, "blocks"] as const,
  },

  // Paper ACL (access control for papers)
  paperAcl: {
    all: () => ["paperAcl"] as const,
    byPaper: (workspaceId: string, paperId: string) => ["paperAcl", workspaceId, paperId] as const,
    count: (workspaceId: string, paperId: string) => ["paperAcl", workspaceId, paperId, "count"] as const,
    availableSubjects: (workspaceId: string, paperId: string) =>
      ["paperAcl", workspaceId, paperId, "availableSubjects"] as const,
  },

  // Forum Channels (E2EE encrypted, ACL-protected containers)
  forumChannels: {
    all: () => ["forumChannels"] as const,
    byWorkspace: (workspaceId: string) => ["forumChannels", workspaceId] as const,
    detail: (workspaceId: string, channelId: string) => ["forumChannels", workspaceId, channelId] as const,
  },

  // Forum Discussions (E2EE encrypted, threads within a channel)
  forumDiscussions: {
    all: () => ["forumDiscussions"] as const,
    byChannel: (workspaceId: string, channelId: string) =>
      ["forumDiscussions", workspaceId, channelId] as const,
    detail: (workspaceId: string, channelId: string, discussionId: string) =>
      ["forumDiscussions", workspaceId, channelId, discussionId] as const,
  },

  // Forum Replies (E2EE encrypted, messages within a discussion)
  forumReplies: {
    all: () => ["forumReplies"] as const,
    byDiscussion: (workspaceId: string, channelId: string, discussionId: string) =>
      ["forumReplies", workspaceId, channelId, discussionId] as const,
  },

  // Forum Channel ACL (access control for forum channels)
  forumChannelAcl: {
    all: () => ["forumChannelAcl"] as const,
    byChannel: (workspaceId: string, channelId: string) =>
      ["forumChannelAcl", workspaceId, channelId] as const,
    count: (workspaceId: string, channelId: string) =>
      ["forumChannelAcl", workspaceId, channelId, "count"] as const,
    availableSubjects: (workspaceId: string, channelId: string) =>
      ["forumChannelAcl", workspaceId, channelId, "availableSubjects"] as const,
  },

  // Task Comments (E2EE encrypted, scoped to a project task)
  taskComments: {
    all: () => ["taskComments"] as const,
    byTask: (workspaceId: string, projectId: string, taskId: string) =>
      ["taskComments", workspaceId, projectId, taskId] as const,
    detail: (workspaceId: string, projectId: string, taskId: string, commentId: string) =>
      ["taskComments", workspaceId, projectId, taskId, commentId] as const,
  },

  // Paper Comments (E2EE encrypted, scoped to a paper)
  paperComments: {
    all: () => ["paperComments"] as const,
    byPaper: (workspaceId: string, paperId: string) => ["paperComments", workspaceId, paperId] as const,
  },

  // Paper Comment Replies (E2EE encrypted, scoped to a paper comment)
  paperCommentReplies: {
    all: () => ["paperCommentReplies"] as const,
    byComment: (workspaceId: string, commentId: string) =>
      ["paperCommentReplies", workspaceId, commentId] as const,
  },

  // Entity Links (lightweight graph for backlinks and navigation)
  entityLinks: {
    all: () => ["entityLinks"] as const,
    byEntity: (workspaceId: string, entityId: string) => ["entityLinks", workspaceId, entityId] as const,
  },

  // Notifications (in-app inbox)
  notifications: {
    all: () => ["notifications"] as const,
    byWorkspace: (workspaceId: string) => ["notifications", workspaceId] as const,
  },

  // Notification subscriptions (manual + auto)
  notificationSubscriptions: {
    all: () => ["notificationSubscriptions"] as const,
    byWorkspace: (workspaceId: string) => ["notificationSubscriptions", workspaceId] as const,
  },

  // Notification settings (push preferences)
  notificationSettings: {
    all: () => ["notificationSettings"] as const,
    byWorkspace: (workspaceId: string) => ["notificationSettings", workspaceId] as const,
  },
}
