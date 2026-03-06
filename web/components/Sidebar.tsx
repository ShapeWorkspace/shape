import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore, type AuthUser } from "../store/auth-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { WindowTab, ToolType } from "../store/types"
import { LayoutMode } from "../contexts/SidecarContext"
import { TOOL_LABELS } from "../constants/tool-labels"
import {
  Plus,
  X,
  FileText,
  Users,
  MessageCircle,
  Folder,
  MessagesSquare,
  CheckSquare,
  Home,
  Inbox,
  Settings,
  Building2,
  Mail,
  Check,
  Columns3,
  Fullscreen,
  ChevronRight,
} from "lucide-react"
import * as styles from "../styles/sidebar.css"
import * as listStyles from "../styles/list.css"
import { SidebarWorkspaceSwitcher } from "./SidebarWorkspaceSwitcher"
import { UserInviteResponse } from "../../engine/models/user-invite"

const toolIcons: Record<ToolType, React.ReactNode> = {
  drafts: <Inbox size={14} />,
  inbox: <Inbox size={14} />,
  memos: <FileText size={14} />,
  contacts: <Users size={14} />,
  groups: <MessageCircle size={14} />,
  files: <Folder size={14} />,
  papers: <FileText size={14} />,
  forum: <MessagesSquare size={14} />,
  tasks: <CheckSquare size={14} />,
  projects: <CheckSquare size={14} />,
  settings: <Settings size={14} />,
  workspaces: <Building2 size={14} />,
}

interface SidebarProps {
  layoutMode?: LayoutMode
  onLayoutModeChange?: (mode: LayoutMode) => void
  isFocused?: boolean
  selectedIndex?: number
  onSelectedIndexChange?: (index: number) => void
  // When true, the sidebar is rendered inside a mobile drawer
  // This changes styling (no fixed width) and adds close behavior
  isDrawerMode?: boolean
  // Called when the drawer should close (e.g., after item selection)
  onDrawerClose?: () => void
}

export function Sidebar({
  layoutMode,
  onLayoutModeChange,
  isFocused,
  selectedIndex = 0,
  onSelectedIndexChange,
  isDrawerMode = false,
  onDrawerClose,
}: SidebarProps) {
  const { windows, createWindow, setActiveWindow, closeWindow } = useWindowStore()
  const isFullMode = layoutMode === "full"

  // Handle window selection - close drawer after selection in mobile mode
  const handleWindowSelect = (windowId: string) => {
    setActiveWindow(windowId)
    if (isDrawerMode && onDrawerClose) {
      onDrawerClose()
    }
  }

  // Handle new window creation - close drawer after in mobile mode
  const handleCreateWindow = () => {
    createWindow()
    if (isDrawerMode && onDrawerClose) {
      onDrawerClose()
    }
  }

  return (
    <aside
      className={isDrawerMode ? styles.sidebarDrawerMode : styles.sidebar}
      data-testid="navigation-sidebar"
      data-focused={isFocused}
    >
      {/* Header - in drawer mode includes close button, otherwise just title */}
      {isDrawerMode ? (
        <div className={styles.sidebarHeaderRow}>
          <div className={styles.sidebarHeader} data-focused={isFocused}>
            Shape
          </div>
          {onDrawerClose && (
            <button
              className={styles.sidebarCloseButton}
              onClick={onDrawerClose}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          )}
        </div>
      ) : (
        <div className={styles.sidebarHeader} data-focused={isFocused}>
          Shape
        </div>
      )}

      {/* Workspace switcher dropdown - only shows when a workspace is selected */}
      <SidebarWorkspaceSwitcher />

      <button
        className={styles.sidebarItemNewWindow}
        onClick={handleCreateWindow}
        data-keyboard-selected={isFocused && selectedIndex === 0}
        onMouseEnter={() => onSelectedIndexChange?.(0)}
      >
        <Plus size={14} className={styles.sidebarItemIcon} />
        <span>New window</span>
      </button>

      {/* Scrollable container for windows list - allows independent scrolling */}
      <div className={styles.sidebarWindowsList}>
        {windows.map((window, index) => (
          <WindowItem
            key={window.id}
            window={window}
            onSelect={() => handleWindowSelect(window.id)}
            onClose={() => closeWindow(window.id)}
            isKeyboardSelected={isFocused && selectedIndex === index + 1}
            onMouseEnter={() => onSelectedIndexChange?.(index + 1)}
          />
        ))}
      </div>

      {/* Pending invites section - only shows when there are pending invites */}
      <PendingInvites />

      {/* Bottom row - layout toggle (hidden in drawer mode) */}
      {!isDrawerMode && (
        <div className={styles.sidebarBottom}>
          {isFullMode && onLayoutModeChange && (
            <div className={styles.sidebarLayoutToggle}>
              <button
                className={styles.sidebarLayoutToggleButton}
                data-active={isFullMode}
                onClick={() => onLayoutModeChange("full")}
                data-testid="layout-mode-full"
                title="Full width"
              >
                <Columns3 size={14} />
              </button>
              <button
                className={styles.sidebarLayoutToggleButton}
                data-active={!isFullMode}
                onClick={() => onLayoutModeChange("compact")}
                data-testid="layout-mode-compact"
                title="Compact"
              >
                <Fullscreen size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

interface WindowItemProps {
  window: WindowTab
  onSelect: () => void
  onClose: () => void
  isKeyboardSelected?: boolean
  onMouseEnter?: () => void
}

// Maps tool type to human-readable name for breadcrumb display
const toolDisplayNames = TOOL_LABELS

function WindowItem({ window, onSelect, onClose, isKeyboardSelected, onMouseEnter }: WindowItemProps) {
  const getLeafLabel = () => {
    if (window.stack.length === 0) return "Home"
    return window.stack[window.stack.length - 1].label
  }

  const getLeafIcon = () => {
    if (window.stack.length === 0) return <Home size={14} />
    const tool = window.stack[0].tool
    return toolIcons[tool] || <Home size={14} />
  }

  // Generates the breadcrumb sublabel segments: ["Tool", "parent1", "parent2"]
  // Shows all path items except the leaf (which is displayed as the main label)
  const getBreadcrumbSegments = (): string[] | null => {
    if (window.stack.length <= 1) return null

    const toolName = toolDisplayNames[window.stack[0].tool]
    // Get all labels except the last one (leaf)
    const parentLabels = window.stack.slice(0, -1).map(item => item.label)

    // Return segments, avoiding duplication if first label matches tool name
    if (parentLabels[0] === toolName) {
      return parentLabels
    }
    return [toolName, ...parentLabels]
  }

  const breadcrumbSegments = getBreadcrumbSegments()

  return (
    <div
      className={styles.sidebarItem}
      data-active={window.isActive}
      data-keyboard-selected={isKeyboardSelected}
      data-testid={`window-tab-${window.id}`}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <span className={styles.sidebarItemIcon}>{getLeafIcon()}</span>
      <div className={styles.sidebarItemContent}>
        <span className={listStyles.listItemTitle}>{getLeafLabel()}</span>
        {breadcrumbSegments && (
          <span className={styles.sidebarItemSublabel}>
            {breadcrumbSegments.map((segment, index) => (
              <span key={index} className={styles.sidebarItemSublabelSegment}>
                {index > 0 && <ChevronRight size={10} />}
                <span>{segment}</span>
              </span>
            ))}
          </span>
        )}
      </div>
      <button
        className={styles.sidebarItemClose}
        onClick={e => {
          e.stopPropagation()
          onClose()
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

/**
 * PendingInvites displays workspace invites the user has received.
 * Only renders when there are pending invites.
 */
function PendingInvites() {
  const { globalClient, application } = useEngineStore()
  const { accounts } = useAuthStore()
  const { refreshWorkspaces, selectWorkspace } = useWorkspaceStore()
  const queryClient = useQueryClient()
  const fallbackAccountId = accounts.length === 1 ? accounts[0].uuid : null
  const activeAccountId = application?.getAccountUserId() ?? fallbackAccountId

  // Only fetch invites for authenticated accounts (those present in the accounts list).
  const isAuthenticatedAccount = accounts.some((account: AuthUser) => account.uuid === activeAccountId)

  // Fetch pending invites for the current user via the workspace-scoped apiService.
  const { data: invites = [] } = useQuery({
    queryKey: ["user-invites", activeAccountId],
    queryFn: async () => {
      if (!globalClient || !activeAccountId) {
        return []
      }
      const result = await globalClient.getMyPendingInvites().execute(activeAccountId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return result.getValue()
    },
    enabled: isAuthenticatedAccount && !!globalClient,
    refetchInterval: 30000,
  })

  // Accept invite mutation
  const acceptMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!globalClient || !activeAccountId) {
        throw new Error("Client not initialized")
      }
      const result = await globalClient.getAcceptUserInvite().execute({
        accountId: activeAccountId,
        inviteId,
      })
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return result.getValue()
    },
    onSuccess: async result => {
      queryClient.invalidateQueries({ queryKey: ["user-invites", activeAccountId] })
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      try {
        await refreshWorkspaces()
      } catch {
        // Ignore refresh errors; selection will retry once workspaces are available.
      }

      if (result?.workspace_id && activeAccountId) {
        selectWorkspace(result.workspace_id, activeAccountId).catch(() => {})
      }
    },
  })

  // Don't render anything if no pending invites or not an authenticated account
  if (!isAuthenticatedAccount || invites.length === 0) {
    return null
  }

  return (
    <div className={styles.sidebarInvites} data-testid="pending-invites-section">
      <div className={styles.sidebarInvitesHeader}>Pending Invites</div>
      {invites.map((invite: UserInviteResponse) => (
        <div key={invite.id} className={styles.sidebarInviteItem} data-testid="pending-invite-item">
          <Mail size={14} className={styles.sidebarInviteIcon} />
          <span className={styles.sidebarInviteName}>{invite.workspace_name}</span>
          <button
            className={styles.sidebarInviteAccept}
            onClick={() => acceptMutation.mutate(invite.id)}
            disabled={acceptMutation.isPending}
            data-testid="accept-invite-button"
          >
            <Check size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
