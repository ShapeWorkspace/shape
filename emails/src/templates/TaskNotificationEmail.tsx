import React from "react"
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Heading,
  Text,
  Section,
  Hr,
  Button,
  Img,
} from "@react-email/components"
import EmailBrandLogo from "../components/EmailBrandLogo"

export type ThemeColors = Record<string, string>

export interface TaskNotificationEmailProps {
  userName: string
  appName: string
  appUrl: string
  taskUrl: string
  headline: string
  taskTitle: string
  taskSummary: string
  taskBody: string
  taskImageUrl: string
  taskImageAlt: string
  taskImageDisplay: string
  colors: ThemeColors
}

/**
 * TaskNotificationEmail delivers a dedicated template for new task creation alerts.
 * The email highlights the task details so recipients can triage directly from their inbox.
 */
const TaskNotificationEmail: React.FC<TaskNotificationEmailProps> = ({
  appName,
  appUrl,
  taskUrl,
  headline,
  taskTitle,
  taskSummary,
  taskBody,
  taskImageUrl,
  taskImageAlt,
  taskImageDisplay,
  colors,
}) => {
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"

  const preview = taskSummary || taskTitle || headline

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: bgPrimary }}>
        <Container
          style={{
            margin: "0 auto",
            padding: "24px 16px",
            maxWidth: 560,
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
          }}
        >
          <Section style={{ textAlign: "center", marginBottom: 24 }}>
            {/* EMAIL_ASSETS_URL is applied as a prefix and this template owns the file name. */}
            <EmailBrandLogo alt={appName} />
          </Section>

          <Section style={{ border: `1px solid ${borderPrimary}`, borderRadius: 6, padding: 24 }}>
            {/* Lead with the task headline so notifications remain impersonal while still contextual. */}
            <Heading
              as="h2"
              style={{ fontSize: 18, lineHeight: "24px", color: textPrimary, marginTop: 0, marginBottom: 0 }}
            >
              {headline}
            </Heading>

            <Heading
              as="h3"
              style={{ fontSize: 16, lineHeight: "22px", color: textPrimary, marginTop: 12, marginBottom: 0 }}
            >
              {taskTitle}
            </Heading>

            <Text
              style={{
                color: textSecondary,
                fontSize: 14,
                lineHeight: "22px",
                marginTop: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {taskBody}
            </Text>

            {/* Render the hero asset when the task includes an image attachment. */}
            <Section
              style={{
                marginTop: 20,
                display: taskImageDisplay,
              }}
            >
              <Img
                src={taskImageUrl}
                alt={taskImageAlt}
                style={{
                  width: "100%",
                  maxWidth: "100%",
                  height: "auto",
                  borderRadius: 6,
                  display: taskImageDisplay,
                  objectFit: "cover",
                }}
              />
            </Section>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={taskUrl}
                style={{
                  display: "inline-block",
                  backgroundColor: brand,
                  color: brandContrast,
                  padding: "10px 16px",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Open in {appName}
              </Button>
            </Section>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              You’re receiving this because you follow this channel or task.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", marginTop: 16 }}>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              © {new Date().getFullYear()} {appName}
            </Text>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              <a href={appUrl} style={{ color: textSecondary, textDecoration: "underline" }}>
                Open {appName}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default TaskNotificationEmail
