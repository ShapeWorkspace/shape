import React from "react"
import { Check } from "lucide-react"
import * as styles from "./Switch.css"

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  disabled?: boolean
  children?: React.ReactNode
  testId?: string
  labelClassName?: string
}

const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  children,
  testId,
  labelClassName = "",
}) => {
  const handleToggle = () => {
    if (disabled) return
    onChange(!checked)
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    const childrenEl = e.currentTarget.querySelector(`.${styles.switchChildren}`) as HTMLElement | null
    if (childrenEl && childrenEl.contains(e.target as Node)) return
    handleToggle()
  }

  const labelClassNames = [styles.switchLabel, labelClassName].filter(Boolean).join(" ")

  return (
    <div
      className={styles.switchRoot}
      data-testid={testId}
      data-disabled={disabled}
      onClick={handleContainerClick}
    >
      <div className={styles.switchContainer}>
        <button
          type="button"
          className={styles.switchTrack}
          data-checked={checked}
          onClick={handleToggle}
          disabled={disabled}
          aria-checked={checked}
          role="switch"
        >
          <div className={styles.switchThumb} data-checked={checked}>
            {checked && <Check size={12} strokeWidth={3} />}
          </div>
        </button>
        <span className={labelClassNames} onClick={handleToggle}>
          {label}
        </span>
      </div>
      {children ? <div className={styles.switchChildren}>{children}</div> : null}
    </div>
  )
}

export default Switch
