package services

import (
	"crypto/tls"
	"net/smtp"
)

// sendMail sends email via SMTP. For local development (Mailpit), no auth is required.
func sendMail(addr, username, password, from string, to []string, msg []byte) error {
	// Plain (no TLS) for local Mailpit on 1025
	if username == "" && password == "" {
		return smtp.SendMail(addr, nil, from, to, msg)
	}
	// Optional AUTH with STARTTLS if needed
	auth := smtp.PlainAuth("", username, password, "localhost")
	tlsconfig := &tls.Config{InsecureSkipVerify: true}
	_ = tlsconfig
	return smtp.SendMail(addr, auth, from, to, msg)
}
