import React from "react"
import * as styles from "./Spinner.css"

interface SpinnerProps {
  label?: string
  size?: keyof typeof styles.spinner
  className?: string
  inline?: boolean
}

const Spinner: React.FC<SpinnerProps> = ({ label, size = "md", className, inline = true }) => {
  const ContainerTag = inline ? ("span" as const) : ("div" as const)
  return (
    <ContainerTag
      className={`${styles.container} ${className || ""}`.trim()}
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.spinner[size]} aria-hidden />
      {label ? <span className={styles.label}>{label}</span> : null}
    </ContainerTag>
  )
}

export default Spinner
