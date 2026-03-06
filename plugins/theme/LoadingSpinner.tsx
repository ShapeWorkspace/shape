import React from "react"
import * as styles from "./LoadingSpinner.css"

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large"
  label?: string
  className?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = "medium", label, className }) => {
  return (
    <div className={`${styles.container} ${className || ""}`}>
      <div className={`${styles.spinner} ${styles.spinnerSize[size]}`} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  )
}

export default LoadingSpinner
