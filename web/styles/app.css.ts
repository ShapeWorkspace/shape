import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const app = style({
  display: "flex",
  flexDirection: "row",
  height: "100%",
  width: "100%",
  background: vars.color.bgSecondary,
  overflow: "hidden",
})

export const main = style({
  flex: 1,
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[10],
  overflow: "hidden",
})

export const mainContentArea = style({
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: vars.space[6],
  height: "100%",
})

// Disable interactions in the main content area during auth/workspace registration.
export const mainContentAreaBlocked = style({
  pointerEvents: "none",
  userSelect: "none",
})

const fadeIn = keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
})

export const toolWindow = style({
  width: "100%",
  // Use flex: 1 instead of height: 100% to properly fill the parent flex container.
  // This allows the element to shrink when content is smaller and grow when larger.
  flex: 1,
  // minHeight: 0 allows this element to shrink when inside a flex container,
  // enabling proper height constraint propagation to children.
  minHeight: 0,
  // Make this a flex container so children can use flex properties to fill it.
  display: "flex",
  flexDirection: "column",
  animation: `${fadeIn} 120ms ease`,
})

export const contentWrapper = style({
  display: "flex",
  flexDirection: "column",
  width: "600px",
  // Max height allows content to size naturally but caps at parent height
  maxHeight: "100%",
  // Min height 0 allows flex children to shrink below content size
  minHeight: 0,
})

export const contentWrapperWithSidecar = style([
  contentWrapper,
  {
    width: "600px",
  },
])

export const content = style({
  position: "relative",
  flex: 1,
  // minHeight: 0 allows flex item to shrink below content size
  minHeight: 0,
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.xl,
  boxShadow: `0 0 0 1px ${vars.color.borderColor}, 0 2px 8px rgba(0,0,0,0.04)`,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
})

export const contentInner = style({
  flex: 1,
  // minHeight: 0 is critical for nested flex containers to properly constrain height.
  // Without it, the flex item won't shrink below its content size.
  minHeight: 0,
  overflow: "auto",
  padding: vars.space[4],
  // Make this a flex container so children can use flex: 1 to fill available space.
  // This is needed for toolWindow to properly constrain its height.
  display: "flex",
  flexDirection: "column",
})

// Drop target overlay - shown when dragging files over the PUI
export const dropTargetOverlay = style({
  position: "absolute",
  inset: 4,
  borderRadius: vars.borderRadius.lg,
  border: `2px dashed ${vars.color.textPrimary}`,
  background: "rgba(255, 255, 255, 0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
  pointerEvents: "none",
})

export const dropTargetIcon = style({
  color: vars.color.textPrimary,
})

export const emptyState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: `${vars.space[10]} ${vars.space[5]}`,
  color: vars.color.textTertiary,
  textAlign: "center",
})

export const emptyStateText = style({
  fontSize: vars.fontSize[14],
})

export const sectionHeader = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  padding: `${vars.space[3]} 0 6px`,
})

// ============================================================
// Full Layout Mode styles
// In full mode, the main content area stretches edge-to-edge
// with the navigation sidebar and sidecar.
// ============================================================

export const mainFull = style({
  flex: 1,
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  justifyContent: "flex-start",
  padding: 0,
  overflow: "hidden",
})

export const mainContentAreaFull = style({
  display: "flex",
  flexDirection: "row",
  alignItems: "stretch",
  gap: 0,
  height: "100%",
  flex: 1,
})

export const contentWrapperFull = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  height: "100%",
})

export const contentFull = style({
  position: "relative",
  flex: 1,
  minHeight: 0,
  background: vars.color.bgPrimary,
  borderRadius: 0,
  boxShadow: "none",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
})

// ============================================================
// Layout Mode Toggle
// Positioned at the bottom right of the content container
// ============================================================

export const layoutModeToggleContainer = style({
  display: "flex",
  justifyContent: "flex-end",
  padding: `${vars.space[2]} 0`,
})

export const layoutModeToggle = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

export const layoutModeButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  padding: vars.space[1],
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textSecondary,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

// ============================================================
// Mobile Layout Mode styles
// Single-column layout for mobile devices with full-width content
// ============================================================

// Mobile app container - vertical layout for header + content stacking
export const appMobile = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  background: vars.color.bgSecondary,
  overflow: "hidden",
})

export const mainMobile = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  padding: 0,
  // On mobile, take the full width
  width: "100%",
})

// Disable interactions in the mobile content area during auth/workspace registration.
export const mainMobileBlocked = style({
  pointerEvents: "none",
  userSelect: "none",
})

export const contentWrapperMobile = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
})

export const contentMobile = style({
  position: "relative",
  flex: 1,
  minHeight: 0,
  background: vars.color.bgPrimary,
  // No border radius on mobile - edge to edge
  borderRadius: 0,
  boxShadow: "none",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
})
