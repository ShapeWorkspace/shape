package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"shape/config"
	"shape/database"
	"shape/handlers"
	"shape/middleware"
	"shape/services"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
)

func main() {
	// Load environment variables from repo root or server/.env to support local dev.
	envLoaded := false
	if err := godotenv.Load(".env"); err == nil {
		envLoaded = true
	}
	if err := godotenv.Load("server/.env"); err == nil {
		envLoaded = true
	}
	if !envLoaded {
		log.Println("No .env file found")
	}

	// Initialize configuration from environment variables.
	cfg := config.Load()

	// Initialize database with the configured connection string.
	db, err := database.InitDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// Get underlying sql.DB for connection management.
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal("Failed to get underlying sql.DB:", err)
	}
	defer sqlDB.Close()

	// Run migrations for the foundational schema (users, workspaces, memberships, subscriptions, etc.).
	if err := database.RunMigrations(db); err != nil {
		log.Fatal("Failed to run migrations:", err)
	}

	// Initialize analytics with a no-op implementation.
	var analyticsService services.AnalyticsService = &services.NoOpAnalyticsService{}

	// Generate a unique instance ID for this server instance (useful for SSE diagnostics).
	instanceID := mustGenerateInstanceID()

	// Provide the SSE manager with the instance identifier for connected payloads.
	services.GetSSEManager().SetInstanceID(instanceID)

	// Enable Redis pub/sub for SSE when configured, allowing real-time updates across server instances.
	if cfg.RedisEnabled {
		if strings.TrimSpace(cfg.RedisAddress) == "" {
			log.Fatal("REDIS_ENABLED is true but REDIS_ADDRESS is not set")
		}
		redisOpts := services.RedisOptions{
			Address:    cfg.RedisAddress,
			Username:   cfg.RedisUsername,
			Password:   cfg.RedisPassword,
			TLSEnabled: cfg.RedisTLSEnabled,
		}
		if err := services.GetSSEManager().EnableRedis(redisOpts); err != nil {
			log.Fatalf("failed to initialize redis for SSE: %v", err)
		}
		defer services.GetSSEManager().CloseRedis()
	}

	// Initialize handlers with all dependencies.
	h := handlers.New(db, cfg, analyticsService)

	// Setup routes using Gorilla mux.
	router := mux.NewRouter().StrictSlash(true)
	router.Use(middleware.InstanceIDMiddleware(instanceID))
	router.Use(middleware.ResolveWorkspaceIdentifier(h.WorkspaceService()))

	// SSE endpoints under /api/sse (register before logging middleware).
	router.HandleFunc("/api/sse/workspaces/{workspaceId}/notifications/events", middleware.RequireAuthSSE(h.SSE.HandleNotificationSSE)).Methods("GET")
	// SSE token exchange endpoint - exchanges app token for short-lived SSE token.
	// Uses RequireAuth (not RequireAuthSSE) since it receives the app token in Authorization header.
	router.HandleFunc("/api/sse/token", middleware.RequireAuth(h.SSE.GenerateSSEToken)).Methods("POST")

	// Add logging middleware (after SSE route to avoid logging each SSE ping).
	router.Use(middleware.LoggingMiddleware)

	// API routes with JSON middleware.
	api := router.PathPrefix("/api").Subrouter()
	api.Use(middleware.JSONMiddleware)

	// Stripe webhook endpoint (must be before auth middleware).
	api.HandleFunc("/stripe/webhook", h.Stripe.HandleWebhook).Methods("POST")

	// Health endpoint for load balancer checks.
	api.HandleFunc("/health", h.Health).Methods("GET")

	// Auth routes (user authentication operations).
	auth := api.PathPrefix("/auth").Subrouter()
	auth.HandleFunc("/register", h.Auth.Register).Methods("POST")
	auth.HandleFunc("/login-challenge", h.Auth.LoginChallenge).Methods("POST")
	auth.HandleFunc("/login", h.Auth.Login).Methods("POST")
	auth.HandleFunc("/refresh", h.Auth.RefreshAppToken).Methods("POST")
	auth.HandleFunc("/forgot-password", h.Auth.ForgotPassword).Methods("POST")
	auth.HandleFunc("/reset-password", h.Auth.ResetPassword).Methods("POST")
	auth.HandleFunc("/change-password", middleware.RequireAuth(h.Auth.ChangePassword)).Methods("POST")
	auth.HandleFunc("/logout", middleware.RequireAuth(h.Auth.Logout)).Methods("POST")
	auth.HandleFunc("/logout-all", middleware.RequireAuth(h.Auth.LogoutAll)).Methods("POST")
	auth.HandleFunc("/me", middleware.RequireAuth(h.Auth.GetCurrentUser)).Methods("GET")
	auth.HandleFunc("/me/settings", middleware.RequireAuth(h.UserSettings.GetUserSettings)).Methods("GET")
	auth.HandleFunc("/me/settings", middleware.RequireAuth(h.UserSettings.UpdateUserSettings)).Methods("PUT")

	// User workspace operations (not namespaced to a specific workspace).
	workspaces := api.PathPrefix("/workspaces").Subrouter()
	workspaces.HandleFunc("", middleware.RequireAuth(h.Workspace.CreateWorkspace)).Methods("POST")
	workspaces.HandleFunc("", middleware.RequireAuth(h.Workspace.GetWorkspacesWithMembership)).Methods("GET")

	// Activation endpoint must bypass workspace read-only middleware so admins can unlock billing.
	api.HandleFunc("/workspaces/{workspaceId}/activate", middleware.RequireAuth(h.Subscription.ActivateWorkspace)).Methods("POST")

	// Workspace-namespaced routes (all operations within a specific workspace).
	workspaceAPI := api.PathPrefix("/workspaces/{workspaceId}").Subrouter()
	workspaceAPI.Use(middleware.RequireWorkspaceWritableOnWorkspaceParam(h.SubscriptionSvc))
	workspaceAPI.HandleFunc("", middleware.RequireAuth(h.Workspace.UpdateWorkspace)).Methods("PUT")
	workspaceAPI.HandleFunc("", middleware.RequireAuth(h.Workspace.DeleteWorkspace)).Methods("DELETE")

	// Workspace member routes.
	workspaceAPI.HandleFunc("/members", middleware.RequireAuth(h.WorkspaceMembers.GetWorkspaceMembers)).Methods("GET")
	workspaceAPI.HandleFunc("/members", middleware.RequireAuth(h.WorkspaceMembers.AddMemberToWorkspace)).Methods("POST")
	workspaceAPI.HandleFunc("/members/batch", middleware.RequireAuth(h.WorkspaceMembers.GetWorkspaceMembersBatch)).Methods("POST")
	workspaceAPI.HandleFunc("/members/me", middleware.RequireAuth(h.WorkspaceMembers.UpdateOwnProfile)).Methods("PUT")
	workspaceAPI.HandleFunc("/members/{userId}", middleware.RequireAuth(h.WorkspaceMembers.GetWorkspaceMember)).Methods("GET")
	workspaceAPI.HandleFunc("/members/{userId}", middleware.RequireAuth(h.WorkspaceMembers.RemoveMemberFromWorkspace)).Methods("DELETE")
	workspaceAPI.HandleFunc("/members/{userId}", middleware.RequireAuth(h.WorkspaceMembers.UpdateMemberRole)).Methods("PUT")
	workspaceAPI.HandleFunc("/pending-invites", middleware.RequireAuth(h.WorkspaceMembers.GetPendingInvites)).Methods("GET")
	workspaceAPI.HandleFunc("/pending-invites/{inviteId}", middleware.RequireAuth(h.WorkspaceMembers.RevokePendingInvite)).Methods("DELETE")

	// Workspace invites (shareable invite links).
	workspaceAPI.HandleFunc("/invites", middleware.RequireAuth(h.Invite.CreateWorkspaceInvite)).Methods("POST")
	workspaceAPI.HandleFunc("/invites", middleware.RequireAuth(h.Invite.GetWorkspaceInvites)).Methods("GET")
	workspaceAPI.HandleFunc("/invites/{inviteId}", middleware.RequireAuth(h.Invite.RevokeWorkspaceInvite)).Methods("DELETE")

	// User invites (inviting existing users to a workspace).
	workspaceAPI.HandleFunc("/user-invites", middleware.RequireAuth(h.UserInvites.CreateUserInvite)).Methods("POST")
	workspaceAPI.HandleFunc("/user-invites", middleware.RequireAuth(h.UserInvites.GetWorkspaceUserInvites)).Methods("GET")
	workspaceAPI.HandleFunc("/user-invites/{inviteId}", middleware.RequireAuth(h.UserInvites.RevokeUserInvite)).Methods("DELETE")

	// Link invites with E2EE key bundles (inviting users without accounts).
	workspaceAPI.HandleFunc("/link-invites", middleware.RequireAuth(h.LinkInvites.CreateLinkInvite)).Methods("POST")
	workspaceAPI.HandleFunc("/link-invites", middleware.RequireAuth(h.LinkInvites.GetWorkspaceLinkInvites)).Methods("GET")
	workspaceAPI.HandleFunc("/link-invites/{inviteId}", middleware.RequireAuth(h.LinkInvites.RevokeLinkInvite)).Methods("DELETE")

	// Subscription management routes.
	workspaceAPI.HandleFunc("/subscription", middleware.RequireAuth(h.Subscription.GetSubscription)).Methods("GET")
	workspaceAPI.HandleFunc("/subscription/checkout", middleware.RequireAuth(h.Subscription.CreateCheckoutSession)).Methods("POST")
	workspaceAPI.HandleFunc("/subscription/portal", middleware.RequireAuth(h.Subscription.CreateBillingPortalSession)).Methods("POST")
	workspaceAPI.HandleFunc("/onboarding/complete", middleware.RequireAuth(h.Workspace.CompleteOnboarding)).Methods("POST")

	// Workspace key routes (E2EE key management).
	workspaceAPI.HandleFunc("/keys", middleware.RequireAuth(h.WorkspaceKeys.GetWorkspaceKeys)).Methods("GET")
	workspaceAPI.HandleFunc("/keys", middleware.RequireAuth(h.WorkspaceKeys.CreateWorkspaceKey)).Methods("POST")
	workspaceAPI.HandleFunc("/keys/{keyId}/shares", middleware.RequireAuth(h.WorkspaceKeys.GetWorkspaceKeySharesForKey)).Methods("GET")
	workspaceAPI.HandleFunc("/keys/{keyId}/shares", middleware.RequireAuth(h.WorkspaceKeys.CreateWorkspaceKeyShare)).Methods("POST")

	// File upload/download routes (file entities + S3 multipart uploads).
	workspaceAPI.HandleFunc("/files/{fileId}/upload-url", middleware.RequireAuth(h.Files.RequestUploadPartURL)).Methods("POST")
	workspaceAPI.HandleFunc("/files/{fileId}/parts", middleware.RequireAuth(h.Files.RecordUploadPart)).Methods("POST")
	workspaceAPI.HandleFunc("/files/{fileId}/complete", middleware.RequireAuth(h.Files.CompleteUpload)).Methods("POST")
	workspaceAPI.HandleFunc("/files/{fileId}/download", middleware.RequireAuth(h.Files.GetDownloadURL)).Methods("GET")

	// Unified entities (v2 entity API).
	workspaceAPI.HandleFunc("/entities", middleware.RequireAuth(h.Entities.HandleEntities)).Methods("POST")
	workspaceAPI.HandleFunc("/entities/{entityId}", middleware.RequireAuth(h.Entities.GetEntity)).Methods("GET")
	workspaceAPI.HandleFunc("/entities/{entityId}", middleware.RequireAuth(h.Entities.UpdateEntity)).Methods("PUT")
	workspaceAPI.HandleFunc("/entities/{entityId}", middleware.RequireAuth(h.Entities.DeleteEntity)).Methods("DELETE")
	workspaceAPI.HandleFunc("/entities/{entityId}/blocks", middleware.RequireAuth(h.Entities.CreateEntityBlock)).Methods("POST")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl", middleware.RequireAuth(h.Entities.GetEntityACLEntries)).Methods("GET")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl", middleware.RequireAuth(h.Entities.CreateEntityACLEntry)).Methods("POST")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl/{entryId}", middleware.RequireAuth(h.Entities.UpdateEntityACLEntry)).Methods("PUT")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl/{entryId}", middleware.RequireAuth(h.Entities.DeleteEntityACLEntry)).Methods("DELETE")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl/count", middleware.RequireAuth(h.Entities.GetEntityACLMemberCount)).Methods("GET")
	workspaceAPI.HandleFunc("/entities/{entityId}/acl/available-subjects", middleware.RequireAuth(h.Entities.GetAvailableSubjectsForEntity)).Methods("GET")

	// Entity link routes (backlinks/navigation across unified entities).
	workspaceAPI.HandleFunc("/entity-links/{entityId}", middleware.RequireAuth(h.EntityLinks.GetEntityLinks)).Methods("GET")
	workspaceAPI.HandleFunc("/entity-links/{entityId}/sync", middleware.RequireAuth(h.EntityLinks.SyncEntityLinks)).Methods("POST")

	// Workspace teams routes (listing teams for ACL subject selection).
	workspaceAPI.HandleFunc("/teams", middleware.RequireAuth(h.Teams.GetWorkspaceTeams)).Methods("GET")

	// Unified sync routes (recovery-oriented sync for initial load, reconnection, and offline recovery).
	workspaceAPI.HandleFunc("/mentions/{resourceType}/{resourceId}", middleware.RequireAuth(h.Mentions.GetMentionableUsers)).Methods("GET")

	workspaceAPI.HandleFunc("/sync", middleware.RequireAuth(h.Sync.GetUnifiedChanges)).Methods("GET")
	workspaceAPI.HandleFunc("/sync/sequence", middleware.RequireAuth(h.Sync.GetLatestSequence)).Methods("GET")

	// In-app notification routes.
	workspaceAPI.HandleFunc("/notifications", middleware.RequireAuth(h.Notifications.ListNotifications)).Methods("GET")
	workspaceAPI.HandleFunc("/notifications/{notificationId}/read", middleware.RequireAuth(h.Notifications.MarkNotificationRead)).Methods("POST")
	workspaceAPI.HandleFunc("/notifications/read-all", middleware.RequireAuth(h.Notifications.MarkAllNotificationsRead)).Methods("POST")

	// Notification subscription routes.
	workspaceAPI.HandleFunc("/subscriptions", middleware.RequireAuth(h.NotificationSubscriptions.ListSubscriptions)).Methods("GET")
	workspaceAPI.HandleFunc("/subscriptions", middleware.RequireAuth(h.NotificationSubscriptions.CreateSubscription)).Methods("POST")
	workspaceAPI.HandleFunc("/subscriptions/{subscriptionId}", middleware.RequireAuth(h.NotificationSubscriptions.DeleteSubscription)).Methods("DELETE")

	// Notification settings routes.
	workspaceAPI.HandleFunc("/notification-settings", middleware.RequireAuth(h.NotificationSettings.GetNotificationSettings)).Methods("GET")
	workspaceAPI.HandleFunc("/notification-settings", middleware.RequireAuth(h.NotificationSettings.UpdateNotificationSettings)).Methods("PUT")

	// Device token routes (not workspace-scoped).
	api.HandleFunc("/device-tokens", middleware.RequireAuth(h.DeviceTokens.ListDeviceTokens)).Methods("GET")
	api.HandleFunc("/device-tokens", middleware.RequireAuth(h.DeviceTokens.RegisterDeviceToken)).Methods("POST")
	api.HandleFunc("/device-tokens/{deviceTokenId}", middleware.RequireAuth(h.DeviceTokens.DeleteDeviceToken)).Methods("DELETE")

	// Invite lookups and acceptance (not workspace-scoped).
	api.HandleFunc("/invites/{token}", h.Invite.GetInviteStatus).Methods("GET")
	api.HandleFunc("/invites/{token}/accept", middleware.RequireAuth(h.Invite.AcceptInvite)).Methods("POST")

	// User invites - invites received by the current user (accepting invitations from others).
	api.HandleFunc("/user/invites", middleware.RequireAuth(h.UserInvites.GetMyPendingInvites)).Methods("GET")
	api.HandleFunc("/user/invites/{inviteId}/accept", middleware.RequireAuth(h.UserInvites.AcceptUserInvite)).Methods("POST")
	api.HandleFunc("/user/invites/{inviteId}/decline", middleware.RequireAuth(h.UserInvites.DeclineUserInvite)).Methods("POST")

	// Link invites - public endpoint for invite lookup (no auth required for display).
	api.HandleFunc("/link-invites/{inviteId}", h.LinkInvites.GetLinkInvite).Methods("GET")
	// Link invite acceptance (auth required - user creates account first, then accepts).
	api.HandleFunc("/link-invites/{inviteId}/accept", middleware.RequireAuth(h.LinkInvites.AcceptLinkInvite)).Methods("POST")

	// Test route for smoke testing.
	api.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"message": "hello world"})
	}).Methods("GET")

	// Test-only routes (enabled in test/dev environment).
	if cfg.Environment == "test" || cfg.Environment == "dev" {
		api.HandleFunc("/test/emails", h.Test.GetCapturedEmails).Methods("GET")
		api.HandleFunc("/test/email-capture", h.Test.SetEmailCapture).Methods("POST")
		api.HandleFunc("/test/subscriptions", h.Test.CreateWorkspaceSubscription).Methods("POST")
	}

	// Setup CORS to allow cross-origin requests from configured origins.
	// In dev/test, we allow any origin to simplify local multi-port setups.
	// In prod, we require an explicit whitelist via ALLOWED_ORIGINS.
	corsOptions := cors.Options{
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}
	if cfg.Environment == "development" || cfg.Environment == "test" {
		corsOptions.AllowOriginFunc = func(origin string) bool {
			return true
		}
	} else {
		corsOptions.AllowedOrigins = cfg.AllowedOrigins
	}
	c := cors.New(corsOptions)

	handler := c.Handler(router)

	port := os.Getenv("PORT")
	if port == "" {
		log.Fatal("PORT environment variable is required")
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

// mustGenerateInstanceID returns a process-wide instance identifier so every response can
// disclose which server instance handled the request. The ID must be consistent for the
// lifetime of the process to be useful when debugging.
func mustGenerateInstanceID() string {
	const idLength = 16
	b := make([]byte, idLength)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("failed to generate instance id: %v", err)
	}
	return hex.EncodeToString(b)
}
