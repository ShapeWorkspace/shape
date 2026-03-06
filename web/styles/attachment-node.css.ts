/**
 * Styles for the AttachmentNodeView component.
 *
 * Provides styling for file attachments in the TipTap editor:
 * - Uploading state with spinner
 * - Image preview for images
 * - File chip for other file types
 * - Error state for failed uploads
 */

import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Spin animation for the loading spinner
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

// Base wrapper for all attachment types
export const attachmentWrapper = style({
  display: "inline-flex",
  alignItems: "center",
  verticalAlign: "middle",
  margin: "0 2px",
  borderRadius: vars.borderRadius.md,
  transition: `all ${vars.transition.fast}`,
})

// Selected state outline
export const attachmentSelected = style({
  outline: `2px solid ${vars.color.unreadBlue}`,
  outlineOffset: "1px",
})

// Error state styling
export const attachmentError = style({
  background: vars.color.deleteRedHover,
})

// Chip container for non-image attachments
export const attachmentChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  maxWidth: "240px",
})

// Chip container for large files (stacked layout with label underneath)
export const attachmentChipLarge = style({
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: vars.space[1],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  maxWidth: "240px",
})

// Row inside large file chip (icon, name, size)
export const attachmentChipRow = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
})

// File icon container
export const attachmentIcon = style({
  display: "flex",
  alignItems: "center",
  color: vars.color.textSecondary,
  flexShrink: 0,
})

// File name text with ellipsis for long names
export const attachmentName = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: vars.fontWeight.medium,
})

// File size text
export const attachmentSize = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[11],
  flexShrink: 0,
})

// Uploading indicator text
export const attachmentUploading = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[11],
  flexShrink: 0,
})

// Spinner animation for uploading state
export const attachmentSpinner = style({
  animation: `${spin} 1s linear infinite`,
  color: vars.color.unreadBlue,
  flexShrink: 0,
})

// Error icon styling
export const attachmentErrorIcon = style({
  color: vars.color.deleteRed,
  flexShrink: 0,
})

// Error text
export const attachmentErrorText = style({
  color: vars.color.deleteRed,
  fontSize: vars.fontSize[11],
  flexShrink: 0,
})

// Image preview styling
export const attachmentImage = style({
  maxWidth: "100%",
  maxHeight: "400px",
  borderRadius: vars.borderRadius.md,
  objectFit: "contain",
  display: "block",
})

// Video player styling with native HTML5 controls
export const attachmentVideo = style({
  maxWidth: "100%",
  maxHeight: "500px",
  borderRadius: vars.borderRadius.md,
  display: "block",
  background: vars.color.bgSecondary,
})

// Label text for large files ("Large file. Show anyway")
export const attachmentLargeFileLabel = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textSecondary,
})

// "Show anyway" clickable button styled as underlined link
export const attachmentShowAnywayButton = style({
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontSize: vars.fontSize[11],
  color: vars.color.textSecondary,
  textDecoration: "underline",
  cursor: "pointer",
  ":hover": {
    color: vars.color.textPrimary,
  },
})

// Download to disk button
export const attachmentDownloadButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[1],
  background: "transparent",
  border: "none",
  borderRadius: vars.borderRadius.sm,
  color: vars.color.textSecondary,
  cursor: "pointer",
  flexShrink: 0,
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgTertiary,
    color: vars.color.textPrimary,
  },
})
