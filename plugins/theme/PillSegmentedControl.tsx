import React from "react"
import * as styles from "./PillSegmentedControl.css"

export interface PillSegmentedControlOption {
  value: string
  label: string
  count?: number
  badge?: boolean
}

export interface PillSegmentedControlProps {
  options: ReadonlyArray<PillSegmentedControlOption>
  value: string
  onChange: (optionValue: string) => void
  disabled?: boolean
}

export const PillSegmentedControl: React.FC<PillSegmentedControlProps> = ({
  options,
  value,
  onChange,
  disabled = false,
}) => (
  <div className={styles.container} aria-disabled={disabled}>
    {options.map(option => {
      const isOptionActive = value === option.value
      const segmentClassName = `${styles.segment} ${isOptionActive ? styles.segmentActive : ""}`
      const labelClassName = `${styles.label} ${isOptionActive ? styles.labelActive : ""}`
      const countClassName = `${styles.count} ${isOptionActive ? styles.countActive : ""}`

      return (
        <button
          key={option.value}
          type="button"
          className={segmentClassName}
          disabled={disabled}
          aria-pressed={isOptionActive}
          onClick={() => onChange(option.value)}
        >
          <span className={labelClassName}>{option.label}</span>
          {option.badge ? <span className={styles.badge} aria-hidden /> : null}
          {option.count !== undefined ? <span className={countClassName}>{option.count}</span> : null}
        </button>
      )
    })}
  </div>
)

export default PillSegmentedControl
