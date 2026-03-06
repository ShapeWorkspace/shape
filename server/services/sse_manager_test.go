package services

import (
	"testing"
	"time"
)

// buildSSEManagerForTesting wires an in-memory SSE manager without Redis enabled.
// The manager is used to validate local broadcast behavior only.
func buildSSEManagerForTesting() *SSEManager {
	return &SSEManager{
		clients:     map[string]map[string][]*SSEClient{},
		clientIndex: map[string]*SSEClient{},
	}
}

func TestSSEManagerBroadcastToUser_SendsEventToLocalClient(t *testing.T) {
	workspaceID := "workspace-test"
	userID := "user-test"

	sseManager := buildSSEManagerForTesting()
	client := &SSEClient{
		ID:          "client-1",
		UserID:      userID,
		WorkspaceID: workspaceID,
		Channel:     make(chan SSEEvent, 1),
	}

	// Register the client under the workspace/user lookup tables.
	sseManager.clients[workspaceID] = map[string][]*SSEClient{
		userID: {client},
	}
	sseManager.clientIndex[client.ID] = client

	event := SSEEvent{
		Type: string(SSEReactionCreated),
		Data: map[string]interface{}{
			"id": "reaction-id",
		},
	}

	sseManager.BroadcastToUser(userID, workspaceID, event)

	select {
	case receivedEvent := <-client.Channel:
		if receivedEvent.Type != event.Type {
			t.Fatalf("expected event type %s, got %s", event.Type, receivedEvent.Type)
		}
		receivedID, _ := receivedEvent.Data["id"].(string)
		if receivedID != "reaction-id" {
			t.Fatalf("expected payload id reaction-id, got %s", receivedID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected SSE event to be delivered to client channel")
	}
}

func TestSSEManagerBroadcastToUserWithOptions_ExcludesOriginatingClient(t *testing.T) {
	workspaceID := "workspace-test"
	userID := "user-test"

	sseManager := buildSSEManagerForTesting()
	excludedClient := &SSEClient{
		ID:          "client-excluded",
		UserID:      userID,
		WorkspaceID: workspaceID,
		Channel:     make(chan SSEEvent, 1),
	}
	receivingClient := &SSEClient{
		ID:          "client-receiver",
		UserID:      userID,
		WorkspaceID: workspaceID,
		Channel:     make(chan SSEEvent, 1),
	}

	sseManager.clients[workspaceID] = map[string][]*SSEClient{
		userID: {excludedClient, receivingClient},
	}
	sseManager.clientIndex[excludedClient.ID] = excludedClient
	sseManager.clientIndex[receivingClient.ID] = receivingClient

	event := SSEEvent{
		Type: string(SSEReactionDeleted),
		Data: map[string]interface{}{
			"id": "reaction-id",
		},
	}

	sseManager.BroadcastToUserWithOptions(userID, workspaceID, event, UserBroadcastOptions{
		ExcludeClientID: excludedClient.ID,
	})

	select {
	case <-excludedClient.Channel:
		t.Fatalf("did not expect excluded client to receive SSE event")
	default:
		// Expected path: excluded client channel should remain empty.
	}

	select {
	case receivedEvent := <-receivingClient.Channel:
		if receivedEvent.Type != event.Type {
			t.Fatalf("expected event type %s, got %s", event.Type, receivedEvent.Type)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected non-excluded client to receive SSE event")
	}
}
