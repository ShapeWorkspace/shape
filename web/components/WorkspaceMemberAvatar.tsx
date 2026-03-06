import type { CSSProperties } from "react"
import * as styles from "../styles/avatar.css"
import { vars } from "../styles/theme.css"

// Same color palette as project tags for visual consistency across the app
const WORKSPACE_MEMBER_AVATAR_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#10b981", // green
  "#ef4444", // red
  "#ec4899", // pink
  "#6366f1", // indigo
]

function getDeterministicPaletteIndex(seed: string, paletteLength: number): number {
  // Deterministic hashing keeps avatar colors stable across reloads and clients.
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  if (paletteLength <= 0) {
    return 0
  }
  return hash % paletteLength
}

function deriveInitialsFromDisplayName(displayName: string): string {
  // Initials mirror the workspace profile name if no avatar image is set.
  const trimmed = displayName.trim()
  if (!trimmed) {
    return "?"
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase()
  }
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
}

export interface WorkspaceMemberAvatarProps {
  userId: string
  displayName: string
  avatarDataUrl?: string | null
  size?: number
  fontSize?: number
  className?: string
  testId?: string
}

export function WorkspaceMemberAvatar({
  userId,
  displayName,
  avatarDataUrl = null,
  size = 32,
  fontSize,
  className,
  testId,
}: WorkspaceMemberAvatarProps) {
  const safeSeed = userId.trim() || displayName.trim() || "unknown"
  const paletteIndex = getDeterministicPaletteIndex(safeSeed, WORKSPACE_MEMBER_AVATAR_COLORS.length)
  const backgroundColor = WORKSPACE_MEMBER_AVATAR_COLORS[paletteIndex] ?? vars.color.bgTertiary
  const initials = deriveInitialsFromDisplayName(displayName)
  const accessibleName = displayName.trim() || "Member"

  const inlineStyle: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor,
    // White text for good contrast against vibrant tag-style backgrounds
    color: "white",
  }

  if (fontSize) {
    inlineStyle.fontSize = `${fontSize}px`
  }

  const combinedClassName = className ? `${styles.avatar} ${className}` : styles.avatar

  return (
    <div
      className={combinedClassName}
      style={inlineStyle}
      title={accessibleName}
      aria-label={`${accessibleName} avatar`}
      data-testid={testId}
    >
      {avatarDataUrl ? (
        <img src={avatarDataUrl} alt={accessibleName} className={styles.avatarImage} />
      ) : (
        initials
      )}
    </div>
  )
}
