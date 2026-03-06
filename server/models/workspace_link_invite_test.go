package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupTestDB creates an in-memory SQLite database for testing.
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	// Auto-migrate the required models for testing.
	if err := db.AutoMigrate(&WorkspaceLinkInvite{}); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	return db
}

// createTestLinkInvite creates a link invite with the given expiration time.
func createTestLinkInvite(t *testing.T, db *gorm.DB, expiresAt time.Time) *WorkspaceLinkInvite {
	t.Helper()

	invite := &WorkspaceLinkInvite{
		ID:                             uuid.New().String(),
		WorkspaceID:                    uuid.New().String(),
		CreatedBy:                      uuid.New().String(),
		Role:                           WorkspaceMemberRoleMember,
		WrappedWorkspaceKeysVersion:    1,
		WrappedWorkspaceKeysNonce:      "test-nonce-0123456789abcdef0123456789abcdef",
		WrappedWorkspaceKeysCiphertext: "test-ciphertext-base64-encoded",
		InviterSignPublicKey:           "test-sign-pubkey-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab",
		InviteSignature:                "test-signature-base64-encoded",
		SignedAt:                       time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:                      expiresAt,
	}

	if err := db.Create(invite).Error; err != nil {
		t.Fatalf("failed to create test invite: %v", err)
	}

	return invite
}

func TestDeleteExpiredInvites_DeletesOnlyExpiredInvites(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create invites with different expiration states:
	// - 2 expired invites (expired 1 hour ago, expired 1 day ago)
	// - 2 valid invites (expires in 1 hour, expires in 1 day)
	expiredInvite1 := createTestLinkInvite(t, db, now.Add(-1*time.Hour))
	expiredInvite2 := createTestLinkInvite(t, db, now.Add(-24*time.Hour))
	validInvite1 := createTestLinkInvite(t, db, now.Add(1*time.Hour))
	validInvite2 := createTestLinkInvite(t, db, now.Add(24*time.Hour))

	// Execute the delete.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted exactly 2 expired invites.
	if deleted != 2 {
		t.Errorf("expected 2 deleted invites, got %d", deleted)
	}

	// Verify expired invites are gone.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", expiredInvite1.ID).Count(&count)
	if count != 0 {
		t.Errorf("expired invite 1 should have been deleted")
	}

	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", expiredInvite2.ID).Count(&count)
	if count != 0 {
		t.Errorf("expired invite 2 should have been deleted")
	}

	// Verify valid invites still exist.
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", validInvite1.ID).Count(&count)
	if count != 1 {
		t.Errorf("valid invite 1 should still exist")
	}

	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", validInvite2.ID).Count(&count)
	if count != 1 {
		t.Errorf("valid invite 2 should still exist")
	}
}

func TestDeleteExpiredInvites_NoExpiredInvites(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create only valid (non-expired) invites.
	createTestLinkInvite(t, db, now.Add(1*time.Hour))
	createTestLinkInvite(t, db, now.Add(48*time.Hour))

	// Execute the delete.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted 0 invites.
	if deleted != 0 {
		t.Errorf("expected 0 deleted invites, got %d", deleted)
	}

	// Verify both invites still exist.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Count(&count)
	if count != 2 {
		t.Errorf("expected 2 invites to remain, got %d", count)
	}
}

func TestDeleteExpiredInvites_EmptyDatabase(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	// Execute the delete on empty database.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted 0 invites.
	if deleted != 0 {
		t.Errorf("expected 0 deleted invites, got %d", deleted)
	}
}

func TestDeleteExpiredInvites_DeletesAcceptedExpiredInvites(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create an expired invite that was previously accepted.
	// Even accepted invites should be deleted if expired.
	invite := createTestLinkInvite(t, db, now.Add(-1*time.Hour))
	acceptedAt := now.Add(-2 * time.Hour)
	acceptedBy := uuid.New().String()
	db.Model(invite).Updates(map[string]any{
		"accepted_at": acceptedAt,
		"accepted_by": acceptedBy,
	})

	// Execute the delete.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted the expired invite even though it was accepted.
	if deleted != 1 {
		t.Errorf("expected 1 deleted invite, got %d", deleted)
	}

	// Verify invite is gone.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", invite.ID).Count(&count)
	if count != 0 {
		t.Errorf("expired accepted invite should have been deleted")
	}
}

func TestDeleteExpiredInvites_DeletesRevokedExpiredInvites(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create an expired invite that was previously revoked.
	// Even revoked invites should be deleted if expired.
	invite := createTestLinkInvite(t, db, now.Add(-1*time.Hour))
	revokedAt := now.Add(-30 * time.Minute)
	db.Model(invite).Updates(map[string]any{
		"revoked_at": revokedAt,
	})

	// Execute the delete.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted the expired invite even though it was revoked.
	if deleted != 1 {
		t.Errorf("expected 1 deleted invite, got %d", deleted)
	}

	// Verify invite is gone.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", invite.ID).Count(&count)
	if count != 0 {
		t.Errorf("expired revoked invite should have been deleted")
	}
}

func TestDeleteExpiredInvites_BoundaryCondition(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create an invite that expires exactly now.
	// This should be considered expired (expires_at < now uses strict less-than).
	// Due to timing, we use a slight offset to ensure consistent behavior.
	justExpired := createTestLinkInvite(t, db, now.Add(-1*time.Millisecond))
	notYetExpired := createTestLinkInvite(t, db, now.Add(1*time.Millisecond))

	// Execute the delete.
	deleted, err := service.DeleteExpiredInvites()
	if err != nil {
		t.Fatalf("DeleteExpiredInvites failed: %v", err)
	}

	// Should have deleted the just-expired invite.
	if deleted != 1 {
		t.Errorf("expected 1 deleted invite, got %d", deleted)
	}

	// Verify just-expired invite is gone.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", justExpired.ID).Count(&count)
	if count != 0 {
		t.Errorf("just-expired invite should have been deleted")
	}

	// Verify not-yet-expired invite still exists.
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", notYetExpired.ID).Count(&count)
	if count != 1 {
		t.Errorf("not-yet-expired invite should still exist")
	}
}

func TestGetActiveByID_ReturnsErrorForExpiredInvite(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create an expired invite.
	expiredInvite := createTestLinkInvite(t, db, now.Add(-1*time.Hour))

	// GetActiveByID should return ErrLinkInviteExpired.
	_, err := service.GetActiveByID(expiredInvite.ID)
	if err != ErrLinkInviteExpired {
		t.Errorf("expected ErrLinkInviteExpired, got %v", err)
	}
}

func TestCreateInvite_SetsCorrectExpiration(t *testing.T) {
	db := setupTestDB(t)

	// Use a custom TTL for testing.
	customTTL := 24 * time.Hour
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{
		DefaultTTL: customTTL,
	})

	beforeCreate := time.Now().UTC()

	invite, err := service.Create(CreateWorkspaceLinkInviteParams{
		ID:                             uuid.New().String(),
		WorkspaceID:                    uuid.New().String(),
		CreatedBy:                      uuid.New().String(),
		Role:                           WorkspaceMemberRoleMember,
		WrappedWorkspaceKeysVersion:    1,
		WrappedWorkspaceKeysNonce:      "test-nonce-0123456789abcdef0123456789abcdef",
		WrappedWorkspaceKeysCiphertext: "test-ciphertext",
		InviterSignPublicKey:           "test-pubkey",
		InviteSignature:                "test-signature",
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	afterCreate := time.Now().UTC()

	// Verify expiration is approximately customTTL from now.
	expectedMin := beforeCreate.Add(customTTL)
	expectedMax := afterCreate.Add(customTTL)

	if invite.ExpiresAt.Before(expectedMin) || invite.ExpiresAt.After(expectedMax) {
		t.Errorf("ExpiresAt %v not in expected range [%v, %v]", invite.ExpiresAt, expectedMin, expectedMax)
	}
}

func TestCreateInvite_Uses48HourDefaultTTL(t *testing.T) {
	db := setupTestDB(t)

	// Use empty config to get default TTL.
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	beforeCreate := time.Now().UTC()

	invite, err := service.Create(CreateWorkspaceLinkInviteParams{
		ID:                             uuid.New().String(),
		WorkspaceID:                    uuid.New().String(),
		CreatedBy:                      uuid.New().String(),
		Role:                           WorkspaceMemberRoleMember,
		WrappedWorkspaceKeysVersion:    1,
		WrappedWorkspaceKeysNonce:      "test-nonce-0123456789abcdef0123456789abcdef",
		WrappedWorkspaceKeysCiphertext: "test-ciphertext",
		InviterSignPublicKey:           "test-pubkey",
		InviteSignature:                "test-signature",
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	afterCreate := time.Now().UTC()

	// Verify expiration is approximately 48 hours from now (the default).
	expectedMin := beforeCreate.Add(48 * time.Hour)
	expectedMax := afterCreate.Add(48 * time.Hour)

	if invite.ExpiresAt.Before(expectedMin) || invite.ExpiresAt.After(expectedMax) {
		t.Errorf("ExpiresAt %v not in expected range [%v, %v] (48h default)", invite.ExpiresAt, expectedMin, expectedMax)
	}
}

func TestDelete_RemovesInvite(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	now := time.Now().UTC()

	// Create a valid invite.
	invite := createTestLinkInvite(t, db, now.Add(48*time.Hour))

	// Verify it exists.
	var count int64
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", invite.ID).Count(&count)
	if count != 1 {
		t.Fatalf("invite should exist before deletion")
	}

	// Delete it.
	err := service.Delete(invite.ID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify it's gone.
	db.Model(&WorkspaceLinkInvite{}).Where("id = ?", invite.ID).Count(&count)
	if count != 0 {
		t.Errorf("invite should have been deleted")
	}
}

func TestDelete_ReturnsErrorForNonExistentInvite(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	// Try to delete a non-existent invite.
	err := service.Delete(uuid.New().String())
	if err != ErrLinkInviteNotFound {
		t.Errorf("expected ErrLinkInviteNotFound, got %v", err)
	}
}

func TestDelete_ReturnsErrorForEmptyID(t *testing.T) {
	db := setupTestDB(t)
	service := NewWorkspaceLinkInviteService(db, nil, WorkspaceLinkInviteConfig{})

	// Try to delete with empty ID.
	err := service.Delete("")
	if err == nil {
		t.Errorf("expected error for empty ID, got nil")
	}
}
