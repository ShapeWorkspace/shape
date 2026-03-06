import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Mobile header styles implementing iOS 26-style navigation header.
 *
 * Layout:
 * [Hamburger][Back?]  Title (large)           [Sidecar?]
 *                     Breadcrumb (small)
 *
 * Height: 56px (iOS standard navigation bar height)
 * Touch targets: 44x44px minimum for all interactive elements
 */

// ============================================================
// Header Container
// ============================================================

export const mobileHeader = style({
  display: "flex",
  alignItems: "center",
  height: "56px",
  paddingLeft: vars.space[1],
  paddingRight: vars.space[1],
  borderBottom: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgPrimary,
  flexShrink: 0,
})

// ============================================================
// Left Zone (Hamburger + Back button)
// ============================================================

export const mobileHeaderLeftZone = style({
  display: "flex",
  alignItems: "center",
  // Ensure consistent width for alignment
  minWidth: "44px",
  flexShrink: 0,
})

// ============================================================
// Center Zone (Title + Breadcrumb)
// ============================================================

export const mobileHeaderCenterZone = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  paddingLeft: vars.space[2],
  paddingRight: vars.space[2],
  overflow: "hidden",
  minWidth: 0,
})

export const mobileHeaderTitle = style({
  fontSize: "17px",
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
  lineHeight: 1.2,
})

export const mobileHeaderSubtitle = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
  lineHeight: 1.3,
  marginTop: "1px",
  display: "flex",
  alignItems: "center",
})

// Individual segment within the breadcrumb subtitle
export const mobileHeaderBreadcrumbSegment = style({
  display: "inline-flex",
  alignItems: "center",
})

// Chevron separator between breadcrumb segments
export const mobileHeaderBreadcrumbSeparator = style({
  marginLeft: "2px",
  marginRight: "2px",
  flexShrink: 0,
})

// ============================================================
// Right Zone (Sidecar button)
// ============================================================

export const mobileHeaderRightZone = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  // Ensure consistent width for alignment
  minWidth: "44px",
  flexShrink: 0,
})

// ============================================================
// Buttons
// ============================================================

// Base button style - 44x44 touch target
export const mobileHeaderButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // Touch target minimum
  width: "44px",
  height: "44px",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textSecondary,
  transition: `color ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.md,
  touchAction: "manipulation",
  // Remove tap highlight on mobile
  WebkitTapHighlightColor: "transparent",
  ":active": {
    color: vars.color.textPrimary,
    background: vars.color.bgHover,
  },
})

// Hamburger menu button (always visible)
export const mobileHeaderHamburgerButton = style([
  mobileHeaderButton,
  {
    // No additional styles needed
  },
])

// Back button (iOS-style chevron left)
export const mobileHeaderBackButton = style([
  mobileHeaderButton,
  {
    // Slightly overlap with hamburger for compact feel
    marginLeft: "-8px",
    color: vars.color.textPrimary,
  },
])

// Sidecar toggle button
export const mobileHeaderSidecarButton = style([
  mobileHeaderButton,
  {
    position: "relative",
  },
])

// Warning badge on sidecar button (for unsaved drafts)
export const mobileHeaderSidecarWarning = style({
  position: "absolute",
  top: "8px",
  right: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "14px",
  height: "14px",
  borderRadius: "7px",
  background: vars.color.bgPrimary,
  color: vars.color.deleteRed,
  boxShadow: `0 0 0 1px ${vars.color.borderColor}`,
})

// Unread indicator dot on hamburger button
export const mobileHeaderUnreadDot = style({
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "8px",
  height: "8px",
  background: vars.color.unreadBlue,
  borderRadius: "50%",
})

// Wrapper for button with indicator
export const mobileHeaderButtonWrapper = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
})
