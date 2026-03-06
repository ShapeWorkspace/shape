import React from "react"
import { Check } from "lucide-react"
import * as styles from "./Checkbox.css"

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: keyof typeof styles.size
  label?: React.ReactNode
}

export const Checkbox: React.FC<CheckboxProps> = ({ size = "md", label, className, ...props }) => {
  const boxClass = [styles.box, styles.size[size]].join(" ")

  return (
    <label className={[styles.root, className].filter(Boolean).join(" ")}>
      <input type="checkbox" className={styles.input} {...props} />
      <span className={boxClass} aria-hidden>
        <Check size={16} strokeWidth={3} />
      </span>
      {label}
    </label>
  )
}

export default Checkbox
