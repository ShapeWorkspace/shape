import { useMemo, useCallback } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { useWindowStore } from "../store/window-store"
import { useFolder } from "../store/queries/use-folders"
import { useNotifications } from "../store/queries/use-notifications"
import { useSidecar } from "../contexts/SidecarContext"
import { WindowTab } from "../store/types"
import { ChevronRight, Home } from "lucide-react"
import * as styles from "../styles/breadcrumb.css"

interface BreadcrumbProps {
  window: WindowTab | undefined
  // Whether this breadcrumb's area (content) is focused
  isFocused?: boolean
}

/**
 * Breadcrumb displays the navigation stack for the current window.
 * Clicking items navigates back via URL.
 */
export function Breadcrumb({ window, isFocused = false }: BreadcrumbProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { navigateBack, navigateTo } = useWindowStore()
  const { clearSidecar } = useSidecar()
  const { data: notifications = [] } = useNotifications()

  // Extract current folderId from URL query params
  // This is used to detect orphan folder navigation (e.g., from search results)
  const currentFolderId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get("folder")
  }, [location.search])

  // Fetch current folder to get its parentId
  // Using useFolder hook which fetches directly from the server
  const { data: currentFolder } = useFolder(currentFolderId ?? "")

  // Determine if we should show ".." parent navigation link
  // Show when: folder has a parent AND that parent is not already in the breadcrumb stack
  const shouldShowParentLink = useMemo(() => {
    if (!currentFolder?.parentId) {
      return false
    }
    // Check if parent is already represented in the breadcrumb stack
    const parentInStack = window?.stack.some(item => item.folderId === currentFolder.parentId)
    return !parentInStack
  }, [currentFolder, window?.stack])

  // Get the parent folder name for the breadcrumb
  const { data: parentFolder } = useFolder(currentFolder?.parentId ?? "")

  // Only count actionable unread notifications for the home breadcrumb indicator.
  const hasUnreadNotificationsForHomeBreadcrumb = useMemo(() => {
    return notifications.some(
      notification => !notification.readAt && notification.actionType !== "reaction_added"
    )
  }, [notifications])

  const homeBreadcrumbIcon = (
    <span className={styles.breadcrumbIconWrapper}>
      <Home size={14} />
      {hasUnreadNotificationsForHomeBreadcrumb && (
        <span className={styles.breadcrumbUnreadDot} data-testid="breadcrumb-home-unread-indicator" />
      )}
    </span>
  )

  // Navigate to parent folder (bash-like ".." behavior)
  // We update the window store, which triggers URL sync automatically
  const goToParent = useCallback(() => {
    if (!currentFolder?.parentId) return
    // Pop current folder from stack, then push parent folder
    // URL sync will handle the actual navigation
    navigateBack()
    navigateTo({
      id: currentFolder.parentId,
      label: parentFolder?.content.name ?? "Folder",
      tool: "files",
      folderId: currentFolder.parentId,
    })
  }, [currentFolder, parentFolder, navigateBack, navigateTo])

  // Navigate to workspace home
  const goHome = () => {
    if (!window || !workspaceId) return
    // Clear the stack in window store and navigate to workspace home
    const timesToGoBack = window.stack.length
    for (let i = 0; i < timesToGoBack; i++) {
      navigateBack()
    }
    // Clear sidecar when navigating home
    clearSidecar()
    navigate(`/w/${workspaceId}`)
  }

  if (!window || window.stack.length === 0) {
    return (
      <nav className={styles.breadcrumb} data-testid="breadcrumb">
        <span
          className={`${styles.breadcrumbItem} ${styles.breadcrumbHomeItem}`}
          data-active={true}
          data-focused={isFocused}
          data-testid="breadcrumb-home"
        >
          {homeBreadcrumbIcon}
        </span>
      </nav>
    )
  }

  // Navigate to a specific breadcrumb item via URL
  const handleClick = (index: number) => {
    if (!workspaceId || !window) return

    // Save the clicked item BEFORE modifying the stack
    const clickedItem = window.stack[index]
    if (!clickedItem) return

    // Pop items from the stack to get back to the clicked item
    const timesToGoBack = window.stack.length - 1 - index
    for (let i = 0; i < timesToGoBack; i++) {
      navigateBack()
    }

    // Build URL based on the clicked item
    if (clickedItem.itemId && clickedItem.folderId) {
      // File inside a folder - preserve folder context
      navigate(`/w/${workspaceId}/${clickedItem.tool}/${clickedItem.itemId}?folder=${clickedItem.folderId}`)
    } else if (clickedItem.folderId) {
      // Folder navigation uses query params
      navigate(`/w/${workspaceId}/${clickedItem.tool}?folder=${clickedItem.folderId}`)
    } else if (clickedItem.itemId) {
      // File/item at root level
      navigate(`/w/${workspaceId}/${clickedItem.tool}/${clickedItem.itemId}`)
    } else {
      // Tool root (e.g., Files at root level)
      navigate(`/w/${workspaceId}/${clickedItem.tool}`)
    }
  }

  return (
    <nav className={styles.breadcrumb} data-testid="breadcrumb">
      <span
        className={`${styles.breadcrumbItem} ${styles.breadcrumbHomeItem}`}
        onClick={goHome}
        data-testid="breadcrumb-back-button"
      >
        {homeBreadcrumbIcon}
      </span>
      {/* Show ".." parent navigation when folder has parent not in the stack (e.g., from search) */}
      {shouldShowParentLink && (
        <span className={styles.breadcrumbSegment}>
          <ChevronRight size={12} className={styles.breadcrumbSeparator} />
          <span className={styles.breadcrumbItem} onClick={goToParent} data-testid="breadcrumb-parent">
            ..
          </span>
        </span>
      )}
      {window.stack.map((item, index) => {
        const isLeaf = index === window.stack.length - 1
        return (
          <span key={index} className={styles.breadcrumbSegment}>
            <ChevronRight size={12} className={styles.breadcrumbSeparator} />
            <span
              className={styles.breadcrumbItem}
              data-active={isLeaf}
              data-focused={isLeaf && isFocused}
              onClick={() => handleClick(index)}
              data-testid={`breadcrumb-item-${index}`}
            >
              {item.label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}
