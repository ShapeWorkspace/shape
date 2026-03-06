package handlers

import (
	"encoding/json"
	"net/http"

	"shape/middleware"
	"shape/services"

	"github.com/gorilla/mux"
)

// SSEHandlers handles Server-Sent Events endpoints for real-time updates.
type SSEHandlers struct {
	sseManager *services.SSEManager
}

// NewSSEHandlers creates new SSE handlers connected to the global SSE manager.
func NewSSEHandlers() *SSEHandlers {
	return &SSEHandlers{
		sseManager: services.GetSSEManager(),
	}
}

// SSETokenResponse is returned by the SSE token exchange endpoint.
type SSETokenResponse struct {
	Token string `json:"token"`
}

// GenerateSSEToken exchanges an app token (in Authorization header) for a short-lived,
// single-use SSE token. This token should be used immediately to establish an SSE connection.
//
// Security: The SSE token is designed to appear in URLs (as a query param) since EventSource
// doesn't support custom headers. By making it short-lived (60s) and single-use, we minimize
// the risk if it appears in server logs or other places where URLs are recorded.
//
// Flow:
// 1. Client calls POST /api/sse/token with Authorization: Bearer <appToken>
// 2. Server validates app token and returns { "token": "<sseToken>" }
// 3. Client immediately connects to SSE endpoint with ?sseToken=<sseToken>
// 4. SSE token is consumed on first use and cannot be reused
func (h *SSEHandlers) GenerateSSEToken(w http.ResponseWriter, r *http.Request) {
	// Get the authenticated user ID from context (set by RequireAuth middleware)
	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Generate a short-lived, single-use SSE token
	token, err := middleware.GenerateSSEToken(userID)
	if err != nil {
		JSONError(w, "Failed to generate SSE token", http.StatusInternalServerError)
		return
	}

	response := SSETokenResponse{Token: token}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleNotificationSSE manages the long-lived SSE stream for workspace notifications.
// This endpoint is used by clients to receive real-time updates about workspace events.
func (h *SSEHandlers) HandleNotificationSSE(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]

	// Enforce authentication via middleware-provided context.
	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Delegate to the shared SSE manager which performs connection lifecycle management.
	h.sseManager.HandleSSE(w, r, userID, workspaceID)
}
