package services

import "shape/models"

// SeatCapacityPolicyInput is the normalized input for seat-capacity policy decisions.
type SeatCapacityPolicyInput struct {
	WorkspaceID              string
	SeatsToAdd               int
	OccupiedSeats            int
	SeatsPurchased           int
	HasPersistedSubscription bool
	SubscriptionStatus       models.WorkspaceSubscriptionStatus
	SelfHostedEnabled        bool
}

// SeatCapacityPolicy decides whether a seat-consuming action should be allowed.
// This interface is intentionally small so policy logic can evolve without changing handlers.
type SeatCapacityPolicy interface {
	EvaluateSeatCapacity(input SeatCapacityPolicyInput) error
}

// DefaultSeatCapacityPolicy encodes the first production billing rule set.
// Rule set:
// 1) Single-seat workspaces are always allowed (free solo).
// 2) Any action that moves occupancy above one seat requires a paid subscription with capacity.
type DefaultSeatCapacityPolicy struct{}

// NewDefaultSeatCapacityPolicy creates the default seat-capacity policy.
func NewDefaultSeatCapacityPolicy() *DefaultSeatCapacityPolicy {
	return &DefaultSeatCapacityPolicy{}
}

// EvaluateSeatCapacity returns nil when the action is allowed.
func (p *DefaultSeatCapacityPolicy) EvaluateSeatCapacity(input SeatCapacityPolicyInput) error {
	// Billing enforcement is temporarily disabled while rollout stays open.
	_ = input
	return nil
}
