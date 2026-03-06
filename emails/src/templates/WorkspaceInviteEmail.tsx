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

export type ThemeColors = Record<string, string>

export interface WorkspaceInviteEmailProps {
  userName: string
  inviterName: string
  workspaceName: string
  appName: string
  appUrl: string
  workspaceUrl: string
  colors: ThemeColors
}

const WorkspaceInviteEmail: React.FC<WorkspaceInviteEmailProps> = ({
  userName,
  inviterName,
  workspaceName,
  appName,
  appUrl,
  workspaceUrl,
  colors,
}) => {
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"
  const trimmedUserName = userName?.trim() ?? ""
  const heading =
    trimmedUserName.length > 0
      ? `${trimmedUserName}, you were invited to ${workspaceName}`
      : `You're invited to ${workspaceName}`

  return (
    <Html>
      <Head />
      <Preview>{`You are invited to ${workspaceName}`}</Preview>
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
            {/* EMAIL_ASSETS_URL feeds this src prefix; the template keeps ownership of the logo filename. */}
            <EmailBrandLogo alt={appName} />
          </Section>

          <Section style={{ border: `1px solid ${borderPrimary}`, borderRadius: 6, padding: 24 }}>
            <Heading as="h2" style={{ fontSize: 20, lineHeight: "24px", color: textPrimary, margin: 0 }}>
              {heading}
            </Heading>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 12 }}>
              {inviterName} added you to the workspace <strong>{workspaceName}</strong>.
            </Text>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 12 }}>
              New to {appName}? Sign up or sign in with this email address after accepting and you&apos;ll
              land in the workspace automatically.
            </Text>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={workspaceUrl}
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
                Accept workspace invite
              </Button>
            </Section>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              You can also access it later from your account at{" "}
              <a href={appUrl} style={{ color: textSecondary, textDecoration: "underline" }}>
                {appName}
              </a>
              .
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

export default WorkspaceInviteEmail
