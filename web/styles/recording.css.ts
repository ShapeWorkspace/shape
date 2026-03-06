import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

const pulse = keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.4 },
  "100%": { opacity: 1 },
})

export const recordingContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[4],
  height: "100%",
})

export const recordingPreviewPanel = style({
  flex: 1,
  borderRadius: vars.borderRadius.lg,
  border: `1px solid ${vars.color.borderLight}`,
  background: vars.color.bgSecondary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  minHeight: "260px",
})

export const recordingVideoPreview = style({
  width: "100%",
  height: "100%",
  objectFit: "cover",
})

export const recordingAudioPlaceholder = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.space[2],
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
})

export const recordingSidecarStatus = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  color: vars.color.deleteRed,
  fontSize: vars.fontSize[12],
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const recordingIndicatorDot = style({
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: vars.color.deleteRed,
  animation: `${pulse} 1s ease-in-out infinite`,
})

export const recordingAudioIndicator = style({
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  background: vars.color.deleteRed,
  animation: `${pulse} 1s ease-in-out infinite`,
})
