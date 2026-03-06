import { style, createVar } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Dynamic color variable for tags and other colored elements
export const dynamicColorVar = createVar()

export const withDynamicColor = style({
  vars: {
    [dynamicColorVar]: "#6b7280",
  },
})

export const dynamicBgColor = style({
  backgroundColor: dynamicColorVar,
})

export const dynamicBorderColor = style({
  borderColor: dynamicColorVar,
})

export const dynamicBgAndBorderColor = style([dynamicBgColor, dynamicBorderColor])

// Flex utilities
export const flexRow = style({
  display: "flex",
  alignItems: "center",
})

export const flexRowGap6 = style([
  flexRow,
  {
    gap: "6px",
  },
])

export const flexRowGap8 = style([
  flexRow,
  {
    gap: vars.space[2],
  },
])

export const flex1 = style({
  flex: 1,
})

// Empty state placeholder for when lists have no content
export const emptyState = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: `${vars.space[10]} ${vars.space[5]}`,
  color: vars.color.textTertiary,
  textAlign: "center",
  fontSize: vars.fontSize[14],
})
