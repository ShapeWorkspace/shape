package services

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"shape/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// NotificationRecipientAccessScope describes the ACL scope that must be enforced for a notification.
type NotificationRecipientAccessScope struct {
	ResourceType models.ACLResourceType
	ResourceID   string
	CreatorID    string
}

// NotificationEventDescriptor captures a normalized notification event payload.
type NotificationEventDescriptor struct {
	WorkspaceID      string
	ActorUserID      string
	ActionType       models.NotificationActionType
	TargetEntityID   string
	TargetEntityType string
	ParentEntityID   string
	ParentEntityType string
	AccessScope      *NotificationRecipientAccessScope
}

// NotificationService centralizes subscription, in-app notification, and push queue logic.
type NotificationService struct {
	db               *gorm.DB
	aclService       *ACLService
	workspaceChecker *WorkspaceChecker
	sseManager       *SSEManager
}

// NewNotificationService wires a notification service with required dependencies.
func NewNotificationService(
	db *gorm.DB,
	aclService *ACLService,
	workspaceChecker *WorkspaceChecker,
	sseManager *SSEManager,
) *NotificationService {
	return &NotificationService{
		db:               db,
		aclService:       aclService,
		workspaceChecker: workspaceChecker,
		sseManager:       sseManager,
	}
}

// EnsureSubscriptionForEntityIfMissing creates a subscription row if it does not already exist.
func (s *NotificationService) EnsureSubscriptionForEntityIfMissing(
	ctx context.Context,
	userID string,
	workspaceID string,
	entityType string,
	entityID string,
) (*models.EntitySubscription, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(workspaceID) == "" {
		return nil, errors.New("user_id and workspace_id are required")
	}
	if strings.TrimSpace(entityID) == "" || entityType == "" {
		return nil, errors.New("entity_type and entity_id are required")
	}

	subscription := &models.EntitySubscription{
		ID:          uuid.NewString(),
		UserID:      userID,
		WorkspaceID: workspaceID,
		EntityID:    entityID,
		EntityType:  entityType,
	}

	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "user_id"},
			{Name: "workspace_id"},
			{Name: "entity_type"},
			{Name: "entity_id"},
		},
		DoNothing: true,
	}).Create(subscription).Error; err != nil {
		return nil, err
	}

	var persisted models.EntitySubscription
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND workspace_id = ? AND entity_type = ? AND entity_id = ?", userID, workspaceID, entityType, entityID).
		First(&persisted).Error; err != nil {
		return nil, err
	}

	return &persisted, nil
}

// GetSubscriptionForEntity returns the subscription row for a user/entity pair if it exists.
func (s *NotificationService) GetSubscriptionForEntity(
	ctx context.Context,
	userID string,
	workspaceID string,
	entityType string,
	entityID string,
) (*models.EntitySubscription, error) {
	var subscription models.EntitySubscription
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND workspace_id = ? AND entity_type = ? AND entity_id = ?", userID, workspaceID, entityType, entityID).
		First(&subscription).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &subscription, nil
}

// ListSubscriptionsForEntity returns all subscriptions for a given entity.
func (s *NotificationService) ListSubscriptionsForEntity(
	ctx context.Context,
	workspaceID string,
	entityType string,
	entityID string,
) ([]models.EntitySubscription, error) {
	var subscriptions []models.EntitySubscription
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND entity_type = ? AND entity_id = ?", workspaceID, entityType, entityID).
		Find(&subscriptions).Error; err != nil {
		return nil, err
	}
	return subscriptions, nil
}

// ListSubscriptionsForUser returns all subscriptions for a user in a workspace.
func (s *NotificationService) ListSubscriptionsForUser(
	ctx context.Context,
	workspaceID string,
	userID string,
	limit int,
	page int,
) ([]models.EntitySubscription, bool, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	var subscriptions []models.EntitySubscription
	query := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Order("created_at DESC").
		Limit(limit + 1).
		Offset(offset)

	if err := query.Find(&subscriptions).Error; err != nil {
		return nil, false, err
	}

	hasMore := len(subscriptions) > limit
	if hasMore {
		subscriptions = subscriptions[:limit]
	}
	return subscriptions, hasMore, nil
}

// DeleteSubscriptionByID removes a subscription by ID.
func (s *NotificationService) DeleteSubscriptionByID(ctx context.Context, subscriptionID string, userID string) error {
	if strings.TrimSpace(subscriptionID) == "" {
		return errors.New("subscription_id is required")
	}
	result := s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", subscriptionID, userID).
		Delete(&models.EntitySubscription{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// DeleteSubscriptionForUserAndEntity deletes a subscription row scoped to a user and entity.
func (s *NotificationService) DeleteSubscriptionForUserAndEntity(
	ctx context.Context,
	userID string,
	workspaceID string,
	entityType string,
	entityID string,
) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(workspaceID) == "" {
		return errors.New("user_id and workspace_id are required")
	}
	if strings.TrimSpace(entityID) == "" || entityType == "" {
		return errors.New("entity_type and entity_id are required")
	}

	return s.db.WithContext(ctx).
		Where("user_id = ? AND workspace_id = ? AND entity_type = ? AND entity_id = ?", userID, workspaceID, entityType, entityID).
		Delete(&models.EntitySubscription{}).Error
}

// DeleteSubscriptionsAndNotificationsForEntity removes subscriptions and notifications referencing an entity.
func (s *NotificationService) DeleteSubscriptionsAndNotificationsForEntity(
	ctx context.Context,
	workspaceID string,
	entityType string,
	entityID string,
) error {
	if strings.TrimSpace(workspaceID) == "" {
		return errors.New("workspace_id is required")
	}
	if strings.TrimSpace(entityID) == "" || entityType == "" {
		return errors.New("entity_type and entity_id are required")
	}

	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND entity_type = ? AND entity_id = ?", workspaceID, entityType, entityID).
		Delete(&models.EntitySubscription{}).Error; err != nil {
		return err
	}

	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND ((target_entity_type = ? AND target_entity_id = ?) OR (parent_entity_type = ? AND parent_entity_id = ?))",
			workspaceID, entityType, entityID, entityType, entityID).
		Delete(&models.InAppNotification{}).Error; err != nil {
		return err
	}

	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND ((target_entity_type = ? AND target_entity_id = ?) OR (parent_entity_type = ? AND parent_entity_id = ?))",
			workspaceID, entityType, entityID, entityType, entityID).
		Delete(&models.PushNotification{}).Error; err != nil {
		return err
	}

	return nil
}

// DeleteNotificationDataForUserInWorkspace deletes all notification-related data for a user in a workspace.
func (s *NotificationService) DeleteNotificationDataForUserInWorkspace(ctx context.Context, workspaceID string, userID string) error {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(userID) == "" {
		return errors.New("workspace_id and user_id are required")
	}

	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.EntitySubscription{}).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.InAppNotification{}).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.PushNotification{}).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.NotificationPreference{}).Error; err != nil {
		return err
	}

	return nil
}

// ListInAppNotifications returns a paginated slice of notifications ordered with unread first.
func (s *NotificationService) ListInAppNotifications(
	ctx context.Context,
	workspaceID string,
	userID string,
	limit int,
	page int,
) ([]models.InAppNotification, bool, error) {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	var notifications []models.InAppNotification
	query := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Order("CASE WHEN read_at IS NULL THEN 0 ELSE 1 END ASC").
		Order("updated_at DESC").
		Limit(limit + 1).
		Offset(offset)

	if err := query.Find(&notifications).Error; err != nil {
		return nil, false, err
	}

	hasMore := len(notifications) > limit
	if hasMore {
		notifications = notifications[:limit]
	}
	return notifications, hasMore, nil
}

// MarkNotificationRead sets read_at for a specific notification owned by the user.
func (s *NotificationService) MarkNotificationRead(
	ctx context.Context,
	workspaceID string,
	userID string,
	notificationID string,
) (*models.InAppNotification, error) {
	var notification models.InAppNotification
	err := s.db.WithContext(ctx).
		Where("id = ? AND workspace_id = ? AND user_id = ?", notificationID, workspaceID, userID).
		First(&notification).Error
	if err != nil {
		return nil, err
	}

	if notification.ReadAt == nil {
		now := time.Now().UTC()
		if err := s.db.WithContext(ctx).Model(&notification).Updates(map[string]interface{}{
			"read_at":    now,
			"updated_at": now,
		}).Error; err != nil {
			return nil, err
		}
		notification.ReadAt = &now
		notification.UpdatedAt = now
	}

	if s.sseManager != nil {
		sseEvent := SSEEvent{
			Type: string(SSENotificationUpdated),
			Data: notification.ToSSEPayload(),
		}
		s.sseManager.BroadcastToUser(userID, workspaceID, sseEvent)
	}

	return &notification, nil
}

// MarkAllNotificationsRead marks all unread notifications as read for a user/workspace.
func (s *NotificationService) MarkAllNotificationsRead(ctx context.Context, workspaceID string, userID string) error {
	now := time.Now().UTC()

	var unreadNotifications []models.InAppNotification
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ? AND read_at IS NULL", workspaceID, userID).
		Find(&unreadNotifications).Error; err != nil {
		return err
	}

	if len(unreadNotifications) == 0 {
		return nil
	}

	if err := s.db.WithContext(ctx).
		Model(&models.InAppNotification{}).
		Where("workspace_id = ? AND user_id = ? AND read_at IS NULL", workspaceID, userID).
		Updates(map[string]interface{}{
			"read_at":    now,
			"updated_at": now,
		}).Error; err != nil {
		return err
	}

	if s.sseManager != nil {
		for _, notification := range unreadNotifications {
			notification.ReadAt = &now
			notification.UpdatedAt = now
			sseEvent := SSEEvent{
				Type: string(SSENotificationUpdated),
				Data: notification.ToSSEPayload(),
			}
			s.sseManager.BroadcastToUser(userID, workspaceID, sseEvent)
		}
	}

	return nil
}

// GetNotificationPreferenceSnapshot returns a map of action_type -> push_enabled.
func (s *NotificationService) GetNotificationPreferenceSnapshot(
	ctx context.Context,
	workspaceID string,
	userID string,
) (map[models.NotificationActionType]bool, error) {
	prefs := make(map[models.NotificationActionType]bool)
	for _, actionType := range models.AllNotificationActionTypes() {
		prefs[actionType] = true
	}

	var rows []models.NotificationPreference
	if err := s.db.WithContext(ctx).
		Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		prefs[row.ActionType] = row.PushEnabled
	}

	return prefs, nil
}

// NotificationPreferenceUpdate carries a single preference update.
type NotificationPreferenceUpdate struct {
	ActionType  models.NotificationActionType
	PushEnabled bool
}

// UpdateNotificationPreferences writes preference updates for a user/workspace.
func (s *NotificationService) UpdateNotificationPreferences(
	ctx context.Context,
	workspaceID string,
	userID string,
	updates []NotificationPreferenceUpdate,
) error {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(userID) == "" {
		return errors.New("workspace_id and user_id are required")
	}
	if len(updates) == 0 {
		return errors.New("at least one preference update is required")
	}

	now := time.Now().UTC()
	for _, update := range updates {
		if update.ActionType == "" {
			return errors.New("action_type is required")
		}

		row := map[string]interface{}{
			"id":           uuid.NewString(),
			"user_id":      userID,
			"workspace_id": workspaceID,
			"action_type":  update.ActionType,
			"push_enabled": update.PushEnabled,
			"created_at":   now,
			"updated_at":   now,
		}

		if err := s.db.WithContext(ctx).
			Model(&models.NotificationPreference{}).
			Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "user_id"}, {Name: "workspace_id"}, {Name: "action_type"}},
				DoUpdates: clause.AssignmentColumns([]string{"push_enabled", "updated_at"}),
			}).Create(row).Error; err != nil {
			return err
		}
	}

	return nil
}

// RegisterDeviceToken creates or updates a device token for the user.
func (s *NotificationService) RegisterDeviceToken(
	ctx context.Context,
	userID string,
	token string,
	platform models.DeviceTokenPlatform,
) (*models.DeviceToken, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("user_id is required")
	}
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("token is required")
	}
	if platform == "" {
		return nil, errors.New("platform is required")
	}

	now := time.Now().UTC()
	deviceToken := &models.DeviceToken{
		ID:        uuid.NewString(),
		UserID:    userID,
		Token:     token,
		Platform:  platform,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "token"}},
		DoUpdates: clause.AssignmentColumns([]string{"platform", "updated_at"}),
	}).Create(deviceToken).Error; err != nil {
		return nil, err
	}

	return deviceToken, nil
}

// DeleteDeviceToken deletes a device token by ID, scoped to the user.
func (s *NotificationService) DeleteDeviceToken(ctx context.Context, userID string, tokenID string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(tokenID) == "" {
		return errors.New("user_id and token_id are required")
	}

	result := s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", tokenID, userID).
		Delete(&models.DeviceToken{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ListDeviceTokens returns all device tokens for a user.
func (s *NotificationService) ListDeviceTokens(ctx context.Context, userID string) ([]models.DeviceToken, error) {
	var tokens []models.DeviceToken
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&tokens).Error; err != nil {
		return nil, err
	}
	return tokens, nil
}

// CreateNotificationsForRecipients creates in-app notifications and broadcasts SSE.
func (s *NotificationService) CreateNotificationsForRecipients(
	ctx context.Context,
	event NotificationEventDescriptor,
	recipientUserIDs []string,
) ([]*models.InAppNotification, error) {
	uniqueRecipients := make(map[string]struct{})
	for _, recipientID := range recipientUserIDs {
		trimmed := strings.TrimSpace(recipientID)
		if trimmed == "" {
			continue
		}
		uniqueRecipients[trimmed] = struct{}{}
	}

	var notifications []*models.InAppNotification
	for recipientID := range uniqueRecipients {
		if recipientID == event.ActorUserID {
			continue
		}

		eligible, err := s.recipientHasAccess(ctx, recipientID, event.WorkspaceID, event.AccessScope)
		if err != nil {
			log.Printf("notification: access check failed for user=%s action=%s: %v", recipientID, event.ActionType, err)
			continue
		}
		if !eligible {
			continue
		}

		notification, err := s.createOrUpdateInAppNotificationForRecipient(ctx, event, recipientID)
		if err != nil {
			log.Printf("notification: failed to create in-app notification for user=%s action=%s: %v", recipientID, event.ActionType, err)
			continue
		}
		if notification != nil {
			notifications = append(notifications, notification)
		}

		if notification != nil && event.ActionType == models.NotificationActionTypeReactionAdded {
			if err := s.trimReactionNotificationsForRecipient(ctx, event.WorkspaceID, recipientID, 100); err != nil {
				log.Printf("notification: failed to trim reaction history user=%s: %v", recipientID, err)
			}
		}

		if s.sseManager != nil && notification != nil {
			sseEvent := SSEEvent{
				Type: string(SSENotificationUpdated),
				Data: notification.ToSSEPayload(),
			}
			s.sseManager.BroadcastToUser(recipientID, event.WorkspaceID, sseEvent)
		}
	}

	return notifications, nil
}

// createOrUpdateInAppNotificationForRecipient collapses unread notifications when possible.
func (s *NotificationService) createOrUpdateInAppNotificationForRecipient(
	ctx context.Context,
	event NotificationEventDescriptor,
	recipientID string,
) (*models.InAppNotification, error) {
	if !shouldCollapseNotification(event.ActionType) {
		return s.createNotificationWithoutCollapse(ctx, event, recipientID)
	}

	var existing models.InAppNotification
	err := s.db.WithContext(ctx).
		Where("user_id = ? AND workspace_id = ? AND parent_entity_id = ? AND action_type = ? AND read_at IS NULL",
			recipientID, event.WorkspaceID, event.ParentEntityID, event.ActionType).
		First(&existing).Error

	if err == nil {
		now := time.Now().UTC()
		updates := map[string]interface{}{
			"count":           existing.Count + 1,
			"latest_actor_id": event.ActorUserID,
			"updated_at":      now,
		}
		if err := s.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return nil, err
		}
		existing.Count = existing.Count + 1
		existing.LatestActorID = event.ActorUserID
		existing.UpdatedAt = now
		return &existing, nil
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	notification := &models.InAppNotification{
		ID:               uuid.NewString(),
		UserID:           recipientID,
		WorkspaceID:      event.WorkspaceID,
		ActorUserID:      event.ActorUserID,
		LatestActorID:    event.ActorUserID,
		ActionType:       event.ActionType,
		TargetEntityID:   event.TargetEntityID,
		TargetEntityType: event.TargetEntityType,
		ParentEntityID:   event.ParentEntityID,
		ParentEntityType: event.ParentEntityType,
		Count:            1,
		ReadAt:           nil,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.db.WithContext(ctx).Create(notification).Error; err != nil {
		return nil, err
	}

	return notification, nil
}

// createNotificationWithoutCollapse always inserts a new notification row.
func (s *NotificationService) createNotificationWithoutCollapse(
	ctx context.Context,
	event NotificationEventDescriptor,
	recipientID string,
) (*models.InAppNotification, error) {
	now := time.Now().UTC()
	notification := &models.InAppNotification{
		ID:               uuid.NewString(),
		UserID:           recipientID,
		WorkspaceID:      event.WorkspaceID,
		ActorUserID:      event.ActorUserID,
		LatestActorID:    event.ActorUserID,
		ActionType:       event.ActionType,
		TargetEntityID:   event.TargetEntityID,
		TargetEntityType: event.TargetEntityType,
		ParentEntityID:   event.ParentEntityID,
		ParentEntityType: event.ParentEntityType,
		Count:            1,
		ReadAt:           nil,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := s.db.WithContext(ctx).Create(notification).Error; err != nil {
		return nil, err
	}

	return notification, nil
}

func shouldCollapseNotification(actionType models.NotificationActionType) bool {
	return actionType != models.NotificationActionTypeReactionAdded
}

// trimReactionNotificationsForRecipient keeps only the latest reaction notifications.
func (s *NotificationService) trimReactionNotificationsForRecipient(
	ctx context.Context,
	workspaceID string,
	recipientID string,
	limit int,
) error {
	if limit <= 0 {
		return nil
	}

	var notifications []models.InAppNotification
	if err := s.db.WithContext(ctx).
		Where(
			"user_id = ? AND workspace_id = ? AND action_type = ?",
			recipientID, workspaceID, models.NotificationActionTypeReactionAdded,
		).
		Order("created_at DESC").
		Find(&notifications).Error; err != nil {
		return err
	}

	if len(notifications) <= limit {
		return nil
	}

	toDelete := notifications[limit:]
	ids := make([]string, 0, len(toDelete))
	for _, notification := range toDelete {
		ids = append(ids, notification.ID)
	}

	return s.db.WithContext(ctx).Where("id IN ?", ids).Delete(&models.InAppNotification{}).Error
}

// DeleteLatestReactionNotificationForRecipient removes the most recent matching reaction notification.
func (s *NotificationService) DeleteLatestReactionNotificationForRecipient(
	ctx context.Context,
	event NotificationEventDescriptor,
	recipientID string,
) error {
	trimmedRecipientID := strings.TrimSpace(recipientID)
	if trimmedRecipientID == "" {
		return nil
	}
	if event.ActionType != models.NotificationActionTypeReactionAdded {
		return errors.New("notification deletion only supports reaction_added events")
	}

	var notification models.InAppNotification
	query := s.db.WithContext(ctx).
		Where(
			"user_id = ? AND workspace_id = ? AND action_type = ? AND actor_user_id = ? AND target_entity_id = ? AND target_entity_type = ? AND parent_entity_id = ? AND parent_entity_type = ?",
			trimmedRecipientID, event.WorkspaceID, event.ActionType, event.ActorUserID,
			event.TargetEntityID, event.TargetEntityType, event.ParentEntityID, event.ParentEntityType,
		).
		Order("created_at DESC").
		Limit(1)

	if err := query.First(&notification).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}

	if err := s.db.WithContext(ctx).Delete(&notification).Error; err != nil {
		return err
	}

	if s.sseManager != nil {
		sseEvent := SSEEvent{
			Type: string(SSENotificationDeleted),
			Data: notification.ToSSEDeletePayload(),
		}
		s.sseManager.BroadcastToUser(trimmedRecipientID, event.WorkspaceID, sseEvent)
	}

	return nil
}

// recipientHasAccess checks workspace membership and ACL access for a recipient.
func (s *NotificationService) recipientHasAccess(
	ctx context.Context,
	userID string,
	workspaceID string,
	accessScope *NotificationRecipientAccessScope,
) (bool, error) {
	if s.workspaceChecker != nil && !s.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		return false, nil
	}
	if accessScope == nil || accessScope.ResourceType == "" || accessScope.ResourceID == "" {
		return true, nil
	}
	if accessScope.CreatorID != "" && accessScope.CreatorID == userID {
		return true, nil
	}
	if s.aclService == nil {
		return false, nil
	}
	hasAccess, err := s.aclService.UserHasAccessToResource(userID, accessScope.ResourceType, accessScope.ResourceID)
	if err != nil {
		return false, err
	}
	return hasAccess, nil
}

// CleanupNotificationRetention deletes read and unread notifications past retention windows.
func (s *NotificationService) CleanupNotificationRetention(ctx context.Context) error {
	readCutoff := time.Now().UTC().Add(-30 * 24 * time.Hour)
	unreadCutoff := time.Now().UTC().Add(-90 * 24 * time.Hour)

	if err := s.db.WithContext(ctx).
		Where("read_at IS NOT NULL AND read_at < ?", readCutoff).
		Delete(&models.InAppNotification{}).Error; err != nil {
		return err
	}

	if err := s.db.WithContext(ctx).
		Where("read_at IS NULL AND created_at < ?", unreadCutoff).
		Delete(&models.InAppNotification{}).Error; err != nil {
		return err
	}

	return nil
}
