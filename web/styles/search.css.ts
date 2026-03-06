/**
 * Search Component Styles
 *
 * Styles for search chips, search results, and other search UI elements.
 */

import { style } from "@vanilla-extract/css"
import { vars } from "./theme.css"

/**
 * Container for search chips, displayed before the search input.
 */
export const searchChipsContainer = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[1],
  flexWrap: "wrap",
})

/**
 * Individual search chip (context filter).
 */
export const searchChip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space[1],
  padding: `2px ${vars.space[2]}`,
  backgroundColor: vars.color.bgTertiary,
  borderRadius: vars.borderRadius.md,
  fontSize: vars.fontSize[12],
  color: vars.color.textSecondary,
  whiteSpace: "nowrap",
})

/**
 * Chip remove button (X).
 */
export const searchChipRemove = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "14px",
  height: "14px",
  borderRadius: "50%",
  backgroundColor: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
  color: vars.color.textTertiary,
  transition: `background ${vars.transition.fast}, color ${vars.transition.fast}`,
  ":hover": {
    backgroundColor: vars.color.bgActive,
    color: vars.color.textPrimary,
  },
})

/**
 * Search results list container.
 */
export const searchResultsList = style({
  display: "flex",
  flexDirection: "column",
})

/**
 * Section header in search results (for grouping by type).
 */
export const searchResultsSectionHeader = style({
  display: "flex",
  alignItems: "center",
  padding: `${vars.space[2]} ${vars.space[3]}`,
  fontSize: vars.fontSize[11],
  fontWeight: vars.fontWeight.medium,
  color: vars.color.textTertiary,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: `1px solid ${vars.color.borderLight}`,
})

/**
 * Individual search result item.
 */
export const searchResultItem = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  cursor: "pointer",
  transition: `background ${vars.transition.fast}`,
  borderRadius: vars.borderRadius.base,
  margin: "1px 0",
  ":hover": {
    background: vars.color.bgSecondary,
  },
  selectors: {
    '&[data-selected="true"]': {
      background: vars.color.bgTertiary,
    },
  },
})

/**
 * Search result icon.
 */
export const searchResultIcon = style({
  color: vars.color.textTertiary,
  flexShrink: 0,
})

/**
 * Search result title/primary text.
 */
export const searchResultTitle = style({
  flex: 1,
  fontSize: vars.fontSize[14],
  color: vars.color.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

/**
 * Search result meta/secondary text.
 */
export const searchResultMeta = style({
  fontSize: vars.fontSize[12],
  color: vars.color.textTertiary,
})

/**
 * Search indexing indicator.
 */
export const searchIndexingIndicator = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  fontSize: vars.fontSize[13],
  color: vars.color.textTertiary,
})

/**
 * Enhanced search container with chips support.
 */
export const searchWithChips = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  padding: `${vars.space[2]} ${vars.space[3]}`,
  marginBottom: vars.space[1],
  flexWrap: "wrap",
})
