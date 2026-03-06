import { style, keyframes } from "@vanilla-extract/css"
import { vars } from "./theme.css"

// Spin animation for loading spinners
const spin = keyframes({
  "0%": { transform: "rotate(0deg)" },
  "100%": { transform: "rotate(360deg)" },
})

export const sidecarWrapper = style({
  display: "flex",
  flexDirection: "column",
  width: "280px",
  minWidth: "280px",
  maxHeight: "100%",
})

export const sidecar = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.xl,
  boxShadow: `0 0 0 1px ${vars.color.borderColor}, 0 2px 8px rgba(0,0,0,0.04)`,
  overflow: "hidden",
  outline: "none",
  selectors: {
    '&[data-focused="true"]': {
      boxShadow: `0 0 0 1px ${vars.color.borderColor}, 0 0 0 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)`,
    },
  },
})

// ============================================================
// Full Layout Mode styles for sidecar
// Edge-to-edge sidecar that attaches to the right screen edge
// ============================================================

export const sidecarWrapperFull = style({
  display: "flex",
  flexDirection: "column",
  width: "280px",
  minWidth: "280px",
  height: "100%",
  borderLeft: `1px solid ${vars.color.borderColor}`,
})

export const sidecarFull = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: vars.color.bgPrimary,
  borderRadius: 0,
  boxShadow: "none",
  overflow: "hidden",
  outline: "none",
  selectors: {
    '&[data-focused="true"]': {
      // Subtle highlight in full mode
      background: vars.color.bgPrimary,
    },
  },
})

export const sidecarBreadcrumbFull = style({
  padding: `0 ${vars.space[4]}`,
  height: "41px",
  fontSize: vars.fontSize[13],
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  flexShrink: 0,
  overflow: "hidden",
  borderBottom: `1px solid ${vars.color.borderColor}`,
})

export const sidecarContent = style({
  flex: 1,
  overflowY: "auto",
  padding: `${vars.space[3]} ${vars.space[3]} ${vars.space[3]}`,
})

export const sidecarContentFull = style({
  flex: 1,
  overflowY: "auto",
  padding: `${vars.space[3]} ${vars.space[3]} ${vars.space[3]}`,
})

export const sidecarBreadcrumb = style({
  height: "41px",
  fontSize: vars.fontSize[13],
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  marginBottom: vars.space[2],
  flexShrink: 0,
  overflow: "hidden",
})

export const sidecarBreadcrumbItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  minWidth: 0,
  flexShrink: 1,
  maxWidth: "100px",
  // Last item (deepest node) gets priority and more space, but still truncates
  selectors: {
    "&:last-child": {
      flexShrink: 0,
      maxWidth: "200px",
    },
  },
})

export const sidecarBreadcrumbItemText = style({
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `color ${vars.transition.fast}`,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  ":hover": {
    color: vars.color.textPrimary,
  },
  selectors: {
    '&[data-active="true"]': {
      color: vars.color.textSecondary,
    },
    // When the sidecar is focused, the active (leaf) item should be bright white
    '&[data-active="true"][data-focused="true"]': {
      color: vars.color.textPrimary,
    },
  },
})

export const sidecarBreadcrumbSeparator = style({
  color: vars.color.borderColor,
})

export const sidecarSection = style({
  marginBottom: vars.space[4],
  ":last-child": {
    marginBottom: 0,
  },
})

export const sidecarSectionHeader = style({
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: vars.space[2],
})

export const sidecarMetaList = style({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
})

export const sidecarMetaItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  fontSize: vars.fontSize[13],
  color: vars.color.textTertiary,
  borderRadius: vars.borderRadius.md,
  transition: `background ${vars.transition.fast}`,
  selectors: {
    '&[data-clickable="true"]:hover': {
      background: vars.color.bgSecondary,
    },
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

export const sidecarMetaItemIcon = style({
  flexShrink: 0,
})

export const sidecarMetaLabel = style({
  color: vars.color.textSecondary,
})

export const sidecarMetaValue = style({
  marginLeft: "auto",
  color: vars.color.textPrimary,
})

export const sidecarMetaTags = style({
  flexWrap: "wrap",
})

export const sidecarTagsList = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space[1],
  marginLeft: "auto",
})

export const sidecarTag = style({
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  color: "white",
})

export const sidecarMenu = style({
  display: "flex",
  flexDirection: "column",
  gap: "1px",
})

export const sidecarMenuItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[2]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}, opacity ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[14],
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
    '&[data-disabled="true"]': {
      opacity: 0.5,
    },
    '&[data-destructive="true"]': {
      color: vars.color.deleteRed,
    },
    '&[data-destructive="true"]:hover': {
      background: vars.color.deleteRedHover,
    },
    '&[data-destructive="true"][data-selected="true"]': {
      background: vars.color.deleteRedActive,
    },
    '&[data-sub-row="true"]': {
      paddingLeft: vars.space[4],
      fontSize: vars.fontSize[13],
    },
  },
})

export const sidecarSubRowBranch = style({
  width: vars.space[3],
  height: vars.space[3],
  flexShrink: 0,
  borderLeft: `1px solid ${vars.color.textTertiary}`,
  borderBottom: `1px solid ${vars.color.textTertiary}`,
  borderBottomLeftRadius: vars.borderRadius.sm,
  transform: "translateY(-1px)",
})

export const sidecarMenuIcon = style({
  color: vars.color.textTertiary,
  display: "flex",
  alignItems: "center",
  selectors: {
    // Inherit red color from parent when destructive
    '[data-destructive="true"] &': {
      color: "inherit",
    },
  },
})

export const draftWarning = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  color: vars.color.deleteRed,
})

export const draftDiffList = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
  marginTop: vars.space[2],
  marginBottom: vars.space[2],
})

export const draftDiffRow = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
  padding: vars.space[2],
  borderRadius: vars.borderRadius.md,
  background: vars.color.bgSecondary,
})

export const draftDiffLabel = style({
  fontSize: vars.fontSize[12],
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: vars.color.textTertiary,
})

export const draftDiffValues = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
})

export const draftDiffValue = style({
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

export const draftDiffValueLabel = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
})

export const sidecarMenuLabelContainer = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
})

export const sidecarMenuLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const sidecarMenuSublabel = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const sidecarMenuMeta = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

export const sidecarMenuBadge = style({
  background: vars.color.textPrimary,
  color: "white",
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  padding: "2px 6px",
  borderRadius: "10px",
})

export const sidecarMenuArrow = style({
  color: vars.color.textTertiary,
})

export const sidecarEmpty = style({
  padding: vars.space[5],
  textAlign: "center",
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[13],
})

export const sidecarDescription = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  lineHeight: 1.5,
  padding: vars.space[2],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
})

export const sidecarContentPreview = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  lineHeight: 1.5,
  padding: vars.space[3],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
})

export const sidecarCommentInput = style({
  marginBottom: vars.space[2],
})

export const sidecarCommentInputField = style({
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  outline: "none",
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const sidecarCommentList = style({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginTop: vars.space[2],
})

export const sidecarCommentItem = style({
  padding: vars.space[2],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgTertiary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgActive,
    },
    '&[data-resolved="true"]': {
      opacity: 0.6,
    },
  },
})

export const sidecarCommentHeader = style({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: vars.fontSize[12],
  marginBottom: vars.space[1],
})

export const sidecarCommentAuthor = style({
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textPrimary,
})

export const sidecarCommentTime = style({
  color: vars.color.textTertiary,
  marginLeft: "auto",
})

export const sidecarCommentResolved = style({
  color: vars.color.resolvedGreen,
})

export const sidecarCommentContent = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  lineHeight: 1.4,
})

export const sidecarCommentDetailContent = style({
  fontSize: vars.fontSize[14],
  lineHeight: 1.5,
  color: vars.color.textPrimary,
  padding: vars.space[3],
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
  marginBottom: vars.space[2],
})

export const sidecarCommentDetailTime = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

export const sidecarBadge = style({
  fontSize: vars.fontSize[10],
  fontWeight: vars.fontWeight.medium,
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: vars.borderRadius.md,
  background: vars.color.resolvedGreen,
  color: "white",
  marginLeft: "auto",
})

export const sidecarCurrentTags = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
})

export const sidecarCurrentTag = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
})

export const sidecarTagRemove = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px",
  borderRadius: "50%",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgHover,
    color: vars.color.deleteRed,
  },
})

export const sidecarTagInput = style({
  marginBottom: vars.space[2],
})

export const sidecarTagInputField = style({
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  outline: "none",
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const sidecarTagColor = style({
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  flexShrink: 0,
})

export const sidecarInfo = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarComments = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarAddToList = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarCommentDetail = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarCommentDetailHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  marginBottom: vars.space[2],
})

export const sidecarTaskInfo = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarNoteTags = style({
  display: "flex",
  flexDirection: "column",
})

export const sidecarInputContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

// Wrapper for TipTapEditor in sidecar forms
export const sidecarEditorWrapper = style({
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  overflow: "hidden",
  minHeight: "120px",
  maxHeight: "300px",
})

export const sidecarInput = style({
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  outline: "none",
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
})

export const sidecarInputActions = style({
  display: "flex",
  gap: vars.space[2],
  justifyContent: "flex-end",
})

export const sidecarCancelButton = style({
  padding: `${vars.space[1]} ${vars.space[3]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  background: "none",
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  color: vars.color.textSecondary,
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarConfirmButton = style({
  padding: `${vars.space[1]} ${vars.space[3]}`,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.textPrimary,
  // Use bgPrimary for text so it inverts correctly in dark mode
  color: vars.color.bgPrimary,
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    opacity: 0.9,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

// Delete confirmation modal styles
export const sidecarConfirmOverlay = style({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
})

export const sidecarConfirmDialog = style({
  background: vars.color.bgPrimary,
  borderRadius: vars.borderRadius.lg,
  padding: vars.space[4],
  maxWidth: "280px",
  boxShadow: `0 4px 16px rgba(0, 0, 0, 0.2)`,
})

export const sidecarConfirmText = style({
  margin: 0,
  marginBottom: vars.space[4],
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  lineHeight: 1.5,
})

export const sidecarConfirmButtons = style({
  display: "flex",
  gap: vars.space[2],
  justifyContent: "flex-end",
})

export const sidecarDeleteButton = style({
  padding: `${vars.space[1]} ${vars.space[3]}`,
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: vars.color.deleteRed,
  color: "white",
  fontSize: vars.fontSize[13],
  cursor: "pointer",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    opacity: 0.9,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

// ============================================================
// Confirmation Sidecar Styles
// ============================================================

export const sidecarConfirmationContent = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  padding: `${vars.space[2]} 0`,
})

export const sidecarConfirmationIcon = style({
  color: vars.color.textTertiary,
  marginBottom: vars.space[3],
})

export const sidecarConfirmationMessage = style({
  margin: 0,
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  lineHeight: 1.5,
})

// ============================================================
// Form Sidecar Styles
// ============================================================

export const sidecarFormDescription = style({
  margin: 0,
  marginBottom: vars.space[3],
  fontSize: vars.fontSize[13],
  color: vars.color.textSecondary,
  lineHeight: 1.5,
})

export const sidecarFormFields = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const sidecarFormField = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
})

export const sidecarAdvancedSection = style({
  marginTop: vars.space[3],
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const sidecarAdvancedToggle = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  transition: `color ${vars.transition.fast}`,
  ":hover": {
    color: vars.color.textSecondary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarAdvancedChevron = style({
  display: "flex",
  alignItems: "center",
  transition: `transform ${vars.transition.fast}`,
  selectors: {
    '&[data-expanded="true"]': {
      transform: "rotate(90deg)",
    },
  },
})

export const sidecarAdvancedContent = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const sidecarAdvancedHint = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
})

export const sidecarFormLabel = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
})

export const sidecarFormError = style({
  fontSize: vars.fontSize[11],
  color: vars.color.deleteRed,
  marginTop: vars.space[1],
})

export const sidecarInputError = style({
  borderColor: vars.color.deleteRed,
  ":focus": {
    borderColor: vars.color.deleteRed,
  },
})

export const sidecarTextarea = style({
  width: "100%",
  minHeight: "80px",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  outline: "none",
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  resize: "vertical",
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarSelect = style({
  width: "100%",
  padding: `${vars.space[2]} ${vars.space[2]}`,
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  fontSize: vars.fontSize[13],
  outline: "none",
  fontFamily: "inherit",
  background: vars.color.bgPrimary,
  color: vars.color.textPrimary,
  cursor: "pointer",
  appearance: "none",
  // Add dropdown arrow via background image
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  paddingRight: vars.space[6],
  ":focus": {
    borderColor: vars.color.textTertiary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarCheckboxLabel = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  cursor: "pointer",
  padding: `${vars.space[1]} 0`,
})

export const sidecarCheckbox = style({
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: vars.color.textPrimary,
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarCheckboxText = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
})

export const sidecarRadioGroup = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
})

export const sidecarRadioLabel = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  cursor: "pointer",
  padding: `${vars.space[1]} 0`,
})

export const sidecarRadio = style({
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: vars.color.textPrimary,
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const sidecarRadioText = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
})

// ============================================================
// Loading and Empty State Styles
// ============================================================

export const sidecarLoadingContainer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[4],
})

export const sidecarSpinner = style({
  animation: `${spin} 1s linear infinite`,
  color: vars.color.textTertiary,
})

export const sidecarEmptyState = style({
  padding: vars.space[4],
  textAlign: "center",
  color: vars.color.textTertiary,
  fontSize: vars.fontSize[13],
})

// ============================================================
// Member Selection Field Styles (used in create forms)
// ============================================================

export const memberSelectionField = style({
  marginTop: vars.space[3],
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})

export const memberSelectionSection = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[2],
})

export const memberSelectionLabel = style({
  fontSize: vars.fontSize[12],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textSecondary,
})

export const memberSelectionList = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
})

export const memberSelectionItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: vars.color.bgSecondary,
  borderRadius: vars.borderRadius.base,
})

export const memberSelectionItemIcon = style({
  display: "flex",
  alignItems: "center",
  color: vars.color.textTertiary,
  flexShrink: 0,
})

export const memberSelectionItemInfo = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "1px",
  textAlign: "left",
})

export const memberSelectionItemName = style({
  fontSize: vars.fontSize[13],
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

export const memberSelectionItemMeta = style({
  fontSize: vars.fontSize[11],
  color: vars.color.textTertiary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

// Native select styled like TaskSidecar
export const memberSelectionRoleSelect = style({
  background: "transparent",
  color: "inherit",
  border: "none",
  outline: "none",
  font: "inherit",
  cursor: "pointer",
  fontSize: vars.fontSize[12],
  padding: "2px 4px",
  flexShrink: 0,
  selectors: {
    "&:disabled": {
      cursor: "not-allowed",
    },
  },
})

export const memberSelectionRemoveButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: vars.space[1],
  border: "none",
  borderRadius: vars.borderRadius.base,
  background: "none",
  cursor: "pointer",
  color: vars.color.textTertiary,
  transition: `all ${vars.transition.fast}`,
  flexShrink: 0,
  ":hover": {
    background: vars.color.bgTertiary,
    color: vars.color.deleteRed,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

export const memberSelectionEmpty = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
  padding: `${vars.space[1]} 0`,
})

// Available member/team row - clickable to add
export const memberSelectionAvailableItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[1]} ${vars.space[2]}`,
  background: "none",
  border: `1px solid ${vars.color.borderColor}`,
  borderRadius: vars.borderRadius.base,
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
  transition: `all ${vars.transition.fast}`,
  ":hover": {
    background: vars.color.bgSecondary,
    borderColor: vars.color.textTertiary,
  },
  ":disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
})

// ============================================================
// Task Comments Section Styles
// ============================================================

export const sidecarCommentsContainer = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[3],
})
