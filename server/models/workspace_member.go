package models

import (
	"context"
	"errors"
	"time"

	"shape/utils"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// WorkspaceMemberRole defines the permission level of a workspace member.
type WorkspaceMemberRole string

const (
	WorkspaceMemberRoleAdmin      WorkspaceMemberRole = "admin"
	WorkspaceMemberRoleMember     WorkspaceMemberRole = "member"
	WorkspaceMemberRoleSuperAdmin WorkspaceMemberRole = "super_admin"
)

const (
	workspaceMemberWrappingKeyTypeWorkspace  = "workspace"
	workspaceMemberContentCiphertextSentinel = "NEEDS_SETUP"
	workspaceMemberChainRootKeyIDPlaceholder = "00000000-0000-0000-0000-000000000000"
)

// WorkspaceMember represents a user's membership in a workspace.
type WorkspaceMember struct {
	ID                string              `json:"id" gorm:"primaryKey;type:uuid;not null"`
	WorkspaceID       string              `json:"workspace_id" gorm:"type:uuid;not null;uniqueIndex:idx_workspace_member_workspace_user,priority:1"`
	UserID            string              `json:"user_id" gorm:"type:uuid;not null;uniqueIndex:idx_workspace_member_workspace_user,priority:2"`
	CreatedAt         time.Time           `json:"created_at" gorm:"not null"`
	UpdatedAt         time.Time           `json:"updated_at" gorm:"not null"`
	Role              WorkspaceMemberRole `json:"role" gorm:"not null"`
	ChainRootKeyID    string              `json:"chain_root_key_id" gorm:"type:uuid;not null;default:'00000000-0000-0000-0000-000000000000'"`
	WrappingKeyID     string              `json:"wrapping_key_id" gorm:"type:uuid;not null;default:'00000000-0000-0000-0000-000000000000'"`
	WrappingKeyType   string              `json:"wrapping_key_type" gorm:"type:varchar(16);not null;default:'workspace'"`
	EntityKeyNonce    string              `json:"entity_key_nonce" gorm:"type:char(48);not null;default:''"`
	WrappedEntityKey  string              `json:"wrapped_entity_key" gorm:"type:text;not null;default:''"`
	ContentNonce      string              `json:"content_nonce" gorm:"type:char(48);not null;default:''"`
	ContentCiphertext string              `json:"content_ciphertext" gorm:"type:text;not null;default:'NEEDS_SETUP'"`
	ContentHash       string              `json:"content_hash" gorm:"type:char(64);not null;default:''"`
	User              User                `json:"user" gorm:"foreignKey:UserID"`
}

func newWorkspaceMemberPlaceholder(workspaceID, userID string, role WorkspaceMemberRole) WorkspaceMember {
	return WorkspaceMember{
		ID:                uuid.NewString(),
		WorkspaceID:       workspaceID,
		UserID:            userID,
		Role:              role,
		ChainRootKeyID:    workspaceMemberChainRootKeyIDPlaceholder,
		WrappingKeyID:     workspaceMemberChainRootKeyIDPlaceholder,
		WrappingKeyType:   workspaceMemberWrappingKeyTypeWorkspace,
		EntityKeyNonce:    "",
		WrappedEntityKey:  "",
		ContentNonce:      "",
		ContentCiphertext: workspaceMemberContentCiphertextSentinel,
		ContentHash:       "",
	}
}

// UpdateWorkspaceMemberProfileParams defines the encrypted profile fields for a workspace member.
type UpdateWorkspaceMemberProfileParams struct {
	ChainRootKeyID    string
	WrappingKeyID     string
	WrappingKeyType   string
	EntityKeyNonce    string
	WrappedEntityKey  string
	ContentNonce      string
	ContentCiphertext string
	ContentHash       string
}

// WorkspaceMemberService provides methods for managing workspace members.
type WorkspaceMemberService struct {
	db               *gorm.DB
	userService      *UserService
	workspaceChecker WorkspaceCheckerInterface
	subscriptions    WorkspaceSubscriptionServiceInterface
	sseBroadcaster   SSEBroadcasterInterface
	changeLogService ChangeLogServiceInterface
}

// NewWorkspaceMemberService creates a new workspace member service instance.
func NewWorkspaceMemberService(
	db *gorm.DB,
	userService *UserService,
	workspaceChecker WorkspaceCheckerInterface,
	subscriptions WorkspaceSubscriptionServiceInterface,
	sseBroadcaster SSEBroadcasterInterface,
	changeLogService ChangeLogServiceInterface,
) *WorkspaceMemberService {
	return &WorkspaceMemberService{
		db:               db,
		userService:      userService,
		workspaceChecker: workspaceChecker,
		subscriptions:    subscriptions,
		sseBroadcaster:   sseBroadcaster,
		changeLogService: changeLogService,
	}
}

func (s *WorkspaceMemberService) appendChangeLogEntry(params ChangeLogAppendParams) {
	if s.changeLogService == nil {
		return
	}
	if _, err := s.changeLogService.AppendChange(context.Background(), params); err != nil {
		utils.Warnf("WorkspaceMemberService: failed to append change log entry: %v", err)
	}
}

// EnsureWorkspaceMember idempotently adds a user to a workspace with the given role.
// If actorUserID is non-empty, it must be an admin of the workspace.
func (s *WorkspaceMemberService) EnsureWorkspaceMember(actorUserID, workspaceID, userID string, role WorkspaceMemberRole) (*WorkspaceMember, error) {
	utils.Infof("EnsureWorkspaceMember: Adding user %s to workspace %s with role %s (actor: %s)", userID, workspaceID, role, actorUserID)

	if actorUserID != "" && !s.isUserWorkspaceAdmin(actorUserID, workspaceID) {
		utils.Errorf("EnsureWorkspaceMember: Actor %s is not admin of workspace %s", actorUserID, workspaceID)
		return nil, errors.New("forbidden")
	}

	// Check if already a member
	var existing WorkspaceMember
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&existing).Error; err == nil {
		utils.Infof("EnsureWorkspaceMember: User %s is already a member of workspace %s with role %s", userID, workspaceID, existing.Role)
		return &existing, nil
	}

	// Check billing constraints if subscriptions service is available
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacity(workspaceID, 1); err != nil {
			return nil, err
		}
	}

	var member WorkspaceMember
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		utils.Infof("EnsureWorkspaceMember: Creating new membership for user %s in workspace %s with role %s", userID, workspaceID, role)
		member = newWorkspaceMemberPlaceholder(workspaceID, userID, role)
		if err := tx.Create(&member).Error; err != nil {
			utils.Errorf("EnsureWorkspaceMember: Failed to create membership for user %s in workspace %s: %v", userID, workspaceID, err)
			return err
		}

		if err := tx.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&member).Error; err != nil {
			utils.Errorf("EnsureWorkspaceMember: Failed to preload user data for member %s in workspace %s: %v", userID, workspaceID, err)
			return err
		}

		// Add the new member to the Everyone team automatically
		if err := addMemberToEveryoneTeam(tx, workspaceID, userID); err != nil {
			utils.Errorf("EnsureWorkspaceMember: Failed to add user %s to Everyone team in workspace %s: %v", userID, workspaceID, err)
			return err
		}

		utils.Infof("EnsureWorkspaceMember: Successfully created membership for user %s in workspace %s", userID, workspaceID)
		return nil
	}); err != nil {
		return nil, err
	}

	// Broadcast SSE so clients can react in real-time
	utils.Infof("EnsureWorkspaceMember: Broadcasting SSE for new workspace member %s in workspace %s", userID, workspaceID)
	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberAdded(&member)
	}

	actorID := actorUserID
	if actorID == "" {
		actorID = userID
	}
	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationCreate,
		ActorID:     actorID,
	})

	return &member, nil
}

// GetWorkspaceMembers returns all members of a workspace.
func (s *WorkspaceMemberService) GetWorkspaceMembers(currentUserID, workspaceID string) ([]*WorkspaceMember, error) {
	if !s.IsUserInWorkspace(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	var members []*WorkspaceMember
	if err := s.db.Where("workspace_id = ?", workspaceID).
		Preload("User").
		Find(&members).Error; err != nil {
		return nil, err
	}

	return members, nil
}

// GetWorkspaceMember returns a single member of a workspace.
func (s *WorkspaceMemberService) GetWorkspaceMember(currentUserID, workspaceID, memberUserID string) (*WorkspaceMember, error) {
	if !s.IsUserInWorkspace(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	var member WorkspaceMember
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, memberUserID).First(&member).Error; err != nil {
		// Check if this is the global agent
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fallbackMember, fallbackErr := s.buildGlobalAgentMembership(workspaceID, memberUserID)
			if fallbackErr == nil {
				return fallbackMember, nil
			}
			if errors.Is(fallbackErr, gorm.ErrRecordNotFound) {
				return nil, err
			}
			return nil, fallbackErr
		}
		return nil, err
	}

	return &member, nil
}

// buildGlobalAgentMembership synthesizes a WorkspaceMember record for the Shape global agent.
func (s *WorkspaceMemberService) buildGlobalAgentMembership(workspaceID, memberUserID string) (*WorkspaceMember, error) {
	if memberUserID == "" {
		return nil, gorm.ErrRecordNotFound
	}

	if s.userService == nil {
		return nil, gorm.ErrRecordNotFound
	}

	user, err := s.userService.GetByID(memberUserID)
	if err != nil {
		return nil, err
	}

	if user.UserType != UserTypeGlobalAgent {
		return nil, gorm.ErrRecordNotFound
	}

	member := newWorkspaceMemberPlaceholder(workspaceID, user.ID, WorkspaceMemberRoleMember)
	member.CreatedAt = user.CreatedAt
	member.UpdatedAt = user.UpdatedAt
	member.User = *user
	return &member, nil
}

// GetWorkspaceMembersBatch returns multiple workspace members by user IDs.
func (s *WorkspaceMemberService) GetWorkspaceMembersBatch(currentUserID, workspaceID string, userIDs []string) ([]*WorkspaceMember, error) {
	if !s.IsUserInWorkspace(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	if len(userIDs) == 0 {
		return []*WorkspaceMember{}, nil
	}

	var members []*WorkspaceMember
	if err := s.db.Preload("User").
		Where("workspace_id = ? AND user_id IN ?", workspaceID, userIDs).
		Find(&members).Error; err != nil {
		return nil, err
	}

	// Track which user IDs already have concrete workspace memberships
	membersByUserID := make(map[string]struct{}, len(members))
	for _, member := range members {
		membersByUserID[member.UserID] = struct{}{}
	}

	// Try to fill in any missing global agent memberships
	for _, requestedUserID := range userIDs {
		if _, alreadyLoaded := membersByUserID[requestedUserID]; alreadyLoaded {
			continue
		}

		fallbackMember, err := s.buildGlobalAgentMembership(workspaceID, requestedUserID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return nil, err
		}

		members = append(members, fallbackMember)
		membersByUserID[requestedUserID] = struct{}{}
	}

	return members, nil
}

// GetWorkspaceMembersByIDs returns workspace members by membership IDs.
// Used by sync handlers when change logs reference member entity IDs.
func (s *WorkspaceMemberService) GetWorkspaceMembersByIDs(currentUserID, workspaceID string, memberIDs []string) ([]*WorkspaceMember, error) {
	if !s.IsUserInWorkspace(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	if len(memberIDs) == 0 {
		return []*WorkspaceMember{}, nil
	}

	var members []*WorkspaceMember
	if err := s.db.Preload("User").
		Where("workspace_id = ? AND id IN ?", workspaceID, memberIDs).
		Find(&members).Error; err != nil {
		return nil, err
	}

	return members, nil
}

// RemoveMemberFromWorkspace removes a user from a workspace (only admins can do this).
func (s *WorkspaceMemberService) RemoveMemberFromWorkspace(currentUserID, workspaceID, memberUserID string) error {
	if !s.isUserWorkspaceAdmin(currentUserID, workspaceID) {
		return gorm.ErrRecordNotFound
	}

	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return err
		}
	}

	// Prevent removing yourself
	if currentUserID == memberUserID {
		return gorm.ErrInvalidData
	}

	// Check if member exists
	var member WorkspaceMember
	if err := s.db.Where("workspace_id = ? AND user_id = ?", workspaceID, memberUserID).First(&member).Error; err != nil {
		return err
	}

	// Never allow removing the workspace's super administrator
	if member.Role == WorkspaceMemberRoleSuperAdmin {
		return gorm.ErrInvalidData
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Remove team memberships
	if err := tx.Where("workspace_id = ? AND user_id = ?", workspaceID, memberUserID).
		Delete(&TeamMember{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Remove ACL entries for this user
	if err := tx.Where("workspace_id = ? AND subject_type = ? AND subject_id = ?", workspaceID, ACLSubjectTypeUser, memberUserID).
		Delete(&ACLEntry{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Remove the workspace member
	if err := tx.Delete(&member).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	// Inform connected clients
	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberRemoved(workspaceID, memberUserID)
	}

	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationDelete,
		ActorID:     currentUserID,
	})

	return nil
}

// ChangeUserRole changes a user's role in a workspace (only admins can do this).
func (s *WorkspaceMemberService) ChangeUserRole(currentUserID, workspaceID, memberUserID string, newRole WorkspaceMemberRole) (*WorkspaceMember, error) {
	if !s.isUserWorkspaceAdmin(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return nil, err
		}
	}

	actorIsSuperAdmin := s.isUserWorkspaceSuperAdmin(currentUserID, workspaceID)

	var member WorkspaceMember
	if err := s.db.Where("workspace_id = ? AND user_id = ?", workspaceID, memberUserID).First(&member).Error; err != nil {
		return nil, err
	}

	// Only super admins can grant super admin role
	if newRole == WorkspaceMemberRoleSuperAdmin && !actorIsSuperAdmin {
		return nil, gorm.ErrInvalidData
	}

	// Only super admins can demote other super admins
	if member.Role == WorkspaceMemberRoleSuperAdmin {
		if !actorIsSuperAdmin {
			return nil, gorm.ErrInvalidData
		}
		// Ensure at least one super admin remains
		if newRole != WorkspaceMemberRoleSuperAdmin {
			superAdminCount, err := s.countSuperAdmins(workspaceID)
			if err != nil {
				return nil, err
			}
			if superAdminCount <= 1 {
				return nil, gorm.ErrInvalidData
			}
		}
	}

	member.Role = newRole
	if err := s.db.Save(&member).Error; err != nil {
		return nil, err
	}

	// Reload with user data
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, memberUserID).First(&member).Error; err != nil {
		return nil, err
	}

	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberUpdated(&member)
	}

	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationUpdate,
		ActorID:     currentUserID,
	})

	return &member, nil
}

// UpdateMemberProfile updates the encrypted profile payload for the current user in a workspace.
func (s *WorkspaceMemberService) UpdateMemberProfile(
	currentUserID string,
	workspaceID string,
	params UpdateWorkspaceMemberProfileParams,
) (*WorkspaceMember, error) {
	if !s.IsUserInWorkspace(currentUserID, workspaceID) {
		return nil, gorm.ErrRecordNotFound
	}

	if params.ChainRootKeyID == "" {
		return nil, errors.New("chain_root_key_id is required")
	}
	if params.WrappingKeyID == "" {
		return nil, errors.New("wrapping_key_id is required")
	}
	if params.WrappingKeyType == "" {
		return nil, errors.New("wrapping_key_type is required")
	}
	if params.WrappingKeyType != workspaceMemberWrappingKeyTypeWorkspace {
		return nil, errors.New("wrapping_key_type must be 'workspace'")
	}
	if params.WrappingKeyID != params.ChainRootKeyID {
		return nil, errors.New("wrapping_key_id must match chain_root_key_id for workspace profiles")
	}

	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return nil, err
		}
	}

	var member WorkspaceMember
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, currentUserID).First(&member).Error; err != nil {
		return nil, err
	}

	member.ChainRootKeyID = params.ChainRootKeyID
	member.WrappingKeyID = params.WrappingKeyID
	member.WrappingKeyType = params.WrappingKeyType
	member.EntityKeyNonce = params.EntityKeyNonce
	member.WrappedEntityKey = params.WrappedEntityKey
	member.ContentNonce = params.ContentNonce
	member.ContentCiphertext = params.ContentCiphertext
	member.ContentHash = params.ContentHash

	if err := s.db.Save(&member).Error; err != nil {
		return nil, err
	}

	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, currentUserID).First(&member).Error; err != nil {
		return nil, err
	}

	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberUpdated(&member)
	}

	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationUpdate,
		ActorID:     currentUserID,
	})

	return &member, nil
}

// IsUserInWorkspace checks if a user is a member of a workspace.
func (s *WorkspaceMemberService) IsUserInWorkspace(userID, workspaceID string) bool {
	return s.workspaceChecker.IsUserInWorkspace(userID, workspaceID)
}

// IsUserWorkspaceAdmin exposes a read-only check for admin privileges.
func (s *WorkspaceMemberService) IsUserWorkspaceAdmin(userID, workspaceID string) bool {
	return s.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID)
}

func (s *WorkspaceMemberService) isUserWorkspaceAdmin(userID, workspaceID string) bool {
	return s.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID)
}

func (s *WorkspaceMemberService) isUserWorkspaceSuperAdmin(userID, workspaceID string) bool {
	return s.workspaceChecker.IsUserWorkspaceSuperAdmin(userID, workspaceID)
}

func (s *WorkspaceMemberService) countSuperAdmins(workspaceID string) (int64, error) {
	var count int64
	if err := s.db.Model(&WorkspaceMember{}).
		Where("workspace_id = ? AND role = ?", workspaceID, WorkspaceMemberRoleSuperAdmin).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// AddMemberToWorkspace adds a user to a workspace by email address.
// The actorUserID must be an admin of the workspace. Returns the new workspace member.
func (s *WorkspaceMemberService) AddMemberToWorkspace(actorUserID, workspaceID, email string, role WorkspaceMemberRole) (*WorkspaceMember, error) {
	utils.Infof("AddMemberToWorkspace: Adding user by email %s to workspace %s with role %s (actor: %s)", email, workspaceID, role, actorUserID)

	// Actor must be an admin of the workspace.
	if !s.isUserWorkspaceAdmin(actorUserID, workspaceID) {
		utils.Errorf("AddMemberToWorkspace: Actor %s is not admin of workspace %s", actorUserID, workspaceID)
		return nil, errors.New("forbidden")
	}

	// Check billing constraints if subscriptions service is available.
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacity(workspaceID, 1); err != nil {
			return nil, err
		}
	}

	// Look up the user by email.
	if s.userService == nil {
		return nil, errors.New("user service not available")
	}
	user, err := s.userService.GetByEmail(email)
	if err != nil {
		utils.Errorf("AddMemberToWorkspace: Failed to find user by email %s: %v", email, err)
		return nil, err
	}

	// Check if user is already a member.
	var existing WorkspaceMember
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, user.ID).First(&existing).Error; err == nil {
		utils.Infof("AddMemberToWorkspace: User %s is already a member of workspace %s", user.ID, workspaceID)
		return &existing, nil
	}

	// Add the member within a transaction.
	var member WorkspaceMember
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		utils.Infof("AddMemberToWorkspace: Creating membership for user %s in workspace %s with role %s", user.ID, workspaceID, role)
		member = newWorkspaceMemberPlaceholder(workspaceID, user.ID, role)
		if err := tx.Create(&member).Error; err != nil {
			utils.Errorf("AddMemberToWorkspace: Failed to create membership: %v", err)
			return err
		}

		if err := tx.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, user.ID).First(&member).Error; err != nil {
			utils.Errorf("AddMemberToWorkspace: Failed to preload user data: %v", err)
			return err
		}

		// Add the new member to the Everyone team automatically.
		if err := addMemberToEveryoneTeam(tx, workspaceID, user.ID); err != nil {
			utils.Errorf("AddMemberToWorkspace: Failed to add user to Everyone team: %v", err)
			return err
		}

		utils.Infof("AddMemberToWorkspace: Successfully created membership for user %s in workspace %s", user.ID, workspaceID)
		return nil
	}); err != nil {
		return nil, err
	}

	// Broadcast SSE so clients can react in real-time.
	utils.Infof("AddMemberToWorkspace: Broadcasting SSE for new workspace member %s in workspace %s", user.ID, workspaceID)
	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberAdded(&member)
	}

	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationCreate,
		ActorID:     actorUserID,
	})

	return &member, nil
}

// AddMemberToWorkspaceByUserID adds a user to a workspace by user ID.
// This is used for invite acceptance where the user ID is already known.
// The actorUserID must be an admin of the workspace. Returns the new workspace member.
func (s *WorkspaceMemberService) AddMemberToWorkspaceByUserID(actorUserID, workspaceID, userID string, role WorkspaceMemberRole) (*WorkspaceMember, error) {
	utils.Infof("AddMemberToWorkspaceByUserID: Adding user %s to workspace %s with role %s (actor: %s)", userID, workspaceID, role, actorUserID)

	// Actor must be an admin of the workspace.
	if !s.isUserWorkspaceAdmin(actorUserID, workspaceID) {
		utils.Errorf("AddMemberToWorkspaceByUserID: Actor %s is not admin of workspace %s", actorUserID, workspaceID)
		return nil, errors.New("forbidden")
	}

	// Check billing constraints if subscriptions service is available.
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacity(workspaceID, 1); err != nil {
			return nil, err
		}
	}

	// Check if user is already a member.
	var existing WorkspaceMember
	if err := s.db.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&existing).Error; err == nil {
		utils.Infof("AddMemberToWorkspaceByUserID: User %s is already a member of workspace %s", userID, workspaceID)
		return &existing, nil
	}

	// Add the member within a transaction.
	var member WorkspaceMember
	if err := s.db.Transaction(func(tx *gorm.DB) error {
		utils.Infof("AddMemberToWorkspaceByUserID: Creating membership for user %s in workspace %s with role %s", userID, workspaceID, role)
		member = newWorkspaceMemberPlaceholder(workspaceID, userID, role)
		if err := tx.Create(&member).Error; err != nil {
			utils.Errorf("AddMemberToWorkspaceByUserID: Failed to create membership: %v", err)
			return err
		}

		if err := tx.Preload("User").Where("workspace_id = ? AND user_id = ?", workspaceID, userID).First(&member).Error; err != nil {
			utils.Errorf("AddMemberToWorkspaceByUserID: Failed to preload user data: %v", err)
			return err
		}

		// Add the new member to the Everyone team automatically.
		if err := addMemberToEveryoneTeam(tx, workspaceID, userID); err != nil {
			utils.Errorf("AddMemberToWorkspaceByUserID: Failed to add user to Everyone team: %v", err)
			return err
		}

		utils.Infof("AddMemberToWorkspaceByUserID: Successfully created membership for user %s in workspace %s", userID, workspaceID)
		return nil
	}); err != nil {
		return nil, err
	}

	// Broadcast SSE so clients can react in real-time.
	utils.Infof("AddMemberToWorkspaceByUserID: Broadcasting SSE for new workspace member %s in workspace %s", userID, workspaceID)
	if s.sseBroadcaster != nil {
		s.sseBroadcaster.BroadcastWorkspaceMemberAdded(&member)
	}

	s.appendChangeLogEntry(ChangeLogAppendParams{
		WorkspaceID: workspaceID,
		EntityType:  ChangeLogEntityTypeWorkspaceMember,
		EntityID:    member.ID,
		Operation:   ChangeLogOperationCreate,
		ActorID:     actorUserID,
	})

	return &member, nil
}

// addMemberToEveryoneTeam adds a user to the workspace's Everyone team.
// This function is idempotent.
func addMemberToEveryoneTeam(tx *gorm.DB, workspaceID, userID string) error {
	var everyoneTeam Team
	err := tx.Where("workspace_id = ? AND team_type = ?", workspaceID, TeamTypeEveryone).First(&everyoneTeam).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Warnf("addMemberToEveryoneTeam: Everyone team not found for workspace %s", workspaceID)
			return nil
		}
		return err
	}

	// Check if the user is already a member
	var existingMember TeamMember
	if err := tx.Where("team_id = ? AND user_id = ?", everyoneTeam.ID, userID).First(&existingMember).Error; err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	// Add the user to the Everyone team
	teamMember := &TeamMember{
		ID:          uuid.NewString(),
		TeamID:      everyoneTeam.ID,
		WorkspaceID: workspaceID,
		UserID:      userID,
		Role:        TeamMemberRoleMember,
	}

	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(teamMember).Error; err != nil {
		return err
	}

	utils.Infof("addMemberToEveryoneTeam: Added user %s to Everyone team in workspace %s", userID, workspaceID)
	return nil
}
