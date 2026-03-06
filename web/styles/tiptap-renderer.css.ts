/**
 * Styles for the TipTapRenderer component.
 *
 * Provides styling for rendered rich content from TipTap editor:
 * - Text formatting (bold, italic, code, etc.)
 * - Headings
 * - Lists
 * - Blockquotes
 * - Images and figures
 * - Links
 */

import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Spin animation for loading spinner
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

// Main renderer container
// Uses inherit for color so it respects parent context (e.g., chat bubbles with inverted colors)
export const renderer = style({
  lineHeight: 1.7,
  fontSize: vars.fontSize[14],
  color: "inherit",
  wordBreak: "break-word",
})

// Compact mode for reply previews
export const rendererCompact = style({
  fontSize: vars.fontSize[13],
  lineHeight: 1.5,
})

// Paragraph
export const paragraph = style({
  margin: `${vars.space[2]} 0`,
  selectors: {
    "&:first-child": {
      marginTop: 0,
    },
    "&:last-child": {
      marginBottom: 0,
    },
  },
})

// Headings
export const h1 = style({
  fontSize: "1.75em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
  selectors: {
    "&:first-child": {
      marginTop: 0,
    },
  },
})

export const h2 = style({
  fontSize: "1.5em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
  selectors: {
    "&:first-child": {
      marginTop: 0,
    },
  },
})

export const h3 = style({
  fontSize: "1.25em",
  fontWeight: 600,
  marginTop: vars.space[3],
  marginBottom: vars.space[2],
  selectors: {
    "&:first-child": {
      marginTop: 0,
    },
  },
})

export const h4 = style({
  fontSize: "1.1em",
  fontWeight: 600,
  marginTop: vars.space[3],
  marginBottom: vars.space[2],
})

export const h5 = style({
  fontSize: "1em",
  fontWeight: 600,
  marginTop: vars.space[2],
  marginBottom: vars.space[1],
})

export const h6 = style({
  fontSize: "0.9em",
  fontWeight: 600,
  marginTop: vars.space[2],
  marginBottom: vars.space[1],
})

// Inline code
export const inlineCode = style({
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.sm,
  padding: `${vars.space[1]} ${vars.space[1]}`,
  fontFamily: "monospace",
  fontSize: "0.9em",
})

// Highlight (mark)
export const highlight = style({
  background: "rgba(255, 238, 0, 0.3)",
  borderRadius: vars.borderRadius.sm,
  padding: `0 ${vars.space[1]}`,
})

// Lists
export const ul = style({
  paddingLeft: vars.space[6],
  margin: `${vars.space[2]} 0`,
  listStyleType: "disc",
})

export const ol = style({
  paddingLeft: vars.space[6],
  margin: `${vars.space[2]} 0`,
  listStyleType: "decimal",
})

// Blockquote
export const blockquote = style({
  borderLeft: `3px solid ${vars.color.borderLight}`,
  paddingLeft: vars.space[4],
  marginLeft: 0,
  marginRight: 0,
  marginTop: vars.space[2],
  marginBottom: vars.space[2],
  color: vars.color.textSecondary,
})

// Code block (pre)
export const pre = style({
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.md,
  padding: vars.space[3],
  overflowX: "auto",
  fontFamily: "monospace",
  fontSize: vars.fontSize[13],
  margin: `${vars.space[2]} 0`,
})

// Horizontal rule
export const hr = style({
  border: "none",
  borderTop: `1px solid ${vars.color.borderLight}`,
  margin: `${vars.space[4]} 0`,
})

// Links
export const link = style({
  color: vars.color.unreadBlue,
  textDecoration: "underline",
  textDecorationColor: "transparent",
  transition: `text-decoration-color ${vars.transition.fast}`,
  ":hover": {
    textDecorationColor: "currentColor",
  },
})

// Image container
export const imageContainer = style({
  display: "inline-block",
  maxWidth: "100%",
  margin: `${vars.space[2]} 0`,
})

// Image
export const image = style({
  maxWidth: "100%",
  maxHeight: "400px",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  borderRadius: vars.borderRadius.md,
  display: "block",
})

// Image placeholder (loading/error)
export const imagePlaceholder = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space[2],
  padding: vars.space[4],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.md,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[13],
  minWidth: 200,
  minHeight: 100,
})

// Image loading spinner
export const imageSpinner = style({
  animation: `${spin} 1s linear infinite`,
  color: vars.color.unreadBlue,
})

// Image error icon
export const imageError = style({
  color: vars.color.deleteRed,
})

// Figure element (image with caption)
export const figure = style({
  margin: `${vars.space[2]} 0`,
  padding: 0,
})

// Figure caption
export const figcaption = style({
  textAlign: "center",
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  marginTop: vars.space[1],
})

// Video element
export const video = style({
  maxWidth: "100%",
  maxHeight: "500px",
  borderRadius: vars.borderRadius.md,
  display: "block",
  background: vars.color.bgSecondary,
  margin: `${vars.space[2]} 0`,
})

// Missing attachment placeholder
export const attachmentMissing = style({
  display: "inline-flex",
  alignItems: "center",
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  border: `1px dashed ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
})
