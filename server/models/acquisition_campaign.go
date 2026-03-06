package models

import (
	"strings"

	"gorm.io/datatypes"
)

// AcquisitionCampaign identifies the paid acquisition track a workspace belongs to.
// The constant values intentionally mirror their UTM campaign codes so metadata
// round-trips cleanly across marketing links, persistence, and Stripe objects.
type AcquisitionCampaign string

const (
	CampaignNone           AcquisitionCampaign = ""
	CampaignLaunchOffer    AcquisitionCampaign = "launch-offer"
	CampaignGoogleAds      AcquisitionCampaign = "search"
	launchOfferCreditCents                     = 10000
)

// AcquisitionCampaignDefinition encapsulates the behavior toggles for each campaign.
type AcquisitionCampaignDefinition struct {
	Identifier             AcquisitionCampaign
	UTMCampaignCode        string
	TrialPeriodDays        int
	RequiresPaymentMethod  bool
	PromotionalCreditCents int64
	RequiresInvite         bool
}

var campaignDefinitions = map[AcquisitionCampaign]AcquisitionCampaignDefinition{
	CampaignLaunchOffer: {
		Identifier:             CampaignLaunchOffer,
		UTMCampaignCode:        "launch-offer",
		TrialPeriodDays:        0,
		RequiresPaymentMethod:  false,
		PromotionalCreditCents: launchOfferCreditCents,
		RequiresInvite:         true,
	},
	CampaignGoogleAds: {
		Identifier:             CampaignGoogleAds,
		UTMCampaignCode:        "search-1",
		TrialPeriodDays:        30,
		RequiresPaymentMethod:  true,
		PromotionalCreditCents: 0,
		RequiresInvite:         false,
	},
	CampaignNone: {
		Identifier:      CampaignNone,
		UTMCampaignCode: "",
		// Default funnel always promises a 30 day trial, so ensure checkout honors it.
		TrialPeriodDays:        30,
		RequiresPaymentMethod:  true,
		PromotionalCreditCents: 0,
		RequiresInvite:         false,
	},
}

// Definition returns the configuration block for the campaign, falling back to CampaignNone.
func (c AcquisitionCampaign) Definition() AcquisitionCampaignDefinition {
	if def, ok := campaignDefinitions[c]; ok {
		return def
	}
	return campaignDefinitions[CampaignNone]
}

// TrialDays exposes the configured trial window for the campaign.
func (c AcquisitionCampaign) TrialDays() int {
	return c.Definition().TrialPeriodDays
}

// RequiresPaymentMethodUpfront captures whether Stripe should demand a payment method at checkout.
func (c AcquisitionCampaign) RequiresPaymentMethodUpfront() bool {
	return c.Definition().RequiresPaymentMethod
}

// PromotionalCreditCents returns the promotional customer balance Stripe credit for the campaign.
func (c AcquisitionCampaign) PromotionalCreditCents() int64 {
	return c.Definition().PromotionalCreditCents
}

// RequiresInviteBeforeActivation specifies whether the activation flow must include teammate invites.
func (c AcquisitionCampaign) RequiresInviteBeforeActivation() bool {
	return c.Definition().RequiresInvite
}

// DetermineAcquisitionCampaignFromAttribution inspects sanitized signup attribution payloads and
// resolves them to the closest matching campaign constant.
func DetermineAcquisitionCampaignFromAttribution(attribution datatypes.JSONMap) AcquisitionCampaign {
	if len(attribution) == 0 {
		return CampaignNone
	}
	if raw, ok := attribution["utm_campaign"]; ok {
		if candidate, ok := raw.(string); ok {
			return LookupCampaignByUTMCode(candidate)
		}
	}
	return CampaignNone
}

// LookupCampaignByUTMCode normalizes the provided code before mapping it onto a known campaign.
func LookupCampaignByUTMCode(code string) AcquisitionCampaign {
	normalized := strings.TrimSpace(strings.ToLower(code))
	for campaign, def := range campaignDefinitions {
		if candidate := strings.TrimSpace(def.UTMCampaignCode); candidate != "" {
			if normalized == candidate {
				return campaign
			}
		}
	}
	return CampaignNone
}

// String exposes the canonical representation for logging and metadata payloads.
func (c AcquisitionCampaign) String() string {
	return string(c)
}
