package config

import (
	"os"
	"strings"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	DatabaseURL         string
	SessionSecret       string
	SessionCookieDomain string
	AllowedOrigins      []string
	Environment         string
	Host                string
	WorkspaceRootDomain string
	WorkspaceURLScheme  string
	// SelfHosted disables paid billing flows for air-gapped deployments.
	SelfHosted bool
	// CryptoHMACSecret is used to generate deterministic fake salts for non-existent users
	// during the login-challenge flow. This prevents account enumeration attacks by ensuring
	// the response time and format are identical for existing and non-existing accounts.
	CryptoHMACSecret string
	// Sentry
	SentryDSN string
	// Email / SES
	SESEnabled     bool
	SESSenderEmail string
	AWSRegion      string
	// Email / SMTP (for local/dev)
	EmailDriver    string // "ses" or "smtp"
	SMTPHost       string
	SMTPPort       string
	SMTPUsername   string
	SMTPPassword   string
	EmailAssetsURL string
	// Metrics
	MetricsDriver    string // "cloudwatch" or "none"
	MetricsNamespace string

	// Stripe Billing
	StripeSecretKey      string
	StripePublishableKey string
	StripePriceID        string
	StripeWebhookSecret  string

	// Admin API
	AdminAPIKey string

	// Redis / ElastiCache (optional, for SSE pub/sub replication)
	RedisEnabled    bool
	RedisAddress    string
	RedisUsername   string
	RedisPassword   string
	RedisTLSEnabled bool
	RedisChannel    string

	// Feature flags
	SeedingDisabled bool

	// Registration gating - when enabled, users must provide a valid invite code to register.
	// Disabled by default (for CI/tests). Enable in production to gate signups.
	RequireInviteCode bool

	// APNs (Apple Push Notification service)
	APNsKeyBase64   string // Base64-encoded .p8 private key
	APNsKeyID       string // 10-character Key ID from Apple Developer portal
	APNsTeamID      string // 10-character Team ID from Apple Developer portal
	APNsBundleID    string // App bundle identifier (e.g., work.shape.shape)
	APNsEnvironment string // "sandbox" or "production"
}

// Load reads environment variables and returns a populated Config.
// ALLOWED_ORIGINS is required in production but optional in dev/test (which allow all origins).
func Load() *Config {
	env := getEnv("ENVIRONMENT", "production")
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" && env != "development" && env != "test" {
		panic("ALLOWED_ORIGINS environment variable is required in production")
	}

	redisEnabled := strings.ToLower(getEnv("REDIS_ENABLED", "false")) == "true"
	redisTLSEnabled := strings.ToLower(getEnv("REDIS_TLS_ENABLED", "false")) == "true"
	redisChannel := getEnv("REDIS_CHANNEL", "shape:sse")

	seedingDisabled := strings.EqualFold(strings.TrimSpace(getEnv("SEEDING_DISABLED", "false")), "true")
	selfHosted := strings.EqualFold(strings.TrimSpace(getEnv("SELF_HOSTED", "false")), "true")
	requireInviteCode := strings.EqualFold(strings.TrimSpace(getEnv("REQUIRE_INVITE_CODE", "false")), "true")

	return &Config{
		DatabaseURL:         getEnv("DATABASE_URL", "sqlite://shape.db"),
		SessionSecret:       getEnv("SESSION_SECRET", "your-secret-key-change-this-in-production"),
		SessionCookieDomain: strings.TrimSpace(getEnv("SESSION_COOKIE_DOMAIN", "")),
		AllowedOrigins:      parseAllowedOrigins(allowedOrigins),
		Environment:         env,
		WorkspaceRootDomain: strings.TrimSpace(getEnv("WORKSPACE_ROOT_DOMAIN", "shape.work")),
		WorkspaceURLScheme:  strings.TrimSpace(getEnv("WORKSPACE_URL_SCHEME", "https")),
		CryptoHMACSecret:    getEnv("CRYPTO_HMAC_SECRET", "change-this-crypto-hmac-secret-in-production"),
		SentryDSN:           strings.TrimSpace(getEnv("SENTRY_DSN", "")),
		SESEnabled:          strings.ToLower(getEnv("SES_ENABLED", "false")) == "true",
		SESSenderEmail:      getEnv("SES_SENDER_EMAIL", ""),
		AWSRegion:           getEnv("AWS_REGION", "us-east-1"),
		EmailDriver:         strings.ToLower(getEnv("EMAIL_DRIVER", "ses")),
		SMTPHost:            getEnv("SMTP_HOST", "localhost"),
		SMTPPort:            getEnv("SMTP_PORT", "1025"),
		SMTPUsername:        getEnv("SMTP_USERNAME", ""),
		SMTPPassword:        getEnv("SMTP_PASSWORD", ""),
		EmailAssetsURL:      strings.TrimSpace(getEnv("EMAIL_ASSETS_URL", "")),
		MetricsDriver:       strings.ToLower(getEnv("METRICS_DRIVER", "none")),
		MetricsNamespace:    getEnv("METRICS_NAMESPACE", "Shape/App"),
		Host:                getEnv("HOST", ""),

		StripeSecretKey:      getEnv("STRIPE_SECRET_KEY", ""),
		StripePublishableKey: getEnv("STRIPE_PUBLISHABLE_KEY", ""),
		StripePriceID:        getEnv("STRIPE_PRICE_ID", ""),
		StripeWebhookSecret:  getEnv("STRIPE_WEBHOOK_SECRET", ""),

		SelfHosted: selfHosted,

		AdminAPIKey: strings.TrimSpace(getEnv("ADMIN_API_KEY", "")),

		RedisEnabled:    redisEnabled,
		RedisAddress:    getEnv("REDIS_ADDRESS", ""),
		RedisUsername:   getEnv("REDIS_USERNAME", ""),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		RedisTLSEnabled: redisTLSEnabled,
		RedisChannel:    redisChannel,

		SeedingDisabled:   seedingDisabled,
		RequireInviteCode: requireInviteCode,

		APNsKeyBase64:   strings.TrimSpace(getEnv("APNS_KEY_BASE64", "")),
		APNsKeyID:       strings.TrimSpace(getEnv("APNS_KEY_ID", "")),
		APNsTeamID:      strings.TrimSpace(getEnv("APNS_TEAM_ID", "")),
		APNsBundleID:    strings.TrimSpace(getEnv("APNS_BUNDLE_ID", "")),
		APNsEnvironment: strings.TrimSpace(getEnv("APNS_ENVIRONMENT", "sandbox")),
	}
}

// IsDevelopment returns true if we're in development mode.
func (c *Config) IsDevelopment() bool {
	env := strings.ToLower(c.Environment)
	return env == "development" || env == "dev" || env == "test"
}

// IsProduction returns true if we're in production mode.
func (c *Config) IsProduction() bool {
	env := strings.ToLower(c.Environment)
	return env == "production" || env == "prod"
}

// parseAllowedOrigins splits a comma-separated list of origins, or returns nil if empty.
// Returning nil is safe because in dev/test we use AllowOriginFunc instead of AllowedOrigins.
func parseAllowedOrigins(origins string) []string {
	if origins == "" {
		return nil
	}
	return strings.Split(origins, ",")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
