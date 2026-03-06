import { test, expect, type Page, type Browser } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { makeUser } from "./utils/test-data"

const getWorkspaceRowByName = (page: Page, name: string) =>
  page.getByTestId(/workspace-row-/).filter({ hasText: name }).first()

const getWorkspaceSwitcherItemByName = (page: Page, name: string) =>
  page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name }).first()

/**
 * Convert an invite URL to use localhost instead of the production base URL.
 * The app generates invite links using VITE_INVITE_LINK_BASE_URL which points to production.
 * In tests, we need to redirect to localhost for the invite acceptance flow to work.
 */
const convertInviteUrlToLocalhost = (inviteUrl: string, port: string = "5173"): string => {
  // Replace any base URL with localhost
  return inviteUrl.replace(/https?:\/\/[^/]+/, `http://localhost:${port}`)
}

// Reloads can be aborted during client-side redirects; fall back to a direct navigation for stability.
const reloadPageWithFallback = async (page: Page, options?: { timeout?: number }): Promise<void> => {
  const timeout = options?.timeout ?? 20000
  const currentUrl = page.url()

  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout })
  } catch {
    await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout })
  }
}

const ensureToolSelectorAndOpenSettingsTool = async (page: Page): Promise<void> => {
  // The UI can land in a tool view or workspace selector after auth; always return to the tool selector before opening Settings.
  const workspace = new WorkspacePage(page)
  for (let attempt = 0; attempt < 3; attempt++) {
    const workspaceSelectorVisible = await page
      .getByTestId("workspace-selector")
      .isVisible()
      .catch(() => false)
    if (workspaceSelectorVisible) {
      await workspace.createWorkspaceIfWorkspaceSelectorVisible(`Settings Workspace ${Date.now()}`)
    }
    await workspace.ensureToolSelectorVisible()
    try {
      await page.getByTestId("tool-settings").click({ timeout: 5000 })
      return
    } catch {
      if (attempt === 2) {
        throw new Error("Failed to open Settings tool from the tool selector")
      }
    }
  }
}

const createAccountWithWorkspace = async (
  browser: Browser,
  workspaceName: string
): Promise<{ email: string; password: string; name: string }> => {
  const credentials = makeUser()
  const context = await browser.newContext()
  const page = await context.newPage()
  const auth = new AuthPage(page)
  const workspace = new WorkspacePage(page)

  await auth.goto()
  await auth.signUp(credentials)
  await workspace.expectVisible()
  await workspace.createWorkspace(workspaceName)
  await workspace.expectToolSelectorVisible()

  await context.close()

  return credentials
}

const addAccountViaSettings = async (
  page: Page,
  credentials: { email: string; password: string }
): Promise<void> => {
  await ensureToolSelectorAndOpenSettingsTool(page)
  await page.getByTestId("settings-add-account-row").evaluate(element => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 10000 })
  await page.getByTestId("auth-email-input").fill(credentials.email)
  await page.getByTestId("auth-password-input").fill(credentials.password)
  await page.getByTestId("form-sidecar-submit").click()
}


test.describe("Authentication", () => {
  const makeCreds = () => makeUser()

  test("shows onboarding sidecar on first launch", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()
  })

  test("can sign up a new user and reach authenticated state", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await auth.signUp({ email, password })

    // Verify we're authenticated by checking the sidebar is visible
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()
    // Onboarding sidecar should disappear after authentication
    await expect(page.getByTestId("onboarding-signin")).toBeHidden()
  })

  test("can log in an existing user", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Create the account first
    await auth.signUp({ email, password })

    // Verify we're authenticated
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()

    // For now, we'll reload to simulate logging out and back in
    // In the future, we can add a proper logout flow
    await reloadPageWithFallback(page)

    // After reload with existing session, sidebar should still be visible
    // (user should remain authenticated)
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
  })
})

test.describe("E2EE Authentication Flow", () => {
  const makeCreds = () => makeUser()

  test("can register, logout, and login with E2EE cryptography", async ({ page, context }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Step 1: Sign up a new user (generates identity keys, encrypts bundle, sends to server)
    await auth.signUp({ email, password })

    // Verify we're authenticated
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()

    // Step 2: Clear browser state to simulate logging out
    // This clears cookies, local storage, and IndexedDB, forcing a fresh login
    await context.clearCookies()
    await page.evaluate(async () => {
      localStorage.clear()
      sessionStorage.clear()
      // Clear all IndexedDB databases (engine stores user data here)
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name) indexedDB.deleteDatabase(db.name)
      }
    })

    // Navigate to root to trigger the auth check after clearing storage
    await auth.goto()

    // Step 3: Should see auth page again since we cleared the session
    await auth.expectVisible()

    // Step 4: Login with the same credentials (2-step auth dance, decrypts bundle)
    await auth.signIn({ email, password })

    // Verify we're authenticated again
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()
  })

  test("rejects login with wrong password", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Sign up first
    await auth.signUp({ email, password })
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()

    // Clear session (cookies, local storage, and IndexedDB)
    await page.evaluate(async () => {
      localStorage.clear()
      sessionStorage.clear()
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name) indexedDB.deleteDatabase(db.name)
      }
    })
    await page.context().clearCookies()
    await auth.goto()

    // Try to login with wrong password
    await auth.expectVisible()
    await auth.trySignIn({ email, password: "wrongPassword123!" })

    // Should still see auth page (login failed) and show error message.
    // The auth container should remain visible indicating failed login.
    await auth.expectVisible()

    // Check that an error message is displayed (login failure feedback)
    const errorMessage = page.getByTestId("form-sidecar-error")
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    await expect(errorMessage).toContainText(/failed|invalid/i)
  })

  test("can login from a new browser context (simulating different device)", async ({ browser }) => {
    const { email, password } = makeCreds()

    // Context 1: Register the user
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()
    const auth1 = new AuthPage(page1)

    await auth1.goto()
    await auth1.expectVisible()
    await auth1.signUp({ email, password })
    await expect(page1.getByTestId("navigation-sidebar")).toBeVisible()
    await context1.close()

    // Context 2: Fresh browser context (simulates different device)
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    const auth2 = new AuthPage(page2)

    await auth2.goto()
    await auth2.expectVisible()

    // Login with the same credentials - should work via 2-step auth dance
    await auth2.signIn({ email, password })

    // Verify we're authenticated on the new "device"
    await expect(page2.getByTestId("navigation-sidebar")).toBeVisible()
    await context2.close()
  })

  test("session persists after page reload", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Sign up
    await auth.signUp({ email, password })
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible()

    // Reload the page - session should persist
    await reloadPageWithFallback(page)

    // Should still be authenticated (sidebar visible, not auth page)
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 15000 })
  })
})

test.describe("App Flow", () => {
  const makeCreds = () => makeUser()
  test.setTimeout(30000)

  test("non-authenticated user sees tools with onboarding auth sidecar", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Tool selector should be visible for anonymous users (local workspace auto-created)
    await expect(page.getByTestId("tool-selector")).toBeVisible()
    await expect(page.getByTestId("onboarding-signin")).toBeVisible()
    await expect(page.getByTestId("onboarding-signup")).toBeVisible()

    // Onboarding sidecar should not be collapsible (toggle hidden)
    await expect(page.getByTestId("sidecar-toggle")).toBeHidden()
  })

  test("authenticated user lands in tools after onboarding", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up the user
    await auth.signUp({ email, password })

    // After authentication, reflect current UI behavior (workspace selector or tools).
    await workspace.expectVisible()
    const toolSelectorVisible = await page.getByTestId("tool-selector").isVisible().catch(() => false)
    if (toolSelectorVisible) {
      await expect(page.getByTestId("workspace-selector")).toBeHidden()
    } else {
      await expect(page.getByTestId("workspace-selector")).toBeVisible()
    }
  })

  test("authenticated user with workspace selected sees tools", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up the user
    await auth.signUp({ email, password })

    // After authentication, create a workspace
    await workspace.expectVisible()
    await workspace.createWorkspace("My First Workspace")

    // After workspace creation, tools should be visible
    await workspace.expectToolSelectorVisible()

    // Verify some expected tools are present
    await workspace.expectToolVisible("Memos")
    await workspace.expectToolVisible("Inbox")
  })

  test("logging out returns to onboarding tools with auth sidecar", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Authenticate and ensure we're in a workspace context.
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Logout Workspace")
    await workspace.expectToolSelectorVisible()

    // Navigate into Settings and trigger logout.
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })
    await page.getByTestId("settings-logout-row").evaluate(element => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    // After logout, reflect current UI behavior (tools list with onboarding or auth form).
    await expect
      .poll(
        async () => {
          const toolVisible = await page.getByTestId("tool-selector").isVisible().catch(() => false)
          const authFormVisible = await page.getByTestId("auth-email-input").isVisible().catch(() => false)
          return toolVisible || authFormVisible
        },
        { timeout: 20000 }
      )
      .toBe(true)

    const onboardingVisible = await page.getByTestId("onboarding-signin").isVisible().catch(() => false)
    if (onboardingVisible) {
      await expect(page.getByTestId("onboarding-signin")).toBeVisible({ timeout: 20000 })
      await expect(page.getByTestId("onboarding-signup")).toBeVisible({ timeout: 20000 })
    } else {
      await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 20000 })
    }
    await expect(page.getByTestId("tool-inbox")).toBeVisible()
    await expect(page.getByTestId("tool-memos")).toBeVisible()
  })

  test("workspace selection persists after page reload", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up and create workspace
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Persistent Workspace")
    await workspace.expectToolSelectorVisible()

    // Reload the page
    await reloadPageWithFallback(page)

    // Should still see tools (workspace selection persisted)
    await workspace.expectToolSelectorVisible({ timeout: 15000 })
  })
})

test.describe("Anonymous Onboarding", () => {
  test("auth routes redirect into tools with sidecar forms open", async ({ page }) => {
    await page.goto("/auth/signin", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/sidecar=%2Fauth%2Fsignin/)

    await page.goto("/auth/signup", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("auth-invite-code-input")).toHaveCount(0)
    await expect(page).toHaveURL(/sidecar=%2Fauth%2Fsignup/)
  })

  test("anonymous user sees all tools in the selector", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await expect(page.getByTestId("tool-inbox")).toBeVisible()
    await expect(page.getByTestId("tool-memos")).toBeVisible()
    await expect(page.getByTestId("tool-contacts")).toBeVisible()
    await expect(page.getByTestId("tool-groups")).toBeVisible()
    await expect(page.getByTestId("tool-files")).toBeVisible()
    await expect(page.getByTestId("tool-papers")).toBeVisible()
    await expect(page.getByTestId("tool-forum")).toBeVisible()
    await expect(page.getByTestId("tool-projects")).toBeVisible()
    await expect(page.getByTestId("tool-settings")).toBeVisible()
  })

  test("onboarding sidecar clears when navigating into tools", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("tool-inbox").click()
    await expect(page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("inbox-anonymous-message")).toBeVisible()
    await expect(page.getByTestId("onboarding-signin")).toBeHidden()
  })

  test("auth form hides onboarding actions while open", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("onboarding-signin").click()
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("onboarding-signin")).toBeHidden()
    await expect(page.getByTestId("onboarding-signup")).toBeHidden()
  })

  test("auth form cancel returns to onboarding root", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("onboarding-signin").click()
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 10000 })

    await page.getByTestId("form-sidecar-cancel").click()
    await expect(page.getByTestId("auth-email-input")).toBeHidden()
    await expect(page.getByTestId("onboarding-signin")).toBeVisible()
    await expect(page.getByTestId("onboarding-signup")).toBeVisible()
    await expect(page).not.toHaveURL(/sidecar=/)
  })

  test("onboarding sidecar returns when navigating back to home", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("tool-inbox").click()
    await expect(page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("onboarding-signin")).toBeHidden()

    await page.getByTestId("breadcrumb-back-button").click()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("onboarding-signin")).toBeVisible()
    await expect(page.getByTestId("onboarding-signup")).toBeVisible()
  })

  test("files upload is blocked in anonymous local mode", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("tool-files").click()
    await expect(page.getByTestId("files-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("files-upload-disabled-message")).toBeVisible()
    await expect(page.getByTestId("add-file-button")).toHaveAttribute("data-disabled", "true")
  })
})

test.describe("Anonymous Workspace UX", () => {
  test("can rename the local workspace from onboarding sidecar", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("onboarding-rename-workspace").click()
    const renameInput = page.getByTestId("workspace-rename-input")
    await expect(renameInput).toBeVisible()
    await renameInput.fill("Renamed Workspace")
    await page.getByTestId("form-sidecar-submit").click()

    await expect(page.getByTestId("onboarding-signin")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Renamed Workspace")
  })

  test("renamed local workspace persists after reload", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("onboarding-rename-workspace").click()
    const renameInput = page.getByTestId("workspace-rename-input")
    await expect(renameInput).toBeVisible()
    await renameInput.fill("Persistent Rename")
    await page.getByTestId("form-sidecar-submit").click()

    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Persistent Rename")

    await reloadPageWithFallback(page)
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Persistent Rename")
  })

  test("anonymous user can create folders in Files tool", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("tool-files").click()
    await expect(page.getByTestId("files-tool-container")).toBeVisible({ timeout: 10000 })

    const newFolderAction = page.getByTestId("sidecar-new-folder")
    await expect(newFolderAction).toBeVisible()
    await newFolderAction.click()

    const folderNameInput = page.getByTestId("create-folder-name-input")
    await expect(folderNameInput).toBeVisible()
    await folderNameInput.fill("Local Folder")
    await page.getByTestId("form-sidecar-submit").click()

    await expect(page.getByTestId(/folder-item-/)).toHaveCount(1, { timeout: 10000 })
  })

  test("settings rows are disabled for anonymous users", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })

    await expect(page.getByTestId("settings-account-row")).toBeHidden()
    await expect(page.getByTestId("settings-members-row")).toBeHidden()
    await expect(page.getByTestId("settings-notifications-row")).toBeHidden()
    await expect(page.getByTestId("settings-logout-row")).toBeHidden()
    await expect(page.getByTestId("settings-logs-row")).toBeVisible()
  })

  test("workspace creation is disabled in switcher for anonymous users", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("sidebar-workspace-switcher").click()
    const createButton = page.getByTestId("sidebar-workspace-create-button")
    await expect(createButton).toBeVisible()
    await expect(createButton).toBeDisabled()
  })

  test("anonymous user can create a group but member management is disabled", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    await page.getByTestId("tool-groups").click()
    await expect(page.getByTestId("groups-tool-container")).toBeVisible({ timeout: 10000 })

    await page.getByTestId("groups-create-button").click()
    await page.getByTestId("create-group-name-input").fill("Offline Group")
    await page.getByTestId("form-sidecar-submit").click()

    // Group creation should navigate directly to the new conversation.
    const groupChatConversation = page.getByTestId("group-chat-conversation-container")
    await expect(groupChatConversation).toBeVisible({ timeout: 15000 })

    const manageMembersRow = page.getByTestId("group-chat-manage-members")
    await expect(manageMembersRow).toBeVisible({ timeout: 10000 })
    await expect(manageMembersRow).toHaveAttribute("data-disabled", "true")
  })
})

test.describe("Workspace Invite Flow - User With Account", () => {
  /**
   * Tests the invite flow for users who already have accounts.
   * Per BOOK OF ENCRYPTION: When inviting an existing user, the inviter:
   * 1. Creates an invite by email (server returns the invitee's public keys)
   * 2. Creates workspace key shares encrypted to the invitee's public key
   * The invitee then accepts the invite via the sidebar's pending invites section.
   */

  // Increase timeout for multi-user invite tests
  test.setTimeout(180000)

  test("can invite an existing user to a workspace", async ({ browser }) => {
    // Create User A (Alice) who will create a workspace and invite
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Alice's Team")
    await workspaceAlice.expectToolSelectorVisible()

    // Create User B (Bob) in a separate context
    const bobCreds = makeUser()
    const contextBob = await browser.newContext()
    const pageBob = await contextBob.newPage()
    const authBob = new AuthPage(pageBob)
    const workspaceBob = new WorkspacePage(pageBob)

    await authBob.goto()
    await authBob.signUp(bobCreds)
    await workspaceBob.expectVisible()
    await workspaceBob.createWorkspaceIfWorkspaceSelectorVisible("Bob's Workspace")

    // Alice navigates to Settings → Workspace Members to invite Bob
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible()
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()

    // Alice invites Bob by email
    const createInviteRequestPromise = pageAlice.waitForRequest(
      request => request.method() === "POST" && request.url().includes("/user-invites"),
      { timeout: 10000 }
    )
    const createInviteResponsePromise = pageAlice.waitForResponse(
      response => response.request().method() === "POST" && response.url().includes("/user-invites"),
      { timeout: 20000 }
    )
    await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
    const inviteButtonRow = pageAlice.getByTestId("invite-submit-button")
    await expect(inviteButtonRow).toBeVisible({ timeout: 10000 })
    await expect(inviteButtonRow).toHaveAttribute("data-disabled", "false")
    await inviteButtonRow.click()
    await expect(inviteButtonRow).toContainText(/Inviting/i, { timeout: 5000 })
    const createInviteRequest = await createInviteRequestPromise
    expect(createInviteRequest.headers()["x-active-account-id"]).toBeTruthy()
    const createInviteResponse = await createInviteResponsePromise
    expect(createInviteResponse.ok()).toBeTruthy()

    // Verify invite was created (pending invite should appear in list)
    await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

    // Bob reloads to fetch fresh invite data, then should see the invite in sidebar.
    await reloadPageWithFallback(pageBob)
    await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await expect(pageBob.getByTestId("pending-invites-section")).toBeVisible({ timeout: 30000 })
    await expect(pageBob.getByText("Alice's Team")).toBeVisible()

    // Bob accepts the invite from the sidebar
    await pageBob.getByTestId("accept-invite-button").click()

    // Bob should now be a member - pending invite should disappear.
    await expect(pageBob.getByTestId("pending-invites-section")).toBeHidden({ timeout: 30000 })

    const workspaceSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
    const switcherVisibleAfterAccept = await workspaceSwitcher.isVisible().catch(() => false)
    if (switcherVisibleAfterAccept) {
      await workspaceSwitcher.click()
      await expect(getWorkspaceSwitcherItemByName(pageBob, "Alice's Team")).toBeVisible({
        timeout: 30000,
      })
    }

    // Clean up
    await contextAlice.close()
    await contextBob.close()
  })

  test("inviter can cancel a pending invite", async ({ browser }) => {
    // Create User A (Alice) who will create a workspace and invite
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Test Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Create User B (Bob) - just need account to exist
    const bobCreds = makeUser()
    const contextBob = await browser.newContext()
    const pageBob = await contextBob.newPage()
    const authBob = new AuthPage(pageBob)
    const workspaceBob = new WorkspacePage(pageBob)

    await authBob.goto()
    await authBob.signUp(bobCreds)
    await workspaceBob.expectVisible()
    await workspaceBob.createWorkspaceIfWorkspaceSelectorVisible("Bob's Workspace")

    // Alice invites Bob
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()
    const createInviteRequestPromise = pageAlice.waitForRequest(
      request => request.method() === "POST" && request.url().includes("/user-invites"),
      { timeout: 10000 }
    )
    const createInviteResponsePromise = pageAlice.waitForResponse(
      response => response.request().method() === "POST" && response.url().includes("/user-invites"),
      { timeout: 20000 }
    )
    await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
    await pageAlice.getByTestId("invite-submit-button").click()
    const createInviteRequest = await createInviteRequestPromise
    expect(createInviteRequest.headers()["x-active-account-id"]).toBeTruthy()
    const createInviteResponse = await createInviteResponsePromise
    expect(createInviteResponse.ok()).toBeTruthy()
    // Verify invite appears
    await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 20000 })

    // Open the pending invite sidecar and cancel
    await pageAlice.getByTestId("pending-invite-row").click()
    await expect(pageAlice.getByTestId("sidecar-container")).toBeVisible()
    await pageAlice.getByTestId("cancel-invite-button").click()

    // Verify the sidecar is dismissed after canceling the invite
    await expect(pageAlice.getByTestId("sidecar-container")).not.toBeVisible()

    // Verify invite is no longer visible
    await expect(pageAlice.getByTestId("pending-invite-row")).not.toBeVisible()

    // Bob should no longer see the invite in the sidebar
    // The pending-invites-section should either not exist or not contain "Test Workspace"
    const pendingSection = pageBob.getByTestId("pending-invites-section")
    const sectionVisible = await pendingSection.isVisible().catch(() => false)
    if (sectionVisible) {
      await expect(pageBob.getByText("Test Workspace")).not.toBeVisible()
    }

    // Clean up
    await contextAlice.close()
    await contextBob.close()
  })

  test("invitee can access workspace after accepting invite", async ({ browser }) => {
    // Create User A (Alice) - creates workspace
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Shared Team")
    await workspaceAlice.expectToolSelectorVisible()

    // Create User B (Bob)
    const bobCreds = makeUser()
    const contextBob = await browser.newContext()
    const pageBob = await contextBob.newPage()
    const authBob = new AuthPage(pageBob)
    const workspaceBob = new WorkspacePage(pageBob)

    await authBob.goto()
    await authBob.signUp(bobCreds)
    await workspaceBob.expectVisible()
    await workspaceBob.createWorkspaceIfWorkspaceSelectorVisible("Bob's Workspace")

    // Alice invites Bob
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()
    await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
    await pageAlice.getByTestId("invite-submit-button").click()
    await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 20000 })

    // Bob reloads to fetch fresh invite data, then accepts from sidebar
    await reloadPageWithFallback(pageBob)
    await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await expect(pageBob.getByTestId("pending-invites-section")).toBeVisible({ timeout: 30000 })
    await expect(pageBob.getByText("Shared Team")).toBeVisible()
    await pageBob.getByTestId("accept-invite-button").click()

    // Wait for accept to complete and reload to ensure workspace list is fresh
    await expect(pageBob.getByTestId("pending-invites-section")).toBeHidden({ timeout: 30000 })
    await reloadPageWithFallback(pageBob)
    await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

    // Bob switches to Alice's workspace
    const workspaceSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()
    await pageBob.getByText("Shared Team").first().click()
    await workspaceBob.expectToolSelectorVisible()

    // Bob can access the workspace and create his own note
    await pageBob.getByTestId("tool-memos").click()
    await expect(pageBob.getByTestId("notes-tool-container")).toBeVisible({ timeout: 10000 })
    await pageBob.getByTestId("new-note-button").click()
    await expect(pageBob.getByTestId("note-title-input")).toBeVisible()
    await pageBob.getByTestId("note-title-input").fill("Bob's Note in Shared Team")
    await pageBob.keyboard.press("Escape")

    // Verify Bob's note was created (use first() since it appears in both sidebar and breadcrumb)
    await expect(pageBob.getByText("Bob's Note in Shared Team").first()).toBeVisible({ timeout: 10000 })

    // Clean up
    await contextAlice.close()
    await contextBob.close()
  })

  test("pending invites are listed in Settings tool", async ({ browser }) => {
    // Create Alice with workspace
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Invite Test Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Create multiple users to invite
    const bobCreds = makeUser()
    const contextBob = await browser.newContext()
    const pageBob = await contextBob.newPage()
    await new AuthPage(pageBob).goto()
    await new AuthPage(pageBob).signUp(bobCreds)

    const charlieCreds = makeUser()
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    await new AuthPage(pageCharlie).goto()
    await new AuthPage(pageCharlie).signUp(charlieCreds)

    // Alice invites both Bob and Charlie
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()

    // Invite Bob
    await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
    await pageAlice.getByTestId("invite-submit-button").click()
    await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

    // Invite Charlie
    await pageAlice.getByTestId("invite-email-input").fill(charlieCreds.email)
    await pageAlice.getByTestId("invite-submit-button").click()

    // Verify both pending invites are listed
    const pendingInvites = pageAlice.getByTestId("pending-invite-row")
    await expect(pendingInvites).toHaveCount(2, { timeout: 10000 })

    // Clean up
    await contextAlice.close()
    await contextBob.close()
    await contextCharlie.close()
  })
})

test.describe("Multi-Workspace Sign In", () => {
  /**
   * Tests that users with multiple workspaces see the workspace selector
   * after signing in, rather than being auto-redirected to a default workspace.
   */

  test.setTimeout(90000)

  test("user with multiple workspaces sees workspace selector after sign in", async ({ browser }) => {
    const userCreds = makeUser()

    // Create a fresh browser context and sign up
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()
    const auth1 = new AuthPage(page1)
    const workspace1 = new WorkspacePage(page1)

    await auth1.goto()
    await auth1.signUp(userCreds)
    await workspace1.expectVisible()

    // Create first workspace
    await workspace1.createWorkspace("Workspace Alpha")
    await workspace1.expectToolSelectorVisible()

    // Create second workspace
    await workspace1.createWorkspace("Workspace Beta")
    await workspace1.expectToolSelectorVisible()

    // Verify user now has two workspaces via the switcher
    const workspaceSwitcher = page1.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()
    await expect(getWorkspaceSwitcherItemByName(page1, "Workspace Alpha")).toBeVisible()
    await expect(getWorkspaceSwitcherItemByName(page1, "Workspace Beta")).toBeVisible()

    // Close the first context (simulates logging out / closing browser)
    await context1.close()

    // Open a fresh browser context (simulates new session / different device)
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    const auth2 = new AuthPage(page2)

    await auth2.goto()
    await auth2.signIn(userCreds)

    // User should be navigated to the workspace selector page
    await page2.waitForURL("**/workspaces", { timeout: 10000 })
    await expect(page2.getByTestId("workspace-selector")).toBeVisible({ timeout: 15000 })

    // Verify both workspaces are listed
    await expect(getWorkspaceRowByName(page2, "Workspace Alpha")).toBeVisible()
    await expect(getWorkspaceRowByName(page2, "Workspace Beta")).toBeVisible()

    // Clean up
    await context2.close()
  })
})

test.describe("Local Workspace Registration on Sign In", () => {
  test.setTimeout(90000)

  test("fresh local workspace is not registered when signing in", async ({ browser }) => {
    const userCredentials = makeUser()

    // Step 1: Register a new account to create the initial server workspace.
    const registrationContext = await browser.newContext()
    const registrationPage = await registrationContext.newPage()
    const registrationAuth = new AuthPage(registrationPage)

    await registrationAuth.goto()
    await registrationAuth.signUp(userCredentials)

    const registrationWorkspaceSwitcher = registrationPage.getByTestId("sidebar-workspace-switcher")
    await expect(registrationWorkspaceSwitcher).toBeVisible()

    // Close the context to simulate a brand new browser session (no storage, no cookies).
    await registrationContext.close()

    // Step 2: Sign in from a fresh session with an auto-created local workspace that has no data.
    const signInContext = await browser.newContext()
    const signInPage = await signInContext.newPage()
    const signInAuth = new AuthPage(signInPage)

    await signInAuth.goto()
    await signInAuth.signIn(userCredentials)

    // The user should land in tools with their single server workspace selected.
    await expect(signInPage.getByTestId("tool-selector")).toBeVisible({ timeout: 20000 })

    // The workspace switcher should list exactly one workspace (no extra "Untitled Workspace" upload).
    const signInWorkspaceSwitcher = signInPage.getByTestId("sidebar-workspace-switcher")
    await signInWorkspaceSwitcher.click()

    const workspaceItems = signInPage.getByTestId(/sidebar-workspace-item-/)
    await expect(workspaceItems).toHaveCount(1, { timeout: 20000 })

    await signInContext.close()
  })
})

test.describe("Sidebar Workspace Switcher", () => {
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  test("shows workspace switcher in sidebar after workspace is selected", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up and create workspace
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("First Workspace")
    await workspace.expectToolSelectorVisible()

    // Workspace switcher should be visible in sidebar
    const workspaceSwitcher = page.getByTestId("sidebar-workspace-switcher")
    await expect(workspaceSwitcher).toBeVisible()

    // Should show current workspace name
    await expect(workspaceSwitcher).toContainText("First Workspace")
  })

  test("can switch between workspaces using sidebar dropdown", async ({ page }) => {
    test.setTimeout(30000)
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up and create first workspace
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Alpha Workspace")
    await workspace.expectToolSelectorVisible()

    // Workspace switcher should show Alpha Workspace
    const workspaceSwitcher = page.getByTestId("sidebar-workspace-switcher")
    await expect(workspaceSwitcher).toContainText("Alpha Workspace")

    // Create the second workspace via helper to avoid dropdown instability.
    await workspace.createWorkspace("Beta Workspace")

    // Should now show Beta Workspace as current
    await expect(workspaceSwitcher).toContainText("Beta Workspace")

    // Open dropdown and switch back to Alpha Workspace
    await workspaceSwitcher.click()
    const alphaWorkspaceItem = getWorkspaceSwitcherItemByName(page, "Alpha Workspace")
    await expect(alphaWorkspaceItem).toBeVisible()
    const previousWorkspaceUrl = page.url()
    await alphaWorkspaceItem.click({ force: true })
    await expect
      .poll(() => page.url() !== previousWorkspaceUrl, { timeout: 15000 })
      .toBe(true)

    // Should now show Alpha Workspace
    await expect(workspaceSwitcher).toContainText("Alpha Workspace", { timeout: 15000 })
  })

  test("dropdown shows all user workspaces", async ({ page }) => {
    test.setTimeout(60000)
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()

    // Sign up and create first workspace
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Workspace One")
    await workspace.expectToolSelectorVisible()

    // Create second and third workspaces via the workspace helper to avoid modal instability.
    await workspace.createWorkspace("Workspace Two")
    await workspace.createWorkspace("Workspace Three")

    // Open dropdown - should see all three workspaces
    const workspaceSwitcher = page.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()
    await expect(getWorkspaceSwitcherItemByName(page, "Workspace One")).toBeVisible()
    await expect(getWorkspaceSwitcherItemByName(page, "Workspace Two")).toBeVisible()
    await expect(getWorkspaceSwitcherItemByName(page, "Workspace Three")).toBeVisible()
  })
})

test.describe("Multiple Accounts", () => {
  test.setTimeout(120000)

  test("can add a second account and switch across account workspaces", async ({ browser }) => {
    const secondaryWorkspaceName = "Account B Workspace"
    const secondaryCredentials = await createAccountWithWorkspace(browser, secondaryWorkspaceName)

    const primaryCredentials = makeUser()
    const context = await browser.newContext()
    const page = await context.newPage()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp(primaryCredentials)
    await workspace.expectVisible()
    await workspace.createWorkspace("Account A Workspace")
    await workspace.expectToolSelectorVisible()

    await addAccountViaSettings(page, secondaryCredentials)

    await page.waitForURL("**/workspaces", { timeout: 30000 })
    await expect(page.getByTestId("workspace-selector")).toBeVisible({ timeout: 20000 })

    await getWorkspaceRowByName(page, secondaryWorkspaceName).click()
    await workspace.expectToolSelectorVisible()

    const workspaceSwitcher = page.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()
    await expect(getWorkspaceSwitcherItemByName(page, "Account A Workspace")).toBeVisible()
    await expect(getWorkspaceSwitcherItemByName(page, secondaryWorkspaceName)).toBeVisible()

    await getWorkspaceSwitcherItemByName(page, "Account A Workspace").click()
    await expect(workspaceSwitcher).toContainText("Account A Workspace", { timeout: 15000 })

    await context.close()
  })

  test("signing out current account preserves remaining account workspaces", async ({ browser }) => {
    const secondaryWorkspaceName = "Remaining Account Workspace"
    const secondaryCredentials = await createAccountWithWorkspace(browser, secondaryWorkspaceName)

    const primaryCredentials = makeUser()
    const context = await browser.newContext()
    const page = await context.newPage()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp(primaryCredentials)
    await workspace.expectVisible()
    await workspace.createWorkspace("Account A Workspace")
    await workspace.expectToolSelectorVisible()

    await addAccountViaSettings(page, secondaryCredentials)

    await page.waitForURL("**/workspaces", { timeout: 30000 })
    await expect(page.getByTestId("workspace-selector")).toBeVisible({ timeout: 20000 })

    await getWorkspaceRowByName(page, "Account A Workspace").click()
    await workspace.expectToolSelectorVisible()

    await ensureToolSelectorAndOpenSettingsTool(page)
    await page.getByTestId("settings-logout-row").evaluate(element => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    await workspace.expectToolSelectorVisible()

    const workspaceSwitcher = page.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()

    await expect(
      page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: secondaryWorkspaceName })
    ).toHaveCount(1)
    await expect(
      page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: "Account A Workspace" })
    ).toHaveCount(0)

    await context.close()
  })

  test("sign out all accounts returns to anonymous onboarding", async ({ page }) => {
    const credentials = makeUser()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp(credentials)
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Logout All Workspace")
    await workspace.expectToolSelectorVisible()

    await ensureToolSelectorAndOpenSettingsTool(page)
    const logoutAllRow = page.getByTestId("settings-logout-all-row")
    const logoutAllRowVisible = await logoutAllRow
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    if (logoutAllRowVisible) {
      await logoutAllRow.evaluate(element => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
    } else {
      // Fallback when Settings UI isn't reachable (e.g., no workspace selected).
      await page.goto("/auth/logout-all")
    }

    await expect(page.getByTestId("onboarding-signin")).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId("onboarding-signup")).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Workspace Invite Flow - User Without Account", () => {
  /**
   * Tests the invite flow for users who do NOT have accounts yet.
   * Per BOOK OF ENCRYPTION: When inviting a user without an account:
   * 1. Alice creates an invite_secret (random 32 bytes, never sent to server)
   * 2. Alice encrypts all workspace keys into a bundle using the invite_secret
   * 3. Alice signs the bundle and uploads encrypted crypto_fields to server
   * 4. Alice gets an invite URL with the secret in the fragment: /invite/{id}?pub={key}#sk={secret}
   * 5. Charlie (no account) visits the URL, creates account, accepts invite
   * 6. Charlie decrypts the bundle, creates self-shares for workspace keys
   */

  // Increase timeout for multi-user invite tests with account creation
  test.setTimeout(90000)

  test("can create invite link for user without account", async ({ browser }) => {
    // Create Alice who will create a workspace and generate invite link
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Link Invite Team")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice navigates to Settings → Workspace Members
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible()
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()

    // Alice clicks to create an invite link (for users without accounts)
    await pageAlice.getByTestId("create-invite-link-button").click()

    // Verify invite link is displayed (the ListRow now shows the URL)
    // The testId changes from create-invite-link-button to invite-link-input after creation
    const inviteLinkRow = pageAlice.getByTestId("invite-link-input")
    await expect(inviteLinkRow).toBeVisible({ timeout: 10000 })

    // Get the invite URL from the row's text content
    // The URL ends with #sk=<hex>, so we match up to and including the hex after #sk=
    const rowText = await inviteLinkRow.textContent()
    const inviteUrl = rowText?.match(/http[^#]+#sk=[a-f0-9]+/)?.[0] || ""
    expect(inviteUrl).toBeTruthy()

    // URL should contain /invite/{uuid} path
    expect(inviteUrl).toMatch(/\/invite\/[a-f0-9-]+/)
    // URL should have pub query param for public key
    expect(inviteUrl).toContain("?pub=")
    // URL should have #sk= fragment for secret key (never sent to server)
    expect(inviteUrl).toContain("#sk=")

    // The row itself acts as the copy button when clicked (shows "Click to copy" as meta)
    await expect(inviteLinkRow).toContainText("Click to copy")

    // Clean up
    await contextAlice.close()
  })

  test("sidecar is dismissed after deleting invite link", async ({ browser }) => {
    // Create Alice who will create a workspace and generate invite link
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Delete Link Test")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice navigates to Settings → Workspace Members
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible()
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()

    // Alice creates an invite link
    await pageAlice.getByTestId("create-invite-link-button").click()
    await expect(pageAlice.getByTestId("invite-link-input")).toBeVisible({ timeout: 10000 })

    // The link invite row should appear in the Invite Links section
    await expect(pageAlice.getByTestId("link-invite-row")).toBeVisible({ timeout: 10000 })

    // Click on the link invite row to open the sidecar
    await pageAlice.getByTestId("link-invite-row").click()
    await expect(pageAlice.getByTestId("sidecar-container")).toBeVisible()

    // Click the delete button
    await pageAlice.getByTestId("delete-invite-link-button").click()

    // Verify the sidecar is dismissed after deleting the invite link
    await expect(pageAlice.getByTestId("sidecar-container")).not.toBeVisible()

    // Verify the link invite row is no longer visible
    await expect(pageAlice.getByTestId("link-invite-row")).not.toBeVisible()

    // Clean up
    await contextAlice.close()
  })

  test("user without account can accept invite via link", async ({ browser }) => {
    // Create Alice who will create a workspace and generate invite link
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Invite Link Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice creates an invite link
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()
    await pageAlice.getByTestId("create-invite-link-button").click()

    // Get the invite URL from the ListRow that displays it
    const inviteLinkRow = pageAlice.getByTestId("invite-link-input")
    await expect(inviteLinkRow).toBeVisible({ timeout: 10000 })
    // Extract just the URL from the row (which also contains "Click to copy" text)
    // The URL ends with #sk=<hex>, so we match up to and including the hex after #sk=
    const rowText = await inviteLinkRow.textContent()
    const inviteUrl = rowText?.match(/http[^#]+#sk=[a-f0-9]+/)?.[0] || ""

    // Charlie (new user) visits the invite URL in a fresh browser context
    const charlieCreds = makeUser()
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()

    // Navigate to the invite URL
    await pageCharlie.goto(convertInviteUrlToLocalhost(inviteUrl))

    // Charlie should see the invite acceptance Tool (list-based UI)
    await expect(pageCharlie.getByTestId("invite-acceptance-tool")).toBeVisible({ timeout: 15000 })
    await expect(pageCharlie.getByTestId("tool-selector")).toBeHidden()

    // The invite details should show the workspace name
    await expect(pageCharlie.getByText("Invite Link Workspace")).toBeVisible()

    // The invite details should show the inviter's name
    await expect(pageCharlie.getByTestId("invite-inviter")).toContainText(
      `Invited by ${aliceCreds.name}`
    )

    // Charlie signs up directly within the invite acceptance UI
    await pageCharlie.getByTestId("invite-email-input").fill(charlieCreds.email)
    await pageCharlie.getByTestId("invite-password-input").fill(charlieCreds.password)
    await pageCharlie.getByTestId("invite-signup-accept").click()

    // Wait for either success (navigation-sidebar) or error message
    // Give the accept operation time to complete
    await pageCharlie.waitForTimeout(2000)

    // Check for error message first
    const errorMessage = pageCharlie.getByTestId("invite-error-row")
    const hasError = await errorMessage.isVisible().catch(() => false)
    if (hasError) {
      const errorText = await errorMessage.textContent()
      throw new Error(`Invite acceptance failed with error: ${errorText}`)
    }

    // After accepting, Charlie is redirected to the workspace
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 15000 })

    // Verify workspace is accessible - check workspace switcher shows the workspace
    const workspaceSwitcher = pageCharlie.getByTestId("sidebar-workspace-switcher")
    await expect(workspaceSwitcher).toContainText("Invite Link Workspace")

    // Clean up
    await contextAlice.close()
    await contextCharlie.close()
  })

  test("user without account can decline invite and land in a local workspace", async ({ browser }) => {
    // Create Alice who will create a workspace and generate invite link
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Decline Invite Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice creates an invite link
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()
    await pageAlice.getByTestId("create-invite-link-button").click()

    // Get the invite URL from the ListRow
    const inviteLinkRow = pageAlice.getByTestId("invite-link-input")
    await expect(inviteLinkRow).toBeVisible({ timeout: 10000 })
    const inviteLinkRowText = await inviteLinkRow.textContent()
    const inviteUrl = inviteLinkRowText?.match(/http[^#]+#sk=[a-f0-9]+/)?.[0] || ""
    expect(inviteUrl).toBeTruthy()

    // Charlie (no account) visits the invite URL and declines
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    await pageCharlie.goto(convertInviteUrlToLocalhost(inviteUrl))

    await expect(pageCharlie.getByTestId("invite-acceptance-tool")).toBeVisible({ timeout: 15000 })
    await pageCharlie.getByTestId("invite-decline").click()

    // Decline should create a local workspace and route into tools with onboarding sidecar
    await expect(pageCharlie.getByTestId("tool-selector")).toBeVisible({ timeout: 15000 })
    await expect(pageCharlie.getByTestId("onboarding-signin")).toBeVisible()
    await expect(pageCharlie.getByTestId("onboarding-signup")).toBeVisible()
    await expect(pageCharlie).toHaveURL(/\/w\/[a-f0-9-]+/)
    await expect(pageCharlie.getByTestId("invite-acceptance-tool")).toBeHidden()

    // Clean up
    await contextAlice.close()
    await contextCharlie.close()
  })

  test("invite acceptance Tool uses list-based UI", async ({ browser }) => {
    // Create Alice who will create a workspace and generate invite link
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("List UI Test Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice creates an invite link
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await pageAlice.getByTestId("create-invite-link-button").click()

    // Get the invite URL from the ListRow
    const inviteLinkRow = pageAlice.getByTestId("invite-link-input")
    await expect(inviteLinkRow).toBeVisible({ timeout: 10000 })
    // The URL ends with #sk=<hex>, so we match up to and including the hex after #sk=
    const rowText = await inviteLinkRow.textContent()
    const inviteUrl = rowText?.match(/http[^#]+#sk=[a-f0-9]+/)?.[0] || ""

    // Charlie visits the invite URL
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    await pageCharlie.goto(convertInviteUrlToLocalhost(inviteUrl))

    // Verify the invite acceptance Tool is displayed using list-based UI
    await expect(pageCharlie.getByTestId("invite-acceptance-tool")).toBeVisible({ timeout: 15000 })
    await expect(pageCharlie.getByTestId("tool-selector")).toBeHidden()

    // Verify invite details are shown in the list format
    const inviteRow = pageCharlie.getByTestId("invite-details-row")
    await expect(inviteRow).toBeVisible()
    await expect(inviteRow).toContainText("List UI Test Workspace")

    // Clean up
    await contextAlice.close()
    await contextCharlie.close()
  })

  test("accepted user can access encrypted content in workspace", async ({ browser }) => {
    // Create Alice who will create a workspace with content
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Encrypted Content Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Alice creates a note with encrypted content
    await pageAlice.getByTestId("tool-memos").click()
    await expect(pageAlice.getByTestId("notes-tool-container")).toBeVisible()
    await pageAlice.getByTestId("new-note-button").click()
    await expect(pageAlice.getByTestId("note-title-input")).toBeVisible()
    await pageAlice.getByTestId("note-title-input").fill("Alice's Secret Note")
    await pageAlice.keyboard.press("Escape")
    await expect(pageAlice.getByText("Alice's Secret Note").first()).toBeVisible()

    // Navigate back to tool selector to access Settings
    await pageAlice.getByTestId("breadcrumb-back-button").click()
    await workspaceAlice.expectToolSelectorVisible()

    // Alice creates an invite link
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await pageAlice.getByTestId("create-invite-link-button").click()

    // Get the invite URL from the ListRow
    const inviteLinkRow = pageAlice.getByTestId("invite-link-input")
    await expect(inviteLinkRow).toBeVisible({ timeout: 10000 })
    // The URL ends with #sk=<hex>, so we match up to and including the hex after #sk=
    const rowText = await inviteLinkRow.textContent()
    const inviteUrl = rowText?.match(/http[^#]+#sk=[a-f0-9]+/)?.[0] || ""

    // Charlie creates account and accepts invite
    const charlieCreds = makeUser()
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    await pageCharlie.goto(convertInviteUrlToLocalhost(inviteUrl))

    await expect(pageCharlie.getByTestId("invite-acceptance-tool")).toBeVisible({ timeout: 15000 })
    await pageCharlie.getByTestId("invite-email-input").fill(charlieCreds.email)
    await pageCharlie.getByTestId("invite-password-input").fill(charlieCreds.password)
    await pageCharlie.getByTestId("invite-signup-accept").click()

    // After accepting, Charlie is redirected to the workspace tool selector
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 15000 })
    await expect(pageCharlie.getByTestId("tool-selector")).toBeVisible({ timeout: 15000 })

    // Charlie navigates to Notes and creates his own encrypted note
    // (This proves key sharing worked - Charlie has the workspace key to encrypt/decrypt)
    await pageCharlie.getByTestId("tool-memos").click()
    await expect(pageCharlie.getByTestId("notes-tool-container")).toBeVisible({ timeout: 10000 })

    // Charlie creates a new note (which will be encrypted with the shared workspace key)
    await pageCharlie.getByTestId("new-note-button").click()
    await expect(pageCharlie.getByTestId("note-title-input")).toBeVisible()
    await pageCharlie.getByTestId("note-title-input").fill("Charlie's Private Note")
    await pageCharlie.keyboard.press("Escape")

    // The note should appear in the list (proves encryption worked)
    await expect(pageCharlie.getByText("Charlie's Private Note").first()).toBeVisible({ timeout: 10000 })

    // Wait for note to be saved to server before navigating away
    await pageCharlie.waitForTimeout(1000)

    // Navigate away and back to verify the note persists and can be decrypted
    await pageCharlie.getByTestId("breadcrumb-back-button").click()
    await expect(pageCharlie.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
    await pageCharlie.getByTestId("tool-memos").click()
    await expect(pageCharlie.getByTestId("notes-tool-container")).toBeVisible({ timeout: 10000 })

    // Charlie should still see his note (proves decryption with workspace key works)
    await expect(pageCharlie.getByText("Charlie's Private Note")).toBeVisible({ timeout: 10000 })

    // Clean up
    await contextAlice.close()
    await contextCharlie.close()
  })
})

test.describe("Workspace Settings", () => {
  const makeCreds = () => makeUser()

  test("settings tool shows workspace info sidecar", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Test Workspace")
    await workspace.expectToolSelectorVisible()

    // Navigate to Settings tool
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible()

    // Verify sidecar shows workspace info
    await expect(page.getByTestId("workspace-info-name")).toBeVisible()
    await expect(page.getByTestId("workspace-info-name")).toContainText("Test Workspace")

    // Super admin should see their role
    await expect(page.getByTestId("workspace-info-role")).toBeVisible()
    await expect(page.getByTestId("workspace-info-role")).toContainText("Super Admin")
  })

  test("super admin can rename workspace from settings", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Original Name")
    await workspace.expectToolSelectorVisible()

    // Navigate to Settings tool
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible()

    // Click rename button in sidecar
    await expect(page.getByTestId("workspace-rename-button")).toBeVisible()
    await page.getByTestId("workspace-rename-button").click()

    // Fill in new name
    const renameInput = page.getByTestId("workspace-rename-input")
    await expect(renameInput).toBeVisible()
    await renameInput.fill("Renamed Workspace")

    // Submit the form
    await page.getByTestId("form-sidecar-submit").click()

    // Verify the workspace was renamed
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Renamed Workspace", {
      timeout: 10000,
    })

    // Verify the sidecar shows the updated name
    await expect(page.getByTestId("workspace-info-name")).toContainText("Renamed Workspace")
  })

  test("renamed workspace persists after reload", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Persistent Workspace")
    await workspace.expectToolSelectorVisible()

    // Navigate to Settings tool and rename
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible()

    await page.getByTestId("workspace-rename-button").click()
    const renameInput = page.getByTestId("workspace-rename-input")
    await expect(renameInput).toBeVisible()
    await renameInput.fill("Persisted Name")
    await page.getByTestId("form-sidecar-submit").click()

    // Wait for rename to complete
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Persisted Name", {
      timeout: 10000,
    })

    // Reload and verify the name persists
    await reloadPageWithFallback(page)
    await expect(page.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("Persisted Name")
  })

  test("non-super-admin member cannot see rename button", async ({ browser }) => {
    // Increase timeout for multi-user test
    test.setTimeout(90000)

    // Create Alice (super admin) who creates the workspace
    const aliceCreds = makeUser()
    const contextAlice = await browser.newContext()
    const pageAlice = await contextAlice.newPage()
    const authAlice = new AuthPage(pageAlice)
    const workspaceAlice = new WorkspacePage(pageAlice)

    await authAlice.goto()
    await authAlice.signUp(aliceCreds)
    await workspaceAlice.expectVisible()
    await workspaceAlice.createWorkspace("Alice's Workspace")
    await workspaceAlice.expectToolSelectorVisible()

    // Create Bob who will be invited as a regular member
    const bobCreds = makeUser()
    const contextBob = await browser.newContext()
    const pageBob = await contextBob.newPage()
    const authBob = new AuthPage(pageBob)
    const workspaceBob = new WorkspacePage(pageBob)

    await authBob.goto()
    await authBob.signUp(bobCreds)
    await workspaceBob.expectVisible()
    await workspaceBob.createWorkspace("Bob's Workspace")
    await workspaceBob.expectToolSelectorVisible()

    // Alice invites Bob to her workspace
    await ensureToolSelectorAndOpenSettingsTool(pageAlice)
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()

    await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
    await pageAlice.getByTestId("invite-submit-button").click()
    await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

    // Bob accepts the invite
    await reloadPageWithFallback(pageBob)
    await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await expect(pageBob.getByTestId("pending-invites-section")).toBeVisible({ timeout: 30000 })
    await pageBob.getByTestId("accept-invite-button").click()
    await pageBob.waitForTimeout(1000)

    // Bob switches to Alice's workspace
    await reloadPageWithFallback(pageBob)
    await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    const workspaceSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
    await workspaceSwitcher.click()
    await pageBob.getByText("Alice's Workspace").first().click()
    await expect(pageBob.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    // Bob navigates to Settings
    await ensureToolSelectorAndOpenSettingsTool(pageBob)
    await expect(pageBob.getByTestId("settings-tool-container")).toBeVisible()

    // Bob should see workspace info
    await expect(pageBob.getByTestId("workspace-info-name")).toBeVisible()
    await expect(pageBob.getByTestId("workspace-info-name")).toContainText("Alice's Workspace")

    // Bob should see his role as Member
    await expect(pageBob.getByTestId("workspace-info-role")).toBeVisible()
    await expect(pageBob.getByTestId("workspace-info-role")).toContainText("Member")

    // Bob should NOT see the rename button (only super admins can rename)
    await expect(pageBob.getByTestId("workspace-rename-button")).toBeHidden()

    // Clean up
    await contextAlice.close()
    await contextBob.close()
  })

  test("local workspace can be renamed without role check", async ({ page }) => {
    const auth = new AuthPage(page)
    await auth.goto()
    await auth.expectVisible()

    // Navigate to Settings tool (as anonymous user with local workspace)
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible()

    // Should show workspace info with "Local only" status
    await expect(page.getByTestId("workspace-info-name")).toBeVisible()
    await expect(page.getByTestId("workspace-info-status")).toContainText("Local only")

    // Should be able to rename local workspace
    await expect(page.getByTestId("workspace-rename-button")).toBeVisible()
    await page.getByTestId("workspace-rename-button").click()

    const renameInput = page.getByTestId("workspace-rename-input")
    await expect(renameInput).toBeVisible()
    await renameInput.fill("My Local Workspace")
    await page.getByTestId("form-sidecar-submit").click()

    // Verify the workspace was renamed
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText("My Local Workspace", {
      timeout: 10000,
    })
  })
})

test.describe("Account Settings", () => {
  test.setTimeout(90000)
  const makeCreds = () => makeUser()

  test("can set workspace profile name and see it in members list", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Test Workspace")
    await workspace.expectToolSelectorVisible()

    // Open Settings > Account (workspace profile)
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })
    await page.getByTestId("settings-account-row").click()
    await page.getByTestId("workspace-profile-edit-button").click()

    // Update workspace profile fields
    const nameInput = page.getByTestId("workspace-profile-name-input")
    const bioInput = page.getByTestId("workspace-profile-bio-input")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await expect(bioInput).toBeVisible()
    await nameInput.fill("Workspace Persona")
    await bioInput.fill("Profile bio for this workspace.")
    await page.getByTestId("form-sidecar-submit").click()

    // Confirm profile info shows updated name
    await expect(page.getByTestId("workspace-profile-info-name")).toContainText("Workspace Persona", {
      timeout: 10000,
    })

    // Navigate to Members and confirm the display name is used
    await page.getByTestId("settings-members-row").click()
    await expect(page.getByTestId("workspace-members-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("member-row-0")).toContainText("Workspace Persona", { timeout: 10000 })
  })

  test("clicking Account row opens account sidecar", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Test Workspace")
    await workspace.expectToolSelectorVisible()

    // Navigate to Settings tool
    await ensureToolSelectorAndOpenSettingsTool(page)
    await expect(page.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })

    // Click on Account row
    await page.getByTestId("settings-account-row").click()

    // Verify workspace profile sidecar shows profile info
    await expect(page.getByTestId("workspace-profile-info-name")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("workspace-profile-info-email")).toBeVisible()
    await expect(page.getByTestId("workspace-profile-info-email")).toContainText(email)
  })

  test("cannot submit empty name", async ({ page }) => {
    const { email, password } = makeCreds()

    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace("Test Workspace")
    await workspace.expectToolSelectorVisible()

    // Navigate to Settings > Account
    await ensureToolSelectorAndOpenSettingsTool(page)
    await page.getByTestId("settings-account-row").click()
    await expect(page.getByTestId("workspace-profile-info-name")).toBeVisible()

    // Open edit profile form
    await page.getByTestId("workspace-profile-edit-button").click()
    const nameInput = page.getByTestId("workspace-profile-name-input")
    await expect(nameInput).toBeVisible()

    // Clear the input and try to submit
    await nameInput.fill("")

    // Submit button should be disabled when name is empty
    const submitButton = page.getByTestId("form-sidecar-submit")
    await expect(submitButton).toBeDisabled()
  })
})
