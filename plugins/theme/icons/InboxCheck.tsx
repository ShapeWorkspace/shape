import * as React from "react"

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
}

export const InboxCheckIcon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M2 12H8L10 15H14L16 12H22V18C22 18.5306 21.7897 19.0393 21.4146 19.4144C21.0394 19.7895 20.5307 20 20 20H4C3.46935 20 2.96064 19.7895 2.58557 19.4144C2.2105 19.0393 2 18.5306 2 18V12ZM2 12L5.45 5.11C5.616 4.777 5.871 4.497 6.187 4.3C6.504 4.104 6.868 4 7.24 4H10.5H12" />
      <path d="M15.88 4.12L17.88 6.12L21.88 2.12" />
    </svg>
  )
)

InboxCheckIcon.displayName = "InboxCheckIcon"
