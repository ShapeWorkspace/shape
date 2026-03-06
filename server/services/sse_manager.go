// SSE manager provides real-time event broadcasting to connected clients.
// This is a foundational implementation that supports workspace and user-level broadcasts
// without app-specific event types. Callers send pre-packaged event envelopes.

package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"shape/models"
	"shape/utils"

	"github.com/google/uuid"
	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// SSEEventType represents the type of SSE event.
type SSEEventType string

// Foundational event types supported by the new server.
const (
	SSEWorkspaceMemberAdded         SSEEventType = "workspace_member_added"
	SSEWorkspaceMemberRemoved       SSEEventType = "workspace_member_removed"
	SSEWorkspaceMemberUpdated       SSEEventType = "workspace_member_updated"
	SSEWorkspaceSubscriptionUpdated SSEEventType = "workspace_subscription_updated"
	SSEEntityBlockCreated           SSEEventType = "entity_block_created"
	SSEEntityCreated                SSEEventType = "entity_created"
	SSEEntityUpdated                SSEEventType = "entity_updated"
	SSENotificationUpdated          SSEEventType = "notification_updated"
	SSENotificationDeleted          SSEEventType = "notification_deleted"
	SSEReactionCreated              SSEEventType = "reaction_created"
	SSEReactionDeleted              SSEEventType = "reaction_deleted"
)

// SSEEvent represents a server-sent event envelope.
type SSEEvent struct {
	Type string                 `json:"type"`
	Data map[string]interface{} `json:"data"`
}

// Redis broadcast targets.
const (
	redisTargetUser      = "user"
	redisTargetWorkspace = "workspace"
)

// Redis keys for connection metadata persistence.
const (
	redisClientKeyPrefix           = "sse:clients:"
	redisWorkspaceClientsKeyPrefix = "sse:workspace-clients:"
	// redisWorkspaceClientsSentinel keeps the workspace members set addressable even after the last
	// real connection disconnects. This avoids SISMEMBER calls failing with missing-key errors.
	redisWorkspaceClientsSentinel = "__sentinel__"
)

// redisClientLeaseTTL defines how long a connection stays active in Redis without a heartbeat.
const redisClientLeaseTTL = 90 * time.Second

// redisBroadcastMessage carries an event across instances via pub/sub.
type redisBroadcastMessage struct {
	InstanceID      string   `json:"instanceId"`
	Target          string   `json:"target"`
	WorkspaceID     string   `json:"workspaceId"`
	UserID          string   `json:"userId,omitempty"`
	ExcludeUserID   string   `json:"excludeUserId,omitempty"`
	ExcludeClientID string   `json:"excludeClientId,omitempty"`
	Event           SSEEvent `json:"event"`
}

// RedisOptions configures Redis pub/sub for cross-instance SSE fan-out.
type RedisOptions struct {
	Address    string
	Username   string
	Password   string
	Channel    string
	TLSEnabled bool
}

// UserBroadcastOptions allows callers to exclude a particular SSE client connection.
type UserBroadcastOptions struct {
	ExcludeClientID string
}

// ACLBroadcastOptions configures ACL-aware broadcasts.
type ACLBroadcastOptions struct {
	// ExcludeUserID excludes a specific user from receiving the event (typically the author).
	ExcludeUserID string
	// ExcludeClientID excludes a specific SSE client connection (for the originating client).
	ExcludeClientID string
	// CreatorID is the resource creator who has implicit access (not stored in ACL).
	CreatorID string
}

var errClientNotFound = errors.New("client not found")

// SSEClient represents a connected SSE client.
type SSEClient struct {
	ID          string
	UserID      string
	WorkspaceID string
	Channel     chan SSEEvent
	mu          sync.RWMutex
}

// SSEManager manages SSE connections and event broadcasting.
type SSEManager struct {
	// Map of workspaceID -> userID -> []*SSEClient (slice of clients)
	clients     map[string]map[string][]*SSEClient
	clientIndex map[string]*SSEClient
	mu          sync.RWMutex
	db          *gorm.DB

	// EffectiveAccessService for ACL-aware broadcasts
	effectiveAccessService *EffectiveAccessService

	instanceMu sync.RWMutex
	instanceID string

	redisMu      sync.RWMutex
	redisEnabled bool
	redisClient  *redis.Client
	redisPubSub  *redis.PubSub
	redisCtx     context.Context
	redisCancel  context.CancelFunc
	redisChannel string
}

// Global SSE manager instance.
var (
	globalSSEManager *SSEManager
	sseOnce          sync.Once
	redisLogger      = utils.NewLoggerWithPrefix("APPLOG REDIS")
)

// redisClientMetadata captures connection metadata stored in Redis.
type redisClientMetadata struct {
	UserID      string
	WorkspaceID string
	InstanceID  string
}

// redisClientKey returns the Redis hash key storing metadata for a client connection.
func redisClientKey(clientID string) string {
	return redisClientKeyPrefix + clientID
}

// redisWorkspaceClientsKey lists all client IDs connected to a workspace.
func redisWorkspaceClientsKey(workspaceID string) string {
	return redisWorkspaceClientsKeyPrefix + workspaceID
}

// GetSSEManager returns the global SSE manager instance.
func GetSSEManager() *SSEManager {
	sseOnce.Do(func() {
		globalSSEManager = &SSEManager{
			clients:     make(map[string]map[string][]*SSEClient),
			clientIndex: make(map[string]*SSEClient),
		}
	})
	return globalSSEManager
}

// redisClientHandle exposes the active Redis client when replication is enabled.
func (m *SSEManager) redisClientHandle() (*redis.Client, bool) {
	m.redisMu.RLock()
	defer m.redisMu.RUnlock()
	if !m.redisEnabled || m.redisClient == nil {
		return nil, false
	}
	return m.redisClient, true
}

// registerClientInRedis stores connection metadata and initializes its lease plus indexes.
func (m *SSEManager) registerClientInRedis(client *SSEClient) {
	h, ok := m.redisClientHandle()
	if !ok {
		return
	}

	ctx := context.Background()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	key := redisClientKey(client.ID)
	if err := h.HSet(ctx, key,
		"userId", client.UserID,
		"workspaceId", client.WorkspaceID,
		"instanceId", m.InstanceID(),
		"createdAt", now,
		"lastSeenAt", now,
	).Err(); err != nil {
		log.Printf("redis: failed to register client %s: %v", client.ID, err)
		return
	}

	workspaceKey := redisWorkspaceClientsKey(client.WorkspaceID)
	if err := h.SAdd(ctx, workspaceKey, redisWorkspaceClientsSentinel, client.ID).Err(); err != nil {
		log.Printf("redis: failed to track workspace membership for client %s: %v", client.ID, err)
	}

	m.touchClientLease(client.ID, client.WorkspaceID)
}

// touchClientLease refreshes the TTL for connection metadata and related indexes.
func (m *SSEManager) touchClientLease(clientID, workspaceID string) {
	h, ok := m.redisClientHandle()
	if !ok {
		return
	}

	ctx := context.Background()
	_, err := h.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		if workspaceID != "" {
			workspaceKey := redisWorkspaceClientsKey(workspaceID)
			pipe.SAdd(ctx, workspaceKey, redisWorkspaceClientsSentinel, clientID)
			pipe.Expire(ctx, workspaceKey, redisClientLeaseTTL)
		}
		pipe.HSet(ctx, redisClientKey(clientID), "lastSeenAt", time.Now().UTC().Format(time.RFC3339Nano))
		pipe.Expire(ctx, redisClientKey(clientID), redisClientLeaseTTL)
		return nil
	})
	if err != nil {
		log.Printf("redis: failed to refresh lease for client %s: %v", clientID, err)
	}
}

// unregisterClientFromRedis removes all Redis state for a connection that just closed.
func (m *SSEManager) unregisterClientFromRedis(client *SSEClient) {
	h, ok := m.redisClientHandle()
	if !ok {
		return
	}

	ctx := context.Background()
	_, err := h.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.SRem(ctx, redisWorkspaceClientsKey(client.WorkspaceID), client.ID)
		pipe.Del(ctx, redisClientKey(client.ID))
		return nil
	})
	if err != nil {
		log.Printf("redis: failed to unregister client %s: %v", client.ID, err)
	}
}

// getRedisClientMetadata fetches connection metadata from Redis.
func (m *SSEManager) getRedisClientMetadata(clientID string) (*redisClientMetadata, error) {
	h, ok := m.redisClientHandle()
	if !ok {
		return nil, nil
	}

	ctx := context.Background()
	values, err := h.HGetAll(ctx, redisClientKey(clientID)).Result()
	if err != nil {
		return nil, err
	}
	if len(values) == 0 {
		return nil, nil
	}
	return &redisClientMetadata{
		UserID:      values["userId"],
		WorkspaceID: values["workspaceId"],
		InstanceID:  values["instanceId"],
	}, nil
}

// EnableRedis configures Redis pub/sub for cross-instance SSE fan-out.
func (m *SSEManager) EnableRedis(opts RedisOptions) error {
	addr := strings.TrimSpace(opts.Address)
	if addr == "" {
		return fmt.Errorf("redis address is required")
	}
	channel := strings.TrimSpace(opts.Channel)
	if channel == "" {
		channel = "app:sse"
	}

	redisOpts := &redis.Options{
		Addr:     addr,
		Username: strings.TrimSpace(opts.Username),
		Password: opts.Password,
	}
	if opts.TLSEnabled {
		redisOpts.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	client := redis.NewClient(redisOpts)
	ctx, cancel := context.WithCancel(context.Background())
	if err := client.Ping(ctx).Err(); err != nil {
		cancel()
		_ = client.Close()
		redisLogger.Errorf("ping failed: %v", err)
		return fmt.Errorf("redis ping failed: %w", err)
	}

	pubsub := client.Subscribe(ctx, channel)
	if _, err := pubsub.Receive(ctx); err != nil {
		cancel()
		_ = pubsub.Close()
		_ = client.Close()
		redisLogger.Errorf("subscribe failed: %v", err)
		return fmt.Errorf("redis subscribe failed: %w", err)
	}

	m.redisMu.Lock()
	if m.redisCancel != nil {
		m.redisCancel()
	}
	if m.redisPubSub != nil {
		_ = m.redisPubSub.Close()
	}
	if m.redisClient != nil {
		_ = m.redisClient.Close()
	}
	m.redisClient = client
	m.redisPubSub = pubsub
	m.redisCtx = ctx
	m.redisCancel = cancel
	m.redisChannel = channel
	m.redisEnabled = true
	m.redisMu.Unlock()

	go m.consumeRedis(pubsub)

	redisLogger.Infof("replication enabled addr=%s channel=%s tls=%t", addr, channel, opts.TLSEnabled)
	return nil
}

// CloseRedis shuts down Redis pub/sub resources.
func (m *SSEManager) CloseRedis() {
	m.redisMu.Lock()
	defer m.redisMu.Unlock()

	if m.redisCancel != nil {
		m.redisCancel()
		m.redisCancel = nil
	}
	if m.redisPubSub != nil {
		_ = m.redisPubSub.Close()
		m.redisPubSub = nil
	}
	if m.redisClient != nil {
		_ = m.redisClient.Close()
		m.redisClient = nil
	}
	m.redisEnabled = false
	m.redisCtx = nil
	m.redisChannel = ""
	redisLogger.Info("replication disabled")
}

func (m *SSEManager) publishRedisMessage(msg redisBroadcastMessage) {
	m.redisMu.RLock()
	enabled := m.redisEnabled
	client := m.redisClient
	ctx := m.redisCtx
	channel := m.redisChannel
	m.redisMu.RUnlock()

	if !enabled || client == nil || ctx == nil || channel == "" {
		return
	}

	msg.InstanceID = m.InstanceID()
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal redis broadcast: %v", err)
		return
	}
	if err := client.Publish(ctx, channel, payload).Err(); err != nil {
		redisLogger.Errorf("publish failed target=%s workspace=%s: %v", msg.Target, msg.WorkspaceID, err)
	}
	redisLogger.Debugf("published target=%s workspace=%s channel=%s", msg.Target, msg.WorkspaceID, channel)
}

func (m *SSEManager) consumeRedis(pubsub *redis.PubSub) {
	for {
		msg, err := pubsub.ReceiveMessage(m.redisCtx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, redis.ErrClosed) {
				redisLogger.Debug("pubsub listener exiting")
				return
			}
			redisLogger.Errorf("pubsub receive error: %v", err)
			time.Sleep(time.Second)
			continue
		}

		var payload redisBroadcastMessage
		if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
			redisLogger.Errorf("unmarshal error: %v", err)
			continue
		}

		if payload.InstanceID == m.InstanceID() {
			redisLogger.Debug("skipping self-originated redis event")
			continue
		}

		redisLogger.Debugf("consuming target=%s workspace=%s", payload.Target, payload.WorkspaceID)
		m.handleRedisBroadcast(payload)
	}
}

func (m *SSEManager) handleRedisBroadcast(msg redisBroadcastMessage) {
	switch msg.Target {
	case redisTargetUser:
		m.broadcastToUserLocal(msg.UserID, msg.WorkspaceID, msg.Event, msg.ExcludeClientID)
	case redisTargetWorkspace:
		m.broadcastToWorkspaceLocal(msg.WorkspaceID, msg.Event, msg.ExcludeUserID)
	default:
		redisLogger.Warnf("unknown redis broadcast target=%s", msg.Target)
	}
}

// SetDB sets the database handle for membership lookups.
func (m *SSEManager) SetDB(db *gorm.DB) { m.db = db }

// SetEffectiveAccessService sets the effective access service for ACL-aware broadcasts.
func (m *SSEManager) SetEffectiveAccessService(effectiveAccessService *EffectiveAccessService) {
	m.effectiveAccessService = effectiveAccessService
}

// SetInstanceID stores the generated server instance identifier.
func (m *SSEManager) SetInstanceID(instanceID string) {
	m.instanceMu.Lock()
	m.instanceID = instanceID
	m.instanceMu.Unlock()
}

// InstanceID returns the configured server instance identifier.
func (m *SSEManager) InstanceID() string {
	m.instanceMu.RLock()
	defer m.instanceMu.RUnlock()
	return m.instanceID
}

// AddClient adds a new SSE client.
func (m *SSEManager) AddClient(userID, workspaceID string) *SSEClient {
	m.mu.Lock()
	defer m.mu.Unlock()

	client := &SSEClient{
		ID:          uuid.New().String(),
		UserID:      userID,
		WorkspaceID: workspaceID,
		Channel:     make(chan SSEEvent, 10),
	}

	if m.clients[workspaceID] == nil {
		m.clients[workspaceID] = make(map[string][]*SSEClient)
	}

	m.clients[workspaceID][userID] = append(m.clients[workspaceID][userID], client)
	m.clientIndex[client.ID] = client

	log.Printf("SSE client added: user=%s, workspace=%s, clientID=%s, total connections=%d",
		userID, workspaceID, client.ID, len(m.clients[workspaceID][userID]))
	m.registerClientInRedis(client)
	return client
}

// RemoveClientByID removes a specific SSE client by connection ID.
func (m *SSEManager) RemoveClientByID(userID, workspaceID, clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	defer delete(m.clientIndex, clientID)

	if workspaceClients, exists := m.clients[workspaceID]; exists {
		if clients, exists := workspaceClients[userID]; exists {
			for i, client := range clients {
				if client.ID == clientID {
					m.unregisterClientFromRedis(client)
					close(client.Channel)
					m.clients[workspaceID][userID] = append(clients[:i], clients[i+1:]...)
					log.Printf("SSE client removed: user=%s, workspace=%s, clientID=%s, remaining connections=%d",
						userID, workspaceID, clientID, len(m.clients[workspaceID][userID]))

					if len(m.clients[workspaceID][userID]) == 0 {
						delete(m.clients[workspaceID], userID)
					}
					break
				}
			}
		}
	}
}

// RemoveClient removes all SSE clients for a user.
func (m *SSEManager) RemoveClient(userID, workspaceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if workspaceClients, exists := m.clients[workspaceID]; exists {
		if clients, exists := workspaceClients[userID]; exists {
			for _, client := range clients {
				m.unregisterClientFromRedis(client)
				close(client.Channel)
				delete(m.clientIndex, client.ID)
			}
			delete(workspaceClients, userID)
			log.Printf("SSE client removed: user=%s, workspace=%s", userID, workspaceID)
		}
	}
}

// GetConnectionStats returns statistics about current SSE connections.
func (m *SSEManager) GetConnectionStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats := map[string]interface{}{
		"total_workspaces": len(m.clients),
		"workspaces":       make(map[string]map[string]int),
	}

	for workspaceID, workspaceClients := range m.clients {
		workspaceStats := make(map[string]int)
		for userID, clients := range workspaceClients {
			workspaceStats[userID] = len(clients)
		}
		stats["workspaces"].(map[string]map[string]int)[workspaceID] = workspaceStats
	}

	return stats
}

func (m *SSEManager) broadcastToUserLocal(userID, workspaceID string, event SSEEvent, excludeClientID string) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if workspaceClients, exists := m.clients[workspaceID]; exists {
		if clients, exists := workspaceClients[userID]; exists {
			log.Printf("Broadcasting to user: %s, workspace: %s, event: %+v, total connections=%d", userID, workspaceID, event, len(clients))
			for _, client := range clients {
				if excludeClientID != "" && client.ID == excludeClientID {
					continue
				}
				select {
				case client.Channel <- event:
					// Event sent successfully
				default:
					log.Printf("SSE channel full for user=%s, workspace=%s, clientID=%s", userID, workspaceID, client.ID)
				}
			}
		}
	} else {
		log.Printf("No clients found for workspace: %s", workspaceID)
	}
}

// BroadcastToUser sends an event to a specific user in a workspace.
func (m *SSEManager) BroadcastToUser(userID, workspaceID string, event SSEEvent) {
	m.BroadcastToUserWithOptions(userID, workspaceID, event, UserBroadcastOptions{})
}

// BroadcastToUserWithOptions sends an event to a specific user while allowing the caller to exclude the originating SSE client.
func (m *SSEManager) BroadcastToUserWithOptions(userID, workspaceID string, event SSEEvent, opts UserBroadcastOptions) {
	m.broadcastToUserLocal(userID, workspaceID, event, opts.ExcludeClientID)
	m.publishRedisMessage(redisBroadcastMessage{
		Target:          redisTargetUser,
		WorkspaceID:     workspaceID,
		UserID:          userID,
		ExcludeClientID: opts.ExcludeClientID,
		Event:           event,
	})
}

func (m *SSEManager) broadcastToWorkspaceLocal(workspaceID string, event SSEEvent, excludeUserID string) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if workspaceClients, exists := m.clients[workspaceID]; exists {
		totalUsers := len(workspaceClients)
		totalConnections := 0
		for _, clients := range workspaceClients {
			totalConnections += len(clients)
		}
		log.Printf("Broadcasting to workspace: %s, event: %+v, users=%d, total connections=%d",
			workspaceID, event, totalUsers, totalConnections)

		for userID, clients := range workspaceClients {
			if excludeUserID != "" && userID == excludeUserID {
				continue
			}

			for _, client := range clients {
				select {
				case client.Channel <- event:
					// Event sent successfully
				default:
					log.Printf("SSE channel full for user=%s, workspace=%s, clientID=%s", userID, workspaceID, client.ID)
				}
			}
		}
	}
}

// broadcastToAllWorkspaceMembers sends an event to ALL users in a workspace.
// This is intentionally private to prevent accidental use for resource-specific events.
// Use BroadcastToUsersWithAccess for resource-specific events that should respect ACL.
func (m *SSEManager) broadcastToAllWorkspaceMembers(workspaceID string, event SSEEvent, excludeUserID ...string) {
	var exclude string
	if len(excludeUserID) > 0 {
		exclude = excludeUserID[0]
	}
	m.broadcastToWorkspaceLocal(workspaceID, event, exclude)
	m.publishRedisMessage(redisBroadcastMessage{
		Target:        redisTargetWorkspace,
		WorkspaceID:   workspaceID,
		Event:         event,
		ExcludeUserID: exclude,
	})
}

// BroadcastToUsersWithAccess sends an event only to users who have ACL access to a resource.
// This queries the EffectiveAccessService to determine who has access, then broadcasts to each user.
// The creator is always included (implicit access) even if not in the ACL cache.
// IMPORTANT: If ACL lookup fails, this function does NOT broadcast (fail-safe, not fail-open).
func (m *SSEManager) BroadcastToUsersWithAccess(
	workspaceID string,
	resourceType models.ACLResourceType,
	resourceID string,
	event SSEEvent,
	opts ACLBroadcastOptions,
) {
	if m.effectiveAccessService == nil {
		log.Printf("SSE: ERROR - effectiveAccessService not set, cannot broadcast for %s/%s (not falling back to workspace broadcast for security)", resourceType, resourceID)
		return
	}

	// Get all users with access to this resource from the effective access cache
	accesses, err := m.effectiveAccessService.GetUsersForResource(string(resourceType), resourceID)
	if err != nil {
		log.Printf("SSE: ERROR - failed to get users for resource %s/%s: %v (not falling back to workspace broadcast for security)", resourceType, resourceID, err)
		return
	}

	// Build set of user IDs to broadcast to
	userIDs := make(map[string]bool)
	for _, access := range accesses {
		userIDs[access.UserID] = true
	}

	// Always include creator (implicit access not stored in effective_resource_access)
	if opts.CreatorID != "" {
		userIDs[opts.CreatorID] = true
	}

	// Remove excluded user
	if opts.ExcludeUserID != "" {
		delete(userIDs, opts.ExcludeUserID)
	}

	log.Printf("SSE: Broadcasting to %d users with access to %s/%s (creator=%s, excluded=%s)",
		len(userIDs), resourceType, resourceID, opts.CreatorID, opts.ExcludeUserID)

	// Broadcast to each user individually
	for userID := range userIDs {
		// For the author's own clients, we may want to exclude a specific client ID
		excludeClientID := ""
		if userID == opts.CreatorID || userID == opts.ExcludeUserID {
			// This shouldn't happen since we removed ExcludeUserID, but handle edge cases
		}
		// If broadcasting to the same user who triggered the event, exclude their client
		if opts.ExcludeClientID != "" {
			// Check if this user owns the excluded client
			client := m.GetClientByID(opts.ExcludeClientID)
			if client != nil && client.UserID == userID {
				excludeClientID = opts.ExcludeClientID
			}
		}

		m.BroadcastToUserWithOptions(userID, workspaceID, event, UserBroadcastOptions{
			ExcludeClientID: excludeClientID,
		})
	}
}

// HandleSSE handles an SSE connection for a user.
func (m *SSEManager) HandleSSE(w http.ResponseWriter, r *http.Request, userID, workspaceID string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	client := m.AddClient(userID, workspaceID)
	defer m.RemoveClientByID(userID, workspaceID, client.ID)
	m.touchClientLease(client.ID, workspaceID)

	// Send initial connection event so clients know they are subscribed and which server handled it.
	initialEvent := SSEEvent{
		Type: "connected",
		Data: map[string]interface{}{
			"message":    "Connected to notification stream",
			"clientId":   client.ID,
			"instanceId": m.InstanceID(),
		},
	}
	if payload, err := json.Marshal(initialEvent); err != nil {
		log.Printf("Failed to marshal initial SSE connected event: %v", err)
	} else {
		fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}

	done := r.Context().Done()
	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case event, ok := <-client.Channel:
			if !ok {
				log.Printf("SSE channel closed for user=%s, workspace=%s, clientID=%s", userID, workspaceID, client.ID)
				return
			}

			data, err := json.Marshal(event)
			if err != nil {
				log.Printf("Failed to marshal SSE event: %v", err)
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", string(data))
			flusher.Flush()
			m.touchClientLease(client.ID, workspaceID)

		case <-done:
			log.Printf("SSE client disconnected: user=%s, workspace=%s, clientID=%s", userID, workspaceID, client.ID)
			return
		case <-pingTicker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
			m.touchClientLease(client.ID, workspaceID)
		}
	}
}

// GetClientByID retrieves a specific client by connection ID.
func (m *SSEManager) GetClientByID(clientID string) *SSEClient {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if client, exists := m.clientIndex[clientID]; exists {
		return client
	}
	return nil
}

// BroadcastWorkspaceMemberAdded broadcasts a workspace member added event to all users in the workspace.
// This is a workspace-level event that should go to all members, hence uses broadcastToAllWorkspaceMembers.
func (m *SSEManager) BroadcastWorkspaceMemberAdded(member *models.WorkspaceMember) {
	if member == nil {
		return
	}
	event := SSEEvent{
		Type: string(SSEWorkspaceMemberAdded),
		Data: workspaceMemberEventPayload(member),
	}
	m.broadcastToAllWorkspaceMembers(member.WorkspaceID, event)
}

// BroadcastWorkspaceMemberRemoved broadcasts a workspace member removed event to all users in the workspace.
// This is a workspace-level event that should go to all members, hence uses broadcastToAllWorkspaceMembers.
func (m *SSEManager) BroadcastWorkspaceMemberRemoved(workspaceID, userID string) {
	event := SSEEvent{
		Type: string(SSEWorkspaceMemberRemoved),
		Data: map[string]interface{}{
			"workspaceId": workspaceID,
			"userId":      userID,
		},
	}
	m.broadcastToAllWorkspaceMembers(workspaceID, event)
}

// BroadcastWorkspaceMemberUpdated broadcasts a workspace member updated event to all users in the workspace.
func (m *SSEManager) BroadcastWorkspaceMemberUpdated(member *models.WorkspaceMember) {
	if member == nil {
		return
	}
	event := SSEEvent{
		Type: string(SSEWorkspaceMemberUpdated),
		Data: workspaceMemberEventPayload(member),
	}
	m.broadcastToAllWorkspaceMembers(member.WorkspaceID, event)
}

func workspaceMemberEventPayload(member *models.WorkspaceMember) map[string]interface{} {
	return map[string]interface{}{
		"entityId":        member.ID,
		"workspaceId":     member.WorkspaceID,
		"userId":          member.UserID,
		"role":            member.Role,
		"chainRootKeyId":  member.ChainRootKeyID,
		"wrappingKeyId":   member.WrappingKeyID,
		"wrappingKeyType": member.WrappingKeyType,
		"entityKeyNonce":  member.EntityKeyNonce,
		"wrappedEntityKey": member.WrappedEntityKey,
		"contentNonce":     member.ContentNonce,
		"contentCiphertext": member.ContentCiphertext,
		"contentHash":       member.ContentHash,
		"createdAt":         member.CreatedAt,
		"updatedAt":         member.UpdatedAt,
		"user":              member.User,
	}
}
