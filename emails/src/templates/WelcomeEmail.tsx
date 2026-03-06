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

export interface WelcomeEmailProps {
  userName: string
  appName: string
  appUrl: string
  colors: ThemeColors
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({ appName, appUrl, colors }) => {
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"
  // Centralize the X profile reference so the handle and link stay consistent.
  const brandSocialXProfileUrl = "https://x.com/@shapeteams"

  return (
    <Html>
      <Head />
      <Preview>Welcome to {appName}</Preview>
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
            {/* EMAIL_ASSETS_URL provides the base path; the filename lives with the template for clarity. */}
            <EmailBrandLogo alt={appName} />
          </Section>

          <Section style={{ border: `1px solid ${borderPrimary}`, borderRadius: 6, padding: 24 }}>
            <Heading as="h2" style={{ fontSize: 20, lineHeight: "24px", color: textPrimary, margin: 0 }}>
              Welcome to {appName}.
            </Heading>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 12 }}>
              Meet {appName}. A radically simple new way to work.
            </Text>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 16 }}>
              Everyone wants to IPO. Products teams rely on twist and morph into bland concoctions meant to
              satisfy the largest userbase possible.
            </Text>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 16 }}>
              {appName} exists to return essential technologies to their pure form. Chat, discussion, and
              tasks should serve not revenue extraction, but fulfillment of purpose.
            </Text>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 16 }}>
              Start with a discussion that matters. Take your time. {appName} was designed for clarity,
              depth, and purpose.
            </Text>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 16 }}>
              Questions? Reply to this email and we'll get back to you quickly.
            </Text>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={appUrl}
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
                Open {appName}
              </Button>
            </Section>
            <Text style={{ color: textSecondary, fontSize: 14, lineHeight: "22px", marginTop: 24 }}>
              — The {appName} team
            </Text>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              If you didn't sign up for {appName}, you can ignore this email.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", marginTop: 16 }}>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              © {new Date().getFullYear()} {appName}
            </Text>
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", marginTop: 8 }}>
              Follow us on X:{" "}
              <a href={brandSocialXProfileUrl} style={{ color: brand, textDecoration: "underline" }}>
                @shapeteams
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default WelcomeEmail
