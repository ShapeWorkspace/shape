import { create } from "zustand"
import {
  ToolType,
  NoteTag,
  Contact,
  Chat,
  Group,
  GroupChat,
  FileItem,
  Paper,
  Comment,
  ForumChannel,
  Discussion,
  Project,
  Task,
  Tag,
  Message,
} from "./types"

const generateId = () => Math.random().toString(36).substring(2, 11)

/**
 * UIStore manages local-only UI state that doesn't require server persistence.
 * This includes mock data for contacts, groups, files, papers, etc.
 *
 * Note: Notes are NOT in this store - they use TanStack Query for E2EE server sync.
 */
interface UIState {
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
}

interface UIActions {
  // Pinning
  togglePin: (type: ToolType, id: string) => void

  // Note tags (local-only, not E2EE)
  createNoteTag: (name: string, color: string) => NoteTag
  deleteNoteTag: (tagId: string) => void

  // Contacts
  createContact: (name: string) => Contact
  sendMessage: (contactId: string, content: string) => void

  // Groups
  createGroup: (name: string) => Group
  sendGroupMessage: (groupId: string, content: string, threadId?: string) => void

  // Files
  createFile: (name: string, type: string, parentId?: string) => FileItem

  // Papers
  createPaper: (title: string) => Paper
  updatePaper: (id: string, content: string) => void

  // Forum
  createChannel: (name: string, description: string) => ForumChannel
  createDiscussion: (channelId: string, title: string, content: string) => Discussion
  addDiscussionReply: (discussionId: string, content: string) => void

  // Tasks/Projects
  createProject: (name: string) => Project
  createTask: (projectId: string, title: string) => Task
  toggleTask: (projectId: string, taskId: string) => void

  // Tags
  createTag: (name: string, color: string) => Tag

  // Comments
  addComment: (itemId: string, itemType: ToolType, content: string) => Comment
  resolveComment: (commentId: string) => void
}

export type UIStore = UIState & UIActions

/**
 * Maps tool types to their corresponding store keys.
 */
function getStoreKey(type: ToolType): keyof UIState | null {
  const keys: Partial<Record<ToolType, keyof UIState>> = {
    contacts: "contacts",
    groups: "groups",
    files: "files",
    papers: "papers",
    forum: "forumChannels",
    tasks: "projects",
  }
  return keys[type] || null
}

export const useUIStore = create<UIStore>((set, _get) => ({
  // Initial state - all empty
  noteTags: [],
  contacts: [],
  chats: [],
  groups: [],
  groupChats: [],
  files: [],
  papers: [],
  comments: [],
  forumChannels: [],
  discussions: [],
  projects: [],
  tags: [],

  togglePin: (type: ToolType, id: string) => {
    const key = getStoreKey(type)
    if (!key) return

    set(state => ({
      [key]: (state[key] as { id: string; pinned: boolean }[]).map(item =>
        item.id === id ? { ...item, pinned: !item.pinned } : item
      ),
    }))
  },

  createNoteTag: (name: string, color: string) => {
    const tag: NoteTag = { id: generateId(), name, color }
    set(state => ({ noteTags: [...state.noteTags, tag] }))
    return tag
  },

  deleteNoteTag: (tagId: string) => {
    set(state => ({
      noteTags: state.noteTags.filter(t => t.id !== tagId),
    }))
  },

  createContact: (name: string) => {
    const contact: Contact = {
      id: generateId(),
      title: name,
      name,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ contacts: [...state.contacts, contact] }))
    return contact
  },

  sendMessage: (contactId: string, content: string) => {
    set(state => {
      const message: Message = {
        id: generateId(),
        senderId: "me",
        content,
        timestamp: Date.now(),
      }
      const chatIndex = state.chats.findIndex(c => c.contactId === contactId)
      if (chatIndex >= 0) {
        const newChats = [...state.chats]
        newChats[chatIndex] = {
          ...newChats[chatIndex],
          messages: [...newChats[chatIndex].messages, message],
        }
        return { chats: newChats }
      } else {
        return { chats: [...state.chats, { contactId, messages: [message] }] }
      }
    })
  },

  createGroup: (name: string) => {
    const group: Group = {
      id: generateId(),
      title: name,
      name,
      members: [],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ groups: [...state.groups, group] }))
    return group
  },

  sendGroupMessage: (groupId: string, content: string, threadId?: string) => {
    set(state => {
      const message: Message = {
        id: generateId(),
        senderId: "me",
        content,
        timestamp: Date.now(),
      }
      const chatIndex = state.groupChats.findIndex(c => c.groupId === groupId)
      if (threadId) {
        // Add as reply
        if (chatIndex >= 0) {
          const newChats = [...state.groupChats]
          newChats[chatIndex] = {
            ...newChats[chatIndex],
            messages: newChats[chatIndex].messages.map(m =>
              m.id === threadId ? { ...m, replies: [...(m.replies || []), message] } : m
            ),
          }
          return { groupChats: newChats }
        }
      } else {
        // Add as new message
        message.replies = []
        if (chatIndex >= 0) {
          const newChats = [...state.groupChats]
          newChats[chatIndex] = {
            ...newChats[chatIndex],
            messages: [...newChats[chatIndex].messages, message],
          }
          return { groupChats: newChats }
        } else {
          return { groupChats: [...state.groupChats, { groupId, messages: [message] }] }
        }
      }
      return state
    })
  },

  createFile: (name: string, type: string, parentId?: string) => {
    const file: FileItem = {
      id: generateId(),
      title: name,
      name,
      type,
      size: 0,
      content: "",
      pinned: false,
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ files: [...state.files, file] }))
    return file
  },

  createPaper: (title: string) => {
    const paper: Paper = {
      id: generateId(),
      title,
      content: "",
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ papers: [...state.papers, paper] }))
    return paper
  },

  updatePaper: (id: string, content: string) => {
    set(state => ({
      papers: state.papers.map(p => (p.id === id ? { ...p, content, updatedAt: Date.now() } : p)),
    }))
  },

  createChannel: (name: string, description: string) => {
    const channel: ForumChannel = {
      id: generateId(),
      title: name,
      name,
      description,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ forumChannels: [...state.forumChannels, channel] }))
    return channel
  },

  createDiscussion: (channelId: string, title: string, content: string) => {
    const discussion: Discussion = {
      id: generateId(),
      title,
      channelId,
      content,
      author: "You",
      replies: [],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ discussions: [...state.discussions, discussion] }))
    return discussion
  },

  addDiscussionReply: (discussionId: string, content: string) => {
    set(state => {
      const reply: Message = {
        id: generateId(),
        senderId: "me",
        content,
        timestamp: Date.now(),
      }
      return {
        discussions: state.discussions.map(d =>
          d.id === discussionId ? { ...d, replies: [...d.replies, reply] } : d
        ),
      }
    })
  },

  createProject: (name: string) => {
    const project: Project = {
      id: generateId(),
      title: name,
      name,
      tasks: [],
      projectTags: [],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ projects: [...state.projects, project] }))
    return project
  },

  createTask: (projectId: string, title: string) => {
    const task: Task = {
      id: generateId(),
      title,
      completed: false,
      tags: [],
      projectId,
      createdAt: Date.now(),
    }
    set(state => ({
      projects: state.projects.map(p => (p.id === projectId ? { ...p, tasks: [...p.tasks, task] } : p)),
    }))
    return task
  },

  toggleTask: (projectId: string, taskId: string) => {
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map(t => (t.id === taskId ? { ...t, completed: !t.completed } : t)) }
          : p
      ),
    }))
  },

  createTag: (name: string, color: string) => {
    const tag: Tag = {
      id: generateId(),
      title: name,
      name,
      color,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(state => ({ tags: [...state.tags, tag] }))
    return tag
  },

  addComment: (itemId: string, itemType: ToolType, content: string) => {
    const comment: Comment = {
      id: generateId(),
      itemId,
      itemType,
      author: "You",
      content,
      createdAt: Date.now(),
      resolved: false,
    }
    set(state => ({ comments: [...state.comments, comment] }))
    return comment
  },

  resolveComment: (commentId: string) => {
    set(state => ({
      comments: state.comments.map(c => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)),
    }))
  },
}))
