// Middleware provides HTTP middleware components for session management, authentication,
// and request processing. This is a foundational implementation focused on core auth flows.

package middleware

import (
	"bufio"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"shape/models"
	"shape/services"

	"github.com/getsentry/sentry-go"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/sessions"
	"gorm.io/gorm"
)

var store *sessions.CookieStore

// appTokenSecret is used to sign app auth tokens for Tauri desktop/mobile apps.
// These tokens enable token-based auth as an alternative to cookies, which is needed
// because Tauri apps have cross-origin cookie issues with SSE (EventSource).
var appTokenSecret string

// appTokenExpiry is how long app tokens are valid. Set to 30 days for convenience
// since tokens are stored in the OS keychain and persist across app restarts.
const appTokenExpiry = 30 * 24 * time.Hour

// sseTokenExpiry is how long SSE tokens are valid. Short-lived for security since
// these tokens appear in URLs (query params) and could be logged.
const sseTokenExpiry = 60 * time.Second

// sseTokenStore holds pending SSE tokens. These are single-use and short-lived.
// Key is the token, value is the SSEToken struct with userId and expiry.
var sseTokenStore = struct {
	sync.RWMutex
	tokens map[string]*SSEToken
}{tokens: make(map[string]*SSEToken)}

// SSEToken represents a short-lived, single-use token for SSE connections.
type SSEToken struct {
	UserID    string
	ExpiresAt time.Time
}

const autoTestSubscriptionSessionKey = "auto_test_subscription"

type contextKey string

const (
	accountsKey         contextKey = "accounts"
	activeAccountIdKey  contextKey = "active_account_id"
	userIDKey           contextKey = "user_id"
	ActiveAccountHeader            = "X-Active-Account-ID"
	adminAPIHeader                 = "X-Admin-API-Key"
)

var readOnlySafeMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodOptions: true,
}

// InitSessionStore initializes the cookie-based session store with the provided secret.
// Cookies are used for web browser auth; Tauri apps use token-based auth instead.
func InitSessionStore(secret string, isDevelopment bool, cookieDomain string) {
	if strings.TrimSpace(secret) == "" {
		log.Printf("middleware: SESSION_SECRET is empty; session creation will fail")
	}
	store = sessions.NewCookieStore([]byte(secret))

	// Cookie security settings:
	// - Development: SameSite=Default; Secure=false (local HTTP dev)
	// - Production: SameSite=Lax; Secure=true
	var sameSite http.SameSite
	var secure bool

	if isDevelopment {
		sameSite = http.SameSiteDefaultMode
		secure = false
	} else {
		sameSite = http.SameSiteLaxMode
		secure = true
	}

	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   365 * 24 * 60 * 60, // 1 year in seconds
		HttpOnly: !isDevelopment,
		Secure:   secure,
		SameSite: sameSite,
	}
	domain := strings.TrimSpace(cookieDomain)
	if domain != "" {
		store.Options.Domain = domain
	}
}

// InitAppTokenAuth sets the HMAC secret used for signing app auth tokens.
// Call this during server startup with the CryptoHMACSecret from config.
func InitAppTokenAuth(secret string) {
	appTokenSecret = secret
}

// GenerateAppToken creates a signed token for Tauri desktop/mobile app authentication.
// Token format: <userId>.<expiresUnix>.<hmacSignature>
// These tokens are stored in the OS keychain and used instead of cookies.
func GenerateAppToken(userId string) string {
	if appTokenSecret == "" {
		return ""
	}
	expiresAt := time.Now().Add(appTokenExpiry).Unix()
	payload := fmt.Sprintf("%s.%d", userId, expiresAt)

	mac := hmac.New(sha256.New, []byte(appTokenSecret))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s.%s", payload, signature)
}

// ValidateAppToken verifies an app auth token and returns the userId.
// Returns an error if the token is invalid, expired, or the signature doesn't match.
func ValidateAppToken(token string) (string, error) {
	if appTokenSecret == "" {
		return "", fmt.Errorf("app token auth not configured")
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid token format")
	}

	userId := parts[0]
	expiresStr := parts[1]
	providedSig := parts[2]

	// Verify expiration
	expiresAt, err := strconv.ParseInt(expiresStr, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid expiration timestamp")
	}
	if time.Now().Unix() > expiresAt {
		return "", fmt.Errorf("token expired")
	}

	// Verify signature
	payload := fmt.Sprintf("%s.%s", userId, expiresStr)
	mac := hmac.New(sha256.New, []byte(appTokenSecret))
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if subtle.ConstantTimeCompare([]byte(providedSig), []byte(expectedSig)) != 1 {
		return "", fmt.Errorf("invalid signature")
	}

	return userId, nil
}

// GenerateSSEToken creates a short-lived, single-use token for SSE connections.
// This token should be exchanged immediately before establishing an SSE connection.
// Returns the token string that the client should pass as a query parameter.
func GenerateSSEToken(userId string) (string, error) {
	// Clean up expired tokens opportunistically before inserting a new one.
	cleanupExpiredSSETokens()

	// Generate 32 random bytes for the token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("failed to generate random token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	// Store the token with expiry
	sseTokenStore.Lock()
	sseTokenStore.tokens[token] = &SSEToken{
		UserID:    userId,
		ExpiresAt: time.Now().Add(sseTokenExpiry),
	}
	sseTokenStore.Unlock()

	return token, nil
}

// ValidateAndConsumeSSEToken validates an SSE token and returns the userId.
// The token is consumed (deleted) after validation to ensure single-use.
// Returns an error if the token is invalid, expired, or already used.
func ValidateAndConsumeSSEToken(token string) (string, error) {
	sseTokenStore.Lock()
	defer sseTokenStore.Unlock()

	sseToken, exists := sseTokenStore.tokens[token]
	if !exists {
		return "", fmt.Errorf("invalid or already used token")
	}

	// Delete the token immediately (single-use)
	delete(sseTokenStore.tokens, token)

	// Check expiration
	if time.Now().After(sseToken.ExpiresAt) {
		return "", fmt.Errorf("token expired")
	}

	return sseToken.UserID, nil
}

// cleanupExpiredSSETokens removes expired tokens from the store.
// Called periodically to prevent memory leaks from unused tokens.
func cleanupExpiredSSETokens() {
	sseTokenStore.Lock()
	defer sseTokenStore.Unlock()

	now := time.Now()
	for token, sseToken := range sseTokenStore.tokens {
		if now.After(sseToken.ExpiresAt) {
			delete(sseTokenStore.tokens, token)
		}
	}
}

// IsTauriClient checks if the request is from a Tauri desktop/mobile app.
// Tauri apps send X-Client-Type: tauri header to indicate they need token-based auth.
func IsTauriClient(r *http.Request) bool {
	return r.Header.Get("X-Client-Type") == "tauri"
}

// extractBearerToken extracts the token from an "Authorization: Bearer <token>" header.
func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(auth, bearerPrefix) {
		return ""
	}
	return strings.TrimSpace(auth[len(bearerPrefix):])
}

// JSONMiddleware sets the Content-Type header to application/json for all responses.
func JSONMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

// RequireAdminAPIKey enforces that callers provide the shared admin API key before a request
// reaches the underlying handler.
func RequireAdminAPIKey(expected string) mux.MiddlewareFunc {
	trimmed := strings.TrimSpace(expected)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if trimmed == "" {
				http.NotFound(w, r)
				return
			}

			provided := readAdminAPIKeyFromRequest(r)
			if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(trimmed)) != 1 {
				writeAdminUnauthorized(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// readAdminAPIKeyFromRequest pulls the admin key from the standard header, Bearer token,
// or query string so automation can choose whichever transport is most convenient.
func readAdminAPIKeyFromRequest(r *http.Request) string {
	if header := strings.TrimSpace(r.Header.Get(adminAPIHeader)); header != "" {
		return header
	}

	if auth := strings.TrimSpace(r.Header.Get("Authorization")); auth != "" {
		const bearerPrefix = "Bearer "
		if strings.HasPrefix(strings.ToLower(auth), strings.ToLower(bearerPrefix)) {
			return strings.TrimSpace(auth[len(bearerPrefix):])
		}
	}

	if key := strings.TrimSpace(r.URL.Query().Get("api_key")); key != "" {
		return key
	}

	return ""
}

func writeAdminUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"Unauthorized"}`))
}

// InstanceIDMiddleware ensures every response includes the instance identifier so clients
// can trace which server instance handled the request.
func InstanceIDMiddleware(instanceID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Instance-Id", instanceID)
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAuth validates that the request has a valid session with at least one account.
// Also accepts Bearer token authentication for Tauri desktop/mobile apps.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try cookie-based session auth first (web browser path)
		session, err := store.Get(r, "session")
		if err == nil {
			accounts, _ := session.Values["accounts"].([]string)
			if len(accounts) > 0 {
				headerAccountId := r.Header.Get(ActiveAccountHeader)
				if headerAccountId == "" {
					http.Error(w, `{"error":"X-Active-Account-ID header is required"}`, http.StatusBadRequest)
					return
				}

				if slices.Contains(accounts, headerAccountId) {
					if hub := sentry.GetHubFromContext(r.Context()); hub != nil {
						hub.ConfigureScope(func(scope *sentry.Scope) {
							scope.SetUser(sentry.User{ID: headerAccountId})
						})
					}

					ctx := context.WithValue(r.Context(), activeAccountIdKey, headerAccountId)
					ctx = context.WithValue(ctx, accountsKey, accounts)
					ctx = context.WithValue(ctx, userIDKey, headerAccountId)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// Fallback: Bearer token auth for Tauri desktop/mobile apps.
		// These apps store tokens in the OS keychain instead of using cookies.
		if token := extractBearerToken(r); token != "" {
			userId, err := ValidateAppToken(token)
			if err == nil {
				// X-Active-Account-ID header must match the token's user
				headerAccountId := r.Header.Get(ActiveAccountHeader)
				if headerAccountId != "" && headerAccountId == userId {
					if hub := sentry.GetHubFromContext(r.Context()); hub != nil {
						hub.ConfigureScope(func(scope *sentry.Scope) {
							scope.SetUser(sentry.User{ID: userId})
						})
					}

					ctx := context.WithValue(r.Context(), activeAccountIdKey, userId)
					ctx = context.WithValue(ctx, accountsKey, []string{userId})
					ctx = context.WithValue(ctx, userIDKey, userId)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
	})
}

// RequireAuthWebSocket is like RequireAuth but gets the active account ID from query params.
// This is needed because WebSocket connections can't set custom headers.
func RequireAuthWebSocket(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := store.Get(r, "session")
		if err != nil {
			http.Error(w, `{"error":"Invalid session"}`, http.StatusUnauthorized)
			return
		}

		accounts, _ := session.Values["accounts"].([]string)
		if len(accounts) == 0 {
			http.Error(w, `{"error":"No accounts"}`, http.StatusUnauthorized)
			return
		}

		queryAccountId := r.URL.Query().Get("activeAccountId")
		if queryAccountId == "" {
			http.Error(w, `{"error":"activeAccountId query parameter is required"}`, http.StatusBadRequest)
			return
		}

		found := slices.Contains(accounts, queryAccountId)
		if !found {
			http.Error(w, `{"error":"Invalid account ID in query parameter"}`, http.StatusUnauthorized)
			return
		}

		if hub := sentry.GetHubFromContext(r.Context()); hub != nil {
			hub.ConfigureScope(func(scope *sentry.Scope) {
				scope.SetUser(sentry.User{ID: queryAccountId})
			})
		}

		ctx := context.WithValue(r.Context(), activeAccountIdKey, queryAccountId)
		ctx = context.WithValue(ctx, accountsKey, accounts)
		ctx = context.WithValue(ctx, userIDKey, queryAccountId)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAuthSSE is like RequireAuth but for Server-Sent Events.
// SSE connections can't set custom headers, so we check both header and query param.
// Also accepts appToken query param for Tauri desktop/mobile apps.
func RequireAuthSSE(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try cookie-based session auth first (web browser path)
		session, err := store.Get(r, "session")
		if err == nil {
			accounts, _ := session.Values["accounts"].([]string)
			if len(accounts) > 0 {
				activeAccountId := r.Header.Get(ActiveAccountHeader)
				if activeAccountId == "" {
					activeAccountId = r.URL.Query().Get("activeUserId")
				}

				if activeAccountId != "" && slices.Contains(accounts, activeAccountId) {
					if hub := sentry.GetHubFromContext(r.Context()); hub != nil {
						hub.ConfigureScope(func(scope *sentry.Scope) {
							scope.SetUser(sentry.User{ID: activeAccountId})
						})
					}

					ctx := context.WithValue(r.Context(), activeAccountIdKey, activeAccountId)
					ctx = context.WithValue(ctx, accountsKey, accounts)
					ctx = context.WithValue(ctx, userIDKey, activeAccountId)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// Fallback: sseToken query param for Tauri desktop/mobile SSE connections.
		// These are short-lived, single-use tokens exchanged from app tokens via /api/sse/token.
		// This avoids putting long-lived tokens in URLs where they could be logged.
		if token := r.URL.Query().Get("sseToken"); token != "" {
			userId, err := ValidateAndConsumeSSEToken(token)
			if err == nil {
				if hub := sentry.GetHubFromContext(r.Context()); hub != nil {
					hub.ConfigureScope(func(scope *sentry.Scope) {
						scope.SetUser(sentry.User{ID: userId})
					})
				}

				ctx := context.WithValue(r.Context(), activeAccountIdKey, userId)
				ctx = context.WithValue(ctx, accountsKey, []string{userId})
				ctx = context.WithValue(ctx, userIDKey, userId)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
	})
}

// GetActiveAccountIdFromContext retrieves the active account ID from the request context.
func GetActiveAccountIdFromContext(r *http.Request) (interface{}, bool) {
	activeAccountId := r.Context().Value(activeAccountIdKey)
	if activeAccountId == nil {
		return nil, false
	}
	return activeAccountId, true
}

// GetUserID safely extracts the active account UUID from the request context.
// This should only be called after RequireAuth middleware has been applied.
func GetUserID(r *http.Request) string {
	if userIDRaw := r.Context().Value(userIDKey); userIDRaw != nil {
		if userID, ok := userIDRaw.(string); ok {
			return userID
		}
	}
	activeAccountID, ok := GetActiveAccountIdFromContext(r)
	if !ok {
		return ""
	}
	if activeAccountID, ok := activeAccountID.(string); ok {
		return activeAccountID
	}
	return ""
}

// GetAccountsFromContext safely extracts the accounts list from the request context.
// This should only be called after RequireAuth middleware has been applied.
func GetAccountsFromContext(r *http.Request) []string {
	accounts := r.Context().Value(accountsKey)
	if accounts == nil {
		return []string{}
	}
	if accountList, ok := accounts.([]string); ok {
		return accountList
	}
	return []string{}
}

// ResolveWorkspaceIdentifier allows routes that accept a {workspaceId} parameter to specify the workspace
// subdomain instead of the UUID.
func ResolveWorkspaceIdentifier(workspaces *models.WorkspaceService) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if workspaces == nil {
				next.ServeHTTP(w, r)
				return
			}

			vars := mux.Vars(r)
			if vars == nil {
				vars = map[string]string{}
			}
			raw := strings.TrimSpace(vars["workspaceId"])
			if raw == "" {
				next.ServeHTTP(w, r)
				return
			}

			if _, err := uuid.Parse(raw); err == nil {
				next.ServeHTTP(w, r)
				return
			}

			workspace, err := workspaces.GetBySubdomain(raw)
			if err != nil {
				switch {
				case errors.Is(err, gorm.ErrRecordNotFound):
					writeWorkspaceResolutionError(w, http.StatusNotFound, "workspace_not_found", "Workspace not found")
				default:
					writeWorkspaceResolutionError(w, http.StatusInternalServerError, "workspace_resolution_failed", "Failed to resolve workspace")
				}
				return
			}

			vars["workspaceId"] = workspace.ID
			r = mux.SetURLVars(r, vars)
			next.ServeHTTP(w, r)
		})
	}
}

// RequireWorkspaceWritableOnWorkspaceParam rejects write requests for workspaces in read-only mode.
func RequireWorkspaceWritableOnWorkspaceParam(subscriptions *services.WorkspaceSubscriptionService) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if subscriptions == nil || readOnlySafeMethods[r.Method] {
				next.ServeHTTP(w, r)
				return
			}

			workspaceID := mux.Vars(r)["workspaceId"]
			if workspaceID == "" {
				WriteBillingError(w, fmt.Errorf("workspace id missing"))
				return
			}

			path := r.URL.Path
			skipReadOnlyCheck := strings.Contains(path, "/subscription/checkout") || strings.Contains(path, "/subscription/portal") || strings.Contains(path, "/onboarding/complete")
			if !skipReadOnlyCheck {
				if err := subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
					WriteBillingError(w, err)
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// WriteBillingError normalizes billing-related errors into structured HTTP responses.
func WriteBillingError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	code := "billing_error"
	message := "Billing error"
	if err != nil {
		trimmed := strings.TrimSpace(err.Error())
		if trimmed != "" {
			message = trimmed
		}
	}

	switch {
	case errors.Is(err, models.ErrWorkspaceReadOnly):
		status = http.StatusForbidden
		code = "workspace_read_only"
		message = "Workspace is currently in read-only mode"
	case errors.Is(err, models.ErrSeatLimitReached):
		status = http.StatusPaymentRequired
		code = "seat_limit_reached"
		message = "Not enough seats to complete this action"
	case errors.Is(err, models.ErrStripeNotConfigured):
		status = http.StatusServiceUnavailable
		code = "stripe_not_configured"
		message = "Billing not configured"
	case err != nil && err.Error() == "workspace id missing":
		status = http.StatusBadRequest
		code = "workspace_id_missing"
		message = "Workspace identifier is required"
	case err != nil && strings.HasSuffix(err.Error(), " id missing"):
		entity := strings.TrimSpace(strings.TrimSuffix(err.Error(), " id missing"))
		status = http.StatusBadRequest
		code = formatBillingEntityCode(entity, "id_missing")
		message = fmt.Sprintf("%s identifier is required", humanizeEntityLabel(entity))
	case err != nil && strings.HasSuffix(err.Error(), " not found"):
		entity := strings.TrimSpace(strings.TrimSuffix(err.Error(), " not found"))
		status = http.StatusNotFound
		code = formatBillingEntityCode(entity, "not_found")
		message = fmt.Sprintf("%s not found", humanizeEntityLabel(entity))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}

func writeWorkspaceResolutionError(w http.ResponseWriter, status int, code string, message string) {
	if status == 0 {
		status = http.StatusInternalServerError
	}
	if strings.TrimSpace(code) == "" {
		code = "workspace_resolution_failed"
	}
	if strings.TrimSpace(message) == "" {
		message = "Failed to resolve workspace"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}

func humanizeEntityLabel(label string) string {
	label = strings.TrimSpace(label)
	if label == "" {
		return ""
	}

	parts := strings.Fields(label)
	for i := range parts {
		part := parts[i]
		if len(part) == 0 {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + part[1:]
	}
	return strings.Join(parts, " ")
}

func formatBillingEntityCode(entity, suffix string) string {
	entity = strings.ToLower(strings.TrimSpace(entity))
	entity = strings.ReplaceAll(entity, " ", "_")
	entity = strings.ReplaceAll(entity, "-", "_")
	if entity == "" {
		return suffix
	}
	return entity + "_" + suffix
}

// AppendUserToSession adds a user ID to the session accounts list.
func AppendUserToSession(session *sessions.Session, userID string) error {
	var accounts []string
	if existingAccounts, ok := session.Values["accounts"].([]string); ok {
		accounts = existingAccounts
	}

	if !slices.Contains(accounts, userID) {
		accounts = append(accounts, userID)
	}

	session.Values["accounts"] = accounts
	return nil
}

// RemoveUserFromSession removes a user ID from the session accounts list.
func RemoveUserFromSession(session *sessions.Session, userID string) error {
	var accounts []string
	if existingAccounts, ok := session.Values["accounts"].([]string); ok {
		accounts = existingAccounts
	}

	for i, account := range accounts {
		if account == userID {
			accounts = append(accounts[:i], accounts[i+1:]...)
			break
		}
	}

	if len(accounts) == 0 {
		session.Values = make(map[interface{}]interface{})
		session.Options.MaxAge = -1
		return nil
	}

	session.Values["accounts"] = accounts
	return nil
}

// GetSession retrieves or creates a session for the request.
func GetSession(r *http.Request) (*sessions.Session, error) {
	if store == nil {
		return nil, fmt.Errorf("session store is not initialized")
	}

	session, err := store.Get(r, "session")
	if err == nil {
		return session, nil
	}

	log.Printf("middleware: session retrieval failed, attempting to clear stale cookie: %v", err)

	if r != nil {
		r.Header.Del("Cookie")
	}

	return store.New(r, "session")
}

// SaveSession saves the session to the response.
func SaveSession(session *sessions.Session, r *http.Request, w http.ResponseWriter) error {
	if session == nil {
		return fmt.Errorf("cannot save a nil session")
	}
	return session.Save(r, w)
}

// EnableAutoTestSubscriptionFlag marks the current session so the next workspace creation can
// automatically activate a test subscription.
func EnableAutoTestSubscriptionFlag(session *sessions.Session) {
	if session == nil {
		return
	}
	session.Values[autoTestSubscriptionSessionKey] = true
}

// ConsumeAutoTestSubscriptionFlag returns whether the session requested automatic test
// subscription activation.
func ConsumeAutoTestSubscriptionFlag(session *sessions.Session) bool {
	if session == nil {
		return false
	}
	flag, ok := session.Values[autoTestSubscriptionSessionKey].(bool)
	if !ok || !flag {
		return false
	}
	session.Values[autoTestSubscriptionSessionKey] = false
	return true
}

// LoggingMiddleware logs all incoming requests.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
			body:           make([]byte, 0),
		}

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)
		logLine := fmt.Sprintf("[%s] %s %s - %d - %v - %s",
			r.Method,
			r.RequestURI,
			r.RemoteAddr,
			wrapped.statusCode,
			duration,
			r.UserAgent())

		if wrapped.statusCode >= 400 {
			errorBody := string(wrapped.body)
			if errorBody != "" {
				logLine += fmt.Sprintf(" - ERROR: %s", errorBody)
			}
		}

		log.Print(logLine)
	})
}

// ErrorTrackingMiddleware recovers panics and reports 5xx responses to Sentry.
func ErrorTrackingMiddleware(_ services.AnalyticsService, environment string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wrapped := &responseWriter{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
				body:           make([]byte, 0),
			}
			hub := sentry.GetHubFromContext(r.Context())
			defer func() {
				if rec := recover(); rec != nil {
					userID := r.Header.Get(ActiveAccountHeader)
					if userID == "" {
						userID = GetUserID(r)
					}
					if hub != nil {
						hub.RecoverWithContext(r.Context(), rec)
					} else {
						sentry.CurrentHub().RecoverWithContext(r.Context(), rec)
					}

					http.Error(wrapped, `{"error":"Internal Server Error"}`, http.StatusInternalServerError)
					return
				}
			}()
			next.ServeHTTP(wrapped, r)

			if wrapped.statusCode >= http.StatusInternalServerError {
				message := fmt.Sprintf("http %d response for %s %s", wrapped.statusCode, r.Method, r.URL.Path)
				if hub != nil {
					hub.WithScope(func(scope *sentry.Scope) {
						scope.SetLevel(sentry.LevelError)
						scope.SetTag("error_origin", "http_response_status")
						scope.SetTag("http.status_code", fmt.Sprintf("%d", wrapped.statusCode))
						scope.SetTag("http.method", r.Method)
						scope.SetTag("http.path", r.URL.Path)
						hub.CaptureMessage(message)
					})
				} else {
					sentry.CaptureMessage(message)
				}
			}
		})
	}
}

// AnalyticsErrorMiddleware is a backward-compatible alias for ErrorTrackingMiddleware.
func AnalyticsErrorMiddleware(analytics services.AnalyticsService, environment string) func(http.Handler) http.Handler {
	return ErrorTrackingMiddleware(analytics, environment)
}

// RequireAuthMiddleware adapts RequireAuth into a gorilla/mux compatible middleware.
func RequireAuthMiddleware() mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handler := RequireAuth(func(w http.ResponseWriter, r *http.Request) {
				next.ServeHTTP(w, r)
			})
			handler(w, r)
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code and response body.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	body       []byte
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(body []byte) (int, error) {
	if rw.statusCode >= 400 {
		rw.body = append(rw.body, body...)
	}
	return rw.ResponseWriter.Write(body)
}

// Hijack implements http.Hijacker if the underlying ResponseWriter supports it.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, fmt.Errorf("responseWriter does not support hijacking")
}

// Flush implements http.Flusher if the underlying ResponseWriter supports it.
func (rw *responseWriter) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}
