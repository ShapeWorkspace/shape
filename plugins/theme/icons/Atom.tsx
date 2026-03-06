import * as React from "react"

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
}

export const AtomIcon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, strokeWidth = 1.5, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M18.5363 5.19696C19.585 6.2457 19.9497 7.92494 19.5217 9.92228C19.0956 11.911 17.8957 14.1115 15.991 16.0162C14.0865 17.9207 11.8863 19.12 9.89773 19.5463C7.90034 19.9743 6.22047 19.6103 5.17171 18.5616C4.12317 17.5128 3.75973 15.8334 4.1877 13.8362C4.61389 11.8477 5.81318 9.64753 7.71771 7.74296C9.62241 5.83826 11.823 4.6384 13.8117 4.21226C15.8088 3.78435 17.4876 4.14845 18.5363 5.19696Z" />
      <path d="M5.19696 5.46374C6.2457 4.415 7.92494 4.05037 9.92228 4.47835C11.911 4.90449 14.1115 6.10435 16.0162 8.00905C17.9207 9.91359 19.12 12.1138 19.5463 14.1023C19.9743 16.0997 19.6103 17.7796 18.5616 18.8283C17.5128 19.8769 15.8334 20.2403 13.8362 19.8123C11.8477 19.3862 9.64753 18.1869 7.74296 16.2823C5.83826 14.3776 4.6384 12.177 4.21226 10.1884C3.78435 8.19125 4.14845 6.51248 5.19696 5.46374Z" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
)

AtomIcon.displayName = "AtomIcon"
