import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
})

const zoomIn = keyframes({
  from: { transform: "scale(0.95)", opacity: 0 },
  to: { transform: "scale(1)", opacity: 1 },
})

const zoomOut = keyframes({
  from: { transform: "scale(1)", opacity: 1 },
  to: { transform: "scale(0.95)", opacity: 0 },
})

export const modalOverlay = style({
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.5)",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  left: 0,
  opacity: 1, // Set final state to prevent flashing
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: vars.zIndices.xxl,
})

export const modalOverlayOpening = style({
  animation: `${fadeIn} 150ms ease-out`,
  animationFillMode: "forwards",
})

export const modalOverlayClosing = style({
  animation: `${fadeOut} 150ms ease-out`,
  animationFillMode: "forwards",
})

export const modalContainer = style({
  display: "flex",
  flexDirection: "column",
  boxShadow: vars.shadows.lifted,
  background: vars.colors.background.norm,
  borderRadius: vars.borderRadius.lg,
  maxHeight: "90vh",
  opacity: 1, // Set final state to prevent flashing
  transform: "scale(1)", // Set final state to prevent flashing
  width: "90%",
  zIndex: vars.zIndices.xxxl,
  overflow: "hidden",
  selectors: {
    ".dark &": {
      boxShadow: "none",
      border: `1px solid ${vars.colors.background.subtle}`,
    },
  },
})

export const modalContainerOpening = style({
  animation: `${zoomIn} 150ms ease-out`,
  animationFillMode: "forwards",
})

export const modalContainerClosing = style({
  animation: `${zoomOut} 150ms ease-out`,
  animationFillMode: "forwards",
})

export const small = style({
  maxWidth: "380px",
})

export const medium = style({
  maxWidth: "420px",
})

export const large = style({
  maxWidth: "600px",
})

export const xlarge = style({
  maxWidth: "900px",
})

export const xxlarge = style({
  maxWidth: "1100px",
})

// Fluid modal variant that expands relative to the viewport so large previews can dominate the screen.
export const fluid = style({
  maxWidth: "80vw",
})

export const modalHeader = style({
  alignItems: "flex-start",
  display: "flex",
  justifyContent: "space-between",
  padding: `${vars.spacing.lg} ${vars.spacing.xxl}`,
})

// When there is no subtitle, center the title row and the close button vertically
export const modalHeaderCentered = style({
  alignItems: "center",
})

export const modalTitleContainer = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "6px",
  flex: "1 0 0",
})

export const modalTitleRow = style({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: vars.spacing.sm,
})

export const modalTitleIcon = style({
  color: vars.colors.text.weak,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
})

export const modalTitle = style({
  fontSize: vars.fontSizes.xxl,
  fontWeight: vars.fontWeights.bold,
  color: vars.colors.text.norm,
  fontStyle: "normal",
  lineHeight: "38px",
  letterSpacing: "-0.2px",
})

export const modalSubtitle = style({
  color: vars.colors.text.weak,
  fontSize: vars.fontSizes.md,
})

export const closeButton = style({
  alignItems: "center",
  background: "transparent",
  border: "none",
  borderRadius: vars.borderRadius.sm,
  color: vars.colors.text.weak,
  cursor: "pointer",
  display: "flex",
  height: "32px",
  justifyContent: "center",
  padding: 0,
  transition: "all 0.2s ease",
  width: "32px",
  ":hover": {
    background: vars.colors.background.subtle,
    color: vars.colors.text.norm,
  },
})

export const headerDivider = style({
  borderTop: `1px solid ${vars.colors.border.subtle}`,
})

export const modalContent = style({
  padding: `${vars.spacing.sm} ${vars.spacing.xxl} ${vars.spacing.md} ${vars.spacing.xxl}`,
  gap: "10px",
  flex: 1,
  color: vars.colors.text.norm,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  // Keep horizontal overflow clipped while letting long bodies scroll vertically.
  overflowX: "hidden",
  overflowY: "auto",
})

export const modalFooter = style({
  display: "flex",
  padding: "16px 32px 32px 32px",
  alignItems: "center",
  gap: "16px",
  alignSelf: "stretch",
  borderBottomLeftRadius: vars.borderRadius.lg,
  borderBottomRightRadius: vars.borderRadius.lg,
  background: vars.colors.background.norm,
  justifyContent: "space-between",
})
