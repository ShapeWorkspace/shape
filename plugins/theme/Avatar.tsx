import React from "react"
import * as styles from "./Avatar.css"

interface AvatarProps {
  name: string
  url?: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}

const COLOR_PALETTE = [
  { name: "slate", hue: 220 },
  { name: "violet", hue: 270 },
  { name: "berry", hue: 320 },
  { name: "rose", hue: 350 },
  { name: "coral", hue: 15 },
  { name: "amber", hue: 45 },
  { name: "sand", hue: 60 },
  { name: "sage", hue: 150 },
  { name: "teal", hue: 180 },
  { name: "ocean", hue: 210 },
]

const getAvatarColor = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return `oklch(75% 0.08 220)`
  }
  const firstChar = trimmed.charAt(0).toLowerCase()
  const charCode = firstChar.charCodeAt(0)
  const index = charCode % COLOR_PALETTE.length
  const color = COLOR_PALETTE[index]!
  return `oklch(75% 0.08 ${color.hue})`
}

const getInitial = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  return trimmed.charAt(0).toUpperCase()
}

export const Avatar: React.FC<AvatarProps> = ({ name, url, size = "md", className }) => {
  const sizeClass = styles.size[size]
  const backgroundColor = getAvatarColor(name)
  const initial = getInitial(name)

  const classNames = [styles.avatar, sizeClass, className].filter(Boolean).join(" ")

  if (url) {
    return (
      <div className={classNames}>
        <img src={url} alt={name} className={styles.image} />
      </div>
    )
  }

  return (
    <div className={classNames} style={{ backgroundColor, color: "oklch(16% 0.08 0)" }}>
      {initial}
    </div>
  )
}

export default Avatar
