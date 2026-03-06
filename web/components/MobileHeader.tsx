import { Menu, ChevronLeft, ChevronRight, PanelRight, AlertTriangle } from "lucide-react"
import * as styles from "../styles/mobile-header.css"

/**
 * MobileHeader implements an iOS 26-style navigation header for mobile devices.
 *
 * Layout:
 * [Hamburger][Back?]  Title (large, leaf node)     [Sidecar?]
 *                     Breadcrumb (small, full path)
 *
 * The header provides:
 * - Hamburger menu to open the navigation sidebar drawer
 * - Back button (when navigation history exists) to go back
 * - Large title showing the current page/item name
 * - Breadcrumb subtitle showing the full navigation path with chevron separators
 * - Sidecar button (when sidecar content is available)
 */

interface MobileHeaderProps {
  // Navigation state
  canGoBack: boolean
  title: string
  // Breadcrumb path segments (excluding the leaf/title)
  breadcrumbSegments: string[]

  // Sidecar state
  hasSidecarContent: boolean
  showSidecarWarning?: boolean

  // Callbacks
  onHamburgerPress: () => void
  onBackPress: () => void
  onSidecarPress: () => void
}

export function MobileHeader({
  canGoBack,
  title,
  breadcrumbSegments,
  hasSidecarContent,
  showSidecarWarning = false,
  onHamburgerPress,
  onBackPress,
  onSidecarPress,
}: MobileHeaderProps) {
  return (
    <header className={styles.mobileHeader} data-testid="mobile-header">
      {/* Left zone: Hamburger menu + optional Back button */}
      <div className={styles.mobileHeaderLeftZone}>
        <button
          className={styles.mobileHeaderHamburgerButton}
          onClick={onHamburgerPress}
          aria-label="Open navigation menu"
          data-testid="mobile-header-hamburger"
        >
          <Menu size={22} />
        </button>

        {canGoBack && (
          <button
            className={styles.mobileHeaderBackButton}
            onClick={onBackPress}
            aria-label="Go back"
            data-testid="mobile-header-back"
          >
            <ChevronLeft size={24} />
          </button>
        )}
      </div>

      {/* Center zone: Title + Breadcrumb path */}
      <div className={styles.mobileHeaderCenterZone}>
        <span className={styles.mobileHeaderTitle} data-testid="mobile-header-title">
          {title}
        </span>
        {breadcrumbSegments.length > 0 && (
          <span className={styles.mobileHeaderSubtitle} data-testid="mobile-header-breadcrumb">
            {breadcrumbSegments.map((segment, index) => (
              <span key={index} className={styles.mobileHeaderBreadcrumbSegment}>
                {index > 0 && <ChevronRight size={10} className={styles.mobileHeaderBreadcrumbSeparator} />}
                <span>{segment}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Right zone: Sidecar toggle button */}
      <div className={styles.mobileHeaderRightZone}>
        {hasSidecarContent && (
          <button
            className={styles.mobileHeaderSidecarButton}
            onClick={onSidecarPress}
            aria-label="Open details panel"
            data-testid="mobile-header-sidecar"
          >
            <PanelRight size={20} />
            {showSidecarWarning && (
              <span className={styles.mobileHeaderSidecarWarning}>
                <AlertTriangle size={10} />
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  )
}
