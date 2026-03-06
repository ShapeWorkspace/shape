package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"shape/config"
	"shape/middleware"
	"shape/models"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	testAuthHandlersSessionSecret  = "test-session-secret"
	testAuthHandlersAppTokenSecret = "test-app-token-secret"
)

func setupAuthHandlersTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()

	databaseConnection, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to create auth handlers test database: %v", err)
	}

	if err := databaseConnection.AutoMigrate(&models.User{}, &models.AppRefreshToken{}); err != nil {
		t.Fatalf("failed to migrate auth handlers test database: %v", err)
	}

	return databaseConnection
}

func buildAuthHandlersForTesting(t *testing.T) (*AuthHandlers, *models.UserService) {
	t.Helper()

	middleware.InitSessionStore(testAuthHandlersSessionSecret, true, "")
	middleware.InitAppTokenAuth(testAuthHandlersAppTokenSecret)

	databaseConnection := setupAuthHandlersTestDatabase(t)
	userService := models.NewUserService(databaseConnection)
	appRefreshTokenService := models.NewAppRefreshTokenService(databaseConnection)

	testConfig := &config.Config{
		Environment:       "test",
		CryptoHMACSecret:  "test-hmac-secret",
		RequireInviteCode: false,
	}

	authHandlers := NewAuthHandlers(
		userService,
		nil,
		nil,
		nil,
		nil,
		appRefreshTokenService,
		nil,
		testConfig,
		nil,
		nil,
	)

	return authHandlers, userService
}

func buildValidRegisterRequestPayload(email string) RegisterRequest {
	return RegisterRequest{
		UserID:         uuid.NewString(),
		Email:          email,
		ServerPassword: strings.Repeat("a", 64),
		CryptoFields: &models.UserCryptoFields{
			CryptoBundleID:    uuid.NewString(),
			ProtocolVersion:   1,
			PwSalt:            strings.Repeat("b", 32),
			EncKeyBundleNonce: strings.Repeat("c", 48),
			EncKeyBundle:      "dGVzdA==",
			BoxPublicKey:      strings.Repeat("d", 64),
			SignPublicKey:     strings.Repeat("e", 64),
		},
	}
}

func decodeAuthHandlerJSONResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode auth handler JSON response: %v", err)
	}
	return payload
}

func TestAuthHandlersRegister_AppTokenReturnedOnlyForTauri(t *testing.T) {
	authHandlers, _ := buildAuthHandlersForTesting(t)

	t.Run("non-tauri registration does not include app token", func(t *testing.T) {
		registerPayload := buildValidRegisterRequestPayload("register-nontauri@example.com")
		bodyBytes, err := json.Marshal(registerPayload)
		if err != nil {
			t.Fatalf("failed to marshal register payload: %v", err)
		}

		request := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()

		authHandlers.Register(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected register status 200, got %d: %s", recorder.Code, recorder.Body.String())
		}

		responsePayload := decodeAuthHandlerJSONResponse(t, recorder)
		if _, ok := responsePayload["app_token"]; ok {
			t.Fatalf("expected register response to omit app_token for non-tauri requests")
		}
		if _, ok := responsePayload["refresh_token"]; ok {
			t.Fatalf("expected register response to omit refresh_token for non-tauri requests")
		}
	})

	t.Run("tauri registration includes app token", func(t *testing.T) {
		registerPayload := buildValidRegisterRequestPayload("register-tauri@example.com")
		bodyBytes, err := json.Marshal(registerPayload)
		if err != nil {
			t.Fatalf("failed to marshal register payload: %v", err)
		}

		request := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Client-Type", "tauri")
		recorder := httptest.NewRecorder()

		authHandlers.Register(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected register status 200, got %d: %s", recorder.Code, recorder.Body.String())
		}

		responsePayload := decodeAuthHandlerJSONResponse(t, recorder)
		rawAppToken, ok := responsePayload["app_token"]
		if !ok {
			t.Fatalf("expected register response to include app_token for tauri requests")
		}
		appToken, ok := rawAppToken.(string)
		if !ok || strings.TrimSpace(appToken) == "" {
			t.Fatalf("expected register app_token to be a non-empty string")
		}

		rawRefreshToken, ok := responsePayload["refresh_token"]
		if !ok {
			t.Fatalf("expected register response to include refresh_token for tauri requests")
		}
		refreshToken, ok := rawRefreshToken.(string)
		if !ok || strings.TrimSpace(refreshToken) == "" {
			t.Fatalf("expected register refresh_token to be a non-empty string")
		}
	})
}

func TestAuthHandlersRegister_IgnoresInviteCodeGateDuringOpenSignupRollout(t *testing.T) {
	authHandlers, _ := buildAuthHandlersForTesting(t)
	authHandlers.config.RequireInviteCode = true

	registerPayload := buildValidRegisterRequestPayload("register-open-signup@example.com")
	bodyBytes, err := json.Marshal(registerPayload)
	if err != nil {
		t.Fatalf("failed to marshal register payload: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(bodyBytes))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	authHandlers.Register(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected open-signup register status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestAuthHandlersLogin_AppTokenReturnedOnlyForTauri(t *testing.T) {
	authHandlers, userService := buildAuthHandlersForTesting(t)

	loginEmail := "login-user@example.com"
	loginServerPassword := strings.Repeat("f", 64)

	_, err := userService.Create(models.CreateUserParams{
		ID:             uuid.NewString(),
		Email:          loginEmail,
		ServerPassword: loginServerPassword,
		CryptoFields: &models.UserCryptoFields{
			CryptoBundleID:    uuid.NewString(),
			ProtocolVersion:   1,
			PwSalt:            strings.Repeat("1", 32),
			EncKeyBundleNonce: strings.Repeat("2", 48),
			EncKeyBundle:      "dGVzdA==",
			BoxPublicKey:      strings.Repeat("3", 64),
			SignPublicKey:     strings.Repeat("4", 64),
		},
	})
	if err != nil {
		t.Fatalf("failed to create test user for login: %v", err)
	}

	t.Run("non-tauri login does not include app token", func(t *testing.T) {
		loginPayload := LoginRequest{
			Email:          loginEmail,
			ServerPassword: loginServerPassword,
		}
		bodyBytes, err := json.Marshal(loginPayload)
		if err != nil {
			t.Fatalf("failed to marshal login payload: %v", err)
		}

		request := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()

		authHandlers.Login(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected login status 200, got %d: %s", recorder.Code, recorder.Body.String())
		}

		responsePayload := decodeAuthHandlerJSONResponse(t, recorder)
		if _, ok := responsePayload["app_token"]; ok {
			t.Fatalf("expected login response to omit app_token for non-tauri requests")
		}
		if _, ok := responsePayload["refresh_token"]; ok {
			t.Fatalf("expected login response to omit refresh_token for non-tauri requests")
		}
	})

	t.Run("tauri login includes app token", func(t *testing.T) {
		loginPayload := LoginRequest{
			Email:          loginEmail,
			ServerPassword: loginServerPassword,
		}
		bodyBytes, err := json.Marshal(loginPayload)
		if err != nil {
			t.Fatalf("failed to marshal login payload: %v", err)
		}

		request := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(bodyBytes))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Client-Type", "tauri")
		recorder := httptest.NewRecorder()

		authHandlers.Login(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected login status 200, got %d: %s", recorder.Code, recorder.Body.String())
		}

		responsePayload := decodeAuthHandlerJSONResponse(t, recorder)
		rawAppToken, ok := responsePayload["app_token"]
		if !ok {
			t.Fatalf("expected login response to include app_token for tauri requests")
		}
		appToken, ok := rawAppToken.(string)
		if !ok || strings.TrimSpace(appToken) == "" {
			t.Fatalf("expected login app_token to be a non-empty string")
		}

		rawRefreshToken, ok := responsePayload["refresh_token"]
		if !ok {
			t.Fatalf("expected login response to include refresh_token for tauri requests")
		}
		refreshToken, ok := rawRefreshToken.(string)
		if !ok || strings.TrimSpace(refreshToken) == "" {
			t.Fatalf("expected login refresh_token to be a non-empty string")
		}
	})
}

func TestAuthHandlersRefresh_AppTokenRotationForTauri(t *testing.T) {
	authHandlers, _ := buildAuthHandlersForTesting(t)

	registerPayload := buildValidRegisterRequestPayload("refresh-rotation@example.com")
	registerBody, err := json.Marshal(registerPayload)
	if err != nil {
		t.Fatalf("failed to marshal register payload: %v", err)
	}

	registerRequest := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(registerBody))
	registerRequest.Header.Set("Content-Type", "application/json")
	registerRequest.Header.Set("X-Client-Type", "tauri")
	registerRecorder := httptest.NewRecorder()

	authHandlers.Register(registerRecorder, registerRequest)

	if registerRecorder.Code != http.StatusOK {
		t.Fatalf("expected register status 200, got %d: %s", registerRecorder.Code, registerRecorder.Body.String())
	}

	registerResponse := decodeAuthHandlerJSONResponse(t, registerRecorder)
	rawRefreshToken, ok := registerResponse["refresh_token"]
	if !ok {
		t.Fatalf("expected refresh_token in register response")
	}
	refreshToken, ok := rawRefreshToken.(string)
	if !ok || strings.TrimSpace(refreshToken) == "" {
		t.Fatalf("expected refresh_token to be a non-empty string")
	}

	refreshBody, err := json.Marshal(RefreshTokenRequest{RefreshToken: refreshToken})
	if err != nil {
		t.Fatalf("failed to marshal refresh payload: %v", err)
	}

	refreshRequest := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader(refreshBody))
	refreshRequest.Header.Set("Content-Type", "application/json")
	refreshRequest.Header.Set("X-Client-Type", "tauri")
	refreshRecorder := httptest.NewRecorder()

	authHandlers.RefreshAppToken(refreshRecorder, refreshRequest)

	if refreshRecorder.Code != http.StatusOK {
		t.Fatalf("expected refresh status 200, got %d: %s", refreshRecorder.Code, refreshRecorder.Body.String())
	}

	refreshResponse := decodeAuthHandlerJSONResponse(t, refreshRecorder)
	newAppToken, ok := refreshResponse["app_token"].(string)
	if !ok || strings.TrimSpace(newAppToken) == "" {
		t.Fatalf("expected refreshed app_token to be a non-empty string")
	}
	newRefreshToken, ok := refreshResponse["refresh_token"].(string)
	if !ok || strings.TrimSpace(newRefreshToken) == "" {
		t.Fatalf("expected refreshed refresh_token to be a non-empty string")
	}
	if newRefreshToken == refreshToken {
		t.Fatalf("expected refresh token rotation to return a new token")
	}

	// Old refresh token should no longer be usable after rotation.
	oldRefreshBody, err := json.Marshal(RefreshTokenRequest{RefreshToken: refreshToken})
	if err != nil {
		t.Fatalf("failed to marshal refresh payload: %v", err)
	}
	oldRefreshRequest := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader(oldRefreshBody))
	oldRefreshRequest.Header.Set("Content-Type", "application/json")
	oldRefreshRequest.Header.Set("X-Client-Type", "tauri")
	oldRefreshRecorder := httptest.NewRecorder()

	authHandlers.RefreshAppToken(oldRefreshRecorder, oldRefreshRequest)

	if oldRefreshRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected refresh with old token to return 401, got %d", oldRefreshRecorder.Code)
	}
}

func TestAuthHandlersRefresh_RejectsNonTauriRequests(t *testing.T) {
	authHandlers, _ := buildAuthHandlersForTesting(t)

	registerPayload := buildValidRegisterRequestPayload("refresh-nontauri@example.com")
	registerBody, err := json.Marshal(registerPayload)
	if err != nil {
		t.Fatalf("failed to marshal register payload: %v", err)
	}

	registerRequest := httptest.NewRequest(http.MethodPost, "/auth/register", bytes.NewReader(registerBody))
	registerRequest.Header.Set("Content-Type", "application/json")
	registerRequest.Header.Set("X-Client-Type", "tauri")
	registerRecorder := httptest.NewRecorder()

	authHandlers.Register(registerRecorder, registerRequest)

	if registerRecorder.Code != http.StatusOK {
		t.Fatalf("expected register status 200, got %d: %s", registerRecorder.Code, registerRecorder.Body.String())
	}

	registerResponse := decodeAuthHandlerJSONResponse(t, registerRecorder)
	rawRefreshToken, ok := registerResponse["refresh_token"]
	if !ok {
		t.Fatalf("expected refresh_token in register response")
	}
	refreshToken, ok := rawRefreshToken.(string)
	if !ok || strings.TrimSpace(refreshToken) == "" {
		t.Fatalf("expected refresh_token to be a non-empty string")
	}

	refreshBody, err := json.Marshal(RefreshTokenRequest{RefreshToken: refreshToken})
	if err != nil {
		t.Fatalf("failed to marshal refresh payload: %v", err)
	}

	refreshRequest := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewReader(refreshBody))
	refreshRequest.Header.Set("Content-Type", "application/json")
	refreshRecorder := httptest.NewRecorder()

	authHandlers.RefreshAppToken(refreshRecorder, refreshRequest)

	if refreshRecorder.Code != http.StatusBadRequest {
		t.Fatalf("expected non-tauri refresh to return 400, got %d: %s", refreshRecorder.Code, refreshRecorder.Body.String())
	}
}
