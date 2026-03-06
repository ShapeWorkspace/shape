/**
 * Shared brand constants so every package references identical naming and contact details.
 * Keep copy lowercase unless you intentionally opt into the capitalised variant.
 */
export const BRAND_NAME = "Shape"
export const BRAND_NAME_CAPITALIZED = "Shape"

export const BRAND_PRIMARY_DOMAIN = "shape.work"
export const BRAND_APP_DOMAIN = `app.${BRAND_PRIMARY_DOMAIN}`
export const BRAND_APP_URL = `https://${BRAND_APP_DOMAIN}`
export const BRAND_MARKETING_URL = `https://${BRAND_PRIMARY_DOMAIN}`
export const BRAND_HELP_CENTER_URL = `https://www.${BRAND_PRIMARY_DOMAIN}/help`

export const BRAND_CONTACT_EMAIL = `hello@${BRAND_PRIMARY_DOMAIN}`
export const BRAND_SUPPORT_EMAIL = `help@${BRAND_PRIMARY_DOMAIN}`
export const BRAND_BILLING_EMAIL = `billing@${BRAND_PRIMARY_DOMAIN}`

// Social handle used across product surfaces for the X account.
export const BRAND_SOCIAL_X_HANDLE = "shapeteams"
export const BRAND_SOCIAL_X_URL = `https://x.com/${BRAND_SOCIAL_X_HANDLE}`

export const BRAND_SITEMAP_URL = `${BRAND_MARKETING_URL}/sitemap-index.xml`
