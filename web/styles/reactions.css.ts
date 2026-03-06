import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

export const reactionBar = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space[2],
  marginTop: vars.space[2],
})

export const reactionPills = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space[2],
})

export const reactionPill = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: "2px 8px",
  borderRadius: vars.borderRadius.lg,
  border: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  fontSize: vars.fontSize[12],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  selectors: {
    "&:hover": {
      background: vars.color.bgHover,
    },
    '&[data-active="true"]': {
      borderColor: vars.color.textTertiary,
      background: vars.color.bgActive,
    },
  },
})

export const reactionEmoji = style({
  fontSize: vars.fontSize[14],
})

export const reactionCount = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textSecondary,
})

export const reactionAddButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space[1],
  padding: "2px 8px",
  borderRadius: vars.borderRadius.lg,
  border: `1px dashed ${vars.color.borderColor}`,
  background: vars.color.bgSecondary,
  color: vars.color.textSecondary,
  fontSize: vars.fontSize[12],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  selectors: {
    "&:hover": {
      background: vars.color.bgHover,
      color: vars.color.textPrimary,
    },
  },
})

export const reactionPickerPopover = style({
  padding: 0,
  borderRadius: vars.borderRadius.lg,
  overflow: "hidden",
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
})

export const reactionPickerOverlay = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  zIndex: 1200,
})

export const reactionPickerModal = style({
  width: "100%",
  maxWidth: "520px",
  background: vars.color.bgPrimary,
  display: "flex",
  flexDirection: "column",
  borderRadius: vars.borderRadius.xl,
  margin: vars.space[3],
  overflow: "hidden",
})

export const reactionPickerHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${vars.space[3]} ${vars.space[4]}`,
  borderBottom: `1px solid ${vars.color.borderLight}`,
  fontSize: vars.fontSize[14],
  fontWeight: vars.fontWeight.medium,
})

export const reactionPickerCloseButton = style({
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: vars.color.textSecondary,
  padding: 0,
  selectors: {
    "&:hover": {
      color: vars.color.textPrimary,
    },
  },
})

export const reactionPickerBody = style({
  padding: vars.space[2],
})

export const reactionQuickPicks = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space[2],
  paddingBottom: vars.space[2],
  borderBottom: `1px solid ${vars.color.borderLight}`,
  marginBottom: vars.space[2],
})

export const reactionQuickPickButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: vars.borderRadius.md,
  border: `1px solid ${vars.color.borderColor}`,
  background: vars.color.bgSecondary,
  padding: "4px 8px",
  fontSize: vars.fontSize[14],
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  selectors: {
    "&:hover": {
      background: vars.color.bgHover,
    },
  },
})
