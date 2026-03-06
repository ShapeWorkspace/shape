package services

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"shape/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const (
	testWorkspaceID = "00000000-0000-0000-0000-000000000001"
	testUserID      = "00000000-0000-0000-0000-000000000010"
	zeroUUID        = "00000000-0000-0000-0000-000000000000"
)

func TestWorkspaceSubscriptionServiceEnsureSeatCapacity_FreeSoloRule(t *testing.T) {
	service, db := newTestWorkspaceSubscriptionService(t, false)
	createTestWorkspace(t, db, testWorkspaceID)

	if err := service.EnsureSeatCapacity(testWorkspaceID, 1); err != nil {
		t.Fatalf("expected first seat to be allowed, got %v", err)
	}

	createTestMember(t, db, testWorkspaceID, testUserID)
	err := service.EnsureSeatCapacity(testWorkspaceID, 1)
	if !errors.Is(err, models.ErrSeatLimitReached) {
		t.Fatalf("expected ErrSeatLimitReached, got %v", err)
	}
}

func TestWorkspaceSubscriptionServiceEnsureSeatCapacityForInviteReservation_CountsPendingInviteTypes(t *testing.T) {
	service, db := newTestWorkspaceSubscriptionService(t, false)
	createTestWorkspace(t, db, testWorkspaceID)
	createTestMember(t, db, testWorkspaceID, testUserID)
	createTestSubscription(t, db, testWorkspaceID, models.WorkspaceSubscriptionStatusActive, 5)

	createTestEmailInvite(t, db, testWorkspaceID, "pending@example.com")
	createTestUserInvite(t, db, testWorkspaceID, "00000000-0000-0000-0000-000000000011")
	createTestLinkInvite(t, db, testWorkspaceID, "00000000-0000-0000-0000-000000000012")
	createTestTokenInvite(t, db, testWorkspaceID, "00000000-0000-0000-0000-000000000210")

	err := service.EnsureSeatCapacityForInviteReservation(testWorkspaceID, 1)
	if !errors.Is(err, models.ErrSeatLimitReached) {
		t.Fatalf("expected ErrSeatLimitReached for reserved invite seats, got %v", err)
	}

	if err := service.EnsureSeatCapacity(testWorkspaceID, 1); err != nil {
		t.Fatalf("expected direct membership check to pass with purchased seats, got %v", err)
	}
}

func TestWorkspaceSubscriptionServiceEnsureWorkspaceWritable_StatusRules(t *testing.T) {
	service, db := newTestWorkspaceSubscriptionService(t, false)
	createTestWorkspace(t, db, testWorkspaceID)

	if err := service.EnsureWorkspaceWritable(testWorkspaceID); err != nil {
		t.Fatalf("expected workspace with no subscription to be writable, got %v", err)
	}

	createTestSubscription(t, db, testWorkspaceID, models.WorkspaceSubscriptionStatusActive, 2)
	if err := service.EnsureWorkspaceWritable(testWorkspaceID); err != nil {
		t.Fatalf("expected active subscription to be writable, got %v", err)
	}

	if err := db.Model(&models.WorkspaceSubscription{}).
		Where("workspace_id = ?", testWorkspaceID).
		Update("status", models.WorkspaceSubscriptionStatusPastDue).Error; err != nil {
		t.Fatalf("failed to update subscription status: %v", err)
	}

	err := service.EnsureWorkspaceWritable(testWorkspaceID)
	if !errors.Is(err, models.ErrWorkspaceReadOnly) {
		t.Fatalf("expected ErrWorkspaceReadOnly, got %v", err)
	}
}

func TestWorkspaceSubscriptionServiceEnsureWorkspaceWritable_SelfHostedBypass(t *testing.T) {
	service, db := newTestWorkspaceSubscriptionService(t, true)
	createTestWorkspace(t, db, testWorkspaceID)
	createTestSubscription(t, db, testWorkspaceID, models.WorkspaceSubscriptionStatusPastDue, 1)

	if err := service.EnsureWorkspaceWritable(testWorkspaceID); err != nil {
		t.Fatalf("expected self-hosted workspace to remain writable, got %v", err)
	}
}

func newTestWorkspaceSubscriptionService(t *testing.T, selfHosted bool) (*WorkspaceSubscriptionService, *gorm.DB) {
	t.Helper()

	dbName := strings.ReplaceAll(t.Name(), "/", "_")
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", dbName)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.WorkspaceSubscription{},
		&models.StripeSubscriptionInfo{},
		&models.WorkspaceInvite{},
		&models.WorkspaceEmailInvite{},
		&models.WorkspaceUserInvite{},
		&models.WorkspaceLinkInvite{},
	); err != nil {
		t.Fatalf("failed to migrate test tables: %v", err)
	}

	return NewWorkspaceSubscriptionService(db, "", "", "", "https://app.local", selfHosted), db
}

func createTestWorkspace(t *testing.T, db *gorm.DB, workspaceID string) {
	t.Helper()

	workspace := models.Workspace{
		ID:                  workspaceID,
		Name:                "Test Workspace",
		Subdomain:           "test-workspace",
		OnboardingCompleted: true,
	}
	if err := db.Create(&workspace).Error; err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}
}

func createTestMember(t *testing.T, db *gorm.DB, workspaceID, userID string) {
	t.Helper()

	now := time.Now().UTC()
	member := models.WorkspaceMember{
		ID:                "00000000-0000-0000-0000-000000000100",
		WorkspaceID:       workspaceID,
		UserID:            userID,
		Role:              models.WorkspaceMemberRoleAdmin,
		ChainRootKeyID:    zeroUUID,
		WrappingKeyID:     zeroUUID,
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
		t.Fatalf("failed to create workspace member: %v", err)
	}
}

func createTestSubscription(t *testing.T, db *gorm.DB, workspaceID string, status models.WorkspaceSubscriptionStatus, seats int) {
	t.Helper()

	subscription := models.WorkspaceSubscription{
		WorkspaceID:     workspaceID,
		Status:          status,
		SeatsPurchased:  seats,
		BillingProvider: models.WorkspaceSubscriptionBillingProviderStripe,
	}
	if err := db.Save(&subscription).Error; err != nil {
		t.Fatalf("failed to create workspace subscription: %v", err)
	}
}

func createTestEmailInvite(t *testing.T, db *gorm.DB, workspaceID, email string) {
	t.Helper()

	now := time.Now().UTC()
	invite := models.WorkspaceEmailInvite{
		ID:              "00000000-0000-0000-0000-000000000200",
		WorkspaceID:     workspaceID,
		Email:           email,
		Role:            models.WorkspaceMemberRoleMember,
		CreatedBy:       testUserID,
		TokenHash:       []byte("token"),
		TokenLastSentAt: now,
		ExpiresAt:       now.Add(24 * time.Hour),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatalf("failed to create workspace email invite: %v", err)
	}
}

func createTestUserInvite(t *testing.T, db *gorm.DB, workspaceID, inviteeUserID string) {
	t.Helper()

	now := time.Now().UTC()
	invite := models.WorkspaceUserInvite{
		ID:            "00000000-0000-0000-0000-000000000201",
		WorkspaceID:   workspaceID,
		InviteeUserID: inviteeUserID,
		InviterUserID: testUserID,
		Role:          models.WorkspaceMemberRoleMember,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatalf("failed to create workspace user invite: %v", err)
	}
}

func createTestLinkInvite(t *testing.T, db *gorm.DB, workspaceID, inviteID string) {
	t.Helper()

	now := time.Now().UTC()
	invite := models.WorkspaceLinkInvite{
		ID:                             inviteID,
		WorkspaceID:                    workspaceID,
		CreatedBy:                      testUserID,
		Role:                           models.WorkspaceMemberRoleMember,
		WrappedWorkspaceKeysVersion:    1,
		WrappedWorkspaceKeysNonce:      "012345678901234567890123456789012345678901234567",
		WrappedWorkspaceKeysCiphertext: "ciphertext",
		InviterSignPublicKey:           "test-sign-pubkey",
		InviteSignature:                "test-signature",
		ExpiresAt:                      now.Add(24 * time.Hour),
		CreatedAt:                      now,
		UpdatedAt:                      now,
	}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatalf("failed to create workspace link invite: %v", err)
	}
}

func createTestTokenInvite(t *testing.T, db *gorm.DB, workspaceID, inviteID string) {
	t.Helper()

	now := time.Now().UTC()
	expiresAt := now.Add(24 * time.Hour)
	invite := models.WorkspaceInvite{
		ID:          inviteID,
		WorkspaceID: workspaceID,
		CreatedBy:   testUserID,
		Role:        models.WorkspaceMemberRoleMember,
		ExpiresAt:   &expiresAt,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatalf("failed to create workspace token invite: %v", err)
	}
}
