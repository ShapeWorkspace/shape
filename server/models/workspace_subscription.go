package models

import "time"

// WorkspaceSubscriptionStatus mirrors Stripe's status vocabulary so downstream
// logic can treat the values predictably.
type WorkspaceSubscriptionStatus string

const (
	WorkspaceSubscriptionStatusTrialing   WorkspaceSubscriptionStatus = "trialing"
	WorkspaceSubscriptionStatusActive     WorkspaceSubscriptionStatus = "active"
	WorkspaceSubscriptionStatusPastDue    WorkspaceSubscriptionStatus = "past_due"
	WorkspaceSubscriptionStatusCanceled   WorkspaceSubscriptionStatus = "canceled"
	WorkspaceSubscriptionStatusIncomplete WorkspaceSubscriptionStatus = "incomplete"
	WorkspaceSubscriptionStatusUnpaid     WorkspaceSubscriptionStatus = "unpaid"
	WorkspaceSubscriptionStatusUnknown    WorkspaceSubscriptionStatus = "unknown"
)

// WorkspaceSubscriptionBillingProvider records which system issued the subscription.
type WorkspaceSubscriptionBillingProvider string

const (
	WorkspaceSubscriptionBillingProviderStripe     WorkspaceSubscriptionBillingProvider = "stripe"
	WorkspaceSubscriptionBillingProviderTests      WorkspaceSubscriptionBillingProvider = "tests"
	WorkspaceSubscriptionBillingProviderSelfHosted WorkspaceSubscriptionBillingProvider = "self_hosted"
)

// WorkspaceSubscription persists the billing state for a workspace.
type WorkspaceSubscription struct {
	WorkspaceID            string                               `json:"workspace_id" gorm:"primaryKey;type:uuid"`
	Status                 WorkspaceSubscriptionStatus          `json:"status" gorm:"type:text;not null"`
	SeatsPurchased         int                                  `json:"seats_purchased" gorm:"not null;default:0"`
	TrialEndsAt            *time.Time                           `json:"trial_ends_at"`
	CurrentPeriodEnd       *time.Time                           `json:"current_period_end"`
	CancelAtPeriodEnd      bool                                 `json:"cancel_at_period_end" gorm:"not null;default:false"`
	BillingProvider        WorkspaceSubscriptionBillingProvider `json:"billing_provider" gorm:"type:text;not null;default:stripe"`
	CreatedAt              time.Time                            `json:"created_at"`
	UpdatedAt              time.Time                            `json:"updated_at"`
	StripeSubscriptionInfo *StripeSubscriptionInfo              `json:"stripe_subscription_info,omitempty" gorm:"foreignKey:WorkspaceID;references:WorkspaceID"`
}

// WorkspaceSubscriptionSnapshot is returned to clients with derived details.
type WorkspaceSubscriptionSnapshot struct {
	WorkspaceID       string                               `json:"workspace_id"`
	Status            WorkspaceSubscriptionStatus          `json:"status"`
	BillingProvider   WorkspaceSubscriptionBillingProvider `json:"billing_provider"`
	Campaign          AcquisitionCampaign                  `json:"campaign,omitempty"`
	SeatsPurchased    int                                  `json:"seats_purchased"`
	SeatsUsed         int                                  `json:"seats_used"`
	SeatsAvailable    int                                  `json:"seats_available"`
	TrialEndsAt       *time.Time                           `json:"trial_ends_at,omitempty"`
	CurrentPeriodEnd  *time.Time                           `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd bool                                 `json:"cancel_at_period_end"`
	IsTrialActive     bool                                 `json:"is_trial_active"`
	IsReadOnly        bool                                 `json:"is_read_only"`
	HasStripeCustomer bool                                 `json:"has_stripe_customer"`
	HasSubscription   bool                                 `json:"has_subscription"`
}

// computeSeatsAvailable ensures we never surface negative availability values.
func computeSeatsAvailable(purchased, used int) int {
	remaining := purchased - used
	if remaining < 0 {
		return 0
	}
	return remaining
}

// DetermineReadOnly encodes when a workspace should be locked for writes.
// TODO: Re-enable subscription checks when billing is ready for production.
func (ws WorkspaceSubscription) DetermineReadOnly(now time.Time, seatsUsed int, hasValidCredentials bool) bool {
	// Temporarily disabled: all workspaces have full access while building out the product.
	return false

	// Original billing enforcement logic (commented out for development):
	// if ws.TrialEndsAt != nil && now.Before(*ws.TrialEndsAt) {
	// 	// During trial, need valid credentials and seats
	// 	if !hasValidCredentials || ws.SeatsPurchased <= 0 {
	// 		return true
	// 	}
	// 	return false
	// }
	//
	// if ws.CancelAtPeriodEnd {
	// 	if ws.CurrentPeriodEnd == nil {
	// 		return true
	// 	}
	// 	if now.After(*ws.CurrentPeriodEnd) {
	// 		return true
	// 	}
	// }
	//
	// if ws.Status == WorkspaceSubscriptionStatusActive {
	// 	return ws.SeatsPurchased <= 0
	// }
	//
	// return true
}
