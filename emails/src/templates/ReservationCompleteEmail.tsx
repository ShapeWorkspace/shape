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
} from "@react-email/components"
import EmailBrandLogo from "../components/EmailBrandLogo"
import type { ThemeColors } from "./WelcomeEmail"

export interface ReservationCompleteEmailProps {
  workspaceName: string
  workspaceUrl: string
  temporaryPassword: string
  userEmail: string
  appName: string
  appUrl: string
  colors: ThemeColors
}

const ReservationCompleteEmail: React.FC<ReservationCompleteEmailProps> = ({
  workspaceName,
  workspaceUrl,
  temporaryPassword,
  userEmail,
  appName,
  appUrl,
  colors,
}) => {
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"

  return (
    <Html>
      <Head />
      <Preview>{`${workspaceName} is ready on ${appName}`}</Preview>
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
            <EmailBrandLogo alt={appName} />
          </Section>

          <Section style={{ border: `1px solid ${borderPrimary}`, borderRadius: 6, padding: 24 }}>
            <Heading as="h2" style={{ fontSize: 20, lineHeight: "24px", color: textPrimary, margin: 0 }}>
              Reservation confirmed: {workspaceName}
            </Heading>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 12 }}>
              Your workspace has been reserved and can be accessed at any time at{" "}
              <a href={workspaceUrl}>{workspaceUrl}</a>. Use the credentials below to sign in and finish
              onboarding your team.
            </Text>

            <Section
              style={{
                backgroundColor: bgPrimary,
                border: `1px solid ${borderPrimary}`,
                borderRadius: 4,
                padding: 16,
                marginTop: 20,
              }}
            >
              <Text
                style={{
                  color: textSecondary,
                  fontSize: 12,
                  textTransform: "uppercase",
                  margin: 0,
                  letterSpacing: 0.3,
                }}
              >
                Temporary password
              </Text>
              <Text
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "10px 14px",
                  borderRadius: 4,
                  backgroundColor: "#0f172a",
                  color: "#f1f5f9",
                  fontSize: 14,
                  letterSpacing: 0.4,
                  fontFamily: "'IBM Plex Mono', SFMono-Regular, Menlo, Consolas, Monaco, monospace",
                }}
              >
                {temporaryPassword}
              </Text>
              <Text style={{ color: textSecondary, fontSize: 12, marginTop: 12 }}>
                Reserved for: <strong>{userEmail}</strong>
              </Text>
              <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", marginTop: 12 }}>
                Sign in with this email address and update your password from the account menu once you are
                inside the workspace.
              </Text>
            </Section>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={workspaceUrl}
                style={{
                  display: "inline-block",
                  backgroundColor: brand,
                  color: brandContrast,
                  padding: "10px 18px",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Go to your workspace
              </Button>
            </Section>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              Need help getting started? Visit <a href={appUrl}>{appUrl}</a> and our team will be ready to
              assist.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", marginTop: 16 }}>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              © {new Date().getFullYear()} {appName}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default ReservationCompleteEmail
