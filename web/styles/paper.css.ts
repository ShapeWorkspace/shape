import { style, keyframes, globalStyle } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const paperEditor = style({
  display: "flex",
  flexDirection: "column",
  // Use flex: 1 instead of height: 100% to properly fill the parent container.
  // height: 100% doesn't account for parent padding in flex layouts, causing
  // the element to overflow and trigger the parent's overflow: auto.
  flex: 1,
  // minHeight: 0 is critical for nested flex containers to properly constrain height.
  // Without it, the flex item won't shrink below its content size, causing the
  // parent's overflow:auto to take over scrolling instead of our paperScrollContent.
  minHeight: 0,
})

// Toolbar stays fixed at top, doesn't scroll with content.
// Negative margins extend toolbar to container edges (counteracts contentInner padding).
export const paperToolbar = style({
  display: "flex",
  gap: "2px",
  padding: vars.space[2],
  paddingLeft: vars.space[4],
  paddingRight: vars.space[4],
  // Negative margins to extend toolbar flush with container edges
  marginLeft: `calc(-1 * ${vars.space[4]})`,
  marginRight: `calc(-1 * ${vars.space[4]})`,
  marginTop: `calc(-1 * ${vars.space[4]})`,
  background: vars.color.bgSecondary,
  flexWrap: "nowrap",
  flexShrink: 0,
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

// Scrollable content area below the toolbar (contains title, status, and editor)
export const paperScrollContent = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: vars.space[4],
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const paperToolbarButton = style({
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
export const paperToolbarButtonActive = style({
  background: vars.color.bgHover,
  color: vars.color.unreadBlue,
})

// Visual separator between toolbar button groups
export const paperToolbarDivider = style({
  width: "1px",
  height: "20px",
  background: vars.color.borderLight,
  margin: `0 ${vars.space[1]}`,
  alignSelf: "center",
})

export const paperContent = style({
  flex: 1,
  minHeight: "300px",
  padding: 0,
  background: "transparent",
  outline: "none",
  lineHeight: 1.7,
  fontSize: vars.fontSize[14],
  overflow: "auto",
})

// Wrapper for the TipTapEditor component within paper context
export const paperEditorWrapper = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
})

// Title input above the editor
export const paperTitle = style({
  fontSize: "24px",
  fontWeight: 600,
  color: vars.color.textPrimary,
  background: "transparent",
  border: "none",
  outline: "none",
  padding: 0,
  width: "100%",
  "::placeholder": {
    color: vars.color.textSecondary,
  },
})

// Loading spinner animation
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

export const paperLoadingIcon = style({
  animation: `${spin} 1s linear infinite`,
})

// Loading state
export const paperLoading = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space[2],
  padding: vars.space[6],
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[14],
})

// Error state
export const paperError = style({
  padding: vars.space[4],
  color: vars.color.deleteRed,
  fontSize: vars.fontSize[14],
})

// TipTap editor content styling
export const paperEditorContent = style({
  outline: "none",
  minHeight: "200px",
  lineHeight: 1.7,
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
})

// List styles for bullet and ordered lists inside the paper editor
globalStyle(`${paperEditorContent} ul, ${paperEditorContent} ol`, {
  paddingLeft: vars.space[6],
  margin: `${vars.space[2]} 0`,
})

globalStyle(`${paperEditorContent} ul`, {
  listStyleType: "disc",
})

globalStyle(`${paperEditorContent} ol`, {
  listStyleType: "decimal",
})

globalStyle(`${paperEditorContent} li`, {
  marginBottom: vars.space[1],
})

globalStyle(`${paperEditorContent} li p`, {
  margin: 0,
})

// Nested list styling
globalStyle(`${paperEditorContent} ul ul, ${paperEditorContent} ol ul`, {
  listStyleType: "circle",
})

globalStyle(
  `${paperEditorContent} ul ul ul, ${paperEditorContent} ol ol ul, ${paperEditorContent} ol ul ul, ${paperEditorContent} ul ol ul`,
  {
    listStyleType: "square",
  }
)

// Blockquote styling
globalStyle(`${paperEditorContent} blockquote`, {
  borderLeft: `3px solid ${vars.color.borderLight}`,
  paddingLeft: vars.space[4],
  marginLeft: 0,
  marginRight: 0,
  color: vars.color.textSecondary,
})

// Code block styling
globalStyle(`${paperEditorContent} pre`, {
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.md,
  padding: vars.space[3],
  overflowX: "auto",
  fontFamily: "monospace",
  fontSize: vars.fontSize[13],
})

globalStyle(`${paperEditorContent} code`, {
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.sm,
  padding: `${vars.space[1]} ${vars.space[1]}`,
  fontFamily: "monospace",
  fontSize: "0.9em",
})

globalStyle(`${paperEditorContent} pre code`, {
  background: "none",
  padding: 0,
})

// ============================================================
// Paper comment highlight styling
// ============================================================

globalStyle(".paper-comment-highlight", {
  background: "rgba(255, 230, 128, 0.22)",
  borderRadius: vars.borderRadius.sm,
  transition: `background ${vars.transition.fast}`,
  "@media": {
    "(prefers-color-scheme: dark)": {
      background: "rgba(163, 146, 63, 0.28)",
    },
  },
})

globalStyle(".paper-comment-highlight[data-paper-comment-resolved=\"true\"]", {
  background: "transparent",
  pointerEvents: "none",
})

globalStyle(".paper-comment-active", {
  background: "rgba(255, 214, 64, 0.42)",
  borderRadius: vars.borderRadius.sm,
  "@media": {
    "(prefers-color-scheme: dark)": {
      background: "rgba(191, 170, 72, 0.5)",
    },
  },
})

// Heading styles
globalStyle(`${paperEditorContent} h1`, {
  fontSize: "1.75em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
})

globalStyle(`${paperEditorContent} h2`, {
  fontSize: "1.5em",
  fontWeight: 600,
  marginTop: vars.space[4],
  marginBottom: vars.space[2],
})

globalStyle(`${paperEditorContent} h3`, {
  fontSize: "1.25em",
  fontWeight: 600,
  marginTop: vars.space[3],
  marginBottom: vars.space[2],
})

// Horizontal rule
globalStyle(`${paperEditorContent} hr`, {
  border: "none",
  borderTop: `1px solid ${vars.color.borderLight}`,
  margin: `${vars.space[4]} 0`,
})

// Link styling - uses theme accent color instead of browser default blue
globalStyle(`${paperEditorContent} a`, {
  color: vars.color.unreadBlue,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  cursor: "pointer",
})

globalStyle(`${paperEditorContent} a:hover`, {
  textDecoration: "none",
})

// Placeholder styling for empty editor
export const paperEditorEmpty = style({
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

// Draft badge for papers in list view
export const paperDraftBadge = style({
  marginLeft: vars.space[2],
  padding: "2px 6px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: vars.color.bgSecondary,
  color: vars.color.textTertiary,
})
