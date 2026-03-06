package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"shape/config"
	"shape/middleware"
	"shape/models"
	"shape/repositories"
	"shape/services"
	"shape/usecase"

	"gorm.io/gorm"
)

// Handlers contains all domain-specific handlers for the server.
// This is the foundational handler structure without app-specific handlers (discussions, projects, etc.)
type Handlers struct {
	Auth                      *AuthHandlers
	UserSettings              *UserSettingsHandlers
	Workspace                 *WorkspaceHandlers
	WorkspaceMembers          *WorkspaceMembersHandlers
	Teams                     *TeamHandlers
	WorkspaceKeys             *WorkspaceKeyHandlers
	Entities                  *EntityHandlers
	Files                     *FileHandlers
	Invite                    *InviteHandlers
	UserInvites               *UserInviteHandlers
	LinkInvites               *LinkInviteHandlers
	EntityLinks               *EntityLinkHandlers
	SSE                       *SSEHandlers
	Test                      *TestHandlers
	Subscription              *SubscriptionHandlers
	Stripe                    *StripeHandlers
	Sync                      *UnifiedSyncHandlers
	Notifications             *NotificationHandlers
	NotificationSubscriptions *NotificationSubscriptionHandlers
	NotificationSettings      *NotificationSettingsHandlers
	DeviceTokens              *DeviceTokenHandlers
	Mentions                  *MentionHandlers
	SubscriptionSvc           *services.WorkspaceSubscriptionService
	EmailInvites              *models.WorkspaceEmailInviteService
	UserInviteSvc             *models.WorkspaceUserInviteService
	LinkInviteSvc             *models.WorkspaceLinkInviteService

	userSettingsService *models.UserSettingsService
	emailService        services.EmailService
	workspaceService    *models.WorkspaceService
}

// UserSettingsService exposes the user settings service for background jobs.
func (h *Handlers) UserSettingsService() *models.UserSettingsService {
	return h.userSettingsService
}

// EmailService exposes the email service for background jobs.
func (h *Handlers) EmailService() services.EmailService {
	return h.emailService
}

// WorkspaceService exposes the workspace service for shared middleware.
func (h *Handlers) WorkspaceService() *models.WorkspaceService {
	return h.workspaceService
}

// Common response structures used across handlers.
type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Message string       `json:"message"`
	User    *models.User `json:"user,omitempty"`
}

// Health responds with a 200 so load balancers can determine if the service is ready.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	JSONResponse(w, map[string]string{"status": "ok"}, http.StatusOK)
}

// JSONError sends a consistent JSON error response to the client.
func JSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ErrorResponse{Error: message})
}

// JSONErrorWithErr adds underlying error details in non-production environments.
func JSONErrorWithErr(w http.ResponseWriter, message string, err error, statusCode int) {
	if err != nil {
		log.Printf("http_error status=%d message=%q err=%v", statusCode, message, err)
		env := strings.ToLower(os.Getenv("ENVIRONMENT"))
		if env == "development" || env == "dev" || env == "test" || env == "local" {
			message = message + ": " + err.Error()
		}
	}
	JSONError(w, message, statusCode)
}

// JSONResponse sends a consistent JSON response to the client.
func JSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

type changeLogServiceAdapter struct {
	service *services.ChangeLogService
}

func (a changeLogServiceAdapter) AppendChange(ctx context.Context, params models.ChangeLogAppendParams) (*models.ChangeLogEntry, error) {
	if a.service == nil {
		return nil, fmt.Errorf("change log service unavailable")
	}
	return a.service.AppendChange(ctx, services.AppendChangeParams{
		WorkspaceID: params.WorkspaceID,
		EntityType:  params.EntityType,
		EntityID:    params.EntityID,
		Operation:   params.Operation,
		ActorID:     params.ActorID,
	})
}

// New creates a new instance of all handlers with their dependencies wired.
func New(db *gorm.DB, config *config.Config, analyticsService services.AnalyticsService) *Handlers {
	// Initialize session store for cookie-based web authentication.
	// Tauri apps use token-based auth (Bearer tokens stored in OS keychain) instead.
	middleware.InitSessionStore(config.SessionSecret, config.IsDevelopment(), config.SessionCookieDomain)

	// Initialize app token auth for Tauri desktop/mobile apps.
	// These apps use Bearer token auth stored in OS keychain instead of cookies,
	// which bypasses cross-origin cookie issues with SSE/EventSource in WebView.
	middleware.InitAppTokenAuth(config.CryptoHMACSecret)

	// Initialize core services used across handlers.
	userService := models.NewUserService(db)
	workspaceChecker := services.NewWorkspaceChecker(db)
	workspaceService := models.NewWorkspaceService(db)

	appURL := getEnvOr("APP_URL", "https://app.conquer.local")

	subscriptionService := services.NewWorkspaceSubscriptionService(
		db,
		config.StripeSecretKey,
		config.StripePriceID,
		config.StripeWebhookSecret,
		appURL,
		config.SelfHosted,
	)

	// Initialize change log repository and service for sync infrastructure.
	// The repository handles database operations, while the service provides business logic.
	// We use an adapter to bridge between repositories.ChangeLogRepository and services.ChangeLogRepository
	// because they have matching methods but use different DTO types to avoid import cycles.
	changeLogRepoAdapter := NewChangeLogRepositoryAdapter(db)
	changeLogService := services.NewChangeLogService(changeLogRepoAdapter)

	workspaceMemberService := models.NewWorkspaceMemberService(
		db,
		userService,
		workspaceChecker,
		subscriptionService,
		services.GetSSEManager(),
		changeLogServiceAdapter{service: changeLogService},
	)

	inviteService := models.NewInviteService(db, workspaceChecker, subscriptionService)

	emailInviteService := models.NewWorkspaceEmailInviteService(db, subscriptionService, models.WorkspaceEmailInviteConfig{
		DefaultTTL:     durationDaysFromEnv("WORKSPACE_EMAIL_INVITE_TTL_DAYS", 0),
		ResendCooldown: durationMinutesFromEnv("WORKSPACE_EMAIL_INVITE_RESEND_MINUTES", 0),
	})

	userSettingsService := models.NewUserSettingsService(db)

	// Wire dependencies into SSE manager for real-time updates.
	services.GetSSEManager().SetDB(db)

	// Initialize S3 service for file and avatar storage (optional - gracefully handle failure).
	s3Service, err := services.NewS3Service()
	if err != nil {
		fmt.Printf("Warning: Failed to initialize S3 service: %v\n", err)
	}

	// Initialize email service (SES by default, SMTP for local dev).
	var emailService services.EmailService
	appName := "Shape"
	fmt.Printf("email: initializing driver=%s\n", config.EmailDriver)

	switch config.EmailDriver {
	case "smtp":
		fmt.Printf("email: SMTP host=%s port=%s from=%s\n", config.SMTPHost, config.SMTPPort, config.SESSenderEmail)
		emailService = services.NewSMTPEmailService(
			config.SMTPHost,
			config.SMTPPort,
			config.SMTPUsername,
			config.SMTPPassword,
			config.SESSenderEmail,
			appName,
			appURL,
			config.EmailAssetsURL,
		)
	default:
		fmt.Printf("email: SES region=%s from=%s\n", config.AWSRegion, config.SESSenderEmail)
		if svc, err := services.NewSESEmailService(config.AWSRegion, config.SESSenderEmail, appName, appURL, config.EmailAssetsURL); err == nil {
			emailService = svc
		} else {
			fmt.Printf("Warning: Failed to initialize SES email service: %v\n", err)
		}
	}

	// In test environment, force SMTP and enable capture for integration tests.
	if strings.ToLower(config.Environment) == "test" {
		fmt.Printf("email: forcing SMTP in test env host=%s port=%s from=%s\n", config.SMTPHost, config.SMTPPort, config.SESSenderEmail)
		emailService = services.NewSMTPEmailService(
			config.SMTPHost,
			config.SMTPPort,
			config.SMTPUsername,
			config.SMTPPassword,
			config.SESSenderEmail,
			appName,
			appURL,
			config.EmailAssetsURL,
		)
		services.EnableTestEmailCapture(true)
		log.Println("email: TEST environment – outbound delivery is captured locally (Mailpit/in-memory); external mailboxes will not receive these messages")
	}

	// Initialize E2EE workspace key services
	workspaceKeyService := models.NewWorkspaceKeyService(db)
	workspaceKeyShareService := models.NewWorkspaceKeyShareService(db)

	// Initialize ACL and team services for resource-level access control (before group chats)
	aclService := services.NewACLService(db)

	// Initialize ACL performance infrastructure (entity closure + effective access cache)
	entityClosureService := services.NewEntityClosureService(db)
	effectiveAccessService := services.NewEffectiveAccessService(db, entityClosureService)

	// Wire effective access service to ACL service for cache updates on ACL changes
	aclService.SetEffectiveAccessService(effectiveAccessService)

	// Wire effective access service to SSE manager for ACL-aware broadcasts
	services.GetSSEManager().SetEffectiveAccessService(effectiveAccessService)

	// Initialize entity block services for generic collaborative content storage
	entityBlockRepository := repositories.NewEntityBlockRepository(db)
	entityBlockService := services.NewEntityBlockService(entityBlockRepository)

	// Initialize unified entity repository + service
	entityRepository := repositories.NewEntityRepository(db)
	entityService := services.NewEntityService(entityRepository, aclService, effectiveAccessService)

	// Initialize the entity broadcast use case for SSE entity payloads.
	entityBroadcastUseCase := usecase.NewEntityBroadcastUseCase(services.GetSSEManager(), entityService)

	// Initialize file upload tracking services for file entities.
	fileUploadPartService := services.NewFileUploadPartService(db)
	fileUploadSessionService := services.NewFileUploadSessionService(db)

	// Initialize team service for resource-level access control
	teamService := services.NewTeamService(db)

	// Centralized ACL share broadcaster for SSE entity hydration on ACL grants.
	aclRealtimeShareService := services.NewACLRealtimeShareService(services.GetSSEManager(), teamService)

	// Wire effective access service to services that use the cache for fast lookups
	teamService.SetEffectiveAccessService(effectiveAccessService)

	// Initialize user invite service for existing user invitations
	userInviteService := models.NewWorkspaceUserInviteService(db, subscriptionService)

	// Initialize link invite service for E2EE invite links (user without account flow)
	linkInviteService := models.NewWorkspaceLinkInviteService(db, subscriptionService, models.WorkspaceLinkInviteConfig{})

	// Initialize entity link service for backlinking/navigation across unified entities.
	entityLinkService := models.NewEntityLinkService(db)

	// Initialize invite code service for registration gating
	inviteCodeService := models.NewInviteCodeService(db)

	// Refresh tokens for Tauri app auth rotation.
	appRefreshTokenService := models.NewAppRefreshTokenService(db)

	// Initialize notification service for in-app notifications, subscriptions, and preferences.
	notificationService := services.NewNotificationService(db, aclService, workspaceChecker, services.GetSSEManager())

	return &Handlers{
		Auth:                      NewAuthHandlers(userService, workspaceService, workspaceMemberService, emailInviteService, inviteCodeService, appRefreshTokenService, s3Service, config, emailService, analyticsService),
		UserSettings:              NewUserSettingsHandlers(userSettingsService),
		Workspace:                 NewWorkspaceHandlers(workspaceService, subscriptionService, workspaceChecker, workspaceMemberService, changeLogService, config.SelfHosted),
		WorkspaceMembers:          NewWorkspaceMembersHandlers(workspaceMemberService, userService, workspaceService, subscriptionService, emailInviteService, emailService),
		WorkspaceKeys:             NewWorkspaceKeyHandlers(workspaceKeyService, workspaceKeyShareService, workspaceChecker),
		Teams:                     NewTeamHandlers(teamService, workspaceChecker),
		Entities:                  NewEntityHandlers(entityService, entityBlockService, notificationService, aclService, workspaceChecker, services.GetSSEManager(), aclRealtimeShareService, changeLogService, entityBroadcastUseCase),
		Files:                     NewFileHandlers(entityService, fileUploadPartService, fileUploadSessionService, workspaceChecker, changeLogService, s3Service, entityBroadcastUseCase),
		Invite:                    NewInviteHandlers(inviteService, emailInviteService, workspaceMemberService, workspaceService, userService),
		UserInvites:               NewUserInviteHandlers(userInviteService, workspaceMemberService, workspaceChecker, userService),
		LinkInvites:               NewLinkInviteHandlers(linkInviteService, workspaceMemberService, workspaceService, workspaceChecker, workspaceKeyShareService, userService),
		EntityLinks:               NewEntityLinkHandlers(entityLinkService, workspaceChecker),
		SSE:                       NewSSEHandlers(),
		Test:                      NewTestHandlers(db, subscriptionService, workspaceService),
		Subscription:              NewSubscriptionHandlers(subscriptionService, workspaceChecker, userService, workspaceMemberService, emailInviteService, workspaceService, emailService),
		Stripe:                    NewStripeHandlers(subscriptionService),
		Sync:                      NewUnifiedSyncHandlers(changeLogService, workspaceChecker, entityService, entityBlockService),
		Notifications:             NewNotificationHandlers(notificationService, workspaceChecker),
		NotificationSubscriptions: NewNotificationSubscriptionHandlers(notificationService, workspaceChecker),
		NotificationSettings:      NewNotificationSettingsHandlers(notificationService, workspaceChecker),
		DeviceTokens:              NewDeviceTokenHandlers(notificationService),
		Mentions:                  NewMentionHandlers(aclService, workspaceChecker),
		SubscriptionSvc:           subscriptionService,
		EmailInvites:              emailInviteService,
		UserInviteSvc:             userInviteService,
		LinkInviteSvc:             linkInviteService,

		userSettingsService: userSettingsService,
		emailService:        emailService,
		workspaceService:    workspaceService,
	}
}

// getEnvOr returns the environment variable value or the default if not set.
func getEnvOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// durationDaysFromEnv parses an integer environment variable as days, returning the fallback on error.
func durationDaysFromEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	val, err := strconv.Atoi(raw)
	if err != nil || val <= 0 {
		return fallback
	}
	return time.Duration(val) * 24 * time.Hour
}

// durationMinutesFromEnv parses an integer environment variable as minutes, returning the fallback on error.
func durationMinutesFromEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	val, err := strconv.Atoi(raw)
	if err != nil || val <= 0 {
		return fallback
	}
	return time.Duration(val) * time.Minute
}

// changeLogRepositoryAdapter adapts repositories.ChangeLogRepository to models.ChangeLogRepository.
// This adapter is necessary because both packages define their own DTO types (ChangeLogRepositoryEntry)
// with matching field structures but different package origins. This avoids import cycles while
// allowing the repository pattern to work across package boundaries.
type changeLogRepositoryAdapter struct {
	repo repositories.ChangeLogRepository
}

// NewChangeLogRepositoryAdapter creates a new adapter that wraps a repositories.ChangeLogRepository.
func NewChangeLogRepositoryAdapter(db *gorm.DB) *changeLogRepositoryAdapter {
	return &changeLogRepositoryAdapter{
		repo: repositories.NewChangeLogRepository(db),
	}
}

// AppendChangeLogEntry converts between services.ChangeLogRepositoryEntry (DTO) and models.ChangeLogEntry (model),
// then delegates to the underlying repository.
func (a *changeLogRepositoryAdapter) AppendChangeLogEntry(ctx context.Context, entry *services.ChangeLogRepositoryEntry) error {
	// Convert services DTO to model struct for the repository.
	modelEntry := &models.ChangeLogEntry{
		ID:          entry.ID,
		WorkspaceID: entry.WorkspaceID,
		Sequence:    entry.Sequence,
		EntityType:  models.ChangeLogEntityType(entry.EntityType),
		EntityID:    entry.EntityID,
		Operation:   models.ChangeLogOperation(entry.Operation),
		ActorID:     entry.ActorID,
	}

	// Delegate to the underlying repository.
	if err := a.repo.AppendChangeLogEntry(ctx, modelEntry); err != nil {
		return err
	}

	// Copy back the assigned sequence number.
	entry.Sequence = modelEntry.Sequence
	entry.ID = modelEntry.ID

	return nil
}

// FindChangeLogEntriesSinceSequence delegates to the underlying repository and converts results.
func (a *changeLogRepositoryAdapter) FindChangeLogEntriesSinceSequence(
	ctx context.Context,
	workspaceID string,
	entityType string,
	sinceSequence int64,
	limit int,
) ([]services.ChangeLogRepositoryEntry, bool, error) {
	// Delegate to repository.
	repoEntries, hasMore, err := a.repo.FindChangeLogEntriesSinceSequence(ctx, workspaceID, entityType, sinceSequence, limit)
	if err != nil {
		return nil, false, err
	}

	// Convert model entries to DTO format (typed enums → strings).
	svcEntries := make([]services.ChangeLogRepositoryEntry, len(repoEntries))
	for i, re := range repoEntries {
		svcEntries[i] = services.ChangeLogRepositoryEntry{
			ID:          re.ID,
			WorkspaceID: re.WorkspaceID,
			Sequence:    re.Sequence,
			EntityType:  string(re.EntityType),
			EntityID:    re.EntityID,
			Operation:   string(re.Operation),
			ActorID:     re.ActorID,
		}
	}

	return svcEntries, hasMore, nil
}

// FindAllChangeLogEntriesSinceSequence delegates to the underlying repository and converts results.
func (a *changeLogRepositoryAdapter) FindAllChangeLogEntriesSinceSequence(
	ctx context.Context,
	workspaceID string,
	sinceSequence int64,
	limit int,
) ([]services.ChangeLogRepositoryEntry, bool, error) {
	// Delegate to repository.
	repoEntries, hasMore, err := a.repo.FindAllChangeLogEntriesSinceSequence(ctx, workspaceID, sinceSequence, limit)
	if err != nil {
		return nil, false, err
	}

	// Convert model entries to DTO format (typed enums → strings).
	svcEntries := make([]services.ChangeLogRepositoryEntry, len(repoEntries))
	for i, re := range repoEntries {
		svcEntries[i] = services.ChangeLogRepositoryEntry{
			ID:          re.ID,
			WorkspaceID: re.WorkspaceID,
			Sequence:    re.Sequence,
			EntityType:  string(re.EntityType),
			EntityID:    re.EntityID,
			Operation:   string(re.Operation),
			ActorID:     re.ActorID,
		}
	}

	return svcEntries, hasMore, nil
}

// FindMaxSequenceForWorkspace delegates directly to the underlying repository (no conversion needed).
func (a *changeLogRepositoryAdapter) FindMaxSequenceForWorkspace(ctx context.Context, workspaceID string) (int64, error) {
	return a.repo.FindMaxSequenceForWorkspace(ctx, workspaceID)
}
