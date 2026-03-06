import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Base mobile layout styles.
 *
 * Mobile layout uses a single-column design with:
 * - Full-width content area
 * - No fixed width constraints
 * - Safe area handling for iOS devices
 */

// ============================================================
// Mobile Container
// ============================================================

export const mobileContainer = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  overflow: "hidden",
  background: vars.color.bgPrimary,
})

// ============================================================
// Mobile Content Area
// ============================================================

export const mobileContentArea = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
  // Safe area handling for iOS home indicator
  paddingBottom: "env(safe-area-inset-bottom)",
})

// ============================================================
// Mobile Content Wrapper
// ============================================================

export const mobileContentWrapper = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
})

// ============================================================
// Mobile Content
// ============================================================

export const mobileContent = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  // Enable momentum scrolling on iOS
  WebkitOverflowScrolling: "touch",
  padding: vars.space[4],
  display: "flex",
  flexDirection: "column",
})

// ============================================================
// Mobile Content Inner (matches desktop contentInner)
// ============================================================

export const mobileContentInner = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
})
