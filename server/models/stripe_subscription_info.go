package models

import (
	"time"

	"github.com/google/uuid"
)

// newUUID generates a new UUID string.
func newUUID() string {
	return uuid.NewString()
}

// StripeSubscriptionInfo isolates Stripe-specific identifiers for a paid workspace subscription.
// These values remain mandatory because Stripe cannot manage a subscription without the trio.
type StripeSubscriptionInfo struct {
	WorkspaceID            string    `json:"workspace_id" gorm:"primaryKey;type:uuid"`
	StripeCustomerID       string    `json:"stripe_customer_id" gorm:"type:text;not null"`
	StripeSubscriptionID   string    `json:"stripe_subscription_id" gorm:"type:text;not null"`
	StripeSubscriptionItem string    `json:"stripe_subscription_item_id" gorm:"type:text;not null"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// StripePayment keeps an immutable record of each settled invoice reported by Stripe webhooks.
type StripePayment struct {
	StripeInvoiceID       string    `json:"stripe_invoice_id" gorm:"primaryKey;type:text"`
	WorkspaceID           string    `json:"workspace_id" gorm:"type:uuid;not null;index"`
	StripeCustomerID      string    `json:"stripe_customer_id" gorm:"type:text;not null"`
	StripeSubscriptionID  string    `json:"stripe_subscription_id" gorm:"type:text;not null"`
	StripePaymentIntentID string    `json:"stripe_payment_intent_id" gorm:"type:text"`
	AmountPaid            int64     `json:"amount_paid" gorm:"not null"`
	Currency              string    `json:"currency" gorm:"type:text;not null"`
	PaidAt                time.Time `json:"paid_at" gorm:"not null"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

// StripeEventLog stores processed webhook event IDs for idempotency.
type StripeEventLog struct {
	ID        string    `gorm:"primaryKey;type:text"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
}

// SubscriptionCredit records every promotional credit we push to Stripe so we avoid duplicate
// adjustments and maintain visibility into campaign fulfilment.
type SubscriptionCredit struct {
	ID                         string              `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID                string              `json:"workspace_id" gorm:"type:uuid;not null;index"`
	StripeCustomerID           string              `json:"stripe_customer_id" gorm:"type:text;not null"`
	StripeBalanceTransactionID string              `json:"stripe_balance_transaction_id" gorm:"type:text;not null;uniqueIndex"`
	Campaign                   AcquisitionCampaign `json:"campaign" gorm:"type:text;not null"`
	AmountCents                int64               `json:"amount_cents" gorm:"not null"`
	Currency                   string              `json:"currency" gorm:"type:text;not null"`
	CreatedAt                  time.Time           `json:"created_at"`
	UpdatedAt                  time.Time           `json:"updated_at"`
}

// NewSubscriptionCredit seeds a fully populated record with generated identifiers.
func NewSubscriptionCredit(workspaceID, customerID, balanceTransactionID string, campaign AcquisitionCampaign, amountCents int64, currency string) *SubscriptionCredit {
	now := time.Now().UTC()
	return &SubscriptionCredit{
		ID:                         newUUID(),
		WorkspaceID:                workspaceID,
		StripeCustomerID:           customerID,
		StripeBalanceTransactionID: balanceTransactionID,
		Campaign:                   campaign,
		AmountCents:                amountCents,
		Currency:                   currency,
		CreatedAt:                  now,
		UpdatedAt:                  now,
	}
}
