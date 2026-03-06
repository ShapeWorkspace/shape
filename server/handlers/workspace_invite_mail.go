package handlers

import (
	"fmt"
	"log"
	"strings"

	"shape/models"
	"shape/services"
)

// dispatchWorkspaceInviteEmail is a shared helper that sends email-based workspace invites using the
// same delivery pipeline regardless of which HTTP endpoint provisions the invite.
func dispatchWorkspaceInviteEmail(
	emailService services.EmailService,
	workspaceService *models.WorkspaceService,
	userService *models.UserService,
	invite *models.WorkspaceEmailInvite,
	token string,
	inviteeEmail string,
	inviterID string,
) {
	if emailService == nil || workspaceService == nil || userService == nil {
		return
	}
	if invite == nil || token == "" {
		return
	}

	inviter, err := userService.GetByID(inviterID)
	if err != nil {
		return
	}
	workspace, err := workspaceService.GetByID(invite.WorkspaceID)
	if err != nil {
		return
	}

	appURL := getEnvOr("APP_URL", "https://app.conquer.local")
	baseURL := strings.TrimRight(appURL, "/")
	inviteURL := fmt.Sprintf("%s/accept-invite/%s", baseURL, token)
	displayName := deriveInviteeDisplayName(inviteeEmail)
	inviterDisplayName := deriveInviteeDisplayName(inviter.Email)

	emailSendCtx, emailSendCancel := newWorkspaceInviteEmailSendContext()
	defer emailSendCancel()

	if err := emailService.SendWorkspaceInviteEmail(
		emailSendCtx,
		invite.Email,
		displayName,
		inviterDisplayName,
		workspace.Name,
		inviteURL,
	); err != nil {
		log.Printf(
			"workspace invite: failed to send workspace invite email workspace_id=%s invite_id=%s invitee=%s err=%v",
			invite.WorkspaceID,
			invite.ID,
			invite.Email,
			err,
		)
	}
}
