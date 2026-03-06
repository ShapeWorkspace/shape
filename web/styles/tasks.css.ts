import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Animation for strikethrough effect that reveals from left to right
const strikethroughReveal = keyframes({
  "0%": { width: "0%" },
  "100%": { width: "100%" },
})

export const tasksContainer = style({
  display: "flex",
  flexDirection: "column",
})

export const taskItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[2]}`,
  margin: `0 -${vars.space[2]}`,
  borderRadius: vars.borderRadius.base,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

export const taskCheckbox = style({
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: vars.color.textPrimary,
})

export const taskTitle = style({
  flex: 1,
  fontSize: vars.fontSize[14],
})

export const taskTitleCompleted = style({
  textDecoration: "line-through",
  color: vars.color.textTertiary,
})

// Animated strikethrough that reveals from left to right during celebration
// Uses confetti colors: Gold, Coral, Teal, Sky blue, Plum
export const taskTitleCelebrating = style({
  position: "relative",
  // Override flex: 1 from taskTitle so width is based on text content
  flex: "none",
  "::after": {
    content: '""',
    position: "absolute",
    left: 0,
    top: "50%",
    height: "2px",
    borderRadius: "1px",
    background: "linear-gradient(90deg, #FFD700, #FF6B6B, #4ECDC4, #45B7D1, #DDA0DD)",
    animation: `${strikethroughReveal} 500ms ease-out forwards`,
  },
})

export const taskTags = style({
  display: "flex",
  gap: vars.space[1],
})

export const taskTag = style({
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "white",
  // Background color set via --tag-bg CSS custom property
  backgroundColor: "var(--tag-bg)",
})

export const taskAssignee = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  marginLeft: "auto",
})

// Due date display in task list - normal state
export const taskDueDate = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

// Due date display when task is overdue (past due date and not completed)
export const taskDueDateOverdue = style({
  fontSize: vars.fontSize[12],
  color: vars.color.deleteRed,
  fontWeight: vars.fontWeight.medium,
})

export const projectTagsFilter = style({
  display: "flex",
  gap: "6px",
  marginBottom: vars.space[4],
  flexWrap: "wrap",
  outline: "none",
})

export const projectTagBtn = style({
  padding: `4px 10px`,
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
    // Active state for tag buttons with a color
    '&[data-active="true"]': {
      background: `var(--tag-color, ${vars.color.bgTertiary})`,
      borderColor: `var(--tag-color, ${vars.color.textTertiary})`,
      color: `var(--tag-text-color, ${vars.color.textPrimary})`,
    },
    // Selected state for keyboard navigation
    '&[data-selected="true"]': {
      outline: `2px solid ${vars.color.textTertiary}`,
      outlineOffset: "1px",
    },
  },
})

export const taskCheckButton = style({
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  display: "flex",
  position: "relative",
})

export const projectViewHeader = style({
  fontSize: vars.fontSize[18],
  fontWeight: vars.fontWeight.medium,
  marginBottom: vars.space[4],
})

export const taskInputContainer = style({
  display: "flex",
  gap: vars.space[2],
  marginBottom: vars.space[6],
})

export const taskInput = style({
  flex: 1,
})

export const sectionHeaderWithMargin = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginTop: vars.space[2],
})

// Check icon states
export const checkIconPending = style({
  color: "#ccc",
})

export const checkIconCompleted = style({
  color: "#999",
})

export const checkIconCelebrating = style({
  color: "#4ECDC4",
})

// Draft badge for projects in list view
export const projectDraftBadge = style({
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

// Draft badge for tasks in task list
export const taskDraftBadge = style({
  marginLeft: "auto",
  padding: "2px 6px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: vars.color.bgSecondary,
  color: vars.color.textTertiary,
})

// Status label for in-progress tasks in task list (styled like assignee)
export const taskStatusLabel = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

// Comment count indicator in task list
export const taskCommentCount = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})
