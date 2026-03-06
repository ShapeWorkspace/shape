import { useState, useEffect, useMemo } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { ChevronRight, Plus, PanelRight, Columns3, Fullscreen, AlertTriangle, X } from "lucide-react"
import { Sidebar } from "../components/Sidebar"
import { Breadcrumb } from "../components/Breadcrumb"
import { CommandPalette } from "../components/CommandPalette"
import { MobileHeader } from "../components/MobileHeader"
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation"
import { useIsBreakpoint } from "../hooks/use-is-breakpoint"
import { useUrlSync } from "../router/hooks/useUrlSync"
import { useSidecarRouteSync } from "../router/hooks/useSidecarRouteSync"
import { useWindowStore } from "../store/window-store"
import { useAuthStore } from "../store/auth-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { SidecarProvider, useSidecarLayout } from "../contexts/SidecarContext"
import { FocusProvider, useFocus } from "../contexts/FocusContext"
import { GlobalDropProvider, useGlobalDrop } from "../contexts/GlobalDropContext"
import { CommandPaletteProvider } from "../contexts/CommandPaletteContext"
import { DraftProvider } from "../contexts/DraftContext"
import { EntitySaveProvider } from "../contexts/EntitySaveContext"
import { MobileDrawerProvider, useMobileDrawer } from "../contexts/MobileDrawerContext"
import { useDrafts } from "../contexts/DraftContext"
import { hasDraftSettled } from "../utils/drafts"
import { parseWindowLocationFromUrl } from "../utils/window-navigation"
import * as styles from "../styles/app.css"
import * as sidecarStyles from "../styles/sidecar.css"
import * as breadcrumbStyles from "../styles/breadcrumb.css"
import * as mobileDrawerStyles from "../styles/mobile-drawer.css"

// Mobile breakpoint threshold (pixels)
const MOBILE_BREAKPOINT = 768

/**
 * WorkspaceLayout is the main layout for authenticated workspace views.
 * It includes the sidebar, breadcrumb navigation, content area, and sidecar.
 *
 * Per Book of UI: The sidecar is rendered per tool. Each tool determines how
 * to render its own sidecar by passing content through SidecarContext.
 * The layout wraps children with SidecarProvider and renders the sidecar
 * content in the appropriate position.
 *
 * Sidecars use a stack-based navigation system. Tools push content onto the
 * stack, and the layout automatically renders breadcrumbs. Clicking a breadcrumb
 * navigates back to that level, restoring the previous content.
 *
 * On mobile (< 768px), the layout switches to a single-column design with:
 * - iOS-style header with hamburger menu, back button, title, and sidecar button
 * - Slide-out drawer for navigation sidebar
 * - Slide-out drawer for sidecar content
 */
export function WorkspaceLayout() {
  // Wrap with providers:
  // - FocusProvider manages which area (sidebar/content/sidecar) has keyboard focus
  // - SidecarProvider allows tools to pass sidecar content up to layout
  // - GlobalDropProvider enables file drop anywhere in the workspace
  // - CommandPaletteProvider enables global command palette (Cmd+K)
  return (
    <FocusProvider>
      <SidecarProvider>
        <DraftProvider>
          <EntitySaveProvider>
            <GlobalDropProvider>
              <CommandPaletteProvider>
                <WorkspaceLayoutInner />
                <CommandPalette />
              </CommandPaletteProvider>
            </GlobalDropProvider>
          </EntitySaveProvider>
        </DraftProvider>
      </SidecarProvider>
    </FocusProvider>
  )
}

/**
 * Inner layout component that consumes sidecar context.
 * Separated from WorkspaceLayout so we can use useSidecarLayout inside the provider.
 * Detects mobile viewport and renders appropriate layout.
 */
function WorkspaceLayoutInner() {
  // Detect mobile viewport
  const isMobile = useIsBreakpoint("max", MOBILE_BREAKPOINT)

  // Mobile layout uses MobileDrawerProvider for drawer state management
  if (isMobile) {
    return (
      <MobileDrawerProvider>
        <MobileLayout />
      </MobileDrawerProvider>
    )
  }

  return <DesktopLayout />
}

/**
 * Desktop layout with three-panel design: sidebar, content, sidecar.
 */
function DesktopLayout() {
  useKeyboardNavigation()

  const location = useLocation()
  const { windows, activeWindowId, createWindow, setActiveWindow } = useWindowStore()
  const activeWindow = windows.find(w => w.id === activeWindowId)
  const { focusArea, setFocusArea, isSidebarFocused, isContentFocused } = useFocus()
  const [sidebarSelectedIndex, setSidebarSelectedIndex] = useState(0)
  const { isDragging } = useGlobalDrop()
  const { draftEntities, draftBlocks } = useDrafts()
  const isAuthenticating = useAuthStore(state => state.isAuthenticating)
  const isRegisteringWorkspace = useWorkspaceStore(state => state.registeringWorkspaceIds.length > 0)

  // Total sidebar items: windows + "New window" button
  const sidebarItemCount = windows.length + 1

  // Sidecar content and navigation from context
  const {
    stack: sidecarStack,
    navigateToStackIndex,
    setFocused: setSidecarFocused,
    isCollapsed: isSidecarCollapsed,
    isCollapseDisabled,
    toggleSidecarVisibility,
    layoutMode,
    setLayoutMode,
  } = useSidecarLayout()

  const currentSidecarRoute = useMemo(() => {
    if (sidecarStack.length === 0) {
      return null
    }
    return sidecarStack[sidecarStack.length - 1]?.route ?? null
  }, [sidecarStack])

  useUrlSync(currentSidecarRoute)
  useSidecarRouteSync(currentSidecarRoute)

  // Determine if we're in full layout mode
  const isFullMode = layoutMode === "full"

  const parsedLocation = useMemo(
    () => parseWindowLocationFromUrl(location.pathname, location.search),
    [location.pathname, location.search]
  )

  // Ensure there's at least one window when no tool is encoded in the URL.
  useEffect(() => {
    if (windows.length === 0 && !parsedLocation) {
      createWindow()
    }
  }, [windows.length, parsedLocation, createWindow])

  // Sidecar is visible when there's content in the stack and not manually collapsed
  const showSidecar = sidecarStack.length > 0 && !isSidecarCollapsed
  // Has sidecar content (for showing toggle button and enabling S shortcut)
  const hasSidecarContent = sidecarStack.length > 0
  const canToggleSidecar = hasSidecarContent && !isCollapseDisabled

  const showDraftWarning = useMemo(() => {
    const currentItem = activeWindow?.stack[activeWindow.stack.length - 1]
    if (!currentItem?.tool) {
      return false
    }

    const draftBlocksByKey = new Map<string, typeof draftBlocks>()
    for (const block of draftBlocks) {
      const key = `${block.entityType}:${block.entityId}`
      const blocks = draftBlocksByKey.get(key) ?? []
      blocks.push(block)
      draftBlocksByKey.set(key, blocks)
    }

    const draftEntitiesByKey = new Map<string, (typeof draftEntities)[number]>()
    for (const draft of draftEntities) {
      draftEntitiesByKey.set(`${draft.entity.entity_type}:${draft.id}`, draft)
    }

    const getKey = (entityType: string, entityId?: string) => {
      if (!entityId) return null
      return `${entityType}:${entityId}`
    }

    if (currentItem.tool === "memos") {
      const key = getKey("note", currentItem.itemId)
      if (!key) return false
      return hasDraftSettled(draftEntitiesByKey.get(key), draftBlocksByKey.get(key) ?? [])
    }
    if (currentItem.tool === "papers") {
      const key = getKey("paper", currentItem.itemId)
      if (!key) return false
      return hasDraftSettled(draftEntitiesByKey.get(key), draftBlocksByKey.get(key) ?? [])
    }
    if (currentItem.tool === "projects") {
      const taskKey = getKey("task", currentItem.taskId)
      if (taskKey) {
        const settledTask = hasDraftSettled(
          draftEntitiesByKey.get(taskKey),
          draftBlocksByKey.get(taskKey) ?? []
        )
        if (settledTask) {
          return true
        }
      }
      const projectKey = getKey("project", currentItem.itemId)
      if (!projectKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(projectKey), draftBlocksByKey.get(projectKey) ?? [])
    }
    if (currentItem.tool === "forum") {
      const discussionKey = getKey("forum-discussion", currentItem.discussionId)
      if (discussionKey) {
        const settledDiscussion = hasDraftSettled(
          draftEntitiesByKey.get(discussionKey),
          draftBlocksByKey.get(discussionKey) ?? []
        )
        if (settledDiscussion) {
          return true
        }
      }
      const channelKey = getKey("forum-channel", currentItem.itemId)
      if (!channelKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(channelKey), draftBlocksByKey.get(channelKey) ?? [])
    }
    if (currentItem.tool === "groups") {
      const groupKey = getKey("group-chat", currentItem.itemId)
      if (!groupKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(groupKey), draftBlocksByKey.get(groupKey) ?? [])
    }
    if (currentItem.tool === "contacts") {
      const dmKey = getKey("direct-message", currentItem.itemId)
      if (!dmKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(dmKey), draftBlocksByKey.get(dmKey) ?? [])
    }
    if (currentItem.tool === "files") {
      const fileKey = getKey("file", currentItem.itemId)
      if (!fileKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(fileKey), draftBlocksByKey.get(fileKey) ?? [])
    }

    return false
  }, [activeWindow, draftEntities, draftBlocks])

  // Handle keyboard shortcuts for focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      // W to focus sidebar (but NOT Cmd+W which should close the window on macOS)
      if ((e.key === "w" || e.key === "W") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setFocusArea("sidebar")
        return
      }

      // Arrow keys for focus switching and sidebar navigation
      if (e.key === "ArrowRight") {
        if (focusArea === "sidebar") {
          e.preventDefault()
          setFocusArea("content")
        } else if (showSidecar && focusArea === "content") {
          e.preventDefault()
          setFocusArea("sidecar")
        }
      } else if (e.key === "ArrowLeft") {
        if (focusArea === "sidecar") {
          e.preventDefault()
          setFocusArea("content")
        } else if (focusArea === "content") {
          e.preventDefault()
          setFocusArea("sidebar")
        }
      }

      // Up/Down/Enter for sidebar navigation when sidebar is focused
      if (focusArea === "sidebar") {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSidebarSelectedIndex(i => Math.min(i + 1, sidebarItemCount - 1))
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          setSidebarSelectedIndex(i => Math.max(i - 1, 0))
        } else if (e.key === "Enter") {
          e.preventDefault()
          // Index 0 is "New window", rest are windows
          if (sidebarSelectedIndex === 0) {
            createWindow()
          } else {
            const windowToSelect = windows[sidebarSelectedIndex - 1]
            if (windowToSelect) {
              setActiveWindow(windowToSelect.id)
            }
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    showSidecar,
    focusArea,
    sidebarItemCount,
    sidebarSelectedIndex,
    createWindow,
    windows,
    setActiveWindow,
    setFocusArea,
  ])

  // Handle 'S' key to toggle sidecar visibility
  // Only active when there's sidecar content, not disabled, and not in an input field
  useEffect(() => {
    if (!canToggleSidecar) {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      if (e.key === "s") {
        e.preventDefault()
        toggleSidecarVisibility()
        // If sidecar was collapsed (and is now being shown), focus it
        if (isSidecarCollapsed) {
          setFocusArea("sidecar")
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canToggleSidecar, toggleSidecarVisibility, isSidecarCollapsed, setFocusArea])

  // Reset focus to content when sidecar is hidden
  useEffect(() => {
    if (!showSidecar) {
      setFocusArea("content")
    }
  }, [showSidecar, setFocusArea])

  // Sync focus state to sidecar context
  useEffect(() => {
    if (showSidecar) {
      setSidecarFocused(focusArea === "sidecar")
    }
  }, [focusArea, showSidecar, setSidecarFocused])

  // Get current sidecar content from top of stack
  const currentSidecarContent = sidecarStack.length > 0 ? sidecarStack[sidecarStack.length - 1].content : null
  // Block main content interactions while auth/workspace registration is in-flight.
  const shouldBlockMainContent = isAuthenticating || isRegisteringWorkspace
  const mainContentAreaClassName = [
    isFullMode ? styles.mainContentAreaFull : styles.mainContentArea,
    shouldBlockMainContent ? styles.mainContentAreaBlocked : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={styles.app}>
      <Sidebar
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        isFocused={isSidebarFocused}
        selectedIndex={sidebarSelectedIndex}
        onSelectedIndexChange={setSidebarSelectedIndex}
      />
      <main className={isFullMode ? styles.mainFull : styles.main} aria-busy={shouldBlockMainContent}>
        <div className={mainContentAreaClassName}>
          <div
            className={
              isFullMode
                ? styles.contentWrapperFull
                : showSidecar
                  ? styles.contentWrapperWithSidecar
                  : styles.contentWrapper
            }
          >
            {/* Breadcrumb bar: navigation on left, sidecar toggle on right */}
            <div className={isFullMode ? breadcrumbStyles.breadcrumbBarFull : breadcrumbStyles.breadcrumbBar}>
              <Breadcrumb window={activeWindow} isFocused={isContentFocused} />
              {/* Sidecar toggle button - hidden when collapse is disabled */}
              {canToggleSidecar && (
                <button
                  className={breadcrumbStyles.sidecarToggle}
                  onClick={toggleSidecarVisibility}
                  data-active={hasSidecarContent && !isSidecarCollapsed}
                  data-testid="sidecar-toggle"
                  title={isSidecarCollapsed ? "Show sidecar (S)" : "Hide sidecar (S)"}
                  aria-label={isSidecarCollapsed ? "Show sidecar" : "Hide sidecar"}
                >
                  <span className={breadcrumbStyles.sidecarToggleIcon}>
                    <PanelRight size={16} />
                    {showDraftWarning && (
                      <span
                        className={breadcrumbStyles.sidecarToggleWarning}
                        data-testid="sidecar-draft-warning"
                      >
                        <AlertTriangle size={10} />
                      </span>
                    )}
                  </span>
                </button>
              )}
            </div>
            {/* Content container provides the visual styling (bg, border, shadow) */}
            {/* onFocusCapture claims focus context when any element inside receives focus */}
            <div
              className={isFullMode ? styles.contentFull : styles.content}
              onFocusCapture={() => setFocusArea("content")}
            >
              {/* Inner wrapper provides padding and scroll handling */}
              <div className={styles.contentInner}>
                {/* Outlet renders the matched child route (tool components) */}
                <Outlet />
              </div>
              {/* Drop target overlay - dashed border with + icon */}
              {isDragging && (
                <div className={styles.dropTargetOverlay}>
                  <Plus size={48} className={styles.dropTargetIcon} />
                </div>
              )}
            </div>
            {/* Layout mode toggle - outside and below the content container */}
            {!isFullMode && (
              <div className={styles.layoutModeToggleContainer}>
                <div className={styles.layoutModeToggle}>
                  <button
                    className={styles.layoutModeButton}
                    data-active={isFullMode}
                    onClick={() => setLayoutMode("full")}
                    data-testid="layout-mode-full"
                    title="Full width"
                  >
                    <Columns3 size={14} />
                  </button>
                  <button
                    className={styles.layoutModeButton}
                    data-active={!isFullMode}
                    onClick={() => setLayoutMode("compact")}
                    data-testid="layout-mode-compact"
                    title="Compact"
                  >
                    <Fullscreen size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Sidecar with stack-based breadcrumb navigation */}
          {/* Per Book of UI: Sidecar has a breadcrumb bar at top that is automatically
              provided based on the current sidecar stack. Callers should not implement
              their own breadcrumb UI. */}
          {showSidecar && (
            <div
              className={isFullMode ? sidecarStyles.sidecarWrapperFull : sidecarStyles.sidecarWrapper}
              data-testid="sidecar-container"
            >
              {/* Breadcrumb bar - renders from sidecar stack */}
              <div
                className={isFullMode ? sidecarStyles.sidecarBreadcrumbFull : sidecarStyles.sidecarBreadcrumb}
                data-testid="sidecar-breadcrumbs"
              >
                {sidecarStack.map((item, index) => {
                  const isLeaf = index === sidecarStack.length - 1
                  return (
                    <span key={item.id} className={sidecarStyles.sidecarBreadcrumbItem}>
                      {index > 0 && (
                        <ChevronRight size={12} className={sidecarStyles.sidecarBreadcrumbSeparator} />
                      )}
                      <span
                        className={sidecarStyles.sidecarBreadcrumbItemText}
                        data-active={isLeaf}
                        data-focused={isLeaf && focusArea === "sidecar"}
                        data-testid={`sidecar-breadcrumb-item-${index}`}
                        onClick={() => navigateToStackIndex(index)}
                      >
                        {item.title}
                      </span>
                    </span>
                  )
                })}
              </div>
              <div
                className={isFullMode ? sidecarStyles.sidecarFull : sidecarStyles.sidecar}
                data-focused={focusArea === "sidecar"}
                onClick={() => setFocusArea("sidecar")}
              >
                <div className={isFullMode ? sidecarStyles.sidecarContentFull : sidecarStyles.sidecarContent}>
                  {currentSidecarContent}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * Mobile layout with single-column design and slide-out drawers.
 * Uses MobileDrawerContext for drawer state management.
 */
function MobileLayout() {
  const location = useLocation()
  const { windows, activeWindowId, createWindow, navigateBack } = useWindowStore()
  const activeWindow = windows.find(w => w.id === activeWindowId)
  const { isDragging } = useGlobalDrop()
  const { draftEntities, draftBlocks } = useDrafts()
  const isAuthenticating = useAuthStore(state => state.isAuthenticating)
  const isRegisteringWorkspace = useWorkspaceStore(state => state.registeringWorkspaceIds.length > 0)

  // Mobile drawer state
  const {
    isSidebarDrawerOpen,
    sidebarClosing,
    openSidebarDrawer,
    closeSidebarDrawer,
    isSidecarDrawerOpen,
    sidecarClosing,
    openSidecarDrawer,
    closeSidecarDrawer,
    closeAllDrawers,
  } = useMobileDrawer()

  // Sidecar content from context
  const { stack: sidecarStack, navigateToStackIndex } = useSidecarLayout()

  const currentSidecarRoute = useMemo(() => {
    if (sidecarStack.length === 0) {
      return null
    }
    return sidecarStack[sidecarStack.length - 1]?.route ?? null
  }, [sidecarStack])

  useUrlSync(currentSidecarRoute)
  useSidecarRouteSync(currentSidecarRoute)

  const parsedLocation = useMemo(
    () => parseWindowLocationFromUrl(location.pathname, location.search),
    [location.pathname, location.search]
  )

  // Ensure there's at least one window when no tool is encoded in the URL.
  useEffect(() => {
    if (windows.length === 0 && !parsedLocation) {
      createWindow()
    }
  }, [windows.length, parsedLocation, createWindow])

  // Derive header info from active window stack
  const canGoBack = activeWindow ? activeWindow.stack.length > 0 : false

  const title = useMemo(() => {
    if (!activeWindow || activeWindow.stack.length === 0) {
      return "Home"
    }
    return activeWindow.stack[activeWindow.stack.length - 1].label
  }, [activeWindow])

  // Breadcrumb segments for the mobile header (all items except the last which is the title)
  const breadcrumbSegments = useMemo(() => {
    if (!activeWindow || activeWindow.stack.length <= 1) {
      return []
    }
    return activeWindow.stack.slice(0, -1).map(item => item.label)
  }, [activeWindow])

  const hasSidecarContent = sidecarStack.length > 0

  // Check for draft warning on sidecar button
  const showDraftWarning = useMemo(() => {
    const currentItem = activeWindow?.stack[activeWindow.stack.length - 1]
    if (!currentItem?.tool) {
      return false
    }

    const draftBlocksByKey = new Map<string, typeof draftBlocks>()
    for (const block of draftBlocks) {
      const key = `${block.entityType}:${block.entityId}`
      const blocks = draftBlocksByKey.get(key) ?? []
      blocks.push(block)
      draftBlocksByKey.set(key, blocks)
    }

    const draftEntitiesByKey = new Map<string, (typeof draftEntities)[number]>()
    for (const draft of draftEntities) {
      draftEntitiesByKey.set(`${draft.entity.entity_type}:${draft.id}`, draft)
    }

    const getKey = (entityType: string, entityId?: string) => {
      if (!entityId) return null
      return `${entityType}:${entityId}`
    }

    if (currentItem.tool === "memos") {
      const key = getKey("note", currentItem.itemId)
      if (!key) return false
      return hasDraftSettled(draftEntitiesByKey.get(key), draftBlocksByKey.get(key) ?? [])
    }
    if (currentItem.tool === "papers") {
      const key = getKey("paper", currentItem.itemId)
      if (!key) return false
      return hasDraftSettled(draftEntitiesByKey.get(key), draftBlocksByKey.get(key) ?? [])
    }
    if (currentItem.tool === "projects") {
      const taskKey = getKey("task", currentItem.taskId)
      if (taskKey) {
        const settledTask = hasDraftSettled(
          draftEntitiesByKey.get(taskKey),
          draftBlocksByKey.get(taskKey) ?? []
        )
        if (settledTask) {
          return true
        }
      }
      const projectKey = getKey("project", currentItem.itemId)
      if (!projectKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(projectKey), draftBlocksByKey.get(projectKey) ?? [])
    }
    if (currentItem.tool === "forum") {
      const discussionKey = getKey("forum-discussion", currentItem.discussionId)
      if (discussionKey) {
        const settledDiscussion = hasDraftSettled(
          draftEntitiesByKey.get(discussionKey),
          draftBlocksByKey.get(discussionKey) ?? []
        )
        if (settledDiscussion) {
          return true
        }
      }
      const channelKey = getKey("forum-channel", currentItem.itemId)
      if (!channelKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(channelKey), draftBlocksByKey.get(channelKey) ?? [])
    }
    if (currentItem.tool === "groups") {
      const groupKey = getKey("group-chat", currentItem.itemId)
      if (!groupKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(groupKey), draftBlocksByKey.get(groupKey) ?? [])
    }
    if (currentItem.tool === "contacts") {
      const dmKey = getKey("direct-message", currentItem.itemId)
      if (!dmKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(dmKey), draftBlocksByKey.get(dmKey) ?? [])
    }
    if (currentItem.tool === "files") {
      const fileKey = getKey("file", currentItem.itemId)
      if (!fileKey) return false
      return hasDraftSettled(draftEntitiesByKey.get(fileKey), draftBlocksByKey.get(fileKey) ?? [])
    }

    return false
  }, [activeWindow, draftEntities, draftBlocks])

  // Handle back navigation
  const handleBackPress = () => {
    navigateBack()
  }

  // Get current sidecar content from top of stack
  const currentSidecarContent = sidecarStack.length > 0 ? sidecarStack[sidecarStack.length - 1].content : null

  // Determine if any drawer is visible (for overlay)
  const showOverlay = isSidebarDrawerOpen || isSidecarDrawerOpen
  const overlayClosing = (isSidebarDrawerOpen && sidebarClosing) || (isSidecarDrawerOpen && sidecarClosing)
  const shouldBlockMainContent = isAuthenticating || isRegisteringWorkspace
  const mainMobileClassName = [
    styles.mainMobile,
    shouldBlockMainContent ? styles.mainMobileBlocked : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={styles.appMobile}>
      {/* Mobile Header */}
      <MobileHeader
        canGoBack={canGoBack}
        title={title}
        breadcrumbSegments={breadcrumbSegments}
        hasSidecarContent={hasSidecarContent}
        showSidecarWarning={showDraftWarning}
        onHamburgerPress={openSidebarDrawer}
        onBackPress={handleBackPress}
        onSidecarPress={openSidecarDrawer}
      />

      {/* Main content area */}
      <main className={mainMobileClassName} aria-busy={shouldBlockMainContent}>
        <div className={styles.contentWrapperMobile}>
          <div className={styles.contentMobile}>
            <div className={styles.contentInner}>
              <Outlet />
            </div>
            {/* Drop target overlay */}
            {isDragging && (
              <div className={styles.dropTargetOverlay}>
                <Plus size={48} className={styles.dropTargetIcon} />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Drawer overlay - shown when any drawer is open */}
      {showOverlay && (
        <div
          className={mobileDrawerStyles.drawerOverlay}
          data-closing={overlayClosing}
          onClick={closeAllDrawers}
          data-testid="drawer-overlay"
        />
      )}

      {/* Sidebar drawer - slides from left */}
      {isSidebarDrawerOpen && (
        <aside
          className={mobileDrawerStyles.sidebarDrawer}
          data-closing={sidebarClosing}
          data-testid="sidebar-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <Sidebar isDrawerMode onDrawerClose={closeSidebarDrawer} />
        </aside>
      )}

      {/* Sidecar drawer - slides from right */}
      {isSidecarDrawerOpen && hasSidecarContent && (
        <aside
          className={mobileDrawerStyles.sidecarDrawer}
          data-closing={sidecarClosing}
          data-testid="sidecar-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Details panel"
        >
          <div className={mobileDrawerStyles.drawerHeader}>
            {/* Sidecar breadcrumb navigation */}
            <div className={mobileDrawerStyles.sidecarDrawerBreadcrumb}>
              {sidecarStack.map((item, index) => {
                const isLeaf = index === sidecarStack.length - 1
                return (
                  <span key={item.id} className={mobileDrawerStyles.sidecarDrawerBreadcrumbItem}>
                    {index > 0 && (
                      <ChevronRight
                        size={12}
                        className={mobileDrawerStyles.sidecarDrawerBreadcrumbSeparator}
                      />
                    )}
                    <span
                      className={mobileDrawerStyles.sidecarDrawerBreadcrumbItemText}
                      data-active={isLeaf}
                      onClick={() => navigateToStackIndex(index)}
                    >
                      {item.title}
                    </span>
                  </span>
                )
              })}
            </div>
            <button
              className={mobileDrawerStyles.drawerCloseButton}
              onClick={closeSidecarDrawer}
              aria-label="Close details"
            >
              <X size={20} />
            </button>
          </div>
          <div className={mobileDrawerStyles.drawerContent}>
            <div className={sidecarStyles.sidecarContent}>{currentSidecarContent}</div>
          </div>
        </aside>
      )}
    </div>
  )
}
