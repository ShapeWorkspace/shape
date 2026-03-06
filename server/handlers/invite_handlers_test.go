package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const (
	testInviteHandlersSessionSecret  = "test-invite-handlers-session-secret"
	testInviteHandlersAppTokenSecret = "test-invite-handlers-app-token-secret"
)

type inviteHandlersSubscriptionStub struct {
	writableErr           error
	seatCapacityErr       error
	inviteReservationErr  error
	selfHostedEnabledFlag bool
}

func (s *inviteHandlersSubscriptionStub) EnsureSeatCapacity(workspaceID string, seatsToAdd int) error {
	return s.seatCapacityErr
}

func (s *inviteHandlersSubscriptionStub) EnsureSeatCapacityForInviteReservation(workspaceID string, seatsToAdd int) error {
	return s.inviteReservationErr
}

func (s *inviteHandlersSubscriptionStub) EnsureWorkspaceWritable(workspaceID string) error {
	return s.writableErr
}

func (s *inviteHandlersSubscriptionStub) HasActiveSubscription(workspaceID string) (bool, error) {
	return true, nil
}

func (s *inviteHandlersSubscriptionStub) SelfHostedEnabled() bool {
	return s.selfHostedEnabledFlag
}

func (s *inviteHandlersSubscriptionStub) EnsureSelfHostedSubscription(workspaceID string) (*models.WorkspaceSubscriptionSnapshot, error) {
	return nil, nil
}

func setupInviteHandlersTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()

	dbName := strings.ReplaceAll(t.Name(), "/", "_")
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", dbName)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to create invite handlers test database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.WorkspaceInvite{},
		&models.Team{},
		&models.TeamMember{},
	); err != nil {
		t.Fatalf("failed to migrate invite handlers test database: %v", err)
	}

	return db
}

func buildInviteHandlersForTesting(
	db *gorm.DB,
	inviteSubscriptions models.WorkspaceSubscriptionServiceInterface,
	memberSubscriptions models.WorkspaceSubscriptionServiceInterface,
) (*InviteHandlers, *models.InviteService) {
	workspaceChecker := services.NewWorkspaceChecker(db)
	userService := models.NewUserService(db)
	inviteService := models.NewInviteService(db, workspaceChecker, inviteSubscriptions)
	workspaceMemberService := models.NewWorkspaceMemberService(
		db,
		userService,
		workspaceChecker,
		memberSubscriptions,
		nil,
		nil,
	)
	workspaceService := models.NewWorkspaceService(db)

	return NewInviteHandlers(
		inviteService,
		nil,
		workspaceMemberService,
		workspaceService,
		userService,
	), inviteService
}

func createInviteHandlersTestUser(t *testing.T, db *gorm.DB, userID, email string) {
	t.Helper()

	user := models.User{
		ID:             userID,
		Email:          email,
		ServerPassword: "server-password-hash",
		UserType:       models.UserTypeHuman,
		BoxPublicKey:   "test-box-public-key",
		SignPublicKey:  "test-sign-public-key",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
}

func createInviteHandlersTestWorkspace(t *testing.T, db *gorm.DB, workspaceID string) {
	t.Helper()

	workspace := models.Workspace{
		ID:                  workspaceID,
		Name:                "Invite Test Workspace",
		Subdomain:           fmt.Sprintf("invite-%s", strings.ReplaceAll(workspaceID, "-", "")),
		OnboardingCompleted: true,
	}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatalf("failed to create test workspace: %v", err)
	}
}

func createInviteHandlersTestMembership(
	t *testing.T,
	db *gorm.DB,
	workspaceID, userID string,
	role models.WorkspaceMemberRole,
) {
	t.Helper()

	now := time.Now().UTC()
	member := models.WorkspaceMember{
		ID:                uuid.NewString(),
		WorkspaceID:       workspaceID,
		UserID:            userID,
		Role:              role,
		ChainRootKeyID:    "00000000-0000-0000-0000-000000000000",
		WrappingKeyID:     "00000000-0000-0000-0000-000000000000",
		WrappingKeyType:   "workspace",
		EntityKeyNonce:    "",
		WrappedEntityKey:  "",
		ContentNonce:      "",
		ContentCiphertext: "NEEDS_SETUP",
		ContentHash:       "",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("failed to create test workspace membership: %v", err)
	}
}

func performAuthedInviteHandlerRequest(
	t *testing.T,
	handler http.HandlerFunc,
	userID string,
	request *http.Request,
) *httptest.ResponseRecorder {
	t.Helper()

	middleware.InitSessionStore(testInviteHandlersSessionSecret, true, "")
	middleware.InitAppTokenAuth(testInviteHandlersAppTokenSecret)

	appToken := middleware.GenerateAppToken(userID)
	if strings.TrimSpace(appToken) == "" {
		t.Fatalf("expected non-empty app token")
	}

	request.Header.Set("Authorization", "Bearer "+appToken)
	request.Header.Set(middleware.ActiveAccountHeader, userID)
	if request.Header.Get("Content-Type") == "" {
		request.Header.Set("Content-Type", "application/json")
	}

	recorder := httptest.NewRecorder()
	middleware.RequireAuth(handler).ServeHTTP(recorder, request)
	return recorder
}

func decodeInviteHandlersJSONResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode invite handlers json response: %v", err)
	}
	return payload
}

func TestInviteHandlersCreateWorkspaceInvite_SeatReservationRequired(t *testing.T) {
	db := setupInviteHandlersTestDatabase(t)

	adminUserID := uuid.NewString()
	workspaceID := uuid.NewString()
	createInviteHandlersTestUser(t, db, adminUserID, "admin@example.com")
	createInviteHandlersTestWorkspace(t, db, workspaceID)
	createInviteHandlersTestMembership(t, db, workspaceID, adminUserID, models.WorkspaceMemberRoleAdmin)

	inviteSubscriptions := &inviteHandlersSubscriptionStub{
		inviteReservationErr: models.ErrSeatLimitReached,
	}
	inviteHandlers, _ := buildInviteHandlersForTesting(db, inviteSubscriptions, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/workspaces/%s/invites", workspaceID),
		bytes.NewBufferString(`{"role":"member"}`),
	)
	request = mux.SetURLVars(request, map[string]string{"workspaceId": workspaceID})

	recorder := performAuthedInviteHandlerRequest(t, inviteHandlers.CreateWorkspaceInvite, adminUserID, request)
	if recorder.Code != http.StatusPaymentRequired {
		t.Fatalf("expected status 402, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var inviteCount int64
	if err := db.Model(&models.WorkspaceInvite{}).Where("workspace_id = ?", workspaceID).Count(&inviteCount).Error; err != nil {
		t.Fatalf("failed to count invites: %v", err)
	}
	if inviteCount != 0 {
		t.Fatalf("expected no invite persisted on seat-limit failure, got %d", inviteCount)
	}
}

func TestInviteHandlersGetAndRevokeWorkspaceInvites(t *testing.T) {
	db := setupInviteHandlersTestDatabase(t)

	adminUserID := uuid.NewString()
	memberUserID := uuid.NewString()
	workspaceID := uuid.NewString()

	createInviteHandlersTestUser(t, db, adminUserID, "admin@example.com")
	createInviteHandlersTestUser(t, db, memberUserID, "member@example.com")
	createInviteHandlersTestWorkspace(t, db, workspaceID)
	createInviteHandlersTestMembership(t, db, workspaceID, adminUserID, models.WorkspaceMemberRoleAdmin)
	createInviteHandlersTestMembership(t, db, workspaceID, memberUserID, models.WorkspaceMemberRoleMember)

	inviteHandlers, inviteService := buildInviteHandlersForTesting(db, nil, nil)

	activeInvite, err := inviteService.CreateWorkspaceInvite(models.CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   adminUserID,
	})
	if err != nil {
		t.Fatalf("failed to create active invite: %v", err)
	}

	revokedInvite, err := inviteService.CreateWorkspaceInvite(models.CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   adminUserID,
	})
	if err != nil {
		t.Fatalf("failed to create revoked invite: %v", err)
	}
	if err := inviteService.RevokeInvite(workspaceID, revokedInvite.ID); err != nil {
		t.Fatalf("failed to revoke invite: %v", err)
	}

	listRequest := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/workspaces/%s/invites", workspaceID), nil)
	listRequest = mux.SetURLVars(listRequest, map[string]string{"workspaceId": workspaceID})
	listRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.GetWorkspaceInvites, adminUserID, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", listRecorder.Code, listRecorder.Body.String())
	}

	listPayload := decodeInviteHandlersJSONResponse(t, listRecorder)
	rawInvites, ok := listPayload["invites"].([]any)
	if !ok {
		t.Fatalf("expected invites array in response payload")
	}
	if len(rawInvites) != 1 {
		t.Fatalf("expected exactly one active invite, got %d", len(rawInvites))
	}

	firstInvite, ok := rawInvites[0].(map[string]any)
	if !ok {
		t.Fatalf("expected invite object in response payload")
	}
	tokenValue, ok := firstInvite["token"].(string)
	if !ok {
		t.Fatalf("expected token field in invite payload")
	}
	if tokenValue != activeInvite.ID {
		t.Fatalf("expected active invite token %s, got %s", activeInvite.ID, tokenValue)
	}

	memberListRequest := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/workspaces/%s/invites", workspaceID), nil)
	memberListRequest = mux.SetURLVars(memberListRequest, map[string]string{"workspaceId": workspaceID})
	memberListRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.GetWorkspaceInvites, memberUserID, memberListRequest)
	if memberListRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for non-admin list, got %d: %s", memberListRecorder.Code, memberListRecorder.Body.String())
	}

	revokeRequest := httptest.NewRequest(
		http.MethodDelete,
		fmt.Sprintf("/api/workspaces/%s/invites/%s", workspaceID, activeInvite.ID),
		nil,
	)
	revokeRequest = mux.SetURLVars(revokeRequest, map[string]string{
		"workspaceId": workspaceID,
		"inviteId":    activeInvite.ID,
	})
	revokeRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.RevokeWorkspaceInvite, adminUserID, revokeRequest)
	if revokeRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d: %s", revokeRecorder.Code, revokeRecorder.Body.String())
	}

	revokeAgainRequest := httptest.NewRequest(
		http.MethodDelete,
		fmt.Sprintf("/api/workspaces/%s/invites/%s", workspaceID, activeInvite.ID),
		nil,
	)
	revokeAgainRequest = mux.SetURLVars(revokeAgainRequest, map[string]string{
		"workspaceId": workspaceID,
		"inviteId":    activeInvite.ID,
	})
	revokeAgainRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.RevokeWorkspaceInvite, adminUserID, revokeAgainRequest)
	if revokeAgainRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404 for already-revoked invite, got %d: %s", revokeAgainRecorder.Code, revokeAgainRecorder.Body.String())
	}
}

func TestInviteHandlersAcceptInvite_SingleUseAcrossUsers(t *testing.T) {
	db := setupInviteHandlersTestDatabase(t)

	adminUserID := uuid.NewString()
	firstInviteeID := uuid.NewString()
	secondInviteeID := uuid.NewString()
	workspaceID := uuid.NewString()

	createInviteHandlersTestUser(t, db, adminUserID, "admin@example.com")
	createInviteHandlersTestUser(t, db, firstInviteeID, "first@example.com")
	createInviteHandlersTestUser(t, db, secondInviteeID, "second@example.com")
	createInviteHandlersTestWorkspace(t, db, workspaceID)
	createInviteHandlersTestMembership(t, db, workspaceID, adminUserID, models.WorkspaceMemberRoleAdmin)

	inviteHandlers, inviteService := buildInviteHandlersForTesting(db, nil, nil)

	invite, err := inviteService.CreateWorkspaceInvite(models.CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   adminUserID,
	})
	if err != nil {
		t.Fatalf("failed to create invite: %v", err)
	}

	firstAcceptRequest := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/invites/%s/accept", invite.ID),
		bytes.NewBufferString(`{}`),
	)
	firstAcceptRequest = mux.SetURLVars(firstAcceptRequest, map[string]string{"token": invite.ID})
	firstAcceptRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.AcceptInvite, firstInviteeID, firstAcceptRequest)
	if firstAcceptRecorder.Code != http.StatusOK {
		t.Fatalf("expected first accept to return 200, got %d: %s", firstAcceptRecorder.Code, firstAcceptRecorder.Body.String())
	}

	var firstInviteeMemberCount int64
	if err := db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ? AND user_id = ?", workspaceID, firstInviteeID).
		Count(&firstInviteeMemberCount).Error; err != nil {
		t.Fatalf("failed to count first invitee membership: %v", err)
	}
	if firstInviteeMemberCount != 1 {
		t.Fatalf("expected first invitee to be added to workspace, got membership count %d", firstInviteeMemberCount)
	}

	secondAcceptRequest := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/invites/%s/accept", invite.ID),
		bytes.NewBufferString(`{}`),
	)
	secondAcceptRequest = mux.SetURLVars(secondAcceptRequest, map[string]string{"token": invite.ID})
	secondAcceptRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.AcceptInvite, secondInviteeID, secondAcceptRequest)
	if secondAcceptRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected second accept to return 404, got %d: %s", secondAcceptRecorder.Code, secondAcceptRecorder.Body.String())
	}

	var secondInviteeMemberCount int64
	if err := db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ? AND user_id = ?", workspaceID, secondInviteeID).
		Count(&secondInviteeMemberCount).Error; err != nil {
		t.Fatalf("failed to count second invitee membership: %v", err)
	}
	if secondInviteeMemberCount != 0 {
		t.Fatalf("expected second invitee to remain outside workspace, got membership count %d", secondInviteeMemberCount)
	}
}

func TestInviteHandlersAcceptInvite_ReopensTokenOnSeatFailure(t *testing.T) {
	db := setupInviteHandlersTestDatabase(t)

	adminUserID := uuid.NewString()
	inviteeID := uuid.NewString()
	workspaceID := uuid.NewString()

	createInviteHandlersTestUser(t, db, adminUserID, "admin@example.com")
	createInviteHandlersTestUser(t, db, inviteeID, "invitee@example.com")
	createInviteHandlersTestWorkspace(t, db, workspaceID)
	createInviteHandlersTestMembership(t, db, workspaceID, adminUserID, models.WorkspaceMemberRoleAdmin)

	memberSubscriptions := &inviteHandlersSubscriptionStub{
		seatCapacityErr: models.ErrSeatLimitReached,
	}
	inviteHandlers, inviteService := buildInviteHandlersForTesting(db, nil, memberSubscriptions)

	invite, err := inviteService.CreateWorkspaceInvite(models.CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   adminUserID,
	})
	if err != nil {
		t.Fatalf("failed to create invite: %v", err)
	}

	acceptRequest := httptest.NewRequest(
		http.MethodPost,
		fmt.Sprintf("/api/invites/%s/accept", invite.ID),
		bytes.NewBufferString(`{}`),
	)
	acceptRequest = mux.SetURLVars(acceptRequest, map[string]string{"token": invite.ID})
	acceptRecorder := performAuthedInviteHandlerRequest(t, inviteHandlers.AcceptInvite, inviteeID, acceptRequest)
	if acceptRecorder.Code != http.StatusPaymentRequired {
		t.Fatalf("expected status 402 on seat failure, got %d: %s", acceptRecorder.Code, acceptRecorder.Body.String())
	}

	if _, err := inviteService.GetActiveInviteByToken(invite.ID); err != nil {
		t.Fatalf("expected invite to be reopened after seat failure, got %v", err)
	}

	reloadedInvite, err := inviteService.GetInviteByToken(invite.ID)
	if err != nil {
		t.Fatalf("failed to reload invite: %v", err)
	}
	if reloadedInvite.AcceptedAt != nil {
		t.Fatalf("expected reopened invite to have nil accepted_at")
	}
	if reloadedInvite.AcceptedBy != nil {
		t.Fatalf("expected reopened invite to have nil accepted_by")
	}
}
