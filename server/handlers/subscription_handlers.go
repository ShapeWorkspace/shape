package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// SubscriptionHandlers handles subscription and billing operations for workspaces.
type SubscriptionHandlers struct {
	subscriptions          *services.WorkspaceSubscriptionService
	workspaceChecker       *services.WorkspaceChecker
	userService            *models.UserService
	workspaceMemberService *models.WorkspaceMemberService
	emailInviteService     *models.WorkspaceEmailInviteService
	workspaceService       *models.WorkspaceService
	emailService           services.EmailService
}

// NewSubscriptionHandlers creates a new subscription handlers instance.
func NewSubscriptionHandlers(
	subscriptions *services.WorkspaceSubscriptionService,
	checker *services.WorkspaceChecker,
	userService *models.UserService,
	workspaceMemberService *models.WorkspaceMemberService,
	emailInviteService *models.WorkspaceEmailInviteService,
	workspaceService *models.WorkspaceService,
	emailService services.EmailService,
) *SubscriptionHandlers {
	return &SubscriptionHandlers{
		subscriptions:          subscriptions,
		workspaceChecker:       checker,
		userService:            userService,
		workspaceMemberService: workspaceMemberService,
		emailInviteService:     emailInviteService,
		workspaceService:       workspaceService,
		emailService:           emailService,
	}
}

type checkoutRequest struct {
	SeatQuantity int    `json:"seat_quantity"`
	SuccessPath  string `json:"success_path,omitempty"`
	CancelPath   string `json:"cancel_path,omitempty"`
}

type portalRequest struct {
	ReturnPath         string `json:"return_path,omitempty"`
	SeatManagementOnly *bool  `json:"seat_management_only,omitempty"`
}

type activationRequest struct {
	Emails      []string `json:"emails"`
	SuccessPath string   `json:"success_path,omitempty"`
	CancelPath  string   `json:"cancel_path,omitempty"`
}

type activationInviteSummary struct {
	membersAdded  int
	invitesIssued int
}

// GetSubscription returns the current subscription status for a workspace.
func (h *SubscriptionHandlers) GetSubscription(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "User not in workspace", http.StatusForbidden)
		return
	}

	snapshot, err := h.subscriptions.Snapshot(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load subscription", err, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(snapshot)
}

// CreateCheckoutSession creates a Stripe checkout session for purchasing a subscription.
func (h *SubscriptionHandlers) CreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can manage subscriptions", http.StatusForbidden)
		return
	}

	user, err := h.userService.GetByID(userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load user profile", err, http.StatusInternalServerError)
		return
	}

	var req checkoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.SeatQuantity <= 0 {
		JSONError(w, "Seat quantity must be greater than zero", http.StatusBadRequest)
		return
	}

	snapshot, err := h.subscriptions.Snapshot(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load subscription", err, http.StatusInternalServerError)
		return
	}

	seatsUsed := 0
	if snapshot != nil {
		seatsUsed = snapshot.SeatsUsed
	} else {
		seatsUsed, err = h.subscriptions.CountBillableMembers(workspaceID)
		if err != nil {
			JSONErrorWithErr(w, "Failed to calculate seat usage", err, http.StatusInternalServerError)
			return
		}
	}

	if req.SeatQuantity < seatsUsed {
		JSONError(w, fmt.Sprintf("Seat quantity must be at least %d", seatsUsed), http.StatusBadRequest)
		return
	}

	successPath := req.SuccessPath
	if successPath == "" {
		successPath = buildBillingRedirectURLFromRequest(r, "success")
	}
	cancelPath := req.CancelPath
	if cancelPath == "" {
		cancelPath = buildBillingRedirectURLFromRequest(r, "cancelled")
	}

	session, err := h.subscriptions.CreateCheckoutSession(r.Context(), workspaceID, req.SeatQuantity, successPath, cancelPath, user.Email)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrStripeNotConfigured):
			JSONError(w, "Stripe is not configured", http.StatusServiceUnavailable)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			JSONErrorWithErr(w, "Failed to create Stripe checkout session", err, http.StatusInternalServerError)
		}
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"url": session.URL})
}

// ActivateWorkspace handles workspace activation with optional teammate invitations.
func (h *SubscriptionHandlers) ActivateWorkspace(w http.ResponseWriter, r *http.Request) {
	const maxActivationInvites = 32

	workspaceID := mux.Vars(r)["workspaceId"]
	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can activate billing", http.StatusForbidden)
		return
	}

	user, err := h.userService.GetByID(userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load user profile", err, http.StatusInternalServerError)
		return
	}

	var req activationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != http.ErrBodyNotAllowed {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var workspaceCampaign models.AcquisitionCampaign
	if h.workspaceService != nil {
		workspace, err := h.workspaceService.GetByID(workspaceID)
		if err != nil {
			JSONErrorWithErr(w, "Failed to load workspace", err, http.StatusInternalServerError)
			return
		}
		workspaceCampaign = workspace.AcquisitionCampaign
	}
	requireInvites := workspaceCampaign.RequiresInviteBeforeActivation()

	inviteEmails := normalizeActivationEmails(req.Emails, maxActivationInvites)
	if requireInvites {
		if len(inviteEmails) == 0 {
			JSONError(w, "Enter at least one teammate email to redeem the launch offer credit.", http.StatusBadRequest)
			return
		}
		summary, err := h.handleActivationInvites(workspaceID, userID, inviteEmails)
		if err != nil {
			switch {
			case errors.Is(err, models.ErrWorkspaceReadOnly):
				JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			case errors.Is(err, models.ErrSeatLimitReached):
				JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
			default:
				JSONErrorWithErr(w, "Failed to issue invitations", err, http.StatusInternalServerError)
			}
			return
		}
		if summary.membersAdded+summary.invitesIssued == 0 {
			JSONError(w, "Unable to invite teammates. Double-check the email list and try again.", http.StatusBadRequest)
			return
		}
	} else if len(inviteEmails) > 0 {
		if _, err := h.handleActivationInvites(workspaceID, userID, inviteEmails); err != nil {
			switch {
			case errors.Is(err, models.ErrWorkspaceReadOnly):
				JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			case errors.Is(err, models.ErrSeatLimitReached):
				JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
			default:
				JSONErrorWithErr(w, "Failed to issue invitations", err, http.StatusInternalServerError)
			}
			return
		}
	}

	seatQuantity, err := h.deriveActivationSeatQuantity(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to calculate seat quantity", err, http.StatusInternalServerError)
		return
	}
	if seatQuantity <= 0 {
		seatQuantity = 1
	}

	successPath := strings.TrimSpace(req.SuccessPath)
	if successPath == "" {
		successPath = buildActivationRedirectURLFromRequest(r, "success")
	}
	cancelPath := strings.TrimSpace(req.CancelPath)
	if cancelPath == "" {
		cancelPath = buildActivationRedirectURLFromRequest(r, "cancelled")
	}

	session, err := h.subscriptions.CreateCheckoutSession(r.Context(), workspaceID, seatQuantity, successPath, cancelPath, user.Email)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrStripeNotConfigured):
			JSONError(w, "Stripe is not configured", http.StatusServiceUnavailable)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			JSONErrorWithErr(w, "Failed to create Stripe checkout session", err, http.StatusInternalServerError)
		}
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"url": session.URL})
}

// CreateBillingPortalSession creates a Stripe billing portal session for managing subscriptions.
func (h *SubscriptionHandlers) CreateBillingPortalSession(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can manage subscriptions", http.StatusForbidden)
		return
	}

	var req portalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != http.ErrBodyNotAllowed {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	returnPath := req.ReturnPath
	if returnPath == "" {
		returnPath = buildBillingRedirectURLFromRequest(r, "")
	}

	seatOnly := true
	if req.SeatManagementOnly != nil {
		seatOnly = *req.SeatManagementOnly
	}

	handlePortalError := func(err error) bool {
		if err == nil {
			return false
		}
		switch {
		case errors.Is(err, models.ErrStripeNotConfigured):
			JSONError(w, "Stripe is not configured", http.StatusServiceUnavailable)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		case errors.Is(err, services.ErrStripeCustomerMissing):
			JSONError(w, "Workspace billing is not linked to Stripe. Contact support to connect a customer before opening the portal.", http.StatusBadRequest)
		default:
			var stripeErr *services.StripeAPIError
			if errors.As(err, &stripeErr) {
				status := stripeErr.Status
				if status < 400 || status > 599 {
					status = http.StatusBadGateway
				}
				message := stripeErr.Message
				if stripeErr.Code != "" {
					message = fmt.Sprintf("%s (code: %s)", message, stripeErr.Code)
				}
				JSONError(w, fmt.Sprintf("Stripe error: %s", message), status)
			} else {
				JSONErrorWithErr(w, "Failed to create billing portal session", err, http.StatusInternalServerError)
			}
		}
		return true
	}

	var sessionURL string
	if seatOnly {
		session, err := h.subscriptions.CreateBillingPortalSession(r.Context(), workspaceID, returnPath)
		if handlePortalError(err) {
			return
		}
		sessionURL = session.URL
	} else {
		session, err := h.subscriptions.CreateFullBillingPortalSession(r.Context(), workspaceID, returnPath)
		if handlePortalError(err) {
			return
		}
		sessionURL = session.URL
	}

	json.NewEncoder(w).Encode(map[string]string{"url": sessionURL})
}

// buildBillingRedirectURLFromRequest ensures Stripe returns users to the same workspace-specific
// origin that initiated the request so subdomains work in every environment.
func buildBillingRedirectURLFromRequest(r *http.Request, status string) string {
	const billingPath = "/settings/billing"

	origin := deriveRequestOriginFromHeaders(r)
	billingURL := &url.URL{Path: billingPath}

	if origin != "" {
		if parsedOrigin, err := url.Parse(origin); err == nil {
			billingURL.Scheme = parsedOrigin.Scheme
			billingURL.Host = parsedOrigin.Host
		}
	}

	if status != "" {
		query := url.Values{}
		query.Set("status", status)
		billingURL.RawQuery = query.Encode()
	}

	return billingURL.String()
}

func buildActivationRedirectURLFromRequest(r *http.Request, status string) string {
	const activationPath = "/activation"

	origin := deriveRequestOriginFromHeaders(r)
	activationURL := &url.URL{Path: activationPath}

	if origin != "" {
		if parsedOrigin, err := url.Parse(origin); err == nil {
			activationURL.Scheme = parsedOrigin.Scheme
			activationURL.Host = parsedOrigin.Host
		}
	}

	if status != "" {
		query := url.Values{}
		query.Set("status", status)
		activationURL.RawQuery = query.Encode()
	}

	return activationURL.String()
}

// normalizeActivationEmails deduplicates and normalizes email addresses for activation invites.
func normalizeActivationEmails(emails []string, limit int) []string {
	if len(emails) == 0 {
		return nil
	}
	dedup := make(map[string]struct{}, len(emails))
	normalized := make([]string, 0, len(emails))
	for _, email := range emails {
		trimmed := strings.TrimSpace(email)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := dedup[key]; exists {
			continue
		}
		dedup[key] = struct{}{}
		normalized = append(normalized, trimmed)
		if limit > 0 && len(normalized) >= limit {
			break
		}
	}
	return normalized
}

// handleActivationInvites processes teammate invitations during workspace activation.
func (h *SubscriptionHandlers) handleActivationInvites(workspaceID, inviterID string, emails []string) (activationInviteSummary, error) {
	summary := activationInviteSummary{}
	if h.workspaceMemberService == nil {
		return summary, fmt.Errorf("workspace member service unavailable")
	}
	for _, email := range emails {
		if email == "" {
			continue
		}
		if h.subscriptions != nil {
			if err := h.subscriptions.EnsureWorkspaceWritable(workspaceID); err != nil {
				return summary, err
			}
			if err := h.subscriptions.EnsureSeatCapacityForInviteReservation(workspaceID, 1); err != nil {
				return summary, err
			}
		}
		addedMember, err := h.workspaceMemberService.AddMemberToWorkspace(inviterID, workspaceID, email, models.WorkspaceMemberRoleMember)
		if err == nil {
			if addedMember != nil {
				summary.membersAdded++
			}
			continue
		}
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			summary.membersAdded++
			continue
		}

		if errors.Is(err, gorm.ErrRecordNotFound) {
			if h.emailInviteService == nil {
				continue
			}
			result, inviteErr := h.emailInviteService.CreateOrRefresh(models.CreateWorkspaceEmailInviteParams{
				WorkspaceID: workspaceID,
				Email:       email,
				Role:        models.WorkspaceMemberRoleMember,
				CreatedBy:   inviterID,
			})
			if inviteErr != nil {
				return summary, inviteErr
			}
			if result != nil && result.Invite != nil {
				summary.invitesIssued++
				if result.ShouldSend && result.Token != "" {
					go dispatchWorkspaceInviteEmail(
						h.emailService,
						h.workspaceService,
						h.userService,
						result.Invite,
						result.Token,
						email,
						inviterID,
					)
				}
			}
			continue
		}

		return summary, err
	}
	return summary, nil
}

// deriveActivationSeatQuantity calculates the number of seats needed for activation.
func (h *SubscriptionHandlers) deriveActivationSeatQuantity(workspaceID string) (int, error) {
	members, err := h.subscriptions.CountBillableMembers(workspaceID)
	if err != nil {
		return 0, err
	}
	invites := 0
	if h.emailInviteService != nil {
		activeInvites, inviteErr := h.emailInviteService.GetActiveInvitesForWorkspace(workspaceID)
		if inviteErr != nil {
			return 0, inviteErr
		}
		invites = len(activeInvites)
	}
	return members + invites, nil
}

// deriveRequestOriginFromHeaders inspects forwarded headers to recover the browser-facing scheme
// and host when the API is behind a proxy. Falls back to the direct connection values otherwise.
func deriveRequestOriginFromHeaders(r *http.Request) string {
	if r == nil {
		return ""
	}

	host := firstForwardedValue(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if host == "" {
		return ""
	}

	scheme := firstForwardedValue(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	return fmt.Sprintf("%s://%s", scheme, host)
}

// firstForwardedValue returns the first comma-delimited entry from a Forwarded style header.
func firstForwardedValue(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	if comma := strings.Index(trimmed, ","); comma >= 0 {
		return strings.TrimSpace(trimmed[:comma])
	}

	return trimmed
}
