package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"shape/utils"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Workspace represents a collaborative space that users can be members of.
type Workspace struct {
	ID                  string              `json:"uuid" gorm:"primaryKey;type:uuid"`
	Name                string              `json:"name" gorm:"not null"`
	Subdomain           string              `json:"subdomain" gorm:"size:63;uniqueIndex"`
	OnboardingCompleted bool                `json:"onboarding_completed" gorm:"not null;default:false"`
	ReadonlySince       *time.Time          `json:"readonly_since"`
	AcquisitionCampaign AcquisitionCampaign `json:"acquisition_campaign" gorm:"type:text;not null;default:''"`
	// CurrentWorkspaceKeyID references the latest workspace key generation for E2EE.
	// This is set during workspace creation and updated when a new workspace key is created.
	// Clients use this to determine which key to use for encrypting new entities.
	CurrentWorkspaceKeyID *string   `json:"current_workspace_key_id" gorm:"type:uuid"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// WorkspaceResponse is the JSON response format for workspace data.
type WorkspaceResponse struct {
	ID                    string              `json:"uuid"`
	UserID                string              `json:"user_id"`
	Name                  string              `json:"name"`
	Subdomain             string              `json:"subdomain"`
	OnboardingCompleted   bool                `json:"onboarding_completed"`
	ReadonlySince         *time.Time          `json:"readonly_since"`
	AcquisitionCampaign   AcquisitionCampaign `json:"acquisition_campaign"`
	CurrentWorkspaceKeyID *string             `json:"current_workspace_key_id"`
	CreatedAt             time.Time           `json:"created_at"`
	UpdatedAt             time.Time           `json:"updated_at"`
}

// WorkspaceWithMembershipResponse includes workspace data along with the user's membership info.
type WorkspaceWithMembershipResponse struct {
	ID                    string                         `json:"uuid"`
	Name                  string                         `json:"name"`
	Subdomain             string                         `json:"subdomain"`
	OnboardingCompleted   bool                           `json:"onboarding_completed"`
	ReadonlySince         *time.Time                     `json:"readonly_since"`
	AcquisitionCampaign   AcquisitionCampaign            `json:"acquisition_campaign"`
	CurrentWorkspaceKeyID *string                        `json:"current_workspace_key_id"`
	CreatedAt             time.Time                      `json:"created_at"`
	UpdatedAt             time.Time                      `json:"updated_at"`
	JoinedAt              time.Time                      `json:"joined_at"`
	UserID                string                         `json:"user_id"`
	Subscription          *WorkspaceSubscriptionSnapshot `json:"subscription,omitempty" gorm:"-"`
}

// CreateWorkspaceResponse represents the response when creating a workspace.
type CreateWorkspaceResponse struct {
	Workspace    *WorkspaceWithMembershipResponse `json:"workspace"`
	Subscription *WorkspaceSubscriptionSnapshot   `json:"subscription,omitempty" gorm:"-"`
}

// WorkspaceService provides methods for managing workspaces.
type WorkspaceService struct {
	db               *gorm.DB
	onboardingSeeder WorkspaceOnboardingSeeder
}

// ErrWorkspaceSubdomainUnavailable indicates a collision with an existing workspace subdomain.
var ErrWorkspaceSubdomainUnavailable = errors.New("workspace subdomain unavailable")

// InitialWorkspaceKeyShareParams contains the encrypted share data for the workspace creator.
type InitialWorkspaceKeyShareParams struct {
	ShareID             string
	SenderBoxPublicKey  string
	SenderSignPublicKey string
	Nonce               string
	Ciphertext          string
	ShareSignature      string
}

// InitialWorkspaceKeyParams contains parameters for creating the initial workspace key
// and a self-share during workspace creation.
type InitialWorkspaceKeyParams struct {
	KeyID string
	Share InitialWorkspaceKeyShareParams
}

// workspaceCreationOptions holds optional parameters for workspace creation.
type workspaceCreationOptions struct {
	forcedSubdomain       string
	enforceExactSubdomain bool
	subdomainRetryCount   int
}

// NewWorkspaceService creates a new workspace service instance.
func NewWorkspaceService(db *gorm.DB) *WorkspaceService {
	return &WorkspaceService{db: db}
}

// resolveCreatorCampaign looks up the user's signup attribution and derives their campaign.
func (s *WorkspaceService) resolveCreatorCampaign(tx *gorm.DB, userID string) (AcquisitionCampaign, error) {
	trimmed := strings.TrimSpace(userID)
	if trimmed == "" {
		return CampaignNone, fmt.Errorf("workspace creator is required")
	}

	var payload struct {
		SignupAttribution datatypes.JSONMap
	}
	if err := tx.Model(&User{}).Select("signup_attribution").Where("id = ?", trimmed).First(&payload).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CampaignNone, fmt.Errorf("workspace creator %s not found", trimmed)
		}
		return CampaignNone, err
	}

	return DetermineAcquisitionCampaignFromAttribution(payload.SignupAttribution), nil
}

// WorkspaceOnboardingSeedParams captures the context required to populate a newly created workspace
// with default content.
type WorkspaceOnboardingSeedParams struct {
	Workspace     *Workspace
	CreatorUserID string
}

// WorkspaceOnboardingSeeder allows callers to register a hook that seeds initial workspace content
// once the core workspace transaction commits.
type WorkspaceOnboardingSeeder interface {
	SeedWorkspaceContent(params WorkspaceOnboardingSeedParams) error
}

// SetOnboardingSeeder attaches a seeder to the workspace service. The seeder runs after the
// workspace creation transaction commits so downstream operations observe a consistent state.
func (s *WorkspaceService) SetOnboardingSeeder(seeder WorkspaceOnboardingSeeder) {
	s.onboardingSeeder = seeder
}

// GetByID returns a workspace by its ID.
func (s *WorkspaceService) GetByID(id string) (*Workspace, error) {
	var ws Workspace
	if err := s.db.Where("id = ?", id).First(&ws).Error; err != nil {
		return nil, err
	}
	return &ws, nil
}

// GetBySubdomain looks up a workspace via its globally unique subdomain label.
func (s *WorkspaceService) GetBySubdomain(subdomain string) (*Workspace, error) {
	normalized := strings.ToLower(strings.TrimSpace(subdomain))
	if normalized == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var ws Workspace
	if err := s.db.Where("subdomain = ?", normalized).First(&ws).Error; err != nil {
		return nil, err
	}
	return &ws, nil
}

// RenameWorkspace updates the display name for a workspace after sanitizing the payload.
func (s *WorkspaceService) RenameWorkspace(workspaceID string, newName string) (*Workspace, error) {
	trimmed := strings.TrimSpace(newName)
	if trimmed == "" {
		return nil, errors.New("workspace name is required")
	}

	var workspace Workspace
	if err := s.db.Where("id = ?", workspaceID).First(&workspace).Error; err != nil {
		return nil, err
	}

	workspace.Name = trimmed
	if err := s.db.Save(&workspace).Error; err != nil {
		return nil, err
	}

	return &workspace, nil
}

// DeleteWorkspace removes the workspace and all dependent records. Because numerous tables reference
// the workspace identifier we execute the cleanup inside a transaction to guarantee consistency.
func (s *WorkspaceService) DeleteWorkspace(workspaceID string) error {
	tx := s.db.Begin()
	if err := tx.Error; err != nil {
		return err
	}

	rollback := func(err error) error {
		tx.Rollback()
		return err
	}

	// Clean up billing-related records first
	cleanupSteps := []func(*gorm.DB) error{
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&StripeSubscriptionInfo{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&StripePayment{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&SubscriptionCredit{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&WorkspaceInvite{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&WorkspaceEmailInvite{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&TeamMember{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&Team{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&ACLEntry{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&WorkspaceMember{}).Error
		},
		func(db *gorm.DB) error {
			return db.Where("workspace_id = ?", workspaceID).Delete(&WorkspaceSubscription{}).Error
		},
	}

	for _, step := range cleanupSteps {
		if err := step(tx); err != nil {
			return rollback(err)
		}
	}

	if err := tx.Delete(&Workspace{}, "id = ?", workspaceID).Error; err != nil {
		return rollback(err)
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	return nil
}

// CreateWorkspace creates a new workspace and automatically adds the specified user to it.
// The workspaceID is client-generated and cryptographically bound in the initial key share signature.
// Requires initial key params to ensure the workspace has an encryption key from creation.
func (s *WorkspaceService) CreateWorkspace(workspaceID string, name string, userID string, initialKey InitialWorkspaceKeyParams) (*CreateWorkspaceResponse, error) {
	return s.createWorkspace(workspaceID, name, userID, &initialKey, workspaceCreationOptions{})
}

// CreateWorkspaceWithSubdomain provisions a workspace with the specified subdomain, returning an error when it is already taken.
func (s *WorkspaceService) CreateWorkspaceWithSubdomain(workspaceID string, name string, userID string, initialKey InitialWorkspaceKeyParams, subdomain string) (*CreateWorkspaceResponse, error) {
	cleanSubdomain := NormalizeWorkspaceSubdomainSource(subdomain)
	if cleanSubdomain == "" {
		return nil, ErrWorkspaceSubdomainUnavailable
	}
	return s.createWorkspace(workspaceID, name, userID, &initialKey, workspaceCreationOptions{
		forcedSubdomain:       cleanSubdomain,
		enforceExactSubdomain: true,
	})
}

// createWorkspace implements the core workspace creation logic.
// Creates the workspace, membership, team, and the initial workspace key and key share all in one transaction.
// The workspaceID is client-generated and cryptographically bound in the initial key share signature.
func (s *WorkspaceService) createWorkspace(workspaceID string, name string, userID string, initialKey *InitialWorkspaceKeyParams, opts workspaceCreationOptions) (*CreateWorkspaceResponse, error) {
	const maxSubdomainRetries = 5
	if opts.subdomainRetryCount > maxSubdomainRetries {
		return nil, fmt.Errorf("failed to provision unique workspace subdomain after %d retries", maxSubdomainRetries)
	}

	// Validate workspace ID format
	if _, err := uuid.Parse(workspaceID); err != nil {
		return nil, fmt.Errorf("invalid workspace ID format: must be a valid UUID")
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Error; err != nil {
		return nil, err
	}

	workspaceSubdomain, err := s.resolveWorkspaceSubdomain(tx, name, opts)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	creatorCampaign, campaignErr := s.resolveCreatorCampaign(tx, userID)
	if campaignErr != nil {
		tx.Rollback()
		return nil, campaignErr
	}

	// Create workspace with the client-provided ID, setting the initial key ID if provided
	workspace := &Workspace{
		ID:                  workspaceID,
		Name:                name,
		Subdomain:           workspaceSubdomain,
		OnboardingCompleted: false,
		AcquisitionCampaign: creatorCampaign,
	}

	// Set the current workspace key ID if initial key params are provided
	if initialKey != nil {
		workspace.CurrentWorkspaceKeyID = &initialKey.KeyID
	}

	if err := tx.Create(workspace).Error; err != nil {
		tx.Rollback()
		if isWorkspaceSubdomainUniqueConstraintError(err) {
			if opts.enforceExactSubdomain {
				return nil, ErrWorkspaceSubdomainUnavailable
			}
			retryOptions := opts
			retryOptions.subdomainRetryCount++
			return s.createWorkspace(workspaceID, name, userID, initialKey, retryOptions)
		}
		if opts.enforceExactSubdomain && isUniqueConstraintError(err) {
			return nil, ErrWorkspaceSubdomainUnavailable
		}
		return nil, err
	}

	// Create the initial workspace key and share if initial key params are provided
	if initialKey != nil {
		// Create the initial workspace key (generation 1)
		workspaceKey := &WorkspaceKey{
			ID:              initialKey.KeyID,
			WorkspaceID:     workspace.ID,
			Generation:      1,
			CreatedByUserID: userID,
		}
		if err := tx.Create(workspaceKey).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to create initial workspace key: %w", err)
		}

		// Create the key share for the creator (self-share)
		keyShare := &WorkspaceKeyShare{
			ID:                  initialKey.Share.ShareID,
			WorkspaceID:         workspace.ID,
			WorkspaceKeyID:      initialKey.KeyID,
			RecipientUserID:     userID,
			SenderUserID:        userID,
			SenderBoxPublicKey:  initialKey.Share.SenderBoxPublicKey,
			SenderSignPublicKey: initialKey.Share.SenderSignPublicKey,
			Nonce:               initialKey.Share.Nonce,
			Ciphertext:          initialKey.Share.Ciphertext,
			ShareSignature:      initialKey.Share.ShareSignature,
		}
		if err := tx.Create(keyShare).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to create initial workspace key share: %w", err)
		}
	}

	// Create the workspace member entry for the creator as super admin
	workspaceUser := newWorkspaceMemberPlaceholder(workspace.ID, userID, WorkspaceMemberRoleSuperAdmin)

	if err := tx.Create(&workspaceUser).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Create the Everyone team for this workspace and add the creator as a member
	everyoneTeam := NewEveryoneTeam(workspace.ID)
	if err := tx.Create(everyoneTeam).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	everyoneTeamMember := &TeamMember{
		ID:          uuid.NewString(),
		TeamID:      everyoneTeam.ID,
		WorkspaceID: workspace.ID,
		UserID:      userID,
		Role:        TeamMemberRoleMember,
	}
	if err := tx.Create(everyoneTeamMember).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// Run onboarding seeder after commit if configured
	if s.onboardingSeeder != nil {
		seedingParams := WorkspaceOnboardingSeedParams{
			Workspace:     workspace,
			CreatorUserID: userID,
		}
		if err := s.onboardingSeeder.SeedWorkspaceContent(seedingParams); err != nil {
			utils.Warnf("workspace onboarding seeding failed workspace_id=%s err=%v", workspace.ID, err)
		}
	}

	return &CreateWorkspaceResponse{
		Workspace: &WorkspaceWithMembershipResponse{
			ID:                    workspace.ID,
			Name:                  workspace.Name,
			Subdomain:             workspace.Subdomain,
			OnboardingCompleted:   workspace.OnboardingCompleted,
			ReadonlySince:         workspace.ReadonlySince,
			AcquisitionCampaign:   workspace.AcquisitionCampaign,
			CurrentWorkspaceKeyID: workspace.CurrentWorkspaceKeyID,
			CreatedAt:             workspace.CreatedAt,
			UpdatedAt:             workspace.UpdatedAt,
			JoinedAt:              workspaceUser.CreatedAt,
			UserID:                userID,
		},
	}, nil
}

// resolveWorkspaceSubdomain determines the subdomain for a new workspace.
func (s *WorkspaceService) resolveWorkspaceSubdomain(tx *gorm.DB, workspaceName string, opts workspaceCreationOptions) (string, error) {
	if opts.forcedSubdomain == "" {
		return GenerateUniqueWorkspaceSubdomain(tx, workspaceName)
	}
	candidate := strings.ToLower(strings.TrimSpace(opts.forcedSubdomain))
	if candidate == "" {
		return "", ErrWorkspaceSubdomainUnavailable
	}
	exists, err := workspaceSubdomainExists(tx, candidate)
	if err != nil {
		return "", err
	}
	if exists {
		return "", ErrWorkspaceSubdomainUnavailable
	}
	return candidate, nil
}

// isUniqueConstraintError checks if an error is a database unique constraint violation.
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "duplicate key") || strings.Contains(lower, "unique constraint")
}

func isWorkspaceSubdomainUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "idx_workspaces_subdomain")
}

// GetWorkspaces returns all workspaces a user is a member of.
func (s *WorkspaceService) GetWorkspaces(userID string) ([]*Workspace, error) {
	var workspaces []*Workspace
	if err := s.db.Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ?", userID).
		Find(&workspaces).Error; err != nil {
		return nil, err
	}
	return workspaces, nil
}

// GetWorkspacesWithMembership returns workspaces with membership data for a user.
func (s *WorkspaceService) GetWorkspacesWithMembership(userID string) ([]*WorkspaceWithMembershipResponse, error) {
	var results []*WorkspaceWithMembershipResponse

	if err := s.db.Table("workspaces").
		Select("workspaces.id, workspaces.name, workspaces.subdomain, workspaces.onboarding_completed, workspaces.readonly_since, workspaces.acquisition_campaign, workspaces.current_workspace_key_id, workspaces.created_at, workspaces.updated_at, workspace_members.created_at as joined_at, workspace_members.user_id as user_id").
		Joins("JOIN workspace_members ON workspace_members.workspace_id = workspaces.id").
		Where("workspace_members.user_id = ?", userID).
		Scan(&results).Error; err != nil {
		return nil, err
	}

	// Ensure we return an empty slice instead of nil so that JSON marshals to [] rather than null
	if results == nil {
		results = make([]*WorkspaceWithMembershipResponse, 0)
	}

	return results, nil
}

// SetOnboardingCompleted marks the workspace onboarding as complete or incomplete.
func (s *WorkspaceService) SetOnboardingCompleted(workspaceID string, completed bool) error {
	result := s.db.Model(&Workspace{}).
		Where("id = ?", workspaceID).
		Update("onboarding_completed", completed)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("no workspace found with id %s", workspaceID)
	}
	return nil
}
