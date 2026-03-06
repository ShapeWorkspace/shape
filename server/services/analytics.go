package services

import "context"

// AnalyticsService defines the interface for analytics tracking.
// This is a minimal placeholder - implementations can add methods as needed.
type AnalyticsService interface {
	TrackEvent(ctx context.Context, eventName string, properties map[string]interface{}) error
}

// NoOpAnalyticsService is a no-op implementation of AnalyticsService for testing/dev environments.
type NoOpAnalyticsService struct{}

// TrackEvent is a no-op implementation.
func (s *NoOpAnalyticsService) TrackEvent(ctx context.Context, eventName string, properties map[string]interface{}) error {
	return nil
}
