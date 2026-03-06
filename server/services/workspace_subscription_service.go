package services

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"shape/models"
	"shape/utils"

	stripe "github.com/stripe/stripe-go/v80"
	"github.com/stripe/stripe-go/v80/client"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	testSubscriptionDuration       = 365 * 24 * time.Hour
	selfHostedSubscriptionDuration = 100 * 365 * 24 * time.Hour
	selfHostedSeatCount            = 10000
)

// ErrStripeCustomerMissing indicates the workspace lacks a connected Stripe customer record.
var (
	ErrStripeCustomerMissing                = errors.New("workspace is missing a stripe customer")
	ErrWorkspaceSubscriptionMissing         = errors.New("workspace has no Stripe subscription record")
	ErrWorkspaceSubscriptionCustomerMissing = errors.New("workspace has no Stripe customer id")
)

// StripeAPIError captures structured error details returned by Stripe so handlers can surface
// actionable feedback without exposing sensitive payloads.
type StripeAPIError struct {
	Status  int
	Message string
	Code    string
	Type    string
}

// Error implements the error interface with a concise, user-safe message summarising the Stripe issue.
func (e *StripeAPIError) Error() string {
	segmentParts := make([]string, 0, 3)
	if msg := strings.TrimSpace(e.Message); msg != "" {
		segmentParts = append(segmentParts, msg)
	}
	if code := strings.TrimSpace(e.Code); code != "" {
		segmentParts = append(segmentParts, fmt.Sprintf("code=%s", code))
	}
	if errType := strings.TrimSpace(e.Type); errType != "" {
		segmentParts = append(segmentParts, fmt.Sprintf("type=%s", errType))
	}
	detail := strings.Join(segmentParts, " ")
	if detail == "" {
		detail = "stripe returned an unspecified error"
	}
	return fmt.Sprintf("stripe api error (status %d): %s", e.Status, detail)
}

// WorkspaceSubscriptionService centralises billing logic for workspaces.
type WorkspaceSubscriptionService struct {
	db                  *gorm.DB
	stripeSecretKey     string
	stripePriceID       string
	stripeWebhookSecret string
	appURL              string
	trialDuration       time.Duration
	selfHostedEnabled   bool
	stripeClient        *client.API
	seatCapacityPolicy  SeatCapacityPolicy
}

type stripeWebhookEvent struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Created int64  `json:"created"`
	Data    struct {
		Object json.RawMessage `json:"object"`
	} `json:"data"`
}

type stripeCheckoutSessionPayload struct {
	ClientReferenceID string            `json:"client_reference_id"`
	Customer          string            `json:"customer"`
	Subscription      string            `json:"subscription"`
	Metadata          map[string]string `json:"metadata"`
}

type stripeSubscriptionPayload struct {
	ID                string            `json:"id"`
	Status            string            `json:"status"`
	Customer          string            `json:"customer"`
	CancelAtPeriodEnd bool              `json:"cancel_at_period_end"`
	CurrentPeriodEnd  int64             `json:"current_period_end"`
	TrialEnd          *int64            `json:"trial_end"`
	Metadata          map[string]string `json:"metadata"`
	Items             struct {
		Data []struct {
			ID       string `json:"id"`
			Quantity int    `json:"quantity"`
			Price    struct {
				ID string `json:"id"`
			} `json:"price"`
		} `json:"data"`
	} `json:"items"`
}

type stripeInvoicePayload struct {
	ID            string            `json:"id"`
	Number        string            `json:"number"`
	Customer      string            `json:"customer"`
	Subscription  string            `json:"subscription"`
	PaymentIntent string            `json:"payment_intent"`
	AmountPaid    int64             `json:"amount_paid"`
	Currency      string            `json:"currency"`
	Created       int64             `json:"created"`
	Metadata      map[string]string `json:"metadata"`
}

type stripeSessionResponse struct {
	URL string `json:"url"`
}

// NewWorkspaceSubscriptionService creates a billing service instance.
func NewWorkspaceSubscriptionService(db *gorm.DB, secretKey, priceID, webhookSecret, appURL string, selfHostedEnabled bool) *WorkspaceSubscriptionService {
	trimmedSecret := strings.TrimSpace(secretKey)
	trimmedPrice := strings.TrimSpace(priceID)
	trimmedWebhook := strings.TrimSpace(webhookSecret)
	trimmedAppURL := strings.TrimRight(strings.TrimSpace(appURL), "/")

	var stripeClient *client.API
	if trimmedSecret != "" {
		stripeClient = &client.API{}
		stripeClient.Init(trimmedSecret, nil)
	}

	return &WorkspaceSubscriptionService{
		db:                  db,
		stripeSecretKey:     trimmedSecret,
		stripePriceID:       trimmedPrice,
		stripeWebhookSecret: trimmedWebhook,
		appURL:              trimmedAppURL,
		trialDuration:       30 * 24 * time.Hour,
		selfHostedEnabled:   selfHostedEnabled,
		stripeClient:        stripeClient,
		seatCapacityPolicy:  NewDefaultSeatCapacityPolicy(),
	}
}

// DisableStripeNetworkInteractions prevents outbound Stripe API calls. Primarily for tests.
func (s *WorkspaceSubscriptionService) DisableStripeNetworkInteractions() {
	if s == nil {
		return
	}
	s.stripeClient = nil
}

// upsertStripeSubscriptionInfo ensures the workspace owns a Stripe subscription info record.
func (s *WorkspaceSubscriptionService) upsertStripeSubscriptionInfo(workspaceID, customerID, subscriptionID, subscriptionItem string) (*models.StripeSubscriptionInfo, error) {
	trimmedWorkspace := strings.TrimSpace(workspaceID)
	trimmedCustomer := strings.TrimSpace(customerID)
	trimmedSubscription := strings.TrimSpace(subscriptionID)
	trimmedItem := strings.TrimSpace(subscriptionItem)

	if trimmedWorkspace == "" {
		return nil, fmt.Errorf("workspace id is required for stripe subscription info")
	}
	if trimmedCustomer == "" || trimmedSubscription == "" || trimmedItem == "" {
		return nil, fmt.Errorf("stripe subscription info requires customer, subscription, and item identifiers")
	}

	now := time.Now().UTC()
	info := models.StripeSubscriptionInfo{
		WorkspaceID:            trimmedWorkspace,
		StripeCustomerID:       trimmedCustomer,
		StripeSubscriptionID:   trimmedSubscription,
		StripeSubscriptionItem: trimmedItem,
		CreatedAt:              now,
		UpdatedAt:              now,
	}

	if err := s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "workspace_id"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"stripe_customer_id":       info.StripeCustomerID,
			"stripe_subscription_id":   info.StripeSubscriptionID,
			"stripe_subscription_item": info.StripeSubscriptionItem,
			"updated_at":               now,
		}),
	}).Create(&info).Error; err != nil {
		return nil, err
	}

	return &info, nil
}

// deleteStripeSubscriptionInfo removes any Stripe subscription info tied to the workspace.
func (s *WorkspaceSubscriptionService) deleteStripeSubscriptionInfo(workspaceID string) error {
	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return fmt.Errorf("workspace id is required to delete stripe subscription info")
	}
	return s.db.Where("workspace_id = ?", trimmed).Delete(&models.StripeSubscriptionInfo{}).Error
}

// findSubscriptionByStripeID locates the WorkspaceSubscription associated with a Stripe subscription.
func (s *WorkspaceSubscriptionService) findSubscriptionByStripeID(stripeSubscriptionID string) (*models.WorkspaceSubscription, error) {
	trimmed := strings.TrimSpace(stripeSubscriptionID)
	if trimmed == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var record models.WorkspaceSubscription
	if err := s.db.
		Preload("StripeSubscriptionInfo").
		Joins("JOIN stripe_subscription_infos ON stripe_subscription_infos.workspace_id = workspace_subscriptions.workspace_id").
		Where("stripe_subscription_infos.stripe_subscription_id = ?", trimmed).
		First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

// SelfHostedEnabled reports whether the instance should bypass billing limits entirely.
func (s *WorkspaceSubscriptionService) SelfHostedEnabled() bool {
	if s == nil {
		return false
	}
	return s.selfHostedEnabled
}

// HasStripeCredentials reports whether the service can talk to Stripe.
func (s *WorkspaceSubscriptionService) HasStripeCredentials() bool {
	return s.stripeSecretKey != "" && s.stripePriceID != ""
}

// VerifyStripeSignature ensures a webhook payload originates from Stripe.
func (s *WorkspaceSubscriptionService) VerifyStripeSignature(payload []byte, header string, tolerance time.Duration) error {
	if s.stripeWebhookSecret == "" {
		return models.ErrStripeNotConfigured
	}

	timestamp, signatures, err := parseStripeSignature(header)
	if err != nil {
		return err
	}

	if tolerance > 0 {
		eventTime := time.Unix(timestamp, 0)
		if time.Since(eventTime) > tolerance {
			return fmt.Errorf("stripe webhook outside tolerance window")
		}
	}

	unsigned := fmt.Sprintf("%d.%s", timestamp, payload)
	expected := computeStripeSignature(unsigned, s.stripeWebhookSecret)
	for _, sig := range signatures {
		if hmac.Equal(expected, sig) {
			return nil
		}
	}

	return fmt.Errorf("invalid stripe signature")
}

func (s *WorkspaceSubscriptionService) getWorkspace(workspaceID string) (*models.Workspace, error) {
	var workspace models.Workspace
	if err := s.db.Where("id = ?", workspaceID).First(&workspace).Error; err != nil {
		return nil, err
	}
	return &workspace, nil
}

func (s *WorkspaceSubscriptionService) getSubscription(workspaceID string) (*models.WorkspaceSubscription, error) {
	var record models.WorkspaceSubscription
	if err := s.db.Preload("StripeSubscriptionInfo").Where("workspace_id = ?", workspaceID).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &record, nil
}

// CountBillableMembers returns the number of members for the workspace.
func (s *WorkspaceSubscriptionService) CountBillableMembers(workspaceID string) (int, error) {
	return s.countBillableMembers(workspaceID)
}

// Snapshot returns subscription details merged with seat usage.
func (s *WorkspaceSubscriptionService) Snapshot(workspaceID string) (*models.WorkspaceSubscriptionSnapshot, error) {
	now := time.Now().UTC()
	workspace, err := s.getWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return nil, err
	}

	seatsUsed, err := s.countBillableMembers(workspaceID)
	if err != nil {
		return nil, err
	}

	var evaluation models.WorkspaceSubscription
	var hasSubscription bool
	if record != nil {
		evaluation = *record
		hasSubscription = true
	}

	if !hasSubscription {
		if workspace.ReadonlySince == nil {
			s.persistWorkspaceReadonly(workspaceID, &now)
		}
		return nil, nil
	}

	isTrialActive := evaluation.TrialEndsAt != nil && now.Before(*evaluation.TrialEndsAt)
	seatsAvailable := computeSeatsAvailable(evaluation.SeatsPurchased, seatsUsed)
	billingProvider := evaluation.BillingProvider
	if billingProvider == "" {
		billingProvider = models.WorkspaceSubscriptionBillingProviderStripe
	}
	stripeInfo := evaluation.StripeSubscriptionInfo
	stripeCustomerPresent := stripeInfo != nil && strings.TrimSpace(stripeInfo.StripeCustomerID) != ""
	var hasValidCredentials bool
	switch billingProvider {
	case models.WorkspaceSubscriptionBillingProviderStripe:
		hasValidCredentials = stripeCustomerPresent
	case models.WorkspaceSubscriptionBillingProviderTests:
		hasValidCredentials = true
	case models.WorkspaceSubscriptionBillingProviderSelfHosted:
		hasValidCredentials = true
	default:
		hasValidCredentials = true
	}
	isReadOnly := evaluation.DetermineReadOnly(now, seatsUsed, hasValidCredentials)
	status := evaluation.Status

	if isReadOnly && workspace.ReadonlySince == nil {
		s.persistWorkspaceReadonly(workspaceID, &now)
		workspace.ReadonlySince = &now
	} else if !isReadOnly && workspace.ReadonlySince != nil {
		s.persistWorkspaceReadonly(workspaceID, nil)
		workspace.ReadonlySince = nil
	}

	snapshot := models.WorkspaceSubscriptionSnapshot{
		WorkspaceID:       workspaceID,
		Status:            status,
		BillingProvider:   billingProvider,
		Campaign:          workspace.AcquisitionCampaign,
		SeatsPurchased:    evaluation.SeatsPurchased,
		SeatsUsed:         seatsUsed,
		SeatsAvailable:    seatsAvailable,
		TrialEndsAt:       evaluation.TrialEndsAt,
		CurrentPeriodEnd:  evaluation.CurrentPeriodEnd,
		CancelAtPeriodEnd: evaluation.CancelAtPeriodEnd,
		IsTrialActive:     isTrialActive,
		IsReadOnly:        isReadOnly,
		HasStripeCustomer: stripeCustomerPresent,
		HasSubscription:   hasSubscription,
	}

	return &snapshot, nil
}

// HasActiveSubscription reports whether the workspace already owns a persisted subscription record.
func (s *WorkspaceSubscriptionService) HasActiveSubscription(workspaceID string) (bool, error) {
	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return false, fmt.Errorf("workspace id is required")
	}
	record, err := s.getSubscription(trimmed)
	if err != nil {
		return false, err
	}
	return record != nil, nil
}

type memberInviteSeatOccupancy struct {
	BillableMembers     int
	PendingEmailInvites int
	PendingUserInvites  int
	PendingLinkInvites  int
	PendingTokenInvites int
	ReservedInviteSeats int
}

func (s *WorkspaceSubscriptionService) buildMemberInviteSeatOccupancy(workspaceID string) (memberInviteSeatOccupancy, error) {
	occupancy := memberInviteSeatOccupancy{}

	members, err := s.countBillableMembers(workspaceID)
	if err != nil {
		return occupancy, err
	}
	occupancy.BillableMembers = members

	now := time.Now().UTC()

	var pendingEmailInvites int64
	if err := s.db.
		Model(&models.WorkspaceEmailInvite{}).
		Where("workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?", workspaceID, now).
		Count(&pendingEmailInvites).Error; err != nil {
		return occupancy, err
	}
	occupancy.PendingEmailInvites = int(pendingEmailInvites)

	var pendingUserInvites int64
	if err := s.db.
		Model(&models.WorkspaceUserInvite{}).
		Where("workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", workspaceID).
		Count(&pendingUserInvites).Error; err != nil {
		return occupancy, err
	}
	occupancy.PendingUserInvites = int(pendingUserInvites)

	var pendingLinkInvites int64
	if err := s.db.
		Model(&models.WorkspaceLinkInvite{}).
		Where("workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?", workspaceID, now).
		Count(&pendingLinkInvites).Error; err != nil {
		return occupancy, err
	}
	occupancy.PendingLinkInvites = int(pendingLinkInvites)

	var pendingTokenInvites int64
	if err := s.db.
		Model(&models.WorkspaceInvite{}).
		Where("workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", workspaceID, now).
		Count(&pendingTokenInvites).Error; err != nil {
		return occupancy, err
	}
	occupancy.PendingTokenInvites = int(pendingTokenInvites)

	occupancy.ReservedInviteSeats = occupancy.PendingEmailInvites + occupancy.PendingUserInvites + occupancy.PendingLinkInvites + occupancy.PendingTokenInvites
	return occupancy, nil
}

func (s *WorkspaceSubscriptionService) evaluateSeatCapacity(workspaceID string, seatsToAdd int, occupiedSeats int) error {
	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return fmt.Errorf("workspace id is required")
	}
	if seatsToAdd <= 0 {
		return nil
	}

	record, err := s.getSubscription(trimmed)
	if err != nil {
		return err
	}

	input := SeatCapacityPolicyInput{
		WorkspaceID:              trimmed,
		SeatsToAdd:               seatsToAdd,
		OccupiedSeats:            occupiedSeats,
		SeatsPurchased:           0,
		HasPersistedSubscription: record != nil,
		SubscriptionStatus:       models.WorkspaceSubscriptionStatusUnknown,
		SelfHostedEnabled:        s.SelfHostedEnabled(),
	}
	if record != nil {
		input.SeatsPurchased = record.SeatsPurchased
		input.SubscriptionStatus = record.Status
	}

	if s.seatCapacityPolicy == nil {
		return nil
	}
	return s.seatCapacityPolicy.EvaluateSeatCapacity(input)
}

// EnsureSeatCapacityForInviteReservation validates capacity for seat-reserving invite creation.
func (s *WorkspaceSubscriptionService) EnsureSeatCapacityForInviteReservation(workspaceID string, seatsToAdd int) error {
	occupancy, err := s.buildMemberInviteSeatOccupancy(strings.TrimSpace(workspaceID))
	if err != nil {
		return err
	}
	occupiedSeats := occupancy.BillableMembers + occupancy.ReservedInviteSeats
	return s.evaluateSeatCapacity(workspaceID, seatsToAdd, occupiedSeats)
}

// EnsureWorkspaceWritable prevents writes when the subscription is in a non-writable state.
func (s *WorkspaceSubscriptionService) EnsureWorkspaceWritable(workspaceID string) error {
	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return fmt.Errorf("workspace id is required")
	}
	if s.SelfHostedEnabled() {
		return nil
	}

	record, err := s.getSubscription(trimmed)
	if err != nil {
		return err
	}
	if record == nil {
		return nil
	}

	switch record.Status {
	case models.WorkspaceSubscriptionStatusActive, models.WorkspaceSubscriptionStatusTrialing:
		return nil
	default:
		return models.ErrWorkspaceReadOnly
	}
}

// EnsureSeatCapacity validates seat capacity for direct membership growth.
// Direct member additions use current member occupancy and do not reserve extra invite seats.
func (s *WorkspaceSubscriptionService) EnsureSeatCapacity(workspaceID string, seatsToAdd int) error {
	occupancy, err := s.buildMemberInviteSeatOccupancy(strings.TrimSpace(workspaceID))
	if err != nil {
		return err
	}
	return s.evaluateSeatCapacity(workspaceID, seatsToAdd, occupancy.BillableMembers)
}

// EnsureSelfHostedSubscription guarantees self-managed instances receive a generous, long-lived plan.
func (s *WorkspaceSubscriptionService) EnsureSelfHostedSubscription(workspaceID string) (*models.WorkspaceSubscriptionSnapshot, error) {
	if !s.SelfHostedEnabled() {
		return nil, nil
	}

	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return nil, fmt.Errorf("workspace id is required")
	}

	record, err := s.getSubscription(trimmed)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	periodEnd := now.Add(selfHostedSubscriptionDuration)

	if record == nil {
		subscription := models.WorkspaceSubscription{
			WorkspaceID:       trimmed,
			Status:            models.WorkspaceSubscriptionStatusActive,
			SeatsPurchased:    selfHostedSeatCount,
			TrialEndsAt:       nil,
			CurrentPeriodEnd:  &periodEnd,
			CancelAtPeriodEnd: false,
			BillingProvider:   models.WorkspaceSubscriptionBillingProviderSelfHosted,
		}
		if err := s.db.Create(&subscription).Error; err != nil {
			return nil, err
		}
	} else {
		record.Status = models.WorkspaceSubscriptionStatusActive
		record.SeatsPurchased = selfHostedSeatCount
		record.TrialEndsAt = nil
		record.CurrentPeriodEnd = &periodEnd
		record.CancelAtPeriodEnd = false
		record.BillingProvider = models.WorkspaceSubscriptionBillingProviderSelfHosted
		if err := s.db.Save(record).Error; err != nil {
			return nil, err
		}
		if err := s.deleteStripeSubscriptionInfo(trimmed); err != nil {
			return nil, err
		}
		record.StripeSubscriptionInfo = nil
	}

	return s.refreshSubscriptionSnapshot(trimmed)
}

// EnsureTestSubscription force-enables billing for a workspace in dev/test.
func (s *WorkspaceSubscriptionService) EnsureTestSubscription(workspaceID string, seats int) (*models.WorkspaceSubscriptionSnapshot, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return nil, fmt.Errorf("workspace id is required")
	}

	if seats <= 0 {
		seats = 100
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return s.ensureTestSubscriptionDirect(workspaceID, seats)
	}

	stripeInfo := record.StripeSubscriptionInfo
	if stripeInfo == nil || strings.TrimSpace(stripeInfo.StripeCustomerID) == "" {
		return s.ensureTestSubscriptionDirect(workspaceID, seats)
	}
	customerID := strings.TrimSpace(stripeInfo.StripeCustomerID)
	if customerID == "" {
		return nil, ErrWorkspaceSubscriptionCustomerMissing
	}

	updates := map[string]interface{}{
		"status":               models.WorkspaceSubscriptionStatusActive,
		"seats_purchased":      seats,
		"cancel_at_period_end": false,
		"billing_provider":     models.WorkspaceSubscriptionBillingProviderTests,
	}

	if err := s.db.Model(record).Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.refreshSubscriptionSnapshot(workspaceID)
}

func (s *WorkspaceSubscriptionService) ensureTestSubscriptionDirect(workspaceID string, requestedSeats int) (*models.WorkspaceSubscriptionSnapshot, error) {
	trimmed := strings.TrimSpace(workspaceID)
	if trimmed == "" {
		return nil, fmt.Errorf("workspace id is required")
	}

	seatCount := requestedSeats
	if seatCount <= 0 {
		seatCount = 100
	}

	now := time.Now().UTC()
	periodEnd := now.Add(testSubscriptionDuration)
	trialEnds := periodEnd

	record := models.WorkspaceSubscription{
		WorkspaceID:       trimmed,
		Status:            models.WorkspaceSubscriptionStatusActive,
		SeatsPurchased:    seatCount,
		TrialEndsAt:       &trialEnds,
		CurrentPeriodEnd:  &periodEnd,
		CancelAtPeriodEnd: false,
		BillingProvider:   models.WorkspaceSubscriptionBillingProviderTests,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	assignments := map[string]interface{}{
		"status":               models.WorkspaceSubscriptionStatusActive,
		"seats_purchased":      seatCount,
		"trial_ends_at":        trialEnds,
		"current_period_end":   periodEnd,
		"cancel_at_period_end": false,
		"billing_provider":     models.WorkspaceSubscriptionBillingProviderTests,
		"updated_at":           now,
	}

	if err := s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "workspace_id"}},
		DoUpdates: clause.Assignments(assignments),
	}).Create(&record).Error; err != nil {
		return nil, err
	}

	if err := s.deleteStripeSubscriptionInfo(trimmed); err != nil {
		return nil, err
	}

	return s.refreshSubscriptionSnapshot(trimmed)
}

// CreateCheckoutSession creates or updates a Stripe checkout session.
func (s *WorkspaceSubscriptionService) CreateCheckoutSession(
	ctx context.Context,
	workspaceID string,
	seatQuantity int,
	successPath, cancelPath string,
	customerEmail string,
) (stripeSessionResponse, error) {
	if !s.HasStripeCredentials() || s.stripeClient == nil {
		return stripeSessionResponse{}, models.ErrStripeNotConfigured
	}
	if seatQuantity <= 0 {
		return stripeSessionResponse{}, fmt.Errorf("seat quantity must be positive")
	}

	workspace, err := s.getWorkspace(workspaceID)
	if err != nil {
		return stripeSessionResponse{}, err
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return stripeSessionResponse{}, err
	}

	if record != nil && record.StripeSubscriptionInfo != nil && record.StripeSubscriptionInfo.StripeSubscriptionID != "" && record.Status == models.WorkspaceSubscriptionStatusActive {
		return s.CreateBillingPortalSession(ctx, workspaceID, successPath)
	}

	metadata := s.buildStripeMetadata(workspaceID, workspace.AcquisitionCampaign)
	trimmedEmail := strings.TrimSpace(customerEmail)
	subscriptionMetadata := s.metadataWithSeatQuantity(metadata, seatQuantity)

	params := &stripe.CheckoutSessionParams{
		Params:              stripe.Params{Context: ctx},
		Mode:                stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		ClientReferenceID:   stripe.String(workspaceID),
		SuccessURL:          stripe.String(s.joinURL(successPath)),
		CancelURL:           stripe.String(s.joinURL(cancelPath)),
		Metadata:            metadata,
		AllowPromotionCodes: stripe.Bool(false),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(s.stripePriceID),
				Quantity: stripe.Int64(int64(seatQuantity)),
			},
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: subscriptionMetadata,
		},
	}

	definition := workspace.AcquisitionCampaign.Definition()
	if definition.TrialPeriodDays > 0 {
		params.SubscriptionData.TrialPeriodDays = stripe.Int64(int64(definition.TrialPeriodDays))
	}

	if trimmedEmail != "" {
		params.CustomerEmail = stripe.String(trimmedEmail)
	}

	customerID := ""
	if record != nil && record.StripeSubscriptionInfo != nil && strings.TrimSpace(record.StripeSubscriptionInfo.StripeCustomerID) != "" {
		customerID = record.StripeSubscriptionInfo.StripeCustomerID
	}

	creditRecord, err := s.findSubscriptionCredit(workspaceID, workspace.AcquisitionCampaign)
	if err != nil {
		return stripeSessionResponse{}, err
	}
	if customerID == "" && creditRecord != nil {
		customerID = creditRecord.StripeCustomerID
	}

	if customerID == "" {
		customerParams := &stripe.CustomerParams{
			Params:   stripe.Params{Context: ctx},
			Metadata: metadata,
		}
		if trimmedEmail != "" {
			customerParams.Email = stripe.String(trimmedEmail)
		}
		customer, custErr := s.stripeClient.Customers.New(customerParams)
		if custErr != nil {
			return stripeSessionResponse{}, convertStripeError(custErr)
		}
		customerID = customer.ID
	}

	if customerID != "" {
		if trimmedEmail != "" {
			updateParams := &stripe.CustomerParams{
				Params: stripe.Params{Context: ctx},
				Email:  stripe.String(trimmedEmail),
			}
			if _, err := s.stripeClient.Customers.Update(customerID, updateParams); err != nil {
				return stripeSessionResponse{}, convertStripeError(err)
			}
		}
		params.Customer = stripe.String(customerID)
		params.CustomerEmail = nil
	}

	forcePromoCredit := definition.PromotionalCreditCents > 0

	if !definition.RequiresPaymentMethod || forcePromoCredit {
		params.PaymentMethodCollection = stripe.String(string(stripe.CheckoutSessionPaymentMethodCollectionIfRequired))
	}

	if forcePromoCredit && customerID != "" {
		if err := s.applyPromotionalCreditIfNeeded(ctx, workspaceID, customerID, workspace.AcquisitionCampaign); err != nil {
			return stripeSessionResponse{}, err
		}
	}

	session, err := s.stripeClient.CheckoutSessions.New(params)
	if err != nil {
		return stripeSessionResponse{}, convertStripeError(err)
	}

	return stripeSessionResponse{URL: session.URL}, nil
}

// CreateBillingPortalSession returns a Stripe Billing Portal session URL.
func (s *WorkspaceSubscriptionService) CreateBillingPortalSession(
	ctx context.Context,
	workspaceID string,
	returnPath string,
) (stripeSessionResponse, error) {
	if !s.HasStripeCredentials() || s.stripeClient == nil {
		return stripeSessionResponse{}, models.ErrStripeNotConfigured
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return stripeSessionResponse{}, err
	}

	var stripeInfo *models.StripeSubscriptionInfo
	if record != nil {
		stripeInfo = record.StripeSubscriptionInfo
	}
	if stripeInfo == nil || strings.TrimSpace(stripeInfo.StripeCustomerID) == "" {
		return stripeSessionResponse{}, ErrStripeCustomerMissing
	}

	params := s.buildBillingPortalParams(ctx, stripeInfo, returnPath, true)

	session, err := s.stripeClient.BillingPortalSessions.New(params)
	if err != nil {
		return stripeSessionResponse{}, convertStripeError(err)
	}

	return stripeSessionResponse{URL: session.URL}, nil
}

// CreateFullBillingPortalSession returns the standard Stripe Billing Portal session URL.
func (s *WorkspaceSubscriptionService) CreateFullBillingPortalSession(
	ctx context.Context,
	workspaceID string,
	returnPath string,
) (stripeSessionResponse, error) {
	if !s.HasStripeCredentials() || s.stripeClient == nil {
		return stripeSessionResponse{}, models.ErrStripeNotConfigured
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return stripeSessionResponse{}, err
	}

	var stripeInfo *models.StripeSubscriptionInfo
	if record != nil {
		stripeInfo = record.StripeSubscriptionInfo
	}
	if stripeInfo == nil || strings.TrimSpace(stripeInfo.StripeCustomerID) == "" {
		return stripeSessionResponse{}, ErrStripeCustomerMissing
	}

	params := s.buildBillingPortalParams(ctx, stripeInfo, returnPath, false)

	session, err := s.stripeClient.BillingPortalSessions.New(params)
	if err != nil {
		return stripeSessionResponse{}, convertStripeError(err)
	}

	return stripeSessionResponse{URL: session.URL}, nil
}

func (s *WorkspaceSubscriptionService) buildBillingPortalParams(
	ctx context.Context,
	stripeInfo *models.StripeSubscriptionInfo,
	returnPath string,
	limitToSeatUpdate bool,
) *stripe.BillingPortalSessionParams {
	params := &stripe.BillingPortalSessionParams{
		Params:    stripe.Params{Context: ctx},
		Customer:  stripe.String(stripeInfo.StripeCustomerID),
		ReturnURL: stripe.String(s.joinURL(returnPath)),
	}
	if limitToSeatUpdate && stripeInfo.StripeSubscriptionID != "" {
		params.FlowData = &stripe.BillingPortalSessionFlowDataParams{
			Type: stripe.String(string(stripe.BillingPortalSessionFlowTypeSubscriptionUpdate)),
			SubscriptionUpdate: &stripe.BillingPortalSessionFlowDataSubscriptionUpdateParams{
				Subscription: stripe.String(stripeInfo.StripeSubscriptionID),
			},
		}
	}
	return params
}

// ProcessWebhookPayload handles a raw webhook payload after verification.
func (s *WorkspaceSubscriptionService) ProcessWebhookPayload(payload []byte) error {
	var event stripeWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return err
	}
	return s.ProcessStripeEvent(event)
}

// ProcessStripeEvent updates local state in response to a Stripe event.
func (s *WorkspaceSubscriptionService) ProcessStripeEvent(event stripeWebhookEvent) error {
	if event.ID == "" {
		return fmt.Errorf("stripe event missing id")
	}

	utils.Infof("Stripe webhook event received: event_id=%s event_type=%s", event.ID, event.Type)

	processed, err := s.isEventProcessed(event.ID)
	if err != nil {
		utils.Errorf("Failed to check if Stripe event was processed: event_id=%s error=%v", event.ID, err)
		return err
	}
	if processed {
		utils.Infof("Stripe webhook event already processed (duplicate): event_id=%s event_type=%s", event.ID, event.Type)
		return nil
	}

	var handled bool
	switch event.Type {
	case "checkout.session.completed":
		handled = true
		if err := s.handleCheckoutCompleted(event.Data.Object); err != nil {
			utils.Errorf("Failed to handle Stripe checkout.session.completed: event_id=%s error=%v", event.ID, err)
			return err
		}
	case "customer.subscription.created", "customer.subscription.updated":
		handled = true
		if err := s.handleSubscriptionUpsert(event.Data.Object); err != nil {
			utils.Errorf("Failed to handle Stripe %s: event_id=%s error=%v", event.Type, event.ID, err)
			return err
		}
	case "customer.subscription.deleted":
		handled = true
		if err := s.handleSubscriptionDeletion(event.Data.Object); err != nil {
			utils.Errorf("Failed to handle Stripe customer.subscription.deleted: event_id=%s error=%v", event.ID, err)
			return err
		}
	case "invoice.payment_succeeded":
		handled = true
		if err := s.handleInvoicePaymentSucceeded(event.Data.Object); err != nil {
			utils.Errorf("Failed to handle Stripe invoice.payment_succeeded: event_id=%s error=%v", event.ID, err)
			return err
		}
	default:
		handled = false
		utils.Infof("Stripe webhook event ignored (unhandled type): event_id=%s event_type=%s", event.ID, event.Type)
	}

	if handled {
		utils.Infof("Stripe webhook event handled successfully: event_id=%s event_type=%s", event.ID, event.Type)
	}

	return s.markEventProcessed(event.ID)
}

func (s *WorkspaceSubscriptionService) handleCheckoutCompleted(raw json.RawMessage) error {
	var payload stripeCheckoutSessionPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}

	workspaceID := payload.Metadata["workspace_id"]
	if workspaceID == "" {
		workspaceID = payload.ClientReferenceID
	}
	if workspaceID == "" {
		return fmt.Errorf("checkout session missing workspace metadata")
	}

	workspace, err := s.getWorkspace(workspaceID)
	if err != nil {
		return err
	}

	record, err := s.getSubscription(workspaceID)
	if err != nil {
		return err
	}

	customerID := strings.TrimSpace(payload.Customer)
	subscriptionID := strings.TrimSpace(payload.Subscription)

	ctx := context.Background()
	if customerID != "" {
		if err := s.ensureStripeCustomerMetadata(ctx, customerID, workspaceID, workspace.AcquisitionCampaign); err != nil {
			return err
		}
		if err := s.applyPromotionalCreditIfNeeded(ctx, workspaceID, customerID, workspace.AcquisitionCampaign); err != nil {
			return err
		}
	}
	if subscriptionID != "" {
		if err := s.ensureStripeSubscriptionMetadata(ctx, subscriptionID, workspaceID, workspace.AcquisitionCampaign); err != nil {
			return err
		}
	}

	if record == nil {
		return nil
	}

	var infoUpdateErr error
	if record.StripeSubscriptionInfo != nil {
		targetCustomer := record.StripeSubscriptionInfo.StripeCustomerID
		targetSubscription := record.StripeSubscriptionInfo.StripeSubscriptionID
		targetItem := record.StripeSubscriptionInfo.StripeSubscriptionItem
		if customerID != "" {
			targetCustomer = customerID
		}
		if subscriptionID != "" {
			targetSubscription = subscriptionID
		}
		if strings.TrimSpace(targetCustomer) != "" && strings.TrimSpace(targetSubscription) != "" && strings.TrimSpace(targetItem) != "" {
			if info, err := s.upsertStripeSubscriptionInfo(workspaceID, targetCustomer, targetSubscription, targetItem); err != nil {
				infoUpdateErr = err
			} else {
				record.StripeSubscriptionInfo = info
			}
		}
	}
	if infoUpdateErr != nil {
		return infoUpdateErr
	}

	updates := map[string]interface{}{}
	updates["billing_provider"] = models.WorkspaceSubscriptionBillingProviderStripe

	if len(updates) == 0 {
		return nil
	}

	return s.db.Model(record).Updates(updates).Error
}

func (s *WorkspaceSubscriptionService) handleSubscriptionUpsert(raw json.RawMessage) error {
	var payload stripeSubscriptionPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}

	workspaceID := strings.TrimSpace(payload.Metadata["workspace_id"])
	var record *models.WorkspaceSubscription
	var err error
	if workspaceID != "" {
		record, err = s.getSubscription(workspaceID)
		if err != nil {
			return err
		}
	} else {
		record, err = s.findSubscriptionByStripeID(payload.ID)
		if err != nil {
			return err
		}
		workspaceID = record.WorkspaceID
	}

	workspace, err := s.getWorkspace(workspaceID)
	if err != nil {
		return err
	}

	seatQuantity := 0
	subscriptionItem := ""
	if record != nil {
		seatQuantity = record.SeatsPurchased
		if record.StripeSubscriptionInfo != nil {
			subscriptionItem = record.StripeSubscriptionInfo.StripeSubscriptionItem
		}
	}

	matchedPrice := false
	observedPrices := make([]string, 0, len(payload.Items.Data))
	for _, item := range payload.Items.Data {
		observedPrices = append(observedPrices, item.Price.ID)
		if s.stripePriceID != "" && item.Price.ID == s.stripePriceID {
			seatQuantity = item.Quantity
			subscriptionItem = item.ID
			matchedPrice = true
			break
		}
	}
	if !matchedPrice {
		if len(payload.Items.Data) > 0 {
			seatQuantity = payload.Items.Data[0].Quantity
			if subscriptionItem == "" {
				subscriptionItem = payload.Items.Data[0].ID
			}
		}
		utils.Warnf(
			"stripe subscription upsert: price mismatch workspace=%s subscription=%s configured_price=%s observed_prices=%v applied_quantity=%d",
			workspaceID,
			payload.ID,
			s.stripePriceID,
			observedPrices,
			seatQuantity,
		)
	}

	customerID := strings.TrimSpace(payload.Customer)
	status := mapStripeStatus(payload.Status)
	ctx := context.Background()

	if err := s.ensureStripeCustomerMetadata(ctx, customerID, workspaceID, workspace.AcquisitionCampaign); err != nil {
		return err
	}
	if err := s.ensureStripeSubscriptionMetadata(ctx, payload.ID, workspaceID, workspace.AcquisitionCampaign); err != nil {
		return err
	}

	if record == nil {
		if customerID == "" {
			return fmt.Errorf("subscription upsert missing stripe customer id")
		}
		if strings.TrimSpace(subscriptionItem) == "" {
			return fmt.Errorf("subscription upsert missing stripe subscription item id")
		}
		newRecord := models.WorkspaceSubscription{
			WorkspaceID:       workspaceID,
			Status:            status,
			SeatsPurchased:    seatQuantity,
			CancelAtPeriodEnd: payload.CancelAtPeriodEnd,
			BillingProvider:   models.WorkspaceSubscriptionBillingProviderStripe,
		}
		if payload.CurrentPeriodEnd > 0 {
			periodEnd := time.Unix(payload.CurrentPeriodEnd, 0).UTC()
			newRecord.CurrentPeriodEnd = &periodEnd
		}
		if payload.TrialEnd != nil && *payload.TrialEnd > 0 {
			trialEnd := time.Unix(*payload.TrialEnd, 0).UTC()
			newRecord.TrialEndsAt = &trialEnd
		}
		if err := s.db.Create(&newRecord).Error; err != nil {
			return err
		}
		info, err := s.upsertStripeSubscriptionInfo(workspaceID, customerID, payload.ID, subscriptionItem)
		if err != nil {
			return err
		}
		newRecord.StripeSubscriptionInfo = info
		_, snapErr := s.refreshSubscriptionSnapshot(workspaceID)
		return snapErr
	}

	updates := map[string]interface{}{
		"status":               status,
		"cancel_at_period_end": payload.CancelAtPeriodEnd,
		"seats_purchased":      seatQuantity,
	}
	if payload.CurrentPeriodEnd > 0 {
		periodEnd := time.Unix(payload.CurrentPeriodEnd, 0).UTC()
		updates["current_period_end"] = &periodEnd
	}
	if payload.TrialEnd != nil && *payload.TrialEnd > 0 {
		trialEnd := time.Unix(*payload.TrialEnd, 0).UTC()
		updates["trial_ends_at"] = &trialEnd
	}

	updates["billing_provider"] = models.WorkspaceSubscriptionBillingProviderStripe

	targetCustomer := customerID
	if strings.TrimSpace(targetCustomer) == "" && record.StripeSubscriptionInfo != nil {
		targetCustomer = record.StripeSubscriptionInfo.StripeCustomerID
	}
	if strings.TrimSpace(targetCustomer) == "" {
		return fmt.Errorf("subscription upsert missing stripe customer id")
	}
	if strings.TrimSpace(subscriptionItem) == "" {
		return fmt.Errorf("subscription upsert missing stripe subscription item id")
	}
	info, err := s.upsertStripeSubscriptionInfo(workspaceID, targetCustomer, payload.ID, subscriptionItem)
	if err != nil {
		return err
	}
	record.StripeSubscriptionInfo = info

	if err := s.db.Model(record).Updates(updates).Error; err != nil {
		return err
	}

	_, err = s.refreshSubscriptionSnapshot(workspaceID)
	return err
}

func (s *WorkspaceSubscriptionService) handleSubscriptionDeletion(raw json.RawMessage) error {
	var payload stripeSubscriptionPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}

	record, err := s.findSubscriptionByStripeID(payload.ID)
	if err != nil {
		return err
	}

	updates := map[string]interface{}{
		"status":               models.WorkspaceSubscriptionStatusCanceled,
		"seats_purchased":      0,
		"cancel_at_period_end": false,
		"billing_provider":     models.WorkspaceSubscriptionBillingProviderStripe,
	}

	if err := s.db.Model(record).Updates(updates).Error; err != nil {
		return err
	}

	if err := s.deleteStripeSubscriptionInfo(record.WorkspaceID); err != nil {
		return err
	}
	record.StripeSubscriptionInfo = nil

	_, err = s.refreshSubscriptionSnapshot(record.WorkspaceID)
	return err
}

func (s *WorkspaceSubscriptionService) handleInvoicePaymentSucceeded(raw json.RawMessage) error {
	var payload stripeInvoicePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return err
	}

	invoiceID := strings.TrimSpace(payload.ID)
	if invoiceID == "" {
		return fmt.Errorf("invoice payment missing invoice id")
	}

	workspaceID := strings.TrimSpace(payload.Metadata["workspace_id"])
	var record *models.WorkspaceSubscription
	var err error
	if workspaceID != "" {
		record, err = s.getSubscription(workspaceID)
		if err != nil {
			return err
		}
		if record == nil {
			return fmt.Errorf("workspace subscription not found for invoice %s", invoiceID)
		}
	} else {
		subscriptionID := strings.TrimSpace(payload.Subscription)
		if subscriptionID == "" {
			return fmt.Errorf("invoice payment missing subscription reference")
		}
		record, err = s.findSubscriptionByStripeID(subscriptionID)
		if err != nil {
			return err
		}
		workspaceID = record.WorkspaceID
	}

	workspace, err := s.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	if err := s.ensureStripeInvoiceMetadata(context.Background(), invoiceID, workspaceID, workspace.AcquisitionCampaign); err != nil {
		return err
	}

	stripeInfo := record.StripeSubscriptionInfo
	if stripeInfo == nil {
		return fmt.Errorf("workspace %s missing stripe subscription info for invoice %s", workspaceID, invoiceID)
	}

	customerID := strings.TrimSpace(payload.Customer)
	if customerID == "" {
		customerID = stripeInfo.StripeCustomerID
	}
	if strings.TrimSpace(customerID) == "" {
		return fmt.Errorf("invoice payment missing stripe customer id")
	}

	subscriptionID := strings.TrimSpace(payload.Subscription)
	if subscriptionID == "" {
		subscriptionID = stripeInfo.StripeSubscriptionID
	}
	if strings.TrimSpace(subscriptionID) == "" {
		return fmt.Errorf("invoice payment missing stripe subscription id")
	}

	currency := strings.TrimSpace(payload.Currency)
	if currency == "" {
		return fmt.Errorf("invoice payment missing currency")
	}

	paidAt := time.Now().UTC()
	if payload.Created > 0 {
		paidAt = time.Unix(payload.Created, 0).UTC()
	}

	now := time.Now().UTC()
	payment := models.StripePayment{
		StripeInvoiceID:       invoiceID,
		WorkspaceID:           workspaceID,
		StripeCustomerID:      customerID,
		StripeSubscriptionID:  subscriptionID,
		StripePaymentIntentID: strings.TrimSpace(payload.PaymentIntent),
		AmountPaid:            payload.AmountPaid,
		Currency:              currency,
		PaidAt:                paidAt,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	assignments := map[string]interface{}{
		"workspace_id":             payment.WorkspaceID,
		"stripe_customer_id":       payment.StripeCustomerID,
		"stripe_subscription_id":   payment.StripeSubscriptionID,
		"stripe_payment_intent_id": payment.StripePaymentIntentID,
		"amount_paid":              payment.AmountPaid,
		"currency":                 payment.Currency,
		"paid_at":                  payment.PaidAt,
		"updated_at":               now,
	}

	if err := s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "stripe_invoice_id"}},
		DoUpdates: clause.Assignments(assignments),
	}).Create(&payment).Error; err != nil {
		return err
	}

	return nil
}

func (s *WorkspaceSubscriptionService) markEventProcessed(eventID string) error {
	return s.db.Create(&models.StripeEventLog{ID: eventID}).Error
}

func (s *WorkspaceSubscriptionService) isEventProcessed(eventID string) (bool, error) {
	var count int64
	if err := s.db.Model(&models.StripeEventLog{}).Where("id = ?", eventID).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *WorkspaceSubscriptionService) buildStripeMetadata(workspaceID string, campaign models.AcquisitionCampaign) map[string]string {
	metadata := map[string]string{}
	if trimmed := strings.TrimSpace(workspaceID); trimmed != "" {
		metadata["workspace_id"] = trimmed
	}
	if campaign != models.CampaignNone {
		if value := strings.TrimSpace(campaign.String()); value != "" {
			metadata["campaign"] = value
		}
	}
	return metadata
}

func cloneMetadata(source map[string]string) map[string]string {
	if len(source) == 0 {
		return map[string]string{}
	}
	clone := make(map[string]string, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func (s *WorkspaceSubscriptionService) metadataWithSeatQuantity(metadata map[string]string, seatQuantity int) map[string]string {
	clone := cloneMetadata(metadata)
	clone["seat_quantity"] = strconv.Itoa(seatQuantity)
	return clone
}

func (s *WorkspaceSubscriptionService) ensureStripeCustomerMetadata(ctx context.Context, customerID, workspaceID string, campaign models.AcquisitionCampaign) error {
	if s.stripeClient == nil || strings.TrimSpace(customerID) == "" {
		return nil
	}
	metadata := s.buildStripeMetadata(workspaceID, campaign)
	if len(metadata) == 0 {
		return nil
	}
	params := &stripe.CustomerParams{Params: stripe.Params{Context: ctx}, Metadata: metadata}
	_, err := s.stripeClient.Customers.Update(customerID, params)
	return convertStripeError(err)
}

func (s *WorkspaceSubscriptionService) ensureStripeSubscriptionMetadata(ctx context.Context, subscriptionID, workspaceID string, campaign models.AcquisitionCampaign) error {
	if s.stripeClient == nil || strings.TrimSpace(subscriptionID) == "" {
		return nil
	}
	metadata := s.buildStripeMetadata(workspaceID, campaign)
	if len(metadata) == 0 {
		return nil
	}
	params := &stripe.SubscriptionParams{Params: stripe.Params{Context: ctx}, Metadata: metadata}
	_, err := s.stripeClient.Subscriptions.Update(subscriptionID, params)
	return convertStripeError(err)
}

func (s *WorkspaceSubscriptionService) ensureStripeInvoiceMetadata(ctx context.Context, invoiceID, workspaceID string, campaign models.AcquisitionCampaign) error {
	if s.stripeClient == nil || strings.TrimSpace(invoiceID) == "" {
		return nil
	}
	metadata := s.buildStripeMetadata(workspaceID, campaign)
	if len(metadata) == 0 {
		return nil
	}
	params := &stripe.InvoiceParams{Params: stripe.Params{Context: ctx}, Metadata: metadata}
	_, err := s.stripeClient.Invoices.Update(invoiceID, params)
	return convertStripeError(err)
}

func (s *WorkspaceSubscriptionService) hasSubscriptionCredit(workspaceID string, campaign models.AcquisitionCampaign) (bool, error) {
	if strings.TrimSpace(workspaceID) == "" || campaign == models.CampaignNone {
		return false, nil
	}
	credit, err := s.findSubscriptionCredit(workspaceID, campaign)
	if err != nil {
		return false, err
	}
	return credit != nil, nil
}

func (s *WorkspaceSubscriptionService) findSubscriptionCredit(workspaceID string, campaign models.AcquisitionCampaign) (*models.SubscriptionCredit, error) {
	if strings.TrimSpace(workspaceID) == "" || campaign == models.CampaignNone {
		return nil, nil
	}
	var credit models.SubscriptionCredit
	if err := s.db.Where("workspace_id = ? AND campaign = ?", workspaceID, campaign).First(&credit).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &credit, nil
}

func (s *WorkspaceSubscriptionService) recordSubscriptionCredit(workspaceID, customerID, balanceTransactionID string, campaign models.AcquisitionCampaign, amountCents int64, currency string) error {
	credit := models.NewSubscriptionCredit(workspaceID, customerID, balanceTransactionID, campaign, amountCents, currency)
	return s.db.Create(&credit).Error
}

func (s *WorkspaceSubscriptionService) applyPromotionalCreditIfNeeded(ctx context.Context, workspaceID, customerID string, campaign models.AcquisitionCampaign) error {
	if s.stripeClient == nil || campaign == models.CampaignNone {
		return nil
	}
	creditAmount := campaign.PromotionalCreditCents()
	if creditAmount <= 0 || strings.TrimSpace(customerID) == "" {
		return nil
	}
	alreadyCredited, err := s.hasSubscriptionCredit(workspaceID, campaign)
	if err != nil || alreadyCredited {
		return err
	}
	metadata := s.buildStripeMetadata(workspaceID, campaign)
	params := &stripe.CustomerBalanceTransactionParams{
		Params:      stripe.Params{Context: ctx},
		Customer:    stripe.String(customerID),
		Amount:      stripe.Int64(-creditAmount),
		Currency:    stripe.String(string(stripe.CurrencyUSD)),
		Description: stripe.String("Promotional credit"),
		Metadata:    metadata,
	}
	transaction, err := s.stripeClient.CustomerBalanceTransactions.New(params)
	if err != nil {
		return convertStripeError(err)
	}
	return s.recordSubscriptionCredit(workspaceID, customerID, transaction.ID, campaign, creditAmount, string(transaction.Currency))
}

func convertStripeError(err error) error {
	if err == nil {
		return nil
	}
	var stripeErr *stripe.Error
	if errors.As(err, &stripeErr) {
		return &StripeAPIError{
			Status:  stripeErr.HTTPStatusCode,
			Message: strings.TrimSpace(stripeErr.Msg),
			Code:    string(stripeErr.Code),
			Type:    string(stripeErr.Type),
		}
	}
	return err
}

func (s *WorkspaceSubscriptionService) joinURL(path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	trimmed := strings.TrimPrefix(path, "/")
	if trimmed == "" {
		return s.appURL
	}
	return fmt.Sprintf("%s/%s", s.appURL, trimmed)
}

func (s *WorkspaceSubscriptionService) countBillableMembers(workspaceID string) (int, error) {
	var count int64
	if err := s.db.
		Model(&models.WorkspaceMember{}).
		Where("workspace_members.workspace_id = ?", workspaceID).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return int(count), nil
}

// refreshSubscriptionSnapshot recomputes the workspace subscription snapshot and
// broadcasts the result so connected clients can react immediately.
func (s *WorkspaceSubscriptionService) refreshSubscriptionSnapshot(workspaceID string) (*models.WorkspaceSubscriptionSnapshot, error) {
	snapshot, err := s.Snapshot(workspaceID)
	if err != nil {
		return nil, err
	}
	s.broadcastSubscriptionSnapshot(workspaceID, snapshot)
	return snapshot, nil
}

// broadcastSubscriptionSnapshot pushes the latest state to every SSE client in the workspace.
// Subscription updates are workspace-level events that should go to all members.
func (s *WorkspaceSubscriptionService) broadcastSubscriptionSnapshot(workspaceID string, snapshot *models.WorkspaceSubscriptionSnapshot) {
	manager := GetSSEManager()
	if manager == nil {
		return
	}
	event := SSEEvent{
		Type: string(SSEWorkspaceSubscriptionUpdated),
		Data: map[string]interface{}{
			"workspaceId":  workspaceID,
			"subscription": snapshot,
		},
	}
	manager.broadcastToAllWorkspaceMembers(workspaceID, event)
}

func (s *WorkspaceSubscriptionService) persistWorkspaceReadonly(workspaceID string, timestamp *time.Time) {
	_ = s.db.Model(&models.Workspace{}).Where("id = ?", workspaceID).Update("readonly_since", timestamp).Error
}

func parseStripeSignature(header string) (int64, [][]byte, error) {
	parts := strings.Split(header, ",")
	var timestamp int64
	signatures := make([][]byte, 0, len(parts))
	for _, part := range parts {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			value, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				return 0, nil, err
			}
			timestamp = value
		case "v1":
			decoded, err := hex.DecodeString(kv[1])
			if err != nil {
				return 0, nil, err
			}
			signatures = append(signatures, decoded)
		}
	}

	if timestamp == 0 || len(signatures) == 0 {
		return 0, nil, fmt.Errorf("invalid stripe signature header")
	}
	return timestamp, signatures, nil
}

func computeStripeSignature(unsigned, secret string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(unsigned))
	return h.Sum(nil)
}

func mapStripeStatus(raw string) models.WorkspaceSubscriptionStatus {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "trialing":
		return models.WorkspaceSubscriptionStatusTrialing
	case "active":
		return models.WorkspaceSubscriptionStatusActive
	case "past_due":
		return models.WorkspaceSubscriptionStatusPastDue
	case "canceled":
		return models.WorkspaceSubscriptionStatusCanceled
	case "incomplete":
		return models.WorkspaceSubscriptionStatusIncomplete
	case "unpaid":
		return models.WorkspaceSubscriptionStatusUnpaid
	default:
		return models.WorkspaceSubscriptionStatusUnknown
	}
}

// computeSeatsAvailable calculates remaining seats based on purchased and used.
func computeSeatsAvailable(seatsPurchased, seatsUsed int) int {
	available := seatsPurchased - seatsUsed
	if available < 0 {
		return 0
	}
	return available
}
