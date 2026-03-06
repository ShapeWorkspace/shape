import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Smooth fade-in animation for tooltips
 */
const tooltipFadeIn = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
})

/**
 * Tooltip container that appears above all other content.
 * Positioned absolutely using inline styles calculated from the trigger element.
 */
export const tooltip = style({
  position: "fixed",
  zIndex: vars.zIndices.xxxl,
  backgroundColor: vars.colors.text.norm,
  color: vars.colors.text.invert,
  padding: `${vars.spacing.xs} ${vars.spacing.sm}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSizes.xs,
  fontWeight: "500",
  maxWidth: "240px",
  wordWrap: "break-word",
  pointerEvents: "auto",
  boxShadow: vars.shadows.norm,
  animation: `${tooltipFadeIn} 0.1s ease-out`,
  selectors: {
    "&[data-multiline='true']": {
      whiteSpace: "pre-line",
    },
  },
})
