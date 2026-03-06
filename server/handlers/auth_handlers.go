package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"shape/config"
	"shape/middleware"
	"shape/models"
	"shape/services"

	"gorm.io/gorm"
)

// AuthHandlers handles authentication-related requests including registration, login, logout, and password reset.
type AuthHandlers struct {
	userService            *models.UserService
	workspaceService       *models.WorkspaceService
	workspaceMemberService *models.WorkspaceMemberService
	emailInviteService     *models.WorkspaceEmailInviteService
	inviteCodeService      *models.InviteCodeService
	appRefreshTokenService *models.AppRefreshTokenService
	s3Service              *services.S3Service
	config                 *config.Config
	email                  services.EmailService
	analytics              services.AnalyticsService
	passwordResets         *models.PasswordResetService
}

// allowedSignupAttributionKeys defines which marketing attribution fields can be stored with a user.
var allowedSignupAttributionKeys = map[string]struct{}{
	"gclid":        {},
	"utm_source":   {},
	"utm_medium":   {},
	"utm_campaign": {},
	"utm_content":  {},
	"utm_term":     {},
	"landing_path": {},
	"captured_at":  {},
}

// Request/Response structures for auth endpoints.

// RegisterRequest contains all data needed to create a new user account with E2EE support.
// The server_password is a derived key from the client (via Argon2id), NOT the raw password.
// The crypto_fields contain the user's encrypted identity key bundle.
// The user_id is client-generated and cryptographically bound to the encrypted key bundle,
// so the server MUST use this exact ID (or reject registration on collision).
type RegisterRequest struct {
	UserID                       string                   `json:"user_id"` // Client-generated UUID, bound to encrypted payload
	Email                        string                   `json:"email"`
	ServerPassword               string                   `json:"server_password"` // Derived key, not raw password
	AutoActivateTestSubscription bool                     `json:"auto_activate_test_subscription,omitempty"`
	Attribution                  map[string]string        `json:"attribution,omitempty"`
	CryptoFields                 *models.UserCryptoFields `json:"crypto_fields"` // Required for E2EE
	InviteCode                   string                   `json:"invite_code,omitempty"`
	BypassInviteCode             bool                     `json:"bypass_invite_code,omitempty"`
}

// LoginChallengeRequest is the first step of the 2-step auth dance.
// Client sends email to get KDF parameters needed to derive server_password.
type LoginChallengeRequest struct {
	Email string `json:"email"`
}

// LoginChallengeResponse returns the KDF parameters needed to derive keys.
// For non-existent users, returns a deterministic fake salt to prevent enumeration.
type LoginChallengeResponse struct {
	PwSalt     string `json:"pw_salt"`     // 16 bytes hex - Argon2id salt
	KdfVersion int    `json:"kdf_version"` // Protocol version for KDF parameters
}

// LoginRequest is the second step of the 2-step auth dance.
// Client sends the derived server_password (NOT the raw password).
type LoginRequest struct {
	Email          string `json:"email"`
	ServerPassword string `json:"server_password"` // Derived key from Argon2id, not raw password
}

// LoginResponse includes the user data and crypto fields needed to decrypt identity keys.
type LoginResponseWithCrypto struct {
	Message      string                           `json:"message"`
	User         *models.User                     `json:"user"`
	CryptoFields *models.UserCryptoFieldsResponse `json:"crypto_fields,omitempty"`
	// AppToken is a signed Bearer token for Tauri desktop/mobile apps.
	// Returned when X-Client-Type: tauri header is present. These apps store
	// the token in the OS keychain and use it instead of cookies (which have
	// cross-origin issues with SSE/EventSource in WebView).
	AppToken string `json:"app_token,omitempty"`
	// RefreshToken is a long-lived token used to mint new app tokens.
	// Returned only for Tauri requests and must be stored securely.
	RefreshToken string `json:"refresh_token,omitempty"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	TokenID        string                   `json:"token_id"`
	Token          string                   `json:"token"`
	ServerPassword string                   `json:"server_password"`
	CryptoFields   *models.UserCryptoFields `json:"crypto_fields"`
}

type ChangePasswordRequest struct {
	CurrentPassword string                   `json:"current_password"`
	NewPassword     string                   `json:"new_password"`
	CryptoFields    *models.UserCryptoFields `json:"crypto_fields"`
}

type RegisterResponse struct {
	Message string       `json:"message"`
	User    *models.User `json:"user"`
	// AppToken is a signed Bearer token for Tauri desktop/mobile apps.
	// Returned only when X-Client-Type: tauri header is present.
	AppToken string `json:"app_token,omitempty"`
	// RefreshToken is a long-lived token used to mint new app tokens.
	// Returned only for Tauri requests and must be stored securely.
	RefreshToken string `json:"refresh_token,omitempty"`
}

// RefreshTokenRequest exchanges a refresh token for a new app token.
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshTokenResponse returns rotated tokens for Tauri clients.
type RefreshTokenResponse struct {
	AppToken     string `json:"app_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type LoginResponse struct {
	Message string       `json:"message"`
	User    *models.User `json:"user"`
}

// sanitizeSignupAttribution filters and sanitizes incoming attribution data to only allowed keys.
func sanitizeSignupAttribution(payload map[string]string) map[string]string {
	if len(payload) == 0 {
		return nil
	}

	sanitized := make(map[string]string)
	for key, value := range payload {
		if _, allowed := allowedSignupAttributionKeys[key]; !allowed {
			continue
		}
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			continue
		}
		sanitized[key] = trimmedValue
	}

	if len(sanitized) == 0 {
		return nil
	}

	return sanitized
}

// NewAuthHandlers creates a new auth handlers instance with all required dependencies.
func NewAuthHandlers(
	userService *models.UserService,
	workspaceService *models.WorkspaceService,
	workspaceMemberService *models.WorkspaceMemberService,
	emailInviteService *models.WorkspaceEmailInviteService,
	inviteCodeService *models.InviteCodeService,
	appRefreshTokenService *models.AppRefreshTokenService,
	s3Service *services.S3Service,
	config *config.Config,
	email services.EmailService,
	analytics services.AnalyticsService,
) *AuthHandlers {
	return &AuthHandlers{
		userService:            userService,
		workspaceService:       workspaceService,
		workspaceMemberService: workspaceMemberService,
		emailInviteService:     emailInviteService,
		inviteCodeService:      inviteCodeService,
		appRefreshTokenService: appRefreshTokenService,
		s3Service:              s3Service,
		config:                 config,
		email:                  email,
		analytics:              analytics,
		passwordResets:         models.NewPasswordResetService(userService.DB(), userService),
	}
}

// isValidEmail validates email format using a basic regex pattern.
func isValidEmail(email string) bool {
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

// deriveUserDisplayName extracts a friendly label from an email address.
// Used for user-facing emails when no plaintext profile name exists server-side.
func deriveUserDisplayName(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "there"
	}
	if idx := strings.Index(trimmed, "@"); idx > 0 {
		return trimmed[:idx]
	}
	return trimmed
}

// Register handles user registration with E2EE crypto identity.
// The client sends a derived server_password (not raw password) and encrypted key bundle.
// This allows the server to verify authentication without ever seeing the user's actual password.
func (ah *AuthHandlers) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Normalize and validate input.
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Email == "" || req.ServerPassword == "" {
		JSONError(w, "Email and server_password are required", http.StatusBadRequest)
		return
	}

	if !isValidEmail(req.Email) {
		JSONError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Validate server_password - it's a hex-encoded 32-byte derived key (64 hex chars).
	if len(req.ServerPassword) != 64 {
		JSONError(w, "Invalid server_password format", http.StatusBadRequest)
		return
	}

	// Crypto fields are required for E2EE registration.
	if req.CryptoFields == nil {
		JSONError(w, "crypto_fields are required", http.StatusBadRequest)
		return
	}

	// Validate crypto field formats.
	// pw_salt: 16 bytes = 32 hex chars
	if len(req.CryptoFields.PwSalt) != 32 {
		JSONError(w, "Invalid pw_salt format (expected 32 hex chars)", http.StatusBadRequest)
		return
	}
	// enc_key_bundle_nonce: 24 bytes = 48 hex chars
	if len(req.CryptoFields.EncKeyBundleNonce) != 48 {
		JSONError(w, "Invalid enc_key_bundle_nonce format (expected 48 hex chars)", http.StatusBadRequest)
		return
	}
	// box_public_key: 32 bytes = 64 hex chars
	if len(req.CryptoFields.BoxPublicKey) != 64 {
		JSONError(w, "Invalid box_public_key format (expected 64 hex chars)", http.StatusBadRequest)
		return
	}
	// sign_public_key: 32 bytes = 64 hex chars
	if len(req.CryptoFields.SignPublicKey) != 64 {
		JSONError(w, "Invalid sign_public_key format (expected 64 hex chars)", http.StatusBadRequest)
		return
	}
	// enc_key_bundle: base64 string (should be non-empty)
	if req.CryptoFields.EncKeyBundle == "" {
		JSONError(w, "enc_key_bundle is required", http.StatusBadRequest)
		return
	}
	// crypto_bundle_id: should be a valid UUID
	if req.CryptoFields.CryptoBundleID == "" {
		JSONError(w, "crypto_bundle_id is required", http.StatusBadRequest)
		return
	}

	// Validate user_id - it's client-generated and cryptographically bound to the key bundle.
	if req.UserID == "" {
		JSONError(w, "user_id is required", http.StatusBadRequest)
		return
	}
	// Validate UUID format.
	if len(req.UserID) != 36 {
		JSONError(w, "Invalid user_id format (expected UUID)", http.StatusBadRequest)
		return
	}

	// Check if user already exists by email.
	_, err := ah.userService.GetByEmail(req.Email)
	if err == nil {
		JSONError(w, "User with this email already exists", http.StatusConflict)
		return
	}

	// Check if user ID already exists (UUID collision - extremely unlikely but must be handled).
	_, err = ah.userService.GetByID(req.UserID)
	if err == nil {
		JSONError(w, "User ID already exists", http.StatusConflict)
		return
	}

	createUserParams := models.CreateUserParams{
		ID:                req.UserID, // Client-generated, cryptographically bound to key bundle
		Email:             req.Email,
		ServerPassword:    req.ServerPassword,
		SignupAttribution: sanitizeSignupAttribution(req.Attribution),
		CryptoFields:      req.CryptoFields,
	}

	user, err := ah.userService.Create(createUserParams)
	if err != nil {
		JSONError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Create session for the new user.
	session, err := prepareSessionForUser(r, user.ID)
	if err != nil {
		log.Printf("auth: register session initialization failed for %s: %v", user.Email, err)
		JSONError(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Enable auto-test subscription flag when e2e tests request it (non-production only).
	if req.AutoActivateTestSubscription && ah.shouldAllowAutoTestSubscription() {
		middleware.EnableAutoTestSubscriptionFlag(session)
	}

	if err := persistSession(w, r, session); err != nil {
		log.Printf("auth: register session persist failed for %s: %v", user.Email, err)
		JSONError(w, "Failed to save session", http.StatusInternalServerError)
		return
	}

	// Analytics: track user registration.
	if ah.analytics != nil {
		_ = ah.analytics.TrackEvent(r.Context(), "user_registered", map[string]interface{}{"env": ah.config.Environment, "user_id": user.ID})
	}

	// Send welcome email asynchronously (best-effort).
	if ah.email != nil {
		fmt.Printf("auth: dispatching welcome email to %s via configured driver\n", user.Email)
		go func(to, name string, userId string) {
			if err := ah.email.SendWelcomeEmail(context.Background(), to, name); err != nil {
				fmt.Printf("auth: welcome email send failed: %v\n", err)
			} else {
				fmt.Printf("auth: welcome email sent to %s\n", to)
			}
		}(user.Email, deriveUserDisplayName(user.Email), user.ID)
	}

	// Auto-join workspaces for outstanding email invites.
	if ah.workspaceMemberService != nil && ah.emailInviteService != nil {
		invites, err := ah.emailInviteService.GetActiveInvitesForEmail(user.Email)
		if err != nil {
			fmt.Printf("auth: failed to load pending workspace invites for %s: %v\n", user.Email, err)
		} else {
			for _, invite := range invites {
				member, addErr := ah.workspaceMemberService.AddMemberToWorkspace(invite.CreatedBy, invite.WorkspaceID, user.Email, invite.Role)
				if addErr != nil && !errors.Is(addErr, gorm.ErrDuplicatedKey) {
					fmt.Printf("auth: failed to add user %s to workspace %s via pending invite %s: %v\n", user.Email, invite.WorkspaceID, invite.ID, addErr)
					continue
				}
				if markErr := ah.emailInviteService.MarkAccepted(invite.ID, user.ID); markErr != nil {
					fmt.Printf("auth: failed to mark invite %s accepted for %s: %v\n", invite.ID, user.Email, markErr)
				} else if member != nil {
					fmt.Printf("auth: auto-joined %s to workspace %s via pending invite %s\n", user.Email, invite.WorkspaceID, invite.ID)
				}
			}
		}
	}

	response := RegisterResponse{
		Message: "User registered successfully",
		User:    user,
	}

	// For Tauri desktop/mobile apps, include an app token for Bearer auth.
	// These apps store the token in the OS keychain and use it instead of cookies.
	if middleware.IsTauriClient(r) {
		appToken := middleware.GenerateAppToken(user.ID)
		if appToken != "" {
			response.AppToken = appToken
			if ah.appRefreshTokenService != nil {
				refreshToken, err := ah.appRefreshTokenService.Issue(user.ID)
				if err != nil {
					log.Printf("auth: failed to issue refresh token for %s: %v", user.Email, err)
				} else {
					response.RefreshToken = refreshToken
				}
			}
		}
	}

	json.NewEncoder(w).Encode(response)
}

// shouldAllowAutoTestSubscription determines if auto test subscription is allowed based on environment.
func (ah *AuthHandlers) shouldAllowAutoTestSubscription() bool {
	if ah.config == nil {
		return false
	}
	env := strings.TrimSpace(strings.ToLower(ah.config.Environment))
	return env == "test" || env == "dev" || env == "development"
}

// LoginChallenge handles the first step of the 2-step authentication dance.
// It returns the KDF parameters (salt, version) needed for the client to derive keys.
// For non-existent users, it returns a deterministic fake salt to prevent account enumeration.
func (ah *AuthHandlers) LoginChallenge(w http.ResponseWriter, r *http.Request) {
	var req LoginChallengeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Normalize email.
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		JSONError(w, "Email is required", http.StatusBadRequest)
		return
	}

	// Try to find the user.
	user, err := ah.userService.GetByEmail(email)

	var pwSalt string
	var kdfVersion int

	if err == nil && user != nil && user.PwSalt != "" {
		// User exists - return their real salt and protocol version.
		pwSalt = user.PwSalt
		kdfVersion = user.ProtocolVersion
		if kdfVersion == 0 {
			kdfVersion = 1 // Default to version 1 if not set
		}
	} else {
		// User doesn't exist - generate a deterministic fake salt using HMAC.
		// This prevents account enumeration by ensuring the response is identical
		// in timing and format for both existing and non-existing accounts.
		h := hmac.New(sha256.New, []byte(ah.config.CryptoHMACSecret))
		h.Write([]byte(email))
		hash := h.Sum(nil)
		// Take first 16 bytes for the fake salt (same length as real salts).
		pwSalt = hex.EncodeToString(hash[:16])
		kdfVersion = 1 // Always return version 1 for fake responses
	}

	response := LoginChallengeResponse{
		PwSalt:     pwSalt,
		KdfVersion: kdfVersion,
	}

	json.NewEncoder(w).Encode(response)
}

// Login handles user login with E2EE authentication.
// The client sends the derived server_password (NOT the raw password).
// On success, returns the user data and crypto fields needed to decrypt identity keys.
func (ah *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.ServerPassword == "" {
		JSONError(w, "Email and server_password are required", http.StatusBadRequest)
		return
	}

	// Validate server_password format - should be 64 hex chars (32 bytes).
	if len(req.ServerPassword) != 64 {
		JSONError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	user, err := ah.userService.GetByEmail(req.Email)
	if err != nil {
		JSONError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Verify the server_password against the stored bcrypt hash.
	if !user.CheckServerPassword(req.ServerPassword) {
		JSONError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Create session for the authenticated user.
	session, err := middleware.GetSession(r)
	if err != nil {
		log.Printf("auth: login session initialization failed for %s: %v", user.Email, err)
		JSONError(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	err = middleware.AppendUserToSession(session, user.ID)
	if err != nil {
		log.Printf("auth: login session append failed for %s: %v", user.Email, err)
		JSONError(w, "Failed to append user to session", http.StatusInternalServerError)
		return
	}

	if err := middleware.SaveSession(session, r, w); err != nil {
		log.Printf("auth: login session persist failed for %s: %v", user.Email, err)
		JSONError(w, "Failed to save session", http.StatusInternalServerError)
		return
	}

	// Analytics: track user login.
	if ah.analytics != nil {
		_ = ah.analytics.TrackEvent(r.Context(), "user_logged_in", map[string]interface{}{"env": ah.config.Environment, "user_id": user.ID})
	}

	// Return user data with crypto fields for key decryption.
	response := LoginResponseWithCrypto{
		Message:      "Login successful",
		User:         user,
		CryptoFields: user.GetCryptoFieldsResponse(),
	}

	// For Tauri desktop/mobile apps, include an app token for Bearer auth.
	// These apps store the token in the OS keychain and use it instead of cookies
	// (which have cross-origin issues with SSE/EventSource in WebView).
	if middleware.IsTauriClient(r) {
		appToken := middleware.GenerateAppToken(user.ID)
		if appToken != "" {
			response.AppToken = appToken
			if ah.appRefreshTokenService != nil {
				refreshToken, err := ah.appRefreshTokenService.Issue(user.ID)
				if err != nil {
					log.Printf("auth: failed to issue refresh token for %s: %v", user.Email, err)
				} else {
					response.RefreshToken = refreshToken
				}
			}
		}
	}

	json.NewEncoder(w).Encode(response)
}

// RefreshAppToken exchanges a refresh token for a new app token (Tauri only).
func (ah *AuthHandlers) RefreshAppToken(w http.ResponseWriter, r *http.Request) {
	if !middleware.IsTauriClient(r) {
		JSONError(w, "Tauri client required", http.StatusBadRequest)
		return
	}

	var req RefreshTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	trimmedRefreshToken := strings.TrimSpace(req.RefreshToken)
	if trimmedRefreshToken == "" {
		JSONError(w, "refresh_token is required", http.StatusBadRequest)
		return
	}

	// Refresh tokens are hex-encoded 32-byte values (64 hex chars).
	if len(trimmedRefreshToken) != 64 {
		JSONError(w, "Invalid refresh_token format", http.StatusUnauthorized)
		return
	}

	if ah.appRefreshTokenService == nil {
		JSONError(w, "Refresh token service unavailable", http.StatusInternalServerError)
		return
	}

	newRefreshToken, userID, err := ah.appRefreshTokenService.Rotate(trimmedRefreshToken)
	if err != nil {
		JSONError(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

	appToken := middleware.GenerateAppToken(userID)
	if appToken == "" {
		JSONError(w, "Failed to generate app token", http.StatusInternalServerError)
		return
	}

	response := RefreshTokenResponse{
		AppToken:     appToken,
		RefreshToken: newRefreshToken,
	}

	json.NewEncoder(w).Encode(response)
}

// Logout handles user logout, removing the user from the session.
func (ah *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	session, err := middleware.GetSession(r)
	if err != nil {
		log.Printf("auth: logout session retrieval failed: %v", err)
		JSONError(w, "Failed to get session", http.StatusInternalServerError)
		return
	}

	activeAccountId, ok := middleware.GetActiveAccountIdFromContext(r)
	if !ok {
		JSONError(w, "User ID not found in context", http.StatusInternalServerError)
		return
	}

	err = middleware.RemoveUserFromSession(session, activeAccountId.(string))
	if err != nil {
		log.Printf("auth: logout session removal failed for %v: %v", activeAccountId, err)
		JSONError(w, "Failed to remove user from session", http.StatusInternalServerError)
		return
	}

	if err := middleware.SaveSession(session, r, w); err != nil {
		log.Printf("auth: logout session persist failed for %v: %v", activeAccountId, err)
		JSONError(w, "Failed to clear session", http.StatusInternalServerError)
		return
	}

	response := SuccessResponse{
		Message: "Logout successful",
	}

	json.NewEncoder(w).Encode(response)
}

// LogoutAll handles clearing all authenticated accounts from the session.
func (ah *AuthHandlers) LogoutAll(w http.ResponseWriter, r *http.Request) {
	session, err := middleware.GetSession(r)
	if err != nil {
		log.Printf("auth: logout-all session retrieval failed: %v", err)
		JSONError(w, "Failed to get session", http.StatusInternalServerError)
		return
	}

	accounts := middleware.GetAccountsFromContext(r)
	if len(accounts) == 0 {
		JSONError(w, "No accounts found in session", http.StatusUnauthorized)
		return
	}

	// Clear all session data and expire the cookie.
	session.Values = make(map[interface{}]interface{})
	session.Options.MaxAge = -1

	if err := middleware.SaveSession(session, r, w); err != nil {
		log.Printf("auth: logout-all session persist failed: %v", err)
		JSONError(w, "Failed to clear session", http.StatusInternalServerError)
		return
	}

	response := SuccessResponse{
		Message: "Logout all successful",
	}

	json.NewEncoder(w).Encode(response)
}

// GetCurrentUser returns the current authenticated user's profile.
func (ah *AuthHandlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	activeAccountId, ok := middleware.GetActiveAccountIdFromContext(r)
	if !ok {
		JSONError(w, "User ID not found in context", http.StatusInternalServerError)
		return
	}

	activeAccountIdStr, ok := activeAccountId.(string)
	if !ok {
		JSONError(w, "Invalid user ID type", http.StatusInternalServerError)
		return
	}

	user, err := ah.userService.GetByID(activeAccountIdStr)
	if err != nil {
		JSONError(w, "User not found", http.StatusNotFound)
		return
	}

	response := SuccessResponse{
		User: user,
	}

	json.NewEncoder(w).Encode(response)
}

// ForgotPassword handles password reset initiation by sending a reset email.
func (ah *AuthHandlers) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	fmt.Printf("auth: forgot-password request received email=%s\n", email)

	// Always return success to avoid account enumeration.
	if email == "" || !isValidEmail(email) {
		JSONResponse(w, struct {
			Message string `json:"message"`
		}{Message: "If that email exists, we'll send instructions."}, http.StatusOK)
		return
	}

	// 30-minute expiry for password reset tokens.
	tokenID, rawToken, user, err := ah.passwordResets.GenerateTokenForEmail(email, 30*time.Minute)
	if err != nil {
		fmt.Printf("auth: error generating password reset token email=%s err=%v\n", email, err)
		JSONResponse(w, struct {
			Message string `json:"message"`
		}{Message: "If that email exists, we'll send instructions."}, http.StatusOK)
		return
	}

	if user == nil {
		fmt.Printf("auth: no user matched for password reset request email=%s\n", email)
	}

	if user != nil && ah.email != nil {
		fmt.Printf("email: sending password reset driver=%s to=%s tokenId=%s\n", ah.config.EmailDriver, user.Email, tokenID)
		go func(to string, id string, token string) {
			if err := ah.email.SendPasswordResetEmail(context.Background(), to, id, token); err != nil {
				fmt.Printf("email: password reset send failed to=%s tokenId=%s err=%v\n", to, id, err)
			} else {
				fmt.Printf("email: password reset send successful to=%s tokenId=%s\n", to, id)
			}
		}(user.Email, tokenID, rawToken)
	} else if user != nil && ah.email == nil {
		fmt.Printf("email: service not configured; skipping password reset send to=%s tokenId=%s\n", user.Email, tokenID)
	}

	// In development, return the token for testing.
	if ah.config != nil && ah.config.IsDevelopment() && user != nil && tokenID != "" && rawToken != "" {
		JSONResponse(w, struct {
			Message string `json:"message"`
			TokenID string `json:"token_id"`
			Token   string `json:"token"`
		}{Message: "If that email exists, we'll send instructions.", TokenID: tokenID, Token: rawToken}, http.StatusOK)
		return
	}

	JSONResponse(w, struct {
		Message string `json:"message"`
	}{Message: "If that email exists, we'll send instructions."}, http.StatusOK)
}

// ResetPassword verifies the token and updates the user's password.
func (ah *AuthHandlers) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	req.TokenID = strings.TrimSpace(req.TokenID)
	req.Token = strings.TrimSpace(req.Token)
	serverPassword := strings.TrimSpace(req.ServerPassword)

	if req.TokenID == "" || req.Token == "" || serverPassword == "" {
		JSONError(w, "Missing fields", http.StatusBadRequest)
		return
	}
	if len(serverPassword) < 6 {
		JSONError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}
	if err := validateUserCryptoFieldsPayload(req.CryptoFields); err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	user, err := ah.passwordResets.VerifyAndConsume(req.TokenID, req.Token)
	if err != nil || user == nil {
		JSONError(w, "Invalid or expired token", http.StatusBadRequest)
		return
	}

	if err := validateCryptoFieldsMatchUser(req.CryptoFields, user); err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := ah.userService.UpdateServerPasswordAndCryptoFields(user.ID, serverPassword, req.CryptoFields); err != nil {
		JSONError(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	JSONResponse(w, struct {
		Message string `json:"message"`
	}{Message: "Password updated"}, http.StatusOK)
}

// ChangePassword updates the authenticated user's password after verifying the current password.
func (ah *AuthHandlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	activeAccountId, ok := middleware.GetActiveAccountIdFromContext(r)
	if !ok {
		JSONError(w, "User ID not found in context", http.StatusInternalServerError)
		return
	}

	userID, ok := activeAccountId.(string)
	if !ok || strings.TrimSpace(userID) == "" {
		JSONError(w, "Invalid user ID type", http.StatusInternalServerError)
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	currentPassword := strings.TrimSpace(req.CurrentPassword)
	newPassword := strings.TrimSpace(req.NewPassword)

	if currentPassword == "" || newPassword == "" {
		JSONError(w, "Current and new password are required", http.StatusBadRequest)
		return
	}
	if len(newPassword) < 6 {
		JSONError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}
	if currentPassword == newPassword {
		JSONError(w, "New password must differ from current password", http.StatusBadRequest)
		return
	}

	user, err := ah.userService.GetByID(userID)
	if err != nil {
		JSONErrorWithErr(w, "User not found", err, http.StatusNotFound)
		return
	}

	if !user.CheckServerPassword(currentPassword) {
		JSONError(w, "Current password is incorrect", http.StatusUnauthorized)
		return
	}

	if err := validateUserCryptoFieldsPayload(req.CryptoFields); err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := validateCryptoFieldsMatchUser(req.CryptoFields, user); err != nil {
		JSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := ah.userService.UpdateServerPasswordAndCryptoFields(user.ID, newPassword, req.CryptoFields); err != nil {
		JSONErrorWithErr(w, "Failed to update password", err, http.StatusInternalServerError)
		return
	}

	// Analytics: track password change.
	if ah.analytics != nil {
		_ = ah.analytics.TrackEvent(r.Context(), "user_changed_password", map[string]interface{}{"env": ah.config.Environment, "user_id": user.ID})
	}

	JSONResponse(w, struct {
		Message string `json:"message"`
	}{Message: "Password updated"}, http.StatusOK)
}

// validateUserCryptoFieldsPayload ensures the request includes all required crypto fields.
// These fields are needed to re-encrypt the identity key bundle after password changes/resets.
func validateUserCryptoFieldsPayload(fields *models.UserCryptoFields) error {
	if fields == nil {
		return errors.New("crypto fields are required")
	}
	if strings.TrimSpace(fields.CryptoBundleID) == "" {
		return errors.New("crypto_bundle_id is required")
	}
	if fields.ProtocolVersion <= 0 {
		return errors.New("protocol_version is required")
	}
	if strings.TrimSpace(fields.PwSalt) == "" {
		return errors.New("pw_salt is required")
	}
	if strings.TrimSpace(fields.EncKeyBundleNonce) == "" {
		return errors.New("enc_key_bundle_nonce is required")
	}
	if strings.TrimSpace(fields.EncKeyBundle) == "" {
		return errors.New("enc_key_bundle is required")
	}
	if strings.TrimSpace(fields.BoxPublicKey) == "" {
		return errors.New("box_public_key is required")
	}
	if strings.TrimSpace(fields.SignPublicKey) == "" {
		return errors.New("sign_public_key is required")
	}
	return nil
}

// validateCryptoFieldsMatchUser ensures password updates do not rotate identity keys.
func validateCryptoFieldsMatchUser(fields *models.UserCryptoFields, user *models.User) error {
	if fields == nil || user == nil {
		return errors.New("crypto fields and user are required")
	}
	if fields.BoxPublicKey != user.BoxPublicKey {
		return errors.New("box_public_key does not match existing identity key")
	}
	if fields.SignPublicKey != user.SignPublicKey {
		return errors.New("sign_public_key does not match existing identity key")
	}
	return nil
}
