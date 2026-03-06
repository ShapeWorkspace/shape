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
  Button,
  Hr,
} from "@react-email/components"
import EmailBrandLogo from "../components/EmailBrandLogo"
import type { ThemeColors } from "./WelcomeEmail"

export interface NotificationDigestEmailProps {
  userName: string
  appName: string
  appUrl: string
  headline: string
  summary: string
  itemsMarkup: string
  colors: ThemeColors
}

/**
 * NotificationDigestEmail bundles multiple workspace updates into a single summary email.
 * The markup placeholder keeps rendering minimal so the Go service can inject the latest digest entries.
 */
const NotificationDigestEmail: React.FC<NotificationDigestEmailProps> = ({
  appName,
  appUrl,
  headline,
  summary,
  itemsMarkup,
  colors,
}) => {
  const textPrimary = colors["--text-norm"] ?? "#1d1d1f"
  const textSecondary = colors["--text-secondary"] ?? "#6e6e73"
  const bgPrimary = colors["--background-norm"] ?? "#ffffff"
  const borderPrimary = colors["--border-primary"] ?? "#e5e5e5"
  const brand = colors["--brand"] ?? "#000000"
  const brandContrast = colors["--brand-contrast"] ?? "#ffffff"

  return (
    <Html>
      <Head>
        <style>{`
          .digest-items {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin: 0;
            padding: 0;
          }

          .digest-entry {
            border-bottom: 1px solid ${borderPrimary};
            padding-bottom: 16px;
            margin-bottom: 16px;
          }

          .digest-entry:last-of-type {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
          }

          .digest-title {
            font-size: 16px;
            font-weight: 600;
            color: ${textPrimary};
            text-decoration: none;
            margin: 0 0 6px 0;
            display: block;
          }

          .digest-title:hover {
            text-decoration: underline;
          }

          .digest-timestamp {
            font-size: 12px;
            color: ${textSecondary};
            margin: 0 0 8px 0;
          }

          .digest-description {
            font-size: 14px;
            color: ${textSecondary};
            margin: 0;
            line-height: 22px;
          }

          .digest-empty {
            font-size: 14px;
            color: ${textSecondary};
            margin: 0;
          }
        `}</style>
      </Head>
      <Preview>{headline}</Preview>
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
            {/* EMAIL_ASSETS_URL is merged with the logo filename so the markup stays declarative. */}
            <EmailBrandLogo alt={appName} />
          </Section>

          <Section style={{ border: `1px solid ${borderPrimary}`, borderRadius: 6, padding: 24 }}>
            {/* Lead with the key summary so busy readers can scan the highlights quickly. */}
            <Heading
              as="h2"
              style={{ fontSize: 18, lineHeight: "24px", color: textPrimary, marginTop: 0, marginBottom: 12 }}
            >
              {headline}
            </Heading>

            <Text
              style={{
                color: textSecondary,
                fontSize: 14,
                lineHeight: "22px",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {summary}
            </Text>

            <Section style={{ marginTop: 24 }}>
              <div className="digest-items" dangerouslySetInnerHTML={{ __html: itemsMarkup }} />
            </Section>

            <Section style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                href={appUrl}
                style={{
                  backgroundColor: brand,
                  color: brandContrast,
                  padding: "10px 18px",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  display: "inline-block",
                }}
              >
                Open {appName}
              </Button>
            </Section>

            <Hr style={{ border: 0, borderTop: `1px solid ${borderPrimary}`, margin: "24px 0" }} />
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: "20px", margin: 0 }}>
              You’re receiving this summary because you opted into delayed email delivery.
            </Text>
          </Section>

          <Section style={{ textAlign: "center", marginTop: 16 }}>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              © {new Date().getFullYear()} {appName}
            </Text>
            <Text style={{ color: textSecondary, fontSize: 12 }}>
              <a href={appUrl} style={{ color: textSecondary, textDecoration: "underline" }}>
                Visit {appName}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default NotificationDigestEmail
