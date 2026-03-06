import React from "react"
import * as styles from "./Button.css"

type ButtonElementProps<T extends React.ElementType> = {
  as?: T
} & Omit<React.ComponentPropsWithoutRef<T>, "as">

export interface ButtonProps<T extends React.ElementType = "button"> extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  kind?: "solid" | "outline" | "ghost"
  variant?: "norm" | "weak" | "danger" | "accent"
  size?: "regular" | "small" | "large" | "tiny"
  children?: React.ReactNode
  type?: "button" | "submit" | "reset"
  as?: T
}

const Button = <T extends React.ElementType = "button">({
  kind = "outline",
  variant = "weak",
  size = "regular",
  className = "",
  children,
  type = "button",
  as,
  ...props
}: ButtonProps<T> & ButtonElementProps<T>) => {
  const variantKind = `${variant}${kind.charAt(0).toUpperCase() + kind.slice(1)}` as keyof typeof styles
  const variantClass = styles[variantKind]
  const sizeClass = styles[size as keyof typeof styles]

  const classNames = [styles.button, variantClass, sizeClass, className].filter(Boolean).join(" ")

  const Component = (as || "button") as React.ElementType

  if (Component === "button") {
    return (
      <button
        type={type}
        className={classNames}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    )
  }

  return (
    <Component className={classNames} {...props}>
      {children}
    </Component>
  )
}

export default Button
