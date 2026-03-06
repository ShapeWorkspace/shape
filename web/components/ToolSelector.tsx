import { useCallback, useMemo, useEffect, useRef } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"
import { useWindowStore } from "../store/window-store"
import { ToolType } from "../store/types"
import {
  FileText,
  StickyNote,
  Users,
  MessageCircle,
  Folder,
  MessagesSquare,
  CheckSquare,
  Inbox,
  Settings,
} from "lucide-react"
import { List, ListRow, ListSearch, ListEmpty } from "./ListUI"
import { SearchResults } from "./SearchResults"
import { useAppSearch, type EnrichedSearchResult } from "../hooks/use-search"
import type { SearchableEntityType } from "../../engine/search/search-types"
import { useDrafts } from "../contexts/DraftContext"
import { hasDraftSettled } from "../utils/drafts"
import { useNotifications } from "../store/queries/use-notifications"
import { useSidecar } from "../contexts/SidecarContext"
import { OnboardingAuthSidecar } from "./OnboardingAuthSidecar"
import { getSidecarRouteFromSearch } from "../router/sidecar-routing"
import { TOOL_LABELS, TOOL_DESCRIPTIONS } from "../constants/tool-labels"
import { useActiveWorkspaceInfo } from "../hooks/use-active-workspace-info"

/**
 * Tool definitions with their display properties.
 * Per Book of App Flow, each tool has a label and accessory description.
 */
interface ToolListItem {
  type: ToolType
  label: string
  icon: React.ReactNode
  desc: string
}

const tools: ToolListItem[] = [
  { type: "inbox", label: TOOL_LABELS.inbox, icon: <Inbox size={18} />, desc: TOOL_DESCRIPTIONS.inbox },
  { type: "contacts", label: TOOL_LABELS.contacts, icon: <Users size={18} />, desc: TOOL_DESCRIPTIONS.contacts },
  { type: "groups", label: TOOL_LABELS.groups, icon: <MessageCircle size={18} />, desc: TOOL_DESCRIPTIONS.groups },
  { type: "forum", label: TOOL_LABELS.forum, icon: <MessagesSquare size={18} />, desc: TOOL_DESCRIPTIONS.forum },
  { type: "projects", label: TOOL_LABELS.projects, icon: <CheckSquare size={18} />, desc: TOOL_DESCRIPTIONS.projects },
  { type: "files", label: TOOL_LABELS.files, icon: <Folder size={18} />, desc: TOOL_DESCRIPTIONS.files },
  { type: "papers", label: TOOL_LABELS.papers, icon: <FileText size={18} />, desc: TOOL_DESCRIPTIONS.papers },
  { type: "memos", label: TOOL_LABELS.memos, icon: <StickyNote size={18} />, desc: TOOL_DESCRIPTIONS.memos },
]

/**
 * ToolSelector displays available tools when the user is at the workspace home.
 * Uses the standard List pattern with ListRow children.
 */
/**
 * Maps a search entity type to the corresponding tool type for navigation.
 */
function getToolTypeForEntityType(entityType: SearchableEntityType): ToolType {
  switch (entityType) {
    case "note":
      return "memos"
    case "paper":
      return "papers"
    case "paper-comment":
    case "paper-comment-reply":
      return "papers"
    case "project":
    case "task":
    case "project-tag":
    case "task-comment":
      return "projects"
    case "group-chat":
    case "group-message":
      return "groups"
    case "file":
    case "folder":
      return "files"
    case "forum-channel":
    case "forum-discussion":
    case "forum-reply":
      return "forum"
    case "direct-message":
    case "workspace-member":
      return "contacts"
    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const _exhaustiveCheck: never = entityType
      throw new Error(`Unhandled entity type in getToolTypeForEntityType: ${_exhaustiveCheck}`)
    }
  }
}

export function ToolSelector() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId: workspaceIdFromRoute } = useParams<{ workspaceId: string }>()
  const { currentUser } = useAuthStore()
  const { application } = useEngineStore()
  const { navigateTo } = useWindowStore()
  const { data: notifications = [] } = useNotifications()
  const { draftEntities, draftBlocks } = useDrafts()
  const { setSidecar, clearSidecar } = useSidecar()
  const hasInitializedOnboardingSidecarRef = useRef(false)
  const activeWorkspaceInfo = useActiveWorkspaceInfo()
  const isRemoteWorkspace = activeWorkspaceInfo?.isRegisteredWithServer ?? application?.isWorkspaceRemote() ?? false
  const resolvedWorkspaceId = workspaceIdFromRoute ?? application?.workspaceId
  const workspaceId = resolvedWorkspaceId?.trim()
  if (!workspaceId) {
    throw new Error("ToolSelector requires a non-empty workspaceId")
  }

  const sidecarRouteFromUrl = useMemo(() => getSidecarRouteFromSearch(location.search), [location.search])
  const shouldShowOnboardingSidecar = !currentUser && !!application && !isRemoteWorkspace

  // Show the onboarding sidecar only on the home/tools screen for anonymous local workspaces.
  useEffect(() => {
    if (shouldShowOnboardingSidecar && !sidecarRouteFromUrl) {
      setSidecar(<OnboardingAuthSidecar />, "Welcome")
      hasInitializedOnboardingSidecarRef.current = true
      return
    }

    if (hasInitializedOnboardingSidecarRef.current && !sidecarRouteFromUrl) {
      clearSidecar()
      hasInitializedOnboardingSidecarRef.current = false
    }
  }, [shouldShowOnboardingSidecar, sidecarRouteFromUrl, setSidecar, clearSidecar])

  useEffect(() => {
    // Ensure onboarding sidecar does not persist when leaving the home/tools screen.
    // Some tools (e.g., Inbox) do not manage sidecar state, so we clear it on unmount.
    return () => {
      if (!hasInitializedOnboardingSidecarRef.current) {
        return
      }
      clearSidecar()
      hasInitializedOnboardingSidecarRef.current = false
    }
  }, [clearSidecar])

  const draftCount = useMemo(() => {
    const blocksByKey = new Map<string, typeof draftBlocks>()
    for (const block of draftBlocks) {
      const key = `${block.entityType}:${block.entityId}`
      const blocks = blocksByKey.get(key) ?? []
      blocks.push(block)
      blocksByKey.set(key, blocks)
    }

    const keys = new Set<string>()
    for (const draft of draftEntities) {
      const key = `${draft.entity.entity_type}:${draft.id}`
      const blocks = blocksByKey.get(key) ?? []
      if (!hasDraftSettled(draft, blocks)) {
        continue
      }
      keys.add(key)
    }
    for (const [key, blocks] of blocksByKey.entries()) {
      if (keys.has(key)) {
        continue
      }
      if (hasDraftSettled(null, blocks)) {
        keys.add(key)
      }
    }

    return keys.size
  }, [draftEntities, draftBlocks])

  // Global FlexSearch (no entity type filter - searches all types)
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isActive: isSearchActive,
  } = useAppSearch()

  // Handle search input focus
  const handleSearchFocusChange = useCallback((_focused: boolean) => {}, [])

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter(
      notification => !notification.readAt && notification.actionType !== "reaction_added"
    ).length
  }, [notifications])

  // Calculate unread counts based on notification actionType
  const getUnreadCount = (toolType: ToolType): number => {
    if (toolType === "inbox") {
      return unreadNotificationCount
    }
    if (toolType === "contacts") {
      // Count unread dm_received notifications
      return notifications.filter(n => !n.readAt && n.actionType === "dm_received").length
    }
    if (toolType === "groups") {
      // Count unread group_message notifications
      return notifications.filter(n => !n.readAt && n.actionType === "group_message").length
    }
    return 0
  }

  // Prefer the account tied to the current workspace selection.
  const activeAccountEmailForSettingsTool =
    activeWorkspaceInfo?.accountEmail ?? (currentUser ? currentUser.email : null)

  // Build complete item list: drafts (if any) + tools + settings
  const allItems = useMemo<ToolListItem[]>(
    () => [
      ...(draftCount > 0
        ? [
            {
              type: "drafts" as const,
              label: `Drafts (${draftCount})`,
              icon: <Inbox size={18} />,
              desc: "Offline changes",
            },
          ]
        : []),
      ...tools,
      {
        type: "settings" as const,
        label: "Settings",
        icon: <Settings size={18} />,
        desc: activeAccountEmailForSettingsTool ?? "Account settings",
      },
    ],
    [draftCount, activeAccountEmailForSettingsTool]
  )

  // Filter items based on search query
  const filteredItems = allItems.filter(item => {
    if (!searchQuery) return true
    return (
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  // Navigate to a tool via URL and update window store for breadcrumb
  const selectTool = useCallback(
    (type: ToolType) => {
      // Update window store for breadcrumb tracking
      navigateTo({
        id: Math.random().toString(36).substring(2),
        label: allItems.find(t => t.type === type)?.label || type,
        tool: type,
      })

      // Navigate via URL
      navigate(`/w/${workspaceId}/${type}`)
    },
    [workspaceId, navigateTo, navigate, allItems]
  )

  // Handle clicking on a global search result - navigate to the entity
  const handleSearchResultClick = useCallback(
    (result: EnrichedSearchResult) => {
      if (
        (result.entityType === "paper-comment" || result.entityType === "paper-comment-reply") &&
        result.paperId &&
        result.commentId
      ) {
        navigateTo({
          id: result.paperId,
          label: result.subtitle ?? "Paper",
          tool: "papers",
          itemId: result.paperId,
          commentId: result.commentId,
        })
        navigate(`/w/${workspaceId}/papers/${result.paperId}?commentId=${result.commentId}`)
        return
      }

      if (result.entityType === "task-comment" && result.projectId && result.taskId) {
        const taskLabel = result.subtitle?.split("·").pop()?.trim() || result.title || "Task"
        navigateTo({
          id: result.taskId,
          label: taskLabel,
          tool: "projects",
          itemId: result.projectId,
          taskId: result.taskId,
        })
        navigate(`/w/${workspaceId}/projects/${result.projectId}/tasks/${result.taskId}`)
        return
      }

      const toolType = getToolTypeForEntityType(result.entityType)

      // Update window store for breadcrumb tracking
      // Note: folders use folderId (not itemId) to avoid "File not found" errors
      navigateTo({
        id: result.entityId,
        label: result.title,
        tool: toolType,
        // Only set itemId for non-folder entities (files, notes, etc.)
        ...(result.entityType !== "folder" && { itemId: result.entityId }),
        // For folders, set folderId so breadcrumbs show folder context
        ...(result.entityType === "folder" && { folderId: result.entityId }),
      })

      // Navigate via URL to the specific entity
      // Folders use query param format: /files?folder=id
      if (result.entityType === "folder") {
        navigate(`/w/${workspaceId}/files?folder=${result.entityId}`)
      } else if (result.entityType === "forum-reply" && result.parentId) {
        // Forum replies navigate to their parent discussion
        navigate(`/w/${workspaceId}/forum/${result.parentId}`)
      } else {
        navigate(`/w/${workspaceId}/${toolType}/${result.entityId}`)
      }
    },
    [workspaceId, navigateTo, navigate]
  )

  // Handle selection by index
  const handleSelect = useCallback(
    (index: number) => {
      const item = filteredItems[index]
      if (item) {
        selectTool(item.type)
      }
    },
    [filteredItems, selectTool]
  )

  return (
    <List itemCount={filteredItems.length} onSelect={handleSelect} testId="tool-selector">
      <ListSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search..."
        testId="tool-selector-search-input"
        onFocusChange={handleSearchFocusChange}
      />

      {/* Global search results - shown when search is active */}
      {isSearchActive && (
        <SearchResults results={searchResults} onResultClick={handleSearchResultClick} groupByType={true} />
      )}

      {/* Tool list - hidden when search is active */}
      {!isSearchActive && (
        <>
          {filteredItems.map((item, index) => {
            const hasUnread = getUnreadCount(item.type) > 0
            return (
              <ListRow
                key={item.type}
                index={index}
                icon={
                  <span style={{ position: "relative", display: "flex" }}>
                    {item.icon}
                    {hasUnread && (
                      <span
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#2196f3",
                        }}
                      />
                    )}
                  </span>
                }
                title={item.label}
                meta={item.desc}
                onClick={() => selectTool(item.type)}
                testId={`tool-${item.type}`}
              />
            )
          })}

          {filteredItems.length === 0 && <ListEmpty message="No results" />}
        </>
      )}
    </List>
  )
}
