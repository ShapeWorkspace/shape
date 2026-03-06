import React from "react"
import * as styles from "./SegmentedControl.css"

export interface SegmentedControlOption {
  value: string
  label: string
  count?: number
  badge?: boolean
}

export interface SegmentedControlProps {
  options: ReadonlyArray<SegmentedControlOption>
  value: string
  onChange: (optionValue: string) => void
  disabled?: boolean
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  disabled = false,
}) => (
  <div className={styles.container} aria-disabled={disabled}>
    {options.map(option => {
      const isSegmentActive = value === option.value
      const segmentClassName = `${styles.segment} ${isSegmentActive ? styles.segmentActive : ""}`

      return (
        <button
          key={option.value}
          type="button"
          className={segmentClassName}
          disabled={disabled}
          aria-pressed={isSegmentActive}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.badge ? <span className={styles.unreadDot} aria-hidden /> : null}
          {option.count !== undefined ? <span className={styles.count}>{option.count}</span> : null}
        </button>
      )
    })}
  </div>
)

export default SegmentedControl
