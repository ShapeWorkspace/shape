package handlers

import (
	"io"
	"net/http"
	"time"

	"shape/services"
	"shape/utils"
)

// StripeHandlers processes incoming Stripe webhook notifications.
type StripeHandlers struct {
	subscriptions *services.WorkspaceSubscriptionService
}

// NewStripeHandlers creates a new Stripe handlers instance.
func NewStripeHandlers(subscriptions *services.WorkspaceSubscriptionService) *StripeHandlers {
	return &StripeHandlers{subscriptions: subscriptions}
}

// stripeTolerance is the maximum time difference allowed between webhook creation and receipt.
const stripeTolerance = 5 * time.Minute

// HandleWebhook processes incoming Stripe webhook events and updates subscription state accordingly.
func (h *StripeHandlers) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if h.subscriptions == nil {
		JSONError(w, "Stripe not configured", http.StatusServiceUnavailable)
		return
	}

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		JSONError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	signature := r.Header.Get("Stripe-Signature")
	if signature == "" {
		JSONError(w, "Missing Stripe signature", http.StatusBadRequest)
		return
	}

	if err := h.subscriptions.VerifyStripeSignature(payload, signature, stripeTolerance); err != nil {
		utils.Errorf("Stripe webhook signature verification failed: %v", err)
		JSONError(w, "Invalid Stripe signature", http.StatusBadRequest)
		return
	}

	utils.Infof("Stripe webhook received, payload size: %d bytes", len(payload))

	if err := h.subscriptions.ProcessWebhookPayload(payload); err != nil {
		utils.Errorf("Failed to process Stripe webhook: %v", err)
		JSONErrorWithErr(w, "Failed to process Stripe webhook", err, http.StatusInternalServerError)
		return
	}

	utils.Info("Stripe webhook processed successfully")
	JSONResponse(w, map[string]string{"status": "ok"}, http.StatusOK)
}
