import React from "react"
import { Img } from "@react-email/components"
import { SHAPE_EMAIL_BRAND_LOGO_DARK_SRC, SHAPE_EMAIL_BRAND_LOGO_LIGHT_SRC } from "../logo"

const lightClassName = "shape-email-light-logo"
const darkClassName = "shape-email-dark-logo"

const responsiveLogoStyle = `
@media (prefers-color-scheme: dark) {
  .${lightClassName} { display: none !important; }
  .${darkClassName} { display: block !important; }
}

@media (prefers-color-scheme: light) {
  .${lightClassName} { display: block !important; }
  .${darkClassName} { display: none !important; }
}
`

export interface EmailBrandLogoProps {
  alt: string
  height?: number
}

const baseLogoStyle: React.CSSProperties = {
  height: 37,
  width: "auto",
  margin: "0 auto",
  display: "block",
}

const EmailBrandLogo: React.FC<EmailBrandLogoProps> = ({ alt, height = 37 }) => {
  // Height defaults to the established 37px but stays configurable for future templates.
  const computedStyle = { ...baseLogoStyle, height }
  return (
    <>
      <style>{responsiveLogoStyle}</style>
      {/* Fallback: light image visible by default for clients that ignore media queries. */}
      <Img
        src={SHAPE_EMAIL_BRAND_LOGO_LIGHT_SRC}
        alt={alt}
        className={lightClassName}
        style={computedStyle}
      />
      <Img
        src={SHAPE_EMAIL_BRAND_LOGO_DARK_SRC}
        alt={alt}
        className={darkClassName}
        style={{ ...computedStyle, display: "none" }}
      />
    </>
  )
}

export default EmailBrandLogo
