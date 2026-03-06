import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

export const fileViewer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const fileHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  paddingBottom: vars.space[3],
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

export const fileIcon = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "48px",
  height: "48px",
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  color: vars.color.textSecondary,
})

export const fileInfo = style({
  flex: 1,
})

export const fileContent = style({
  flex: 1,
  padding: vars.space[3],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[14],
  lineHeight: 1.6,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space[2],
})

export const loadingSpinner = style({
  animation: `${spin} 1s linear infinite`,
})

/**
 * Upload row with progress bar overlay
 */
export const uploadRow = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  // Extra bottom padding for the progress bar
  padding: `${vars.space[2]} ${vars.space[3]} ${vars.space[3]}`,
  borderRadius: vars.borderRadius.base,
  margin: "1px 0",
  overflow: "hidden",
  // Disabled appearance
  opacity: 0.7,
  cursor: "default",
})

// Thin progress bar strip at the bottom of the row
export const uploadProgressBar = style({
  position: "absolute",
  bottom: 2,
  left: vars.space[3],
  right: vars.space[3],
  height: 2,
  borderRadius: 1,
  background: vars.color.bgTertiary,
  overflow: "hidden",
})

// The filled portion of the progress bar
export const uploadProgressFill = style({
  height: "100%",
  background: vars.color.unreadBlue,
  borderRadius: 1,
  transition: "width 150ms ease-out",
})

export const uploadRowIcon = style({
  color: vars.color.textSecondary,
  flexShrink: 0,
})

export const uploadRowTitle = style({
  flex: 1,
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const uploadRowMeta = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  flexShrink: 0,
})
