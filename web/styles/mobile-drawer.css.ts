import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Mobile drawer styles with iOS-like slide animations.
 *
 * Animation timing uses a spring-like cubic-bezier curve that approximates
 * iOS UIKit's spring animation for a native feel.
 */

// ============================================================
// Animation Keyframes
// ============================================================

// Sidebar slides in from left
const slideInFromLeft = keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(0)" },
})

const slideOutToLeft = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-100%)" },
})

// Sidecar slides in from right
const slideInFromRight = keyframes({
  from: { transform: "translateX(100%)" },
  to: { transform: "translateX(0)" },
})

const slideOutToRight = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(100%)" },
})

// Overlay fade
const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
})

// ============================================================
// Animation Constants
// ============================================================

// Duration matches DRAWER_ANIMATION_DURATION_MS in MobileDrawerContext.tsx
const DRAWER_DURATION = "280ms"

// iOS spring approximation - feels bouncy but controlled
const DRAWER_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

const OVERLAY_DURATION = "200ms"

// ============================================================
// Overlay
// ============================================================

export const drawerOverlay = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  zIndex: 998,
  animation: `${fadeIn} ${OVERLAY_DURATION} ease forwards`,
  // Prevent scroll on body when overlay is visible
  touchAction: "none",
  selectors: {
    '&[data-closing="true"]': {
      animation: `${fadeOut} ${OVERLAY_DURATION} ease forwards`,
    },
  },
})

// ============================================================
// Sidebar Drawer (slides from left)
// ============================================================

export const sidebarDrawer = style({
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: "280px",
  maxWidth: "85vw",
  background: vars.color.bgSecondary,
  zIndex: 999,
  display: "flex",
  flexDirection: "column",
  // iOS safe area handling for notch and home indicator
  paddingTop: "env(safe-area-inset-top)",
  paddingBottom: "env(safe-area-inset-bottom)",
  paddingLeft: "env(safe-area-inset-left)",
  // Subtle shadow for depth
  boxShadow: "4px 0 24px rgba(0, 0, 0, 0.15)",
  // GPU acceleration for smooth animation
  willChange: "transform",
  backfaceVisibility: "hidden",
  animation: `${slideInFromLeft} ${DRAWER_DURATION} ${DRAWER_EASING} forwards`,
  selectors: {
    '&[data-closing="true"]': {
      animation: `${slideOutToLeft} ${DRAWER_DURATION} ${DRAWER_EASING} forwards`,
    },
  },
})

// ============================================================
// Sidecar Drawer (slides from right)
// ============================================================

export const sidecarDrawer = style({
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "320px",
  maxWidth: "90vw",
  background: vars.color.bgPrimary,
  zIndex: 999,
  display: "flex",
  flexDirection: "column",
  // iOS safe area handling
  paddingTop: "env(safe-area-inset-top)",
  paddingBottom: "env(safe-area-inset-bottom)",
  paddingRight: "env(safe-area-inset-right)",
  // Subtle shadow for depth
  boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.15)",
  // GPU acceleration for smooth animation
  willChange: "transform",
  backfaceVisibility: "hidden",
  animation: `${slideInFromRight} ${DRAWER_DURATION} ${DRAWER_EASING} forwards`,
  selectors: {
    '&[data-closing="true"]': {
      animation: `${slideOutToRight} ${DRAWER_DURATION} ${DRAWER_EASING} forwards`,
    },
  },
})

// ============================================================
// Drawer Header
// ============================================================

export const drawerHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${vars.space[2]} ${vars.space[4]}`,
  borderBottom: `1px solid ${vars.color.borderColor}`,
  flexShrink: 0,
  minHeight: "42px",
})

export const drawerHeaderTitle = style({
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
})

export const drawerCloseButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // Touch target minimum 44x44
  width: "44px",
  height: "44px",
  // Visual size smaller
  marginRight: "-10px",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  borderRadius: vars.borderRadius.md,
  touchAction: "manipulation",
  transition: `all ${vars.transition.fast}`,
  ":active": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
})

// ============================================================
// Drawer Content
// ============================================================

export const drawerContent = style({
  flex: 1,
  overflow: "auto",
  // Enable momentum scrolling on iOS
  WebkitOverflowScrolling: "touch",
})

// ============================================================
// Sidecar Drawer Breadcrumb (navigation within sidecar)
// ============================================================

export const sidecarDrawerBreadcrumb = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  fontSize: vars.fontSize[13],
  flexShrink: 0,
  overflow: "hidden",
})

export const sidecarDrawerBreadcrumbItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  minWidth: 0,
  flexShrink: 1,
})

export const sidecarDrawerBreadcrumbItemText = style({
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `color ${vars.transition.fast}`,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  ":active": {
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

export const sidecarDrawerBreadcrumbSeparator = style({
  color: vars.color.borderColor,
  flexShrink: 0,
})
