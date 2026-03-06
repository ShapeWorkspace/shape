package models

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type inviteWorkspaceCheckerStub struct{}

func (s *inviteWorkspaceCheckerStub) IsUserInWorkspace(userID, workspaceID string) bool {
	return true
}

func (s *inviteWorkspaceCheckerStub) IsUserWorkspaceAdmin(userID, workspaceID string) bool {
	return true
}

func (s *inviteWorkspaceCheckerStub) IsUserWorkspaceSuperAdmin(userID, workspaceID string) bool {
	return false
}

type inviteSubscriptionStub struct {
	writableCalls        int
	directSeatCalls      int
	reservationSeatCalls int
	writableErr          error
	directSeatErr        error
	reservationSeatErr   error
}

func (s *inviteSubscriptionStub) EnsureSeatCapacity(workspaceID string, seatsToAdd int) error {
	s.directSeatCalls++
	return s.directSeatErr
}

func (s *inviteSubscriptionStub) EnsureSeatCapacityForInviteReservation(workspaceID string, seatsToAdd int) error {
	s.reservationSeatCalls++
	return s.reservationSeatErr
}

func (s *inviteSubscriptionStub) EnsureWorkspaceWritable(workspaceID string) error {
	s.writableCalls++
	return s.writableErr
}

func (s *inviteSubscriptionStub) HasActiveSubscription(workspaceID string) (bool, error) {
	return true, nil
}

func (s *inviteSubscriptionStub) SelfHostedEnabled() bool {
	return false
}

func (s *inviteSubscriptionStub) EnsureSelfHostedSubscription(workspaceID string) (*WorkspaceSubscriptionSnapshot, error) {
	return nil, nil
}

func setupWorkspaceInviteTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dbName := strings.ReplaceAll(t.Name(), "/", "_")
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", dbName)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	if err := db.AutoMigrate(&WorkspaceInvite{}); err != nil {
		t.Fatalf("failed to migrate workspace invites: %v", err)
	}

	return db
}

func TestWorkspaceInviteService_LifecycleActiveAcceptAndRevoke(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, nil)

	workspaceID := uuid.NewString()
	createdBy := uuid.NewString()

	invite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		t.Fatalf("create invite failed: %v", err)
	}

	active, err := service.GetActiveInviteByToken(invite.ID)
	if err != nil {
		t.Fatalf("expected active invite, got error: %v", err)
	}
	if active.ID != invite.ID {
		t.Fatalf("expected invite id %s, got %s", invite.ID, active.ID)
	}

	if err := service.MarkAccepted(invite.ID, uuid.NewString()); err != nil {
		t.Fatalf("mark accepted failed: %v", err)
	}

	if err := service.MarkAccepted(invite.ID, "same-user-idempotent"); !errors.Is(err, ErrWorkspaceInviteAlreadyAccepted) {
		t.Fatalf("expected ErrWorkspaceInviteAlreadyAccepted for second consumer, got %v", err)
	}

	_, err = service.GetActiveInviteByToken(invite.ID)
	if !errors.Is(err, ErrWorkspaceInviteAlreadyAccepted) {
		t.Fatalf("expected ErrWorkspaceInviteAlreadyAccepted, got %v", err)
	}

	secondInvite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		t.Fatalf("create second invite failed: %v", err)
	}

	if err := service.RevokeInvite(workspaceID, secondInvite.ID); err != nil {
		t.Fatalf("revoke invite failed: %v", err)
	}

	_, err = service.GetActiveInviteByToken(secondInvite.ID)
	if !errors.Is(err, ErrWorkspaceInviteRevoked) {
		t.Fatalf("expected ErrWorkspaceInviteRevoked, got %v", err)
	}
}

func TestWorkspaceInviteService_MarkAcceptedIdempotentForSameUser(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, nil)

	invite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: uuid.NewString(),
		CreatedBy:   uuid.NewString(),
	})
	if err != nil {
		t.Fatalf("create invite failed: %v", err)
	}

	acceptedBy := uuid.NewString()
	if err := service.MarkAccepted(invite.ID, acceptedBy); err != nil {
		t.Fatalf("initial mark accepted failed: %v", err)
	}

	if err := service.MarkAccepted(invite.ID, acceptedBy); err != nil {
		t.Fatalf("expected idempotent acceptance for same user, got %v", err)
	}
}

func TestWorkspaceInviteService_GetActiveInvitesForWorkspaceFiltersStatuses(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, nil)

	workspaceID := uuid.NewString()
	otherWorkspaceID := uuid.NewString()
	createdBy := uuid.NewString()

	activeInvite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		t.Fatalf("create active invite failed: %v", err)
	}

	acceptedInvite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		t.Fatalf("create accepted invite failed: %v", err)
	}
	if err := service.MarkAccepted(acceptedInvite.ID, uuid.NewString()); err != nil {
		t.Fatalf("mark accepted failed: %v", err)
	}

	revokedInvite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
	})
	if err != nil {
		t.Fatalf("create revoked invite failed: %v", err)
	}
	if err := service.RevokeInvite(workspaceID, revokedInvite.ID); err != nil {
		t.Fatalf("revoke invite failed: %v", err)
	}

	expiredAt := time.Now().UTC().Add(-1 * time.Minute)
	expiredInvite := WorkspaceInvite{
		ID:          uuid.NewString(),
		WorkspaceID: workspaceID,
		CreatedBy:   createdBy,
		Role:        WorkspaceMemberRoleMember,
		ExpiresAt:   &expiredAt,
	}
	if err := db.Create(&expiredInvite).Error; err != nil {
		t.Fatalf("create expired invite failed: %v", err)
	}

	if _, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: otherWorkspaceID,
		CreatedBy:   createdBy,
	}); err != nil {
		t.Fatalf("create invite for other workspace failed: %v", err)
	}

	invites, err := service.GetActiveInvitesForWorkspace(workspaceID)
	if err != nil {
		t.Fatalf("get active invites failed: %v", err)
	}
	if len(invites) != 1 {
		t.Fatalf("expected 1 active invite, got %d", len(invites))
	}
	if invites[0].ID != activeInvite.ID {
		t.Fatalf("expected active invite %s, got %s", activeInvite.ID, invites[0].ID)
	}
}

func TestWorkspaceInviteService_GetActiveInviteByTokenExpired(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, nil)

	expiredAt := time.Now().UTC().Add(-1 * time.Minute)
	invite := WorkspaceInvite{
		ID:          uuid.NewString(),
		WorkspaceID: uuid.NewString(),
		CreatedBy:   uuid.NewString(),
		Role:        WorkspaceMemberRoleMember,
		ExpiresAt:   &expiredAt,
	}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatalf("failed to create expired invite: %v", err)
	}

	_, err := service.GetActiveInviteByToken(invite.ID)
	if !errors.Is(err, ErrWorkspaceInviteExpired) {
		t.Fatalf("expected ErrWorkspaceInviteExpired, got %v", err)
	}
}

func TestWorkspaceInviteService_CreateUsesReservationSeatCheck(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	subscriptions := &inviteSubscriptionStub{}
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, subscriptions)

	_, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: uuid.NewString(),
		CreatedBy:   uuid.NewString(),
	})
	if err != nil {
		t.Fatalf("create invite failed: %v", err)
	}

	if subscriptions.writableCalls != 1 {
		t.Fatalf("expected writable check to run once, got %d", subscriptions.writableCalls)
	}
	if subscriptions.reservationSeatCalls != 1 {
		t.Fatalf("expected reservation seat check to run once, got %d", subscriptions.reservationSeatCalls)
	}
	if subscriptions.directSeatCalls != 0 {
		t.Fatalf("expected direct seat check to be unused, got %d calls", subscriptions.directSeatCalls)
	}
}

func TestWorkspaceInviteService_CreateFailsWhenNoReservationCapacity(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	subscriptions := &inviteSubscriptionStub{
		reservationSeatErr: ErrSeatLimitReached,
	}
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, subscriptions)

	_, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: uuid.NewString(),
		CreatedBy:   uuid.NewString(),
	})
	if !errors.Is(err, ErrSeatLimitReached) {
		t.Fatalf("expected ErrSeatLimitReached, got %v", err)
	}
}

func TestWorkspaceInviteService_CreateUsesFixedRoleAndTTL(t *testing.T) {
	db := setupWorkspaceInviteTestDB(t)
	service := NewInviteService(db, &inviteWorkspaceCheckerStub{}, nil)

	beforeCreate := time.Now().UTC()
	invite, err := service.CreateWorkspaceInvite(CreateInviteParams{
		WorkspaceID: uuid.NewString(),
		CreatedBy:   uuid.NewString(),
	})
	if err != nil {
		t.Fatalf("create invite failed: %v", err)
	}

	if invite.Role != WorkspaceMemberRoleMember {
		t.Fatalf("expected invite role %s, got %s", WorkspaceMemberRoleMember, invite.Role)
	}

	if invite.ExpiresAt == nil {
		t.Fatalf("expected invite expiration to be set")
	}

	expectedMin := beforeCreate.Add(workspaceInviteDefaultTTL - time.Minute)
	expectedMax := beforeCreate.Add(workspaceInviteDefaultTTL + time.Minute)
	if invite.ExpiresAt.Before(expectedMin) || invite.ExpiresAt.After(expectedMax) {
		t.Fatalf("expected invite expiration around default ttl, got %s", invite.ExpiresAt.UTC().Format(time.RFC3339))
	}
}
