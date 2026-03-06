// SHAPE_EMAIL_ASSET_BASE_PLACEHOLDER is replaced during server rendering with the EMAIL_ASSETS_URL environment value.
export const SHAPE_EMAIL_ASSET_BASE_PLACEHOLDER = "{{EMAIL_ASSET_BASE_URL}}"

// PNG assets hosted in S3 for light/dark email variants.
export const SHAPE_EMAIL_BRAND_LOGO_LIGHT_FILENAME = "logo-light.png"
export const SHAPE_EMAIL_BRAND_LOGO_DARK_FILENAME = "logo-dark.png"

const buildLogoSourceFromFilename = (filename: string): string =>
  `${SHAPE_EMAIL_ASSET_BASE_PLACEHOLDER}/${filename}`

export const SHAPE_EMAIL_BRAND_LOGO_LIGHT_SRC = buildLogoSourceFromFilename(
  SHAPE_EMAIL_BRAND_LOGO_LIGHT_FILENAME
)
export const SHAPE_EMAIL_BRAND_LOGO_DARK_SRC = buildLogoSourceFromFilename(
  SHAPE_EMAIL_BRAND_LOGO_DARK_FILENAME
)

// Legacy alias preserved for any downstream imports still pointing to the single-logo export.
export const SHAPE_EMAIL_BRAND_LOGO_SRC = SHAPE_EMAIL_BRAND_LOGO_LIGHT_SRC
