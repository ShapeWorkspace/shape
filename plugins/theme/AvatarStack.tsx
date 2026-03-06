import React from "react"
import { Avatar } from "./Avatar"
import * as styles from "./AvatarStack.css"

interface AvatarStackProps {
  avatars: Array<{ name: string; url?: string }>
  max?: number
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}

const SIZE_DIMENSIONS = {
  xs: { width: "20px", height: "20px", fontSize: "10px" },
  sm: { width: "24px", height: "24px", fontSize: "10px" },
  md: { width: "32px", height: "32px", fontSize: "13px" },
  lg: { width: "40px", height: "40px", fontSize: "14px" },
  xl: { width: "48px", height: "48px", fontSize: "16px" },
}

export const AvatarStack: React.FC<AvatarStackProps> = ({ avatars, max = 3, size = "md", className }) => {
  if (avatars.length === 0) {
    return null
  }

  const visibleAvatars = avatars.slice(0, max)
  const overflowCount = avatars.length - max
  const sizeDimensions = SIZE_DIMENSIONS[size]

  const classNames = [styles.stack, className].filter(Boolean).join(" ")

  return (
    <div className={classNames}>
      {visibleAvatars.map((avatar, index) => (
        <div key={index} className={styles.item} style={{ zIndex: avatars.length - index }}>
          <Avatar name={avatar.name} url={avatar.url} size={size} />
        </div>
      ))}
      {overflowCount > 0 && (
        <div
          className={styles.overflow}
          style={{
            width: sizeDimensions.width,
            height: sizeDimensions.height,
            fontSize: sizeDimensions.fontSize,
            marginLeft: "-8px",
          }}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  )
}

export default AvatarStack
