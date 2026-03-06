/**
 * useQuickActions Hook
 *
 * Defines all global actions available in the command palette.
 * Each action has access to navigation, services, and other React context.
 *
 * Actions are categorized as:
 * - 'action': Static commands (create, navigate, settings)
 * - Entity types: For search results (note, project, paper, etc.)
 */

import { useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useCreateNote } from "../store/queries/use-notes"
import { useCreateFolder } from "../store/queries/use-folders"
import { useCreatePaper } from "../store/queries/use-papers"
import { useWindowStore } from "../store/window-store"
import { ToolType, BreadcrumbItem } from "../store/types"
import { useEngineStore } from "../store/engine-store"
import {
  getDefaultPaperTitle,
  getDefaultFolderName,
} from "../utils/default-entity-titles"
import { TOOL_LABELS, MEMO_LABEL } from "../constants/tool-labels"

/**
 * Represents a quick action that can be executed from the command palette.
 */
export interface QuickAction {
  /** Unique identifier for the action */
  id: string
  /** Display title shown in the palette */
  title: string
  /** Optional description for additional context */
  description?: string
  /** Category for grouping and filtering */
  category: "action" | "note" | "project" | "paper" | "file" | "folder" | "chat" | "forum" | "task"
  /** Handler function to execute when action is selected */
  handler: () => void | Promise<void>
}

/**
 * Hook that provides all global quick actions for the command palette.
 *
 * Actions are memoized and have access to:
 * - React Router navigation
 * - Entity creation mutations
 * - Auth actions (logout redirect)
 * - Workspace context
 */
/**
 * Helper to generate unique IDs for breadcrumb items.
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function useQuickActions(): QuickAction[] {
  const navigate = useNavigate()
  const { application } = useEngineStore()

  // Get window store's navigateTo for proper URL sync
  const { navigateTo: windowNavigateTo, navigateHome } = useWindowStore()

  // Mutation hooks for creating entities
  const createNoteMutation = useCreateNote()
  const createFolderMutation = useCreateFolder()
  const createPaperMutation = useCreatePaper()

  // Get the effective workspace ID (from URL params or store)
  const effectiveWorkspaceId = application?.workspaceId ?? ""

  // Navigation helper that uses window store to ensure URL sync works correctly
  // This pushes to the window stack which triggers useUrlSync to update the URL
  const navigateToTool = useCallback(
    (tool: ToolType, itemId?: string, label?: string) => {
      // First clear the stack to go home, then navigate to the tool
      // This ensures a clean navigation path
      navigateHome()

      // Create breadcrumb item and push to stack
      const item: BreadcrumbItem = {
        id: generateId(),
        label: label || TOOL_LABELS[tool],
        tool,
        itemId,
      }

      // Small delay to ensure navigateHome completes first
      setTimeout(() => {
        windowNavigateTo(item)
      }, 0)
    },
    [windowNavigateTo, navigateHome]
  )

  // Create actions with handlers
  const actions = useMemo<QuickAction[]>(() => {
    if (!effectiveWorkspaceId) return []

    return [
      // ==================== CREATE ACTIONS ====================
      {
        id: "create-note",
        title: `Create ${MEMO_LABEL.toLowerCase()}`,
        description: `Create a new ${MEMO_LABEL.toLowerCase()}`,
        category: "action",
        handler: async () => {
          const createdNote = createNoteMutation.createOptimistically({ title: "" })
          navigateToTool("memos", createdNote.id, createdNote.title)
          await createdNote.promise
        },
      },
      {
        id: "create-folder",
        title: "Create folder",
        description: "Create a new folder",
        category: "action",
        handler: async () => {
          const defaultName = getDefaultFolderName()
          await createFolderMutation.mutateAsync({ name: defaultName, parentFolderId: null })
          navigateToTool("files")
        },
      },
      {
        id: "create-paper",
        title: "Create paper",
        description: "Create a new collaborative document",
        category: "action",
        handler: async () => {
          const defaultName = getDefaultPaperTitle()
          const createdPaper = createPaperMutation.createOptimistically({ name: defaultName })
          navigateToTool("papers", createdPaper.id, createdPaper.name)
          await createdPaper.promise
        },
      },
      {
        id: "upload-file",
        title: "Upload file",
        description: "Upload a file to the workspace",
        category: "action",
        handler: () => {
          navigateToTool("files")
        },
      },

      // ==================== NAVIGATION ACTIONS ====================
      {
        id: "go-home",
        title: "Go home",
        description: "Navigate to home",
        category: "action",
        handler: () => navigateHome(),
      },
      {
        id: "go-to-notes",
        title: "Go to Memos",
        description: "Navigate to Memos",
        category: "action",
        handler: () => navigateToTool("memos"),
      },
      {
        id: "go-to-projects",
        title: "Go to Projects",
        description: "Navigate to Projects",
        category: "action",
        handler: () => navigateToTool("projects"),
      },
      {
        id: "go-to-files",
        title: "Go to Files",
        description: "Navigate to Files",
        category: "action",
        handler: () => navigateToTool("files"),
      },
      {
        id: "go-to-papers",
        title: "Go to Papers",
        description: "Navigate to Papers",
        category: "action",
        handler: () => navigateToTool("papers"),
      },
      {
        id: "go-to-messages",
        title: "Go to Messages",
        description: "Navigate to Messages",
        category: "action",
        handler: () => navigateToTool("contacts"),
      },
      {
        id: "go-to-groups",
        title: "Go to Groups",
        description: "Navigate to Group Chats",
        category: "action",
        handler: () => navigateToTool("groups"),
      },
      {
        id: "go-to-forums",
        title: "Go to Forums",
        description: "Navigate to Forums",
        category: "action",
        handler: () => navigateToTool("forum"),
      },
      {
        id: "go-to-settings",
        title: "Go to Settings",
        description: "Open workspace settings",
        category: "action",
        handler: () => navigateToTool("settings"),
      },

      // ==================== WORKSPACE ACTIONS ====================
      {
        id: "invite-member",
        title: "Invite member",
        description: "Invite a user to the workspace",
        category: "action",
        handler: () => navigateToTool("settings"),
      },
      {
        id: "switch-workspace",
        title: "Switch workspace",
        description: "Switch to a different workspace",
        category: "action",
        handler: () => navigate("/workspaces"),
      },
      {
        id: "manage-subscription",
        title: "Manage subscription",
        description: "Open billing management",
        category: "action",
        handler: () => navigateToTool("settings"),
      },

      // ==================== ACCOUNT ACTIONS ====================
      {
        id: "sign-out",
        title: "Sign out",
        description: "Sign out of the application",
        category: "action",
        handler: () => navigate("/auth/logout"),
      },
    ]
  }, [
    effectiveWorkspaceId,
    navigateToTool,
    navigate,
    navigateHome,
    createNoteMutation,
    createFolderMutation,
    createPaperMutation,
  ])

  return actions
}
