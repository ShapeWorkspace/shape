package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// NotificationHandlers exposes endpoints for in-app notifications.
type NotificationHandlers struct {
	notificationService *services.NotificationService
	workspaceChecker    *services.WorkspaceChecker
}

// NewNotificationHandlers wires notification handlers.
func NewNotificationHandlers(service *services.NotificationService, checker *services.WorkspaceChecker) *NotificationHandlers {
	return &NotificationHandlers{
		notificationService: service,
		workspaceChecker:    checker,
	}
}

// ListNotificationsResponse is the response payload for listing notifications.
type ListNotificationsResponse struct {
	Notifications []*models.InAppNotificationResponse `json:"notifications"`
	HasMore       bool                                `json:"has_more"`
	Page          int                                 `json:"page"`
}

// ListNotifications returns paginated in-app notifications for the user.
func (h *NotificationHandlers) ListNotifications(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	page := parseIntQueryDefault(r, "page", 1)
	limit := parseIntQueryDefault(r, "limit", 100)

	notifications, hasMore, err := h.notificationService.ListInAppNotifications(r.Context(), workspaceID, userID, limit, page)
	if err != nil {
		JSONErrorWithErr(w, "Failed to list notifications", err, http.StatusInternalServerError)
		return
	}

	responses := make([]*models.InAppNotificationResponse, len(notifications))
	for i, notification := range notifications {
		n := notification
		responses[i] = n.ToResponse()
	}

	JSONResponse(w, ListNotificationsResponse{
		Notifications: responses,
		HasMore:       hasMore,
		Page:          page,
	}, http.StatusOK)
}

// MarkNotificationRead marks a single notification as read.
func (h *NotificationHandlers) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	notificationID := vars["notificationId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(notificationID) == "" {
		JSONError(w, "Workspace ID and notification ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	notification, err := h.notificationService.MarkNotificationRead(r.Context(), workspaceID, userID, notificationID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			JSONError(w, "Notification not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to mark notification read", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]*models.InAppNotificationResponse{"notification": notification.ToResponse()}, http.StatusOK)
}

// MarkAllNotificationsRead marks all unread notifications as read.
func (h *NotificationHandlers) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if err := h.notificationService.MarkAllNotificationsRead(r.Context(), workspaceID, userID); err != nil {
		JSONErrorWithErr(w, "Failed to mark notifications read", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]bool{"ok": true}, http.StatusOK)
}

// NotificationSubscriptionHandlers manages subscription CRUD endpoints.
type NotificationSubscriptionHandlers struct {
	notificationService *services.NotificationService
	workspaceChecker    *services.WorkspaceChecker
}

// NewNotificationSubscriptionHandlers wires subscription handlers.
func NewNotificationSubscriptionHandlers(service *services.NotificationService, checker *services.WorkspaceChecker) *NotificationSubscriptionHandlers {
	return &NotificationSubscriptionHandlers{
		notificationService: service,
		workspaceChecker:    checker,
	}
}

// CreateNotificationSubscriptionRequest is the request payload for subscribing to an entity.
type CreateNotificationSubscriptionRequest struct {
	EntityID   string `json:"entity_id"`
	EntityType string `json:"entity_type"`
}

// ListNotificationSubscriptionsResponse is the response payload for listing subscriptions.
type ListNotificationSubscriptionsResponse struct {
	Subscriptions []models.EntitySubscription `json:"subscriptions"`
	HasMore       bool                        `json:"has_more"`
	Page          int                         `json:"page"`
}

// CreateSubscription creates a manual subscription for an entity.
func (h *NotificationSubscriptionHandlers) CreateSubscription(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	var req CreateNotificationSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.EntityID) == "" || req.EntityType == "" {
		JSONError(w, "entity_id and entity_type are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	subscription, err := h.notificationService.EnsureSubscriptionForEntityIfMissing(
		r.Context(),
		userID,
		workspaceID,
		req.EntityType,
		req.EntityID,
	)
	if err != nil {
		JSONErrorWithErr(w, "Failed to create subscription", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]*models.EntitySubscription{"subscription": subscription}, http.StatusCreated)
}

// DeleteSubscription deletes a subscription by ID.
func (h *NotificationSubscriptionHandlers) DeleteSubscription(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	subscriptionID := vars["subscriptionId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(subscriptionID) == "" {
		JSONError(w, "Workspace ID and subscription ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	if err := h.notificationService.DeleteSubscriptionByID(r.Context(), subscriptionID, userID); err != nil {
		if err == gorm.ErrRecordNotFound {
			JSONError(w, "Subscription not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to delete subscription", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]bool{"ok": true}, http.StatusOK)
}

// ListSubscriptions returns subscriptions for the authenticated user.
func (h *NotificationSubscriptionHandlers) ListSubscriptions(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	page := parseIntQueryDefault(r, "page", 1)
	limit := parseIntQueryDefault(r, "limit", 100)

	subscriptions, hasMore, err := h.notificationService.ListSubscriptionsForUser(r.Context(), workspaceID, userID, limit, page)
	if err != nil {
		JSONErrorWithErr(w, "Failed to list subscriptions", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, ListNotificationSubscriptionsResponse{
		Subscriptions: subscriptions,
		HasMore:       hasMore,
		Page:          page,
	}, http.StatusOK)
}

// NotificationSettingsHandlers manages push preference settings.
type NotificationSettingsHandlers struct {
	notificationService *services.NotificationService
	workspaceChecker    *services.WorkspaceChecker
}

// NewNotificationSettingsHandlers wires settings handlers.
func NewNotificationSettingsHandlers(service *services.NotificationService, checker *services.WorkspaceChecker) *NotificationSettingsHandlers {
	return &NotificationSettingsHandlers{
		notificationService: service,
		workspaceChecker:    checker,
	}
}

// NotificationPreferenceSummary is a compact preference payload.
type NotificationPreferenceSummary struct {
	ActionType  models.NotificationActionType `json:"action_type"`
	PushEnabled bool                          `json:"push_enabled"`
}

// NotificationSettingsResponse returns per-action push settings.
type NotificationSettingsResponse struct {
	Preferences []NotificationPreferenceSummary `json:"preferences"`
}

// UpdateNotificationSettingsRequest carries preference updates.
type UpdateNotificationSettingsRequest struct {
	Preferences []NotificationPreferenceSummary `json:"preferences"`
}

// GetNotificationSettings returns push preferences for a workspace.
func (h *NotificationSettingsHandlers) GetNotificationSettings(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	prefs, err := h.notificationService.GetNotificationPreferenceSnapshot(r.Context(), workspaceID, userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load notification settings", err, http.StatusInternalServerError)
		return
	}

	preferences := make([]NotificationPreferenceSummary, 0, len(prefs))
	for _, actionType := range models.AllNotificationActionTypes() {
		preferences = append(preferences, NotificationPreferenceSummary{
			ActionType:  actionType,
			PushEnabled: prefs[actionType],
		})
	}

	JSONResponse(w, NotificationSettingsResponse{Preferences: preferences}, http.StatusOK)
}

// UpdateNotificationSettings updates push preferences for a workspace.
func (h *NotificationSettingsHandlers) UpdateNotificationSettings(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateNotificationSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if len(req.Preferences) == 0 {
		JSONError(w, "preferences payload cannot be empty", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	updates := make([]services.NotificationPreferenceUpdate, 0, len(req.Preferences))
	for _, pref := range req.Preferences {
		if pref.ActionType == "" {
			JSONError(w, "action_type is required", http.StatusBadRequest)
			return
		}
		updates = append(updates, services.NotificationPreferenceUpdate{
			ActionType:  pref.ActionType,
			PushEnabled: pref.PushEnabled,
		})
	}

	if err := h.notificationService.UpdateNotificationPreferences(r.Context(), workspaceID, userID, updates); err != nil {
		JSONErrorWithErr(w, "Failed to update notification settings", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]bool{"ok": true}, http.StatusOK)
}

// DeviceTokenHandlers manages device token registration.
type DeviceTokenHandlers struct {
	notificationService *services.NotificationService
}

// NewDeviceTokenHandlers wires device token handlers.
func NewDeviceTokenHandlers(service *services.NotificationService) *DeviceTokenHandlers {
	return &DeviceTokenHandlers{notificationService: service}
}

// RegisterDeviceTokenRequest is the request payload for registering a token.
type RegisterDeviceTokenRequest struct {
	Token    string                     `json:"token"`
	Platform models.DeviceTokenPlatform `json:"platform"`
}

// RegisterDeviceToken registers or updates a device token.
func (h *DeviceTokenHandlers) RegisterDeviceToken(w http.ResponseWriter, r *http.Request) {
	var req RegisterDeviceTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	deviceToken, err := h.notificationService.RegisterDeviceToken(r.Context(), userID, req.Token, req.Platform)
	if err != nil {
		JSONErrorWithErr(w, "Failed to register device token", err, http.StatusBadRequest)
		return
	}

	JSONResponse(w, map[string]*models.DeviceToken{"device_token": deviceToken}, http.StatusCreated)
}

// ListDeviceTokens returns the current user's device tokens.
func (h *DeviceTokenHandlers) ListDeviceTokens(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	tokens, err := h.notificationService.ListDeviceTokens(r.Context(), userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to list device tokens", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string][]models.DeviceToken{"device_tokens": tokens}, http.StatusOK)
}

// DeleteDeviceToken removes a device token by ID.
func (h *DeviceTokenHandlers) DeleteDeviceToken(w http.ResponseWriter, r *http.Request) {
	deviceTokenID := mux.Vars(r)["deviceTokenId"]
	if strings.TrimSpace(deviceTokenID) == "" {
		JSONError(w, "Device token ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if err := h.notificationService.DeleteDeviceToken(r.Context(), userID, deviceTokenID); err != nil {
		if err == gorm.ErrRecordNotFound {
			JSONError(w, "Device token not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to delete device token", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]bool{"ok": true}, http.StatusOK)
}

// parseIntQueryDefault reads an int query param with fallback.
func parseIntQueryDefault(r *http.Request, key string, fallback int) int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
