package utils

import (
	"fmt"
	"log"
	"os"
)

// LogDomain scopes logs so the on-call can filter specific subsystems quickly.
// Keep identifiers short and grep-friendly because we rely on CLI tooling.
type LogDomain string

const (
	// LogDomainGeneral covers existing logs that have not opted into a specific domain.
	LogDomainGeneral LogDomain = "General"
	// LogDomainNotifications scopes notification pipeline activity for targeted debugging.
	LogDomainNotifications LogDomain = "Notifications"
)

// Logger wraps the standard log package with a universal identifier prefix
type Logger struct {
	prefix string
	logger *log.Logger
}

// NewLogger creates a new logger instance with the universal identifier prefix
func NewLogger() *Logger {
	return &Logger{
		prefix: "APPLOG",
		logger: log.New(os.Stdout, "", log.LstdFlags),
	}
}

// NewLoggerWithPrefix creates a new logger instance with a custom prefix
func NewLoggerWithPrefix(prefix string) *Logger {
	return &Logger{
		prefix: prefix,
		logger: log.New(os.Stdout, "", log.LstdFlags),
	}
}

// formatMessage formats the message with the universal identifier prefix
func (l *Logger) formatMessage(level string, message string) string {
	return l.formatMessageWithDomain(level, LogDomainGeneral, message)
}

// formatMessageWithDomain ensures domain tagging is uniform for log filtering.
func (l *Logger) formatMessageWithDomain(level string, domain LogDomain, message string) string {
	return fmt.Sprintf("%s [%s] domain=%s %s", l.prefix, level, domain, message)
}

// logWithDomain writes log entries that opt into a specific subsystem.
func (l *Logger) logWithDomain(level string, domain LogDomain, message string) {
	l.logger.Println(l.formatMessageWithDomain(level, domain, message))
}

// Info logs an informational message
func (l *Logger) Info(message string) {
	l.logger.Println(l.formatMessage("INFO", message))
}

// Infof logs an informational message with formatting
func (l *Logger) Infof(format string, v ...interface{}) {
	l.logger.Println(l.formatMessage("INFO", fmt.Sprintf(format, v...)))
}

// InfoWithDomain logs informational messages that should be grouped by domain.
func (l *Logger) InfoWithDomain(domain LogDomain, message string) {
	l.logWithDomain("INFO", domain, message)
}

// InfofWithDomain logs formatted informational messages grouped by domain.
func (l *Logger) InfofWithDomain(domain LogDomain, format string, v ...interface{}) {
	l.logWithDomain("INFO", domain, fmt.Sprintf(format, v...))
}

// Error logs an error message
func (l *Logger) Error(message string) {
	l.logger.Println(l.formatMessage("ERROR", message))
}

// Errorf logs an error message with formatting
func (l *Logger) Errorf(format string, v ...interface{}) {
	l.logger.Println(l.formatMessage("ERROR", fmt.Sprintf(format, v...)))
}

// ErrorWithDomain logs error messages grouped by domain for focused triage.
func (l *Logger) ErrorWithDomain(domain LogDomain, message string) {
	l.logWithDomain("ERROR", domain, message)
}

// ErrorfWithDomain logs formatted error messages grouped by domain.
func (l *Logger) ErrorfWithDomain(domain LogDomain, format string, v ...interface{}) {
	l.logWithDomain("ERROR", domain, fmt.Sprintf(format, v...))
}

// Warn logs a warning message
func (l *Logger) Warn(message string) {
	l.logger.Println(l.formatMessage("WARN", message))
}

// Warnf logs a warning message with formatting
func (l *Logger) Warnf(format string, v ...interface{}) {
	l.logger.Println(l.formatMessage("WARN", fmt.Sprintf(format, v...)))
}

// WarnWithDomain logs warning messages grouped by domain for faster grep.
func (l *Logger) WarnWithDomain(domain LogDomain, message string) {
	l.logWithDomain("WARN", domain, message)
}

// WarnfWithDomain logs formatted warning messages grouped by domain.
func (l *Logger) WarnfWithDomain(domain LogDomain, format string, v ...interface{}) {
	l.logWithDomain("WARN", domain, fmt.Sprintf(format, v...))
}

// Debug logs a debug message
func (l *Logger) Debug(message string) {
	l.logger.Println(l.formatMessage("DEBUG", message))
}

// Debugf logs a debug message with formatting
func (l *Logger) Debugf(format string, v ...interface{}) {
	l.logger.Println(l.formatMessage("DEBUG", fmt.Sprintf(format, v...)))
}

// DebugWithDomain logs debug messages for a specific subsystem.
func (l *Logger) DebugWithDomain(domain LogDomain, message string) {
	l.logWithDomain("DEBUG", domain, message)
}

// DebugfWithDomain logs formatted debug messages scoped to a domain.
func (l *Logger) DebugfWithDomain(domain LogDomain, format string, v ...interface{}) {
	l.logWithDomain("DEBUG", domain, fmt.Sprintf(format, v...))
}

// Fatal logs a fatal message and exits the program
func (l *Logger) Fatal(message string) {
	l.logger.Fatalln(l.formatMessage("FATAL", message))
}

// Fatalf logs a fatal message with formatting and exits the program
func (l *Logger) Fatalf(format string, v ...interface{}) {
	l.logger.Fatalln(l.formatMessage("FATAL", fmt.Sprintf(format, v...)))
}

// FatalWithDomain logs fatal messages while preserving domain context.
func (l *Logger) FatalWithDomain(domain LogDomain, message string) {
	l.logger.Fatalln(l.formatMessageWithDomain("FATAL", domain, message))
}

// FatalfWithDomain logs formatted fatal messages scoped to a domain.
func (l *Logger) FatalfWithDomain(domain LogDomain, format string, v ...interface{}) {
	l.logger.Fatalln(l.formatMessageWithDomain("FATAL", domain, fmt.Sprintf(format, v...)))
}

// SetOutput allows changing the output destination
func (l *Logger) SetOutput(file *os.File) {
	l.logger.SetOutput(file)
}

// AppLogger is a global logger instance for convenience
var AppLogger = NewLogger()

// Package-level convenience functions that use the global logger
func Info(message string) {
	AppLogger.Info(message)
}

func Infof(format string, v ...interface{}) {
	AppLogger.Infof(format, v...)
}

func InfoWithDomain(domain LogDomain, message string) {
	AppLogger.InfoWithDomain(domain, message)
}

func InfofWithDomain(domain LogDomain, format string, v ...interface{}) {
	AppLogger.InfofWithDomain(domain, format, v...)
}

func Error(message string) {
	AppLogger.Error(message)
}

func Errorf(format string, v ...interface{}) {
	AppLogger.Errorf(format, v...)
}

func ErrorWithDomain(domain LogDomain, message string) {
	AppLogger.ErrorWithDomain(domain, message)
}

func ErrorfWithDomain(domain LogDomain, format string, v ...interface{}) {
	AppLogger.ErrorfWithDomain(domain, format, v...)
}

func Warn(message string) {
	AppLogger.Warn(message)
}

func Warnf(format string, v ...interface{}) {
	AppLogger.Warnf(format, v...)
}

func WarnWithDomain(domain LogDomain, message string) {
	AppLogger.WarnWithDomain(domain, message)
}

func WarnfWithDomain(domain LogDomain, format string, v ...interface{}) {
	AppLogger.WarnfWithDomain(domain, format, v...)
}

func Debug(message string) {
	AppLogger.Debug(message)
}

func Debugf(format string, v ...interface{}) {
	AppLogger.Debugf(format, v...)
}

func DebugWithDomain(domain LogDomain, message string) {
	AppLogger.DebugWithDomain(domain, message)
}

func DebugfWithDomain(domain LogDomain, format string, v ...interface{}) {
	AppLogger.DebugfWithDomain(domain, format, v...)
}

func Fatal(message string) {
	AppLogger.Fatal(message)
}

func Fatalf(format string, v ...interface{}) {
	AppLogger.Fatalf(format, v...)
}

func FatalWithDomain(domain LogDomain, message string) {
	AppLogger.FatalWithDomain(domain, message)
}

func FatalfWithDomain(domain LogDomain, format string, v ...interface{}) {
	AppLogger.FatalfWithDomain(domain, format, v...)
}
