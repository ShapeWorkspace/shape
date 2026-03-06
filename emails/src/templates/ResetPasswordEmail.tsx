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

export interface ResetPasswordEmailProps {
  appName: string
  appUrl: string
  resetUrl: string
  colors: ThemeColors
}

const ResetPasswordEmail: React.FC<ResetPasswordEmailProps> = ({ appName, appUrl, resetUrl, colors }) => {
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"

  return (
    <Html>
      <Head />
      <Preview>Reset your {appName} password</Preview>
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
              Reset your password
            </Heading>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 12 }}>
              We received a request to reset your password. Click the button below to choose a new password.
              This link will expire shortly for your security.
            </Text>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={resetUrl}
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
                Reset password
              </Button>
            </Section>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              If you didn’t request this, you can safely ignore this email.
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

export default ResetPasswordEmail
