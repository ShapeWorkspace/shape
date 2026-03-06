import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { render } from "@react-email/render"
import React from "react"
import WelcomeEmail, { ThemeColors } from "./templates/WelcomeEmail"
import ResetPasswordEmail from "./templates/ResetPasswordEmail"
import WorkspaceInviteEmail from "./templates/WorkspaceInviteEmail"
import MentionAlertEmail from "./templates/MentionAlertEmail"
import TaskNotificationEmail from "./templates/TaskNotificationEmail"
import TaskCommentNotificationEmail from "./templates/TaskCommentNotificationEmail"
import ChatMessageNotificationEmail from "./templates/ChatMessageNotificationEmail"
import NotificationDigestEmail from "./templates/NotificationDigestEmail"
import ReservationCompleteEmail from "./templates/ReservationCompleteEmail"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")

// Email templates use fallback colors defined inline, so no external CSS is required.
// This function returns an empty object; templates fall back to their default values.
function getThemeColors(): ThemeColors {
  return {}
}

function ensureDist(): string {
  const dist = path.resolve(repoRoot, "emails", "dist")
  const templates = path.resolve(dist, "templates")
  fs.mkdirSync(templates, { recursive: true })
  return templates
}

function syncServerTemplate(sourcePath: string, fileName: string) {
  const serverTemplateDirs = [
    path.resolve(repoRoot, "server", "models", "emails"),
    path.resolve(repoRoot, "server", "services", "emails"),
  ]
  for (const dir of serverTemplateDirs) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(sourcePath, path.resolve(dir, fileName))
    } catch {
      // ignore
    }
  }
}

async function build() {
  const colors = getThemeColors()
  const welcomeHtml = render(
    React.createElement(WelcomeEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      colors,
    })
  )

  const outDir = ensureDist()
  const welcomeHtmlPath = path.resolve(outDir, "welcome.html")
  fs.writeFileSync(welcomeHtmlPath, welcomeHtml)
  fs.writeFileSync(path.resolve(outDir, "colors.json"), JSON.stringify(colors, null, 2))
  syncServerTemplate(welcomeHtmlPath, "welcome.html")

  // Build mention alert template
  const mentionAlertHtml = render(
    React.createElement(MentionAlertEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      activityUrl: "{{ACTIVITY_URL}}",
      headline: "{{HEADLINE}}",
      activityTitle: "{{ACTIVITY_TITLE}}",
      activityBody: "{{ACTIVITY_BODY}}",
      colors,
    })
  )
  const mentionAlertHtmlPath = path.resolve(outDir, "mention_alert.html")
  fs.writeFileSync(mentionAlertHtmlPath, mentionAlertHtml)
  syncServerTemplate(mentionAlertHtmlPath, "mention_alert.html")

  // Build task notification template
  const taskNotificationHtml = render(
    React.createElement(TaskNotificationEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      taskUrl: "{{TASK_URL}}",
      headline: "{{TASK_HEADLINE}}",
      taskTitle: "{{TASK_TITLE}}",
      taskSummary: "{{TASK_SUMMARY}}",
      taskBody: "{{TASK_BODY}}",
      taskImageUrl: "{{TASK_IMAGE_URL}}",
      taskImageAlt: "{{TASK_IMAGE_ALT}}",
      taskImageDisplay: "{{TASK_IMAGE_DISPLAY}}",
      colors,
    })
  )
  const taskNotificationHtmlPath = path.resolve(outDir, "task_notification.html")
  fs.writeFileSync(taskNotificationHtmlPath, taskNotificationHtml)
  syncServerTemplate(taskNotificationHtmlPath, "task_notification.html")

  // Build task comment notification template
  const taskCommentNotificationHtml = render(
    React.createElement(TaskCommentNotificationEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      taskUrl: "{{TASK_URL}}",
      headline: "{{TASK_COMMENT_HEADLINE}}",
      taskTitle: "{{TASK_COMMENT_TASK_TITLE}}",
      commentPreview: "{{TASK_COMMENT_PREVIEW}}",
      commentBody: "{{TASK_COMMENT_BODY}}",
      commentImageUrl: "{{TASK_COMMENT_IMAGE_URL}}",
      commentImageAlt: "{{TASK_COMMENT_IMAGE_ALT}}",
      commentImageDisplay: "{{TASK_COMMENT_IMAGE_DISPLAY}}",
      colors,
    })
  )
  const taskCommentNotificationHtmlPath = path.resolve(outDir, "task_comment_notification.html")
  fs.writeFileSync(taskCommentNotificationHtmlPath, taskCommentNotificationHtml)
  syncServerTemplate(taskCommentNotificationHtmlPath, "task_comment_notification.html")

  // Build chat message notification template
  const chatMessageNotificationHtml = render(
    React.createElement(ChatMessageNotificationEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      chatUrl: "{{CHAT_URL}}",
      headline: "{{CHAT_HEADLINE}}",
      chatPreview: "{{CHAT_PREVIEW}}",
      chatBody: "{{CHAT_BODY}}",
      greetingLine: "{{CHAT_GREETING}}",
      chatGreetingDisplay: "{{CHAT_GREETING_DISPLAY}}",
      chatImageUrl: "{{CHAT_IMAGE_URL}}",
      chatImageAlt: "{{CHAT_IMAGE_ALT}}",
      chatImageDisplay: "{{CHAT_IMAGE_DISPLAY}}",
      colors,
    })
  )
  const chatMessageNotificationHtmlPath = path.resolve(outDir, "chat_message_notification.html")
  fs.writeFileSync(chatMessageNotificationHtmlPath, chatMessageNotificationHtml)
  syncServerTemplate(chatMessageNotificationHtmlPath, "chat_message_notification.html")

  // Build notification digest template
  const notificationDigestHtml = render(
    React.createElement(NotificationDigestEmail, {
      userName: "{{USER_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      headline: "{{DIGEST_HEADLINE}}",
      summary: "{{DIGEST_SUMMARY}}",
      itemsMarkup: "{{DIGEST_ITEMS}}",
      colors,
    })
  )
  const notificationDigestHtmlPath = path.resolve(outDir, "notification_digest.html")
  fs.writeFileSync(notificationDigestHtmlPath, notificationDigestHtml)
  syncServerTemplate(notificationDigestHtmlPath, "notification_digest.html")

  // Build reset password template
  const resetHtml = render(
    React.createElement(ResetPasswordEmail, {
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      resetUrl: "{{RESET_URL}}",
      colors,
    })
  )
  const resetHtmlPath = path.resolve(outDir, "reset_password.html")
  fs.writeFileSync(resetHtmlPath, resetHtml)
  syncServerTemplate(resetHtmlPath, "reset_password.html")

  // Build workspace invite template
  const workspaceInviteHtml = render(
    React.createElement(WorkspaceInviteEmail, {
      userName: "{{USER_NAME}}",
      inviterName: "{{INVITER_NAME}}",
      workspaceName: "{{WORKSPACE_NAME}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      workspaceUrl: "{{WORKSPACE_URL}}",
      colors,
    })
  )
  const workspaceInviteHtmlPath = path.resolve(outDir, "workspace_invite.html")
  fs.writeFileSync(workspaceInviteHtmlPath, workspaceInviteHtml)
  syncServerTemplate(workspaceInviteHtmlPath, "workspace_invite.html")

  // Build reservation complete template
  const reservationCompleteHtml = render(
    React.createElement(ReservationCompleteEmail, {
      workspaceName: "{{WORKSPACE_NAME}}",
      workspaceUrl: "{{WORKSPACE_URL}}",
      temporaryPassword: "{{TEMP_PASSWORD}}",
      userEmail: "{{USER_EMAIL}}",
      appName: "{{APP_NAME}}",
      appUrl: "{{APP_URL}}",
      colors,
    })
  )
  const reservationCompleteHtmlPath = path.resolve(outDir, "reservation_complete.html")
  fs.writeFileSync(reservationCompleteHtmlPath, reservationCompleteHtml)
  syncServerTemplate(reservationCompleteHtmlPath, "reservation_complete.html")
}

build().catch(err => {
  console.error(err)
  process.exit(1)
})
