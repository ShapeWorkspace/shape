package models

import "errors"

// Common errors used across the models package.
var (
	// ErrStripeNotConfigured indicates that Stripe credentials are missing or incomplete.
	ErrStripeNotConfigured = errors.New("stripe is not configured")
	// ErrWorkspaceReadOnly signals that the workspace cannot accept writes.
	ErrWorkspaceReadOnly = errors.New("workspace is read-only")
	// ErrSeatLimitReached indicates the workspace has exhausted its purchased seat count.
	ErrSeatLimitReached = errors.New("seat limit reached")
)
