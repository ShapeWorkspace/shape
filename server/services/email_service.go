package services

import (
	"context"
	_ "embed"
	"fmt"
	"html"
	"net/url"
	"os"
	"strings"
	"sync"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

//go:embed emails/welcome.html
var welcomeTemplate []byte

//go:embed emails/reset_password.html
var resetPasswordTemplate []byte

//go:embed emails/workspace_invite.html
var workspaceInviteTemplate []byte

// EmailService defines the interface for sending emails.
type EmailService interface {
	SendWelcomeEmail(ctx context.Context, toEmail, userName string) error
	SendPasswordResetEmail(ctx context.Context, toEmail, tokenID, rawToken string) error
	SendWorkspaceInviteEmail(ctx context.Context, toEmail, userName, inviterName, workspaceName, workspaceURL string) error
	WithAppURL(appURL string) EmailService
}

// SESEmailService sends emails via AWS SES.
type SESEmailService struct {
	client            *sesv2.Client
	senderAddress     string
	appName           string
	appURL            string
	emailAssetBaseURL string
}

// defaultIfBlank trims the provided value and substitutes the fallback when no content remains.
func defaultIfBlank(value, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

// sanitizeEmailAssetBaseURL ensures the EMAIL_ASSETS_URL prefix is safe for concatenating template-owned filenames.
func sanitizeEmailAssetBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	if parsed.Host == "" {
		return ""
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "https" {
		if scheme != "http" || !isLocalEmailAssetHost(parsed.Host) {
			return ""
		}
	}
	parsed.User = nil
	parsed.RawQuery = ""
	parsed.Fragment = ""
	clean := parsed.String()
	return strings.TrimRight(clean, "/")
}

// deriveEmailAssetBaseFallbackFromAppURL rebuilds a sanitized asset prefix from the app URL when EMAIL_ASSETS_URL is blank.
func deriveEmailAssetBaseFallbackFromAppURL(appURL string) string {
	trimmed := strings.TrimSpace(appURL)
	if trimmed == "" {
		return ""
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	if parsed.Host == "" {
		return ""
	}
	fallback := url.URL{
		Scheme: parsed.Scheme,
		Host:   parsed.Host,
		Path:   "/assets/email",
	}
	return sanitizeEmailAssetBaseURL(fallback.String())
}

// isLocalEmailAssetHost checks whether the provided host represents a local or loopback address where http is acceptable.
func isLocalEmailAssetHost(host string) bool {
	trimmed := strings.TrimSpace(host)
	if trimmed == "" {
		return false
	}
	if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
		trimmed = strings.Trim(trimmed, "[]")
	}
	// Separate port component if present.
	if colon := strings.LastIndex(trimmed, ":"); colon != -1 {
		candidate := trimmed[:colon]
		if strings.Count(candidate, ":") == 0 {
			trimmed = candidate
		}
	}
	lower := strings.ToLower(trimmed)
	if lower == "localhost" || lower == "::1" {
		return true
	}
	if strings.HasPrefix(lower, "127.") {
		return true
	}
	return false
}

// assetBaseURL exposes the sanitized EMAIL_ASSETS_URL so templates can append filenames directly.
func (s *SESEmailService) assetBaseURL() string {
	if s.emailAssetBaseURL != "" {
		return s.emailAssetBaseURL
	}
	return strings.TrimRight(s.appURL, "/")
}

// NewSESEmailService creates an SES email service instance.
func NewSESEmailService(region, senderAddress, appName, appURL, emailAssetsURL string) (*SESEmailService, error) {
	if senderAddress == "" {
		return nil, fmt.Errorf("sender address is required")
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.TODO(), awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	client := sesv2.NewFromConfig(cfg)
	assetBaseURL := sanitizeEmailAssetBaseURL(emailAssetsURL)
	if assetBaseURL == "" {
		assetBaseURL = deriveEmailAssetBaseFallbackFromAppURL(appURL)
	}
	return &SESEmailService{
		client:            client,
		senderAddress:     senderAddress,
		appName:           appName,
		appURL:            appURL,
		emailAssetBaseURL: assetBaseURL,
	}, nil
}

// WithAppURL returns a shallow copy of the SES service that uses the provided base URL.
func (s *SESEmailService) WithAppURL(appURL string) EmailService {
	trimmed := strings.TrimRight(strings.TrimSpace(appURL), "/")
	if trimmed == "" || trimmed == s.appURL {
		return s
	}
	clone := *s
	clone.appURL = trimmed
	return &clone
}

func (s *SESEmailService) renderWelcomeHTML(userName string) (string, error) {
	if len(welcomeTemplate) == 0 {
		return "", fmt.Errorf("welcome template not embedded")
	}
	htmlContent := string(welcomeTemplate)
	replacements := map[string]string{
		"{{USER_NAME}}":            userName,
		"{{APP_NAME}}":             s.appName,
		"{{APP_URL}}":              s.appURL,
		"{{EMAIL_ASSET_BASE_URL}}": s.assetBaseURL(),
	}
	for k, v := range replacements {
		htmlContent = strings.ReplaceAll(htmlContent, k, v)
	}
	return htmlContent, nil
}

func (s *SESEmailService) renderResetHTML(resetURL string) (string, error) {
	if len(resetPasswordTemplate) == 0 {
		return "", fmt.Errorf("reset template not embedded")
	}
	htmlContent := string(resetPasswordTemplate)
	replacements := map[string]string{
		"{{APP_NAME}}":             s.appName,
		"{{APP_URL}}":              s.appURL,
		"{{EMAIL_ASSET_BASE_URL}}": s.assetBaseURL(),
		"{{RESET_URL}}":            resetURL,
	}
	for k, v := range replacements {
		htmlContent = strings.ReplaceAll(htmlContent, k, v)
	}
	return htmlContent, nil
}

func (s *SESEmailService) renderWorkspaceInviteHTML(userName, inviterName, workspaceName, workspaceURL string) (string, error) {
	if len(workspaceInviteTemplate) == 0 {
		return "", fmt.Errorf("workspace invite template not embedded")
	}
	htmlContent := string(workspaceInviteTemplate)
	replacements := map[string]string{
		"{{USER_NAME}}":            userName,
		"{{INVITER_NAME}}":         inviterName,
		"{{WORKSPACE_NAME}}":       workspaceName,
		"{{APP_NAME}}":             s.appName,
		"{{APP_URL}}":              s.appURL,
		"{{EMAIL_ASSET_BASE_URL}}": s.assetBaseURL(),
		"{{WORKSPACE_URL}}":        workspaceURL,
	}
	for k, v := range replacements {
		htmlContent = strings.ReplaceAll(htmlContent, k, v)
	}
	return htmlContent, nil
}

func (s *SESEmailService) SendWelcomeEmail(ctx context.Context, toEmail, userName string) error {
	htmlContent, err := s.renderWelcomeHTML(userName)
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("Welcome to %s", s.appName)
	_, err = s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: &s.senderAddress,
		Destination: &types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: &subject},
				Body: &types.Body{
					Html: &types.Content{Data: &htmlContent},
				},
			},
		},
	})
	return err
}

func (s *SESEmailService) SendPasswordResetEmail(ctx context.Context, toEmail, tokenID, rawToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password/%s/%s", strings.TrimRight(s.appURL, "/"), tokenID, rawToken)
	htmlContent, err := s.renderResetHTML(resetURL)
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("Reset your %s password", s.appName)
	_, err = s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: &s.senderAddress,
		Destination: &types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: &subject},
				Body: &types.Body{
					Html: &types.Content{Data: &htmlContent},
				},
			},
		},
	})
	return err
}

func (s *SESEmailService) SendWorkspaceInviteEmail(ctx context.Context, toEmail, userName, inviterName, workspaceName, workspaceURL string) error {
	htmlContent, err := s.renderWorkspaceInviteHTML(userName, inviterName, workspaceName, workspaceURL)
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("You are invited to %s", workspaceName)
	_, err = s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: &s.senderAddress,
		Destination: &types.Destination{
			ToAddresses: []string{toEmail},
		},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: &subject},
				Body: &types.Body{
					Html: &types.Content{Data: &htmlContent},
				},
			},
		},
	})
	return err
}

// SMTPEmailService sends email via an SMTP relay (e.g., Mailpit locally).
type SMTPEmailService struct {
	host              string
	port              string
	username          string
	password          string
	senderAddress     string
	appName           string
	appURL            string
	emailAssetBaseURL string
}

// Test capture storage (active only in test env when enabled).
var (
	testEmailCaptureEnabled bool
	testSkipSMTPDelivery    bool
	testCapturedEmailsMu    sync.Mutex
	testCapturedEmails      map[string][]string
)

// EnableTestEmailCapture enables in-memory email capture (for tests only).
func EnableTestEmailCapture(enable bool) {
	testEmailCaptureEnabled = enable
	testSkipSMTPDelivery = enable
	if !enable {
		testCapturedEmailsMu.Lock()
		testCapturedEmails = nil
		testCapturedEmailsMu.Unlock()
		return
	}

	testCapturedEmailsMu.Lock()
	if testCapturedEmails == nil {
		testCapturedEmails = make(map[string][]string)
	}
	testCapturedEmailsMu.Unlock()
}

// GetAndClearTestCapturedEmails returns and clears captured raw emails.
func GetAndClearTestCapturedEmails() []string {
	testCapturedEmailsMu.Lock()
	defer testCapturedEmailsMu.Unlock()
	if len(testCapturedEmails) == 0 {
		return []string{}
	}
	out := make([]string, 0)
	for _, messages := range testCapturedEmails {
		out = append(out, messages...)
	}
	testCapturedEmails = make(map[string][]string)
	return out
}

// PeekTestCapturedEmails returns captured emails without clearing them.
func PeekTestCapturedEmails() []string {
	testCapturedEmailsMu.Lock()
	defer testCapturedEmailsMu.Unlock()
	if len(testCapturedEmails) == 0 {
		return []string{}
	}
	out := make([]string, 0)
	for _, messages := range testCapturedEmails {
		out = append(out, messages...)
	}
	return out
}

// GetAndClearTestCapturedEmailsFor returns and clears captured emails for the specified recipient.
func GetAndClearTestCapturedEmailsFor(recipient string) []string {
	normalized := strings.ToLower(strings.TrimSpace(recipient))
	testCapturedEmailsMu.Lock()
	defer testCapturedEmailsMu.Unlock()
	if normalized == "" {
		if len(testCapturedEmails) == 0 {
			return []string{}
		}
		out := make([]string, 0)
		for _, messages := range testCapturedEmails {
			out = append(out, messages...)
		}
		testCapturedEmails = make(map[string][]string)
		return out
	}

	if len(testCapturedEmails) == 0 {
		return []string{}
	}
	messages := append([]string(nil), testCapturedEmails[normalized]...)
	delete(testCapturedEmails, normalized)
	return messages
}

// PeekTestCapturedEmailsFor returns captured emails for the specified recipient without clearing them.
func PeekTestCapturedEmailsFor(recipient string) []string {
	normalized := strings.ToLower(strings.TrimSpace(recipient))
	testCapturedEmailsMu.Lock()
	defer testCapturedEmailsMu.Unlock()
	if len(testCapturedEmails) == 0 {
		return []string{}
	}
	if normalized == "" {
		out := make([]string, 0)
		for _, messages := range testCapturedEmails {
			out = append(out, messages...)
		}
		return out
	}

	messages := testCapturedEmails[normalized]
	if messages == nil {
		return []string{}
	}
	return append([]string(nil), messages...)
}

func captureTestEmail(recipient string, message []byte) {
	if !testEmailCaptureEnabled {
		return
	}
	normalized := strings.ToLower(strings.TrimSpace(recipient))
	if normalized == "" {
		normalized = "__unknown__"
	}
	testCapturedEmailsMu.Lock()
	if testCapturedEmails == nil {
		testCapturedEmails = make(map[string][]string)
	}
	testCapturedEmails[normalized] = append(testCapturedEmails[normalized], string(message))
	testCapturedEmailsMu.Unlock()
}

// NewSMTPEmailService creates an SMTP email service instance.
func NewSMTPEmailService(host, port, username, password, senderAddress, appName, appURL, emailAssetsURL string) *SMTPEmailService {
	assetBaseURL := sanitizeEmailAssetBaseURL(emailAssetsURL)
	if assetBaseURL == "" {
		assetBaseURL = deriveEmailAssetBaseFallbackFromAppURL(appURL)
	}
	return &SMTPEmailService{
		host:              host,
		port:              port,
		username:          username,
		password:          password,
		senderAddress:     senderAddress,
		appName:           appName,
		appURL:            appURL,
		emailAssetBaseURL: assetBaseURL,
	}
}

// WithAppURL returns a shallow copy of the SMTP service configured to use the provided base application URL.
func (s *SMTPEmailService) WithAppURL(appURL string) EmailService {
	trimmed := strings.TrimRight(strings.TrimSpace(appURL), "/")
	if trimmed == "" || trimmed == s.appURL {
		return s
	}
	clone := *s
	clone.appURL = trimmed
	return &clone
}

func (s *SMTPEmailService) SendWelcomeEmail(ctx context.Context, toEmail, userName string) error {
	htmlContent, err := (&SESEmailService{appName: s.appName, appURL: s.appURL, emailAssetBaseURL: s.emailAssetBaseURL}).renderWelcomeHTML(userName)
	if err != nil {
		return err
	}
	addr := s.host + ":" + s.port
	subject := "Subject: " + fmt.Sprintf("Welcome to %s", s.appName) + "\r\n"
	mime := "MIME-version: 1.0;\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	msg := []byte("From: " + s.senderAddress + "\r\n" +
		"To: " + toEmail + "\r\n" + subject + mime + htmlContent)
	captureTestEmail(toEmail, msg)
	if testSkipSMTPDelivery {
		return nil
	}
	return smtpSend(addr, s.username, s.password, s.senderAddress, []string{toEmail}, msg)
}

func (s *SMTPEmailService) SendPasswordResetEmail(ctx context.Context, toEmail, tokenID, rawToken string) error {
	resetURL := fmt.Sprintf("%s/reset-password/%s/%s", strings.TrimRight(s.appURL, "/"), tokenID, rawToken)
	htmlContent, err := (&SESEmailService{appName: s.appName, appURL: s.appURL, emailAssetBaseURL: s.emailAssetBaseURL}).renderResetHTML(resetURL)
	if err != nil {
		return err
	}
	addr := s.host + ":" + s.port
	subjectHeader := "Subject: " + fmt.Sprintf("Reset your %s password", s.appName) + "\r\n"
	mime := "MIME-version: 1.0;\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	msg := []byte("From: " + s.senderAddress + "\r\n" +
		"To: " + toEmail + "\r\n" + subjectHeader + mime + htmlContent)
	captureTestEmail(toEmail, msg)
	if testSkipSMTPDelivery {
		return nil
	}
	return smtpSend(addr, s.username, s.password, s.senderAddress, []string{toEmail}, msg)
}

func (s *SMTPEmailService) SendWorkspaceInviteEmail(ctx context.Context, toEmail, userName, inviterName, workspaceName, workspaceURL string) error {
	htmlContent, err := (&SESEmailService{appName: s.appName, appURL: s.appURL, emailAssetBaseURL: s.emailAssetBaseURL}).renderWorkspaceInviteHTML(userName, inviterName, workspaceName, workspaceURL)
	if err != nil {
		return err
	}
	addr := s.host + ":" + s.port
	subjectHeader := "Subject: " + fmt.Sprintf("You are invited to %s", workspaceName) + "\r\n"
	mime := "MIME-version: 1.0;\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n"
	msg := []byte("From: " + s.senderAddress + "\r\n" +
		"To: " + toEmail + "\r\n" + subjectHeader + mime + htmlContent)
	captureTestEmail(toEmail, msg)
	if testSkipSMTPDelivery {
		return nil
	}
	return smtpSend(addr, s.username, s.password, s.senderAddress, []string{toEmail}, msg)
}

// smtpSend is the function variable for testing/mocking.
var smtpSend = func(addr, username, password, from string, to []string, msg []byte) error {
	return sendMail(addr, username, password, from, to, msg)
}

// NewSESEmailServiceFromEnv creates an SES email service from environment variables.
func NewSESEmailServiceFromEnv(appName, appURL string) (*SESEmailService, error) {
	region := os.Getenv("AWS_REGION")
	sender := os.Getenv("SES_SENDER_EMAIL")
	assetBase := os.Getenv("EMAIL_ASSETS_URL")
	return NewSESEmailService(region, sender, appName, appURL, assetBase)
}

// escapeWithLineBreaks escapes HTML entities while preserving deliberate newlines through <br /> tags.
func escapeWithLineBreaks(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	escaped := html.EscapeString(raw)
	escaped = strings.ReplaceAll(escaped, "\r\n", "\n")
	escaped = strings.ReplaceAll(escaped, "\r", "\n")
	escaped = strings.ReplaceAll(escaped, "\n", "<br />")
	return escaped
}
