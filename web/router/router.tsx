import { createBrowserRouter, Navigate } from "react-router-dom"
import { AuthGuard } from "./guards/AuthGuard"
import { WorkspaceGuard } from "./guards/WorkspaceGuard"

// Static imports for full offline support - all components bundled upfront
import { AuthRedirect, AuthLogoutRedirect, AuthLogoutAllRedirect } from "../components/AuthRedirect"
import { WorkspaceSelector } from "../components/WorkspaceSelector"
import { WorkspaceLayout } from "../layouts/WorkspaceLayout"
import { InboxTool } from "../tools/InboxTool"
import { NotesTool } from "../tools/NotesTool"
import { DraftsTool } from "../tools/DraftsTool"
import { ContactsTool } from "../tools/ContactsTool"
import { GroupsTool } from "../tools/GroupsTool"
import { FilesTool } from "../tools/FilesTool"
import { PapersTool } from "../tools/PapersTool"
import { ForumTool } from "../tools/ForumTool"
import { TasksTool } from "../tools/TasksTool"
import { SettingsTool } from "../tools/SettingsTool"
import { NotificationSettingsTool } from "../tools/NotificationSettingsTool"
import { SettingsLogsTool } from "../tools/SettingsLogsTool"
import { WorkspaceMembersTool } from "../tools/WorkspaceMembersTool"
import { InviteAcceptanceTool } from "../tools/InviteAcceptanceTool"
import { ToolSelector } from "../components/ToolSelector"
import { RootRedirect } from "../components/RootRedirect"

/**
 * Main router configuration.
 * URL structure:
 * - /                           -> Root redirect (auth check)
 * - /auth/signin               -> Redirect to workspace with sign-in sidecar
 * - /auth/signup               -> Redirect to workspace with sign-up sidecar
 * - /workspaces                -> Workspace selector
 * - /w/:workspaceId            -> Workspace home (tool selector)
 * - /w/:workspaceId/:tool      -> Tool list view
 * - /w/:workspaceId/:tool/:itemId -> Item detail view
 * - /w/:workspaceId/projects/:itemId/tasks/:taskId -> Task detail view
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootRedirect />,
  },
  {
    path: "/auth",
    children: [
      {
        path: "signin",
        element: <AuthRedirect mode="signin" />,
      },
      {
        path: "signup",
        element: <AuthRedirect mode="signup" />,
      },
      {
        path: "logout",
        element: <AuthLogoutRedirect />,
      },
      {
        path: "logout-all",
        element: <AuthLogoutAllRedirect />,
      },
      {
        index: true,
        element: <Navigate to="signin" replace />,
      },
    ],
  },
  {
    path: "/workspaces",
    element: (
      <AuthGuard>
        <WorkspaceSelector />
      </AuthGuard>
    ),
  },
  {
    // Invite acceptance page - no auth guard as user may not have account yet
    // URL: /invite/{inviteId}?pub={inviterPublicKey}#sk={inviteSecret}
    path: "/invite/:inviteId",
    element: <InviteAcceptanceTool />,
  },
  {
    path: "/w/:workspaceId",
    element: (
      <WorkspaceGuard>
        <WorkspaceLayout />
      </WorkspaceGuard>
    ),
    children: [
      { index: true, element: <ToolSelector /> },
      { path: "drafts", element: <DraftsTool /> },
      { path: "inbox", element: <InboxTool /> },
      { path: "memos", element: <NotesTool /> },
      { path: "memos/:itemId", element: <NotesTool /> },
      { path: "contacts", element: <ContactsTool /> },
      { path: "contacts/:itemId", element: <ContactsTool /> },
      { path: "groups", element: <GroupsTool /> },
      { path: "groups/:itemId", element: <GroupsTool /> },
      { path: "files", element: <FilesTool /> },
      { path: "files/:itemId", element: <FilesTool /> },
      { path: "papers", element: <PapersTool /> },
      { path: "papers/:itemId", element: <PapersTool /> },
      { path: "forum", element: <ForumTool /> },
      { path: "forum/:itemId", element: <ForumTool /> },
      { path: "forum/:channelId/discussions/:discussionId", element: <ForumTool /> },
      { path: "projects", element: <TasksTool /> },
      { path: "projects/:itemId", element: <TasksTool /> },
      { path: "projects/:itemId/tasks/:taskId", element: <TasksTool /> },
      { path: "settings", element: <SettingsTool /> },
      { path: "settings/members", element: <WorkspaceMembersTool /> },
      { path: "settings/notifications", element: <NotificationSettingsTool /> },
      { path: "settings/logs", element: <SettingsLogsTool /> },
    ],
  },
  {
    // Catch-all redirect to root
    path: "*",
    element: <Navigate to="/" replace />,
  },
])
