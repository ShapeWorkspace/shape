package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"shape/models"
	"shape/services"

	"gorm.io/gorm"
)

// TestHandlers provides endpoints used only in tests for development and integration testing.
type TestHandlers struct {
	db            *gorm.DB
	subscriptions *services.WorkspaceSubscriptionService
	workspaces    *models.WorkspaceService
}

// NewTestHandlers wires test-only handler dependencies.
func NewTestHandlers(
	db *gorm.DB,
	subscriptions *services.WorkspaceSubscriptionService,
	workspaces *models.WorkspaceService,
) *TestHandlers {
	return &TestHandlers{
		db:            db,
		subscriptions: subscriptions,
		workspaces:    workspaces,
	}
}

// GetCapturedEmails returns and clears captured test emails.
// GET /api/test/emails
func (t *TestHandlers) GetCapturedEmails(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("ENVIRONMENT") != "test" && os.Getenv("ENVIRONMENT") != "dev" {
		JSONError(w, "Not Found", http.StatusNotFound)
		return
	}
	recipients := r.URL.Query()["recipient"]
	peek := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("peek")), "true")
	var emails []string
	if len(recipients) == 0 {
		if peek {
			emails = services.PeekTestCapturedEmails()
		} else {
			emails = services.GetAndClearTestCapturedEmails()
		}
	} else {
		seen := make(map[string]struct{})
		for _, raw := range recipients {
			normalized := strings.ToLower(strings.TrimSpace(raw))
			if normalized == "" {
				continue
			}
			if _, exists := seen[normalized]; exists {
				continue
			}
			seen[normalized] = struct{}{}
			if peek {
				emails = append(emails, services.PeekTestCapturedEmailsFor(normalized)...)
			} else {
				emails = append(emails, services.GetAndClearTestCapturedEmailsFor(normalized)...)
			}
		}
		if emails == nil {
			emails = []string{}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"emails": emails})
}

// SetEmailCapture enables/disables test email capture.
// POST /api/test/email-capture
func (t *TestHandlers) SetEmailCapture(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("ENVIRONMENT") != "test" && os.Getenv("ENVIRONMENT") != "dev" {
		JSONError(w, "Not Found", http.StatusNotFound)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	services.EnableTestEmailCapture(body.Enabled)
	JSONResponse(w, map[string]bool{"enabled": body.Enabled}, http.StatusOK)
}

// CreateWorkspaceSubscription activates a workspace's subscription in dev/test so billing gates stay open.
// POST /api/test/subscriptions
func (t *TestHandlers) CreateWorkspaceSubscription(w http.ResponseWriter, r *http.Request) {
	env := strings.ToLower(os.Getenv("ENVIRONMENT"))
	if env != "test" && env != "dev" && env != "development" {
		JSONError(w, "Not Found", http.StatusNotFound)
		return
	}

	if t.subscriptions == nil {
		JSONError(w, "Subscription service unavailable", http.StatusServiceUnavailable)
		return
	}

	var payload struct {
		WorkspaceID string `json:"workspace_id"`
		Seats       int    `json:"seats"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	workspaceID := strings.TrimSpace(payload.WorkspaceID)
	if workspaceID == "" {
		JSONError(w, "workspace_id is required", http.StatusBadRequest)
		return
	}

	snapshot, err := t.subscriptions.EnsureTestSubscription(workspaceID, payload.Seats)
	if err != nil {
		JSONErrorWithErr(w, "Failed to activate test subscription", err, http.StatusInternalServerError)
		return
	}

	// Mark onboarding as complete for test subscriptions.
	if snapshot != nil && snapshot.BillingProvider == models.WorkspaceSubscriptionBillingProviderTests && t.workspaces != nil {
		if err := t.workspaces.SetOnboardingCompleted(workspaceID, true); err != nil {
			JSONErrorWithErr(w, "Failed to mark onboarding complete", err, http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	JSONResponse(w, map[string]*models.WorkspaceSubscriptionSnapshot{"subscription": snapshot}, http.StatusOK)
}
