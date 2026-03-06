import React from "react"
import { ChevronDown } from "lucide-react"
import * as styles from "./Select.css"
import { formInput, formInputWithRightIconPadding, selectReset } from "./utils.css"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

const Select: React.FC<SelectProps> = ({ className = "", children, ...props }) => {
  const selectClass = [formInput, formInputWithRightIconPadding, selectReset, styles.select, className]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={styles.container}>
      <select className={selectClass} {...props}>
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronDown size={16} />
      </span>
    </div>
  )
}

export default Select
