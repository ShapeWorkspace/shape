/**
 * Styles for the generic TipTapEditor component.
 *
 * These styles provide a clean, minimal editor appearance that can be
 * customized via className props for specific use cases.
 */

import { style, globalStyle, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Main editor shell container
export const editorShell = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "transparent",
})

// Focused state for the editor shell
export const editorFocused = style({
  // Can be extended with focus indicators if needed
})

// Disabled state for the editor shell
export const editorDisabled = style({
  opacity: 0.6,
  pointerEvents: "none",
})

// Hidden test/programmatic attachment input used when file attachments are enabled.
export const editorAttachmentInput = style({
  display: "none",
})

// Outer wrapper for editor content area - provides positioning context for send button overlay
// The send button is positioned relative to this wrapper, outside the scrolling area
export const editorContentOuterWrapper = style({
  flex: 1,
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
})

// Wrapper around the EditorContent component - handles scrolling
// No hardcoded minHeight - let parent control sizing for compact vs full editors
export const editorContentWrapper = style({
  flex: 1,
  overflow: "auto",
  minHeight: 0,
})

// Styles applied to the ProseMirror editor content area
// No hardcoded minHeight - let parent control sizing for compact vs full editors
export const editorContent = style({
  outline: "none",
  lineHeight: 1.7,
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  padding: vars.space[3],
})

// List styles for bullet and ordered lists inside the editor
globalStyle(`${editorContent} ul, ${editorContent} ol`, {
  paddingLeft: vars.space[6],
  margin: `${vars.space[2]} 0`,
})

globalStyle(`${editorContent} ul`, {
  listStyleType: "disc",
})

globalStyle(`${editorContent} ol`, {
  listStyleType: "decimal",
})

globalStyle(`${editorContent} li`, {
  marginBottom: vars.space[1],
})

globalStyle(`${editorContent} li p`, {
  margin: 0,
})

// Nested list styling
globalStyle(`${editorContent} ul ul, ${editorContent} ol ul`, {
  listStyleType: "circle",
})

globalStyle(
  `${editorContent} ul ul ul, ${editorContent} ol ol ul, ${editorContent} ol ul ul, ${editorContent} ul ol ul`,
  {
    listStyleType: "square",
  }
)

// Blockquote styling
globalStyle(`${editorContent} blockquote`, {
  borderLeft: `3px solid ${vars.color.borderLight}`,
  paddingLeft: vars.space[4],
  marginLeft: 0,
  marginRight: 0,
  color: vars.color.textSecondary,
})

// Code block styling
globalStyle(`${editorContent} pre`, {
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.md,
  padding: vars.space[3],
  overflowX: "auto",
  fontFamily: "monospace",
  fontSize: vars.fontSize[13],
})

globalStyle(`${editorContent} code`, {
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.sm,
  padding: `${vars.space[1]} ${vars.space[1]}`,
  fontFamily: "monospace",
  fontSize: "0.9em",
})

globalStyle(`${editorContent} pre code`, {
  background: "none",
  padding: 0,
})

// Bubble menu styling should follow the app theme (avoid bright cards in dark mode).
globalStyle(".tiptap-bubble-menu", {
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.borderColor}`,
})

// Heading styles
globalStyle(`${editorContent} h1`, {
  fontSize: "1.75em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
})

globalStyle(`${editorContent} h2`, {
  fontSize: "1.5em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
})

globalStyle(`${editorContent} h3`, {
  fontSize: "1.25em",
  fontWeight: 600,
  marginTop: vars.space[3],
  marginBottom: vars.space[2],
})

// Horizontal rule
globalStyle(`${editorContent} hr`, {
  border: "none",
  borderTop: `1px solid ${vars.color.borderLight}`,
  margin: `${vars.space[4]} 0`,
})

// Link styling - uses theme accent color instead of browser default blue
globalStyle(`${editorContent} a`, {
  color: vars.color.unreadBlue,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  cursor: "pointer",
})

globalStyle(`${editorContent} a:hover`, {
  textDecoration: "none",
})

// Placeholder styling for empty editor (class applied by Placeholder extension)
export const editorEmpty = style({
  selectors: {
    "&::before": {
      content: "attr(data-placeholder)",
      color: vars.color.textSecondary,
      float: "left",
      height: 0,
      pointerEvents: "none",
    },
  },
})

// Toolbar container (horizontal bar with formatting buttons)
export const editorToolbar = style({
  display: "flex",
  gap: "2px",
  padding: vars.space[2],
  paddingLeft: vars.space[4],
  paddingRight: vars.space[4],
  background: vars.color.bgSecondary,
  flexWrap: "nowrap",
  borderBottom: `1px solid ${vars.color.borderLight}`,
  flexShrink: 0,
})

// Individual toolbar button
export const editorToolbarButton = style({
  padding: `6px ${vars.space[2]}`,
  background: "none",
  border: "none",
  borderRadius: vars.borderRadius.md,
  cursor: "pointer",
  color: vars.color.textSecondary,
  transition: `all ${vars.transition.fast}`,
  display: "flex",
  alignItems: "center",
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.textPrimary,
  },
  ":disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
})

// Active state for toolbar buttons when format is applied
export const editorToolbarButtonActive = style({
  background: vars.color.bgHover,
  color: vars.color.unreadBlue,
})

// Visual separator between toolbar button groups
export const editorToolbarDivider = style({
  width: "1px",
  height: "20px",
  background: vars.color.borderLight,
  margin: `0 ${vars.space[1]}`,
  alignSelf: "center",
})

// Spin animation for upload spinner
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

// Upload indicator container at bottom of editor
export const uploadIndicator = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
  padding: vars.space[2],
  paddingLeft: vars.space[4],
  paddingRight: vars.space[4],
  background: vars.color.bgSecondary,
  borderTop: `1px solid ${vars.color.borderLight}`,
})

// Individual upload item row
export const uploadItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
})

// Upload spinner animation
export const uploadSpinner = style({
  animation: `${spin} 1s linear infinite`,
  color: vars.color.unreadBlue,
  flexShrink: 0,
})

// Upload file name
export const uploadFileName = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.textPrimary,
  fontWeight: vars.fontWeight.medium,
})

// Upload status text
export const uploadStatus = style({
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[12],
  flexShrink: 0,
})

// ============================================================
// Inline Send Button (overlaid inside editor at bottom-right)
// ============================================================

// Container for the send button overlay positioned at bottom-right
// bottom: 6px centers the 32px button in a 44px min-height editor
export const inlineSendButtonContainer = style({
  position: "absolute",
  bottom: "6px",
  right: vars.space[2],
  zIndex: 10,
})

// The send button itself
export const inlineSendButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  padding: 0,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.textPrimary,
  color: vars.color.bgPrimary,
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    opacity: 0.9,
  },
  ":disabled": {
    opacity: 0.4,
    cursor: "not-allowed",
  },
})

// Spinner for pending state
export const inlineSendSpinner = style({
  animation: `${spin} 1s linear infinite`,
})

// ============================================================
// Compact Editor Content (for chat/comment composers with inline send)
// ============================================================

// ProseMirror content style for compact editors with inline send button
// Includes padding-right to leave room for the send button
export const compactEditorContent = style({
  outline: "none",
  lineHeight: 1.5,
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  padding: vars.space[3],
  paddingRight: "48px",
})
