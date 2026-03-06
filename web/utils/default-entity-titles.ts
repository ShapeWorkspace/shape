/**
 * Default Entity Titles
 *
 * Centralized utilities for generating default titles when creating new entities.
 * This ensures consistency between the command palette and individual tools.
 */

/**
 * Formats a date for use in default entity titles.
 * Format: "Dec 22, 12:22 PM"
 */
function formatDateForTitle(date: Date = new Date()): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Formats a date for recording titles.
 * Format: "Jan 13, 2026 3:40 PM"
 */
function formatDateForRecordingTitle(date: Date = new Date()): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Generates a default title for a new paper.
 * Format: "Untitled Paper Dec 22, 12:22 PM"
 */
export function getDefaultPaperTitle(): string {
  return `Untitled Paper ${formatDateForTitle()}`
}

/**
 * Generates a default name for a new folder.
 * Note: The FilesTool has smart sequential naming (Untitled Folder 2, etc.)
 * but from the command palette we use the simple default.
 */
export function getDefaultFolderName(): string {
  return "Untitled Folder"
}

/**
 * Generates a default name for a new project.
 * Format: "Untitled Project Dec 22, 12:22 PM"
 */
export function getDefaultProjectName(): string {
  return `Untitled Project ${formatDateForTitle()}`
}

/**
 * Generates a default name for a new group chat.
 * Format: "New Group Dec 22, 12:22 PM"
 */
export function getDefaultGroupChatName(): string {
  return `New Group ${formatDateForTitle()}`
}

/**
 * Generates a default name for a new forum channel.
 * Format: "New Channel Dec 22, 12:22 PM"
 */
export function getDefaultForumChannelName(): string {
  return `New Channel ${formatDateForTitle()}`
}

/**
 * Generates a default name for a new video recording.
 * Format: "New video recording Jan 13, 2026 3:40 PM"
 */
export function getDefaultVideoRecordingName(date: Date = new Date()): string {
  return `New video recording ${formatDateForRecordingTitle(date)}`
}

/**
 * Generates a default name for a new audio recording.
 * Format: "New audio recording Jan 13, 2026 3:40 PM"
 */
export function getDefaultAudioRecordingName(date: Date = new Date()): string {
  return `New audio recording ${formatDateForRecordingTitle(date)}`
}
