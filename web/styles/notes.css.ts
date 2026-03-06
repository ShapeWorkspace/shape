import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Full-height container for the note editor with floating save indicator
export const noteEditor = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
})

// Title input styled to appear inside the editor content area
export const noteTitle = style({
  fontSize: vars.fontSize[18],
  fontWeight: vars.fontWeight.medium,
  border: "none",
  background: "none",
  outline: "none",
  width: "100%",
  color: vars.color.textPrimary,
  padding: `${vars.space[4]} ${vars.space[3]} ${vars.space[2]}`,
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

export const noteContent = style({
  width: "100%",
  minHeight: "300px",
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: vars.fontSize[14],
  lineHeight: 1.7,
  resize: "none",
  outline: "none",
  fontFamily: "inherit",
  color: vars.color.textPrimary,
  "::placeholder": {
    color: vars.color.textTertiary,
  },
})

export const noteTags = style({
  display: "flex",
  gap: vars.space[1],
  flexWrap: "wrap",
})

export const noteDraftBadge = style({
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

export const noteTag = style({
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "white",
})

export const noteTagsFilter = style({
  display: "flex",
  gap: "6px",
  marginBottom: vars.space[3],
  flexWrap: "wrap",
})

export const noteTagBtn = style({
  padding: `4px ${vars.space[2]}`,
  borderRadius: "12px",
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  border: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgPrimary,
  color: vars.color.textSecondary,
  ":hover": {
    background: vars.color.bgSecondary,
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]': {
      background: "var(--dynamicColorVar__1cz19ak0, var(--color-textPrimary__1cz19ak0))",
      borderColor: "var(--dynamicColorVar__1cz19ak0, var(--color-textPrimary__1cz19ak0))",
      color: "white",
    },
  },
})

// Scroll container holding title and editor content
export const noteEditorScrollArea = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "auto",
})

export const noteDeleteBtn = style({
  padding: vars.space[2],
  borderRadius: vars.borderRadius.sm,
  border: "none",
  background: "transparent",
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
    color: vars.color.deleteRed,
  },
})

// Frameless TipTap editor wrapper - edge to edge
export const noteEditorContent = style({
  flex: 1,
  overflow: "hidden",
})
