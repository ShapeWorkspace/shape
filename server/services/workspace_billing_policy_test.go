package services

import (
	"testing"

	"shape/models"
)

func TestDefaultSeatCapacityPolicyEvaluateSeatCapacity(t *testing.T) {
	t.Parallel()

	policy := NewDefaultSeatCapacityPolicy()

	tests := []struct {
		name    string
		input   SeatCapacityPolicyInput
		wantErr error
	}{
		{
			name: "ignore non positive seat additions",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:    0,
				OccupiedSeats: 5,
			},
			wantErr: nil,
		},
		{
			name: "allow self hosted",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:        100,
				OccupiedSeats:     999,
				SelfHostedEnabled: true,
			},
			wantErr: nil,
		},
		{
			name: "allow free solo workspace",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:    1,
				OccupiedSeats: 0,
			},
			wantErr: nil,
		},
		{
			name: "allow non subscribed growth past one seat while billing disabled",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:               1,
				OccupiedSeats:            1,
				HasPersistedSubscription: false,
			},
			wantErr: nil,
		},
		{
			name: "allow non writable subscription status while billing disabled",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:               1,
				OccupiedSeats:            1,
				HasPersistedSubscription: true,
				SeatsPurchased:           10,
				SubscriptionStatus:       "",
			},
			wantErr: nil,
		},
		{
			name: "allow growth past purchased seats while billing disabled",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:               1,
				OccupiedSeats:            2,
				HasPersistedSubscription: true,
				SeatsPurchased:           2,
				SubscriptionStatus:       "",
			},
			wantErr: nil,
		},
		{
			name: "allow trialing with capacity",
			input: SeatCapacityPolicyInput{
				SeatsToAdd:               1,
				OccupiedSeats:            1,
				HasPersistedSubscription: true,
				SeatsPurchased:           3,
				SubscriptionStatus:       models.WorkspaceSubscriptionStatusTrialing,
			},
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := policy.EvaluateSeatCapacity(tt.input)
			if err != tt.wantErr {
				t.Fatalf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}
