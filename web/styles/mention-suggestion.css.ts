import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Floating container for mention autocomplete.
export const mentionSuggestionPopover = style({
  position: "fixed",
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.12)",
  zIndex: 200,
  padding: vars.space[1],
  minWidth: "220px",
  maxWidth: "320px",
})

// Scrollable suggestion list.
export const mentionSuggestionList = style({
  maxHeight: "200px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
})

// Individual suggestion row.
export const mentionSuggestionItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  borderRadius: vars.borderRadius.md,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  color: vars.color.textPrimary,
})

export const mentionSuggestionItemActive = style({
  background: vars.color.bgActive,
})

export const mentionSuggestionText = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
})

export const mentionSuggestionName = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const mentionSuggestionEmail = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const mentionSuggestionEmpty = style({
  padding: `${vars.space[2]} ${vars.space[3]}`,
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
})
