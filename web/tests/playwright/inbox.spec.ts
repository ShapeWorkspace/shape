import { test, expect, Page, Browser } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { TasksPage } from "./pages/tasks-page"
import { ContactsPage } from "./pages/contacts-page"
import { FilesPage } from "./pages/files-page"
import { ForumsPage } from "./pages/forums-page"
import { makeUser } from "./utils/test-data"

// Notification flows are stateful; run serially to reduce invite/auth flakes.
test.describe.configure({ mode: "serial", timeout: 120000 })

test.describe("Notifications - Inbox", () => {
  /**
   * Helper to resolve a workspace switcher item by visible name while anchoring on test IDs.
   */
  const getWorkspaceSwitcherItemByName = (page: Page, name: string) =>
    page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name }).first()

  /**
   * Helper to set up two users in the same workspace for notification tests.
   * Uses test IDs to drive the invite flow end-to-end.
   */
  async function setupTwoUsersForNotifications(browser: Browser, workspaceName: string) {
    // Use a unique workspace name to avoid conflicts with default "Untitled Workspace"
    const uniqueWorkspaceName = `${workspaceName} ${Date.now()}`
    const aliceCredentials = makeUser()
    const bobCredentials = makeUser()

    const aliceContext = await browser.newContext()
    const alicePage = await aliceContext.newPage()
    const aliceAuth = new AuthPage(alicePage)
    const aliceWorkspace = new WorkspacePage(alicePage)
    const aliceContacts = new ContactsPage(alicePage)

    const reloadPageSafely = async (page: Page) => {
      const currentUrl = page.url()
      try {
        await page.reload({ waitUntil: "domcontentloaded" })
      } catch {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded" })
      }
    }

    await aliceAuth.goto()
    await aliceAuth.signUp(aliceCredentials)
    await aliceWorkspace.expectVisible()

    // Explicitly create a new workspace with a unique name.
    // This avoids conflicts with default "Untitled Workspace" that both users may have.
    await aliceWorkspace.createWorkspace(uniqueWorkspaceName)
    const resolvedWorkspaceName = uniqueWorkspaceName

    // Verify Alice is in the newly created workspace
    await expect(alicePage.getByTestId("sidebar-workspace-switcher")).toContainText(resolvedWorkspaceName, {
      timeout: 10000,
    })

    const bobContext = await browser.newContext()
    const bobPage = await bobContext.newPage()
    const bobAuth = new AuthPage(bobPage)
    const bobWorkspace = new WorkspacePage(bobPage)

    await bobAuth.goto()
    await bobAuth.signUp(bobCredentials)
    await bobWorkspace.expectVisible()
    const bobToolSelectorVisible = await bobPage.getByTestId("tool-selector").isVisible().catch(() => false)
    if (!bobToolSelectorVisible) {
      const existingWorkspaceRow = bobPage.getByTestId(/workspace-row-/).first()
      let hasExistingWorkspace = false
      for (let attempt = 0; attempt < 5; attempt++) {
        hasExistingWorkspace = await existingWorkspaceRow.isVisible().catch(() => false)
        if (hasExistingWorkspace) {
          break
        }
        await bobPage.waitForTimeout(500)
      }
      if (hasExistingWorkspace) {
        await existingWorkspaceRow.click()
        await bobWorkspace.expectToolSelectorVisible()
      } else {
        await bobWorkspace.createWorkspace("Bob Notifications Workspace")
        await bobWorkspace.expectToolSelectorVisible()
      }
    }

    // Alice invites Bob via Workspace Members.
    await aliceWorkspace.ensureToolSelectorVisible()
    await alicePage.getByTestId("tool-settings").click()
    await expect(alicePage.getByTestId("settings-tool-container")).toBeVisible()
    await alicePage.getByTestId("settings-members-row").click()
    await expect(alicePage.getByTestId("workspace-members-tool-container")).toBeVisible()
    await alicePage.getByTestId("invite-email-input").fill(bobCredentials.email)
    await alicePage.getByTestId("invite-submit-button").click()
    let pendingInviteVisible = await alicePage.getByTestId("pending-invite-row").isVisible().catch(() => false)
    if (!pendingInviteVisible) {
      try {
        await expect.poll(
          async () => alicePage.getByTestId("pending-invite-row").isVisible().catch(() => false),
          { timeout: 15000 }
        ).toBe(true)
        pendingInviteVisible = true
      } catch {
        pendingInviteVisible = false
      }
    }
    if (!pendingInviteVisible) {
      await reloadPageSafely(alicePage)
      await expect(alicePage.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
      await aliceWorkspace.ensureToolSelectorVisible()
      await alicePage.getByTestId("tool-settings").click()
      await expect(alicePage.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })
      await alicePage.getByTestId("settings-members-row").click()
      await expect(alicePage.getByTestId("workspace-members-tool-container")).toBeVisible({ timeout: 10000 })
    }
    await expect(alicePage.getByTestId("pending-invite-row")).toBeVisible({ timeout: 20000 })

    // Return Alice to the tool selector so later navigation is consistent.
    await alicePage.getByTestId("breadcrumb-back-button").click()
    await expect(alicePage.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    // Bob accepts the invite from the sidebar.
    await reloadPageSafely(bobPage)
    await expect(bobPage.getByTestId("pending-invites-section")).toBeVisible({ timeout: 10000 })
    await bobPage.getByTestId("accept-invite-button").click()
    await reloadPageSafely(bobPage)
    await expect(bobPage.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    // Bob switches to the shared workspace.
    await bobPage.getByTestId("sidebar-workspace-switcher").click()
    await getWorkspaceSwitcherItemByName(bobPage, resolvedWorkspaceName).click()
    await expect(bobPage.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    // Reload Alice so member caches include Bob.
    await reloadPageSafely(alicePage)
    await expect(alicePage.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    return {
      alice: {
        context: aliceContext,
        page: alicePage,
        contacts: aliceContacts,
        credentials: aliceCredentials,
      },
      bob: {
        context: bobContext,
        page: bobPage,
        credentials: bobCredentials,
      },
    }
  }

  /**
   * Resolve a workspace member ID by scanning the contacts list for the email.
   */
  async function resolveWorkspaceMemberIdByEmail(page: Page, email: string): Promise<string> {
    const members = page.locator('[data-testid^="workspace-member-"]')
    await expect(members.first()).toBeVisible({ timeout: 10000 })

    const count = await members.count()
    for (let i = 0; i < count; i++) {
      const member = members.nth(i)
      const text = (await member.textContent()) ?? ""
      if (text.includes(email)) {
        const testId = await member.getAttribute("data-testid")
        expect(testId).toBeTruthy()
        return (testId ?? "").replace("workspace-member-", "")
      }
    }

    throw new Error(`Unable to find workspace member row for ${email}.`)
  }

  /**
   * Open the inbox tool for the active workspace.
   */
  async function openInboxForWorkspace(page: Page): Promise<void> {
    const inboxContainer = page.getByTestId("inbox-tool-container")
    if (await inboxContainer.isVisible().catch(() => false)) {
      return
    }

    const workspaceId = page.url().match(/\/w\/([^/?#]+)/)?.[1]
    if (workspaceId) {
      await page.goto(`/w/${workspaceId}/inbox`, { waitUntil: "domcontentloaded" })
      await expect(inboxContainer).toBeVisible({ timeout: 15000 })
      return
    }

    const inboxButton = page.getByTestId("tool-inbox")
    await expect(inboxButton).toBeVisible({ timeout: 15000 })
    await inboxButton.scrollIntoViewIfNeeded()
    await inboxButton.click()
    await expect(inboxContainer).toBeVisible({ timeout: 15000 })
  }

  /**
   * Wait for at least one notification row to appear in the inbox list.
   */
  async function waitForInboxNotifications(page: Page) {
    const notificationRows = page.getByTestId(/inbox-notification-row-/)
    const timeoutAt = Date.now() + 30000

    while (Date.now() < timeoutAt) {
      await openInboxForWorkspace(page)
      const count = await notificationRows.count()
      if (count > 0) {
        return notificationRows
      }
      await page.waitForTimeout(500)
    }

    throw new Error("Timed out waiting for inbox notification rows")
  }

  /**
   * Helper to create a workspace with a single project + task for subscription toggling.
   */
  async function setupWorkspaceWithTaskForSubscriptionToggle(page: Page) {
    const subscriptionToggleCredentials = makeUser()
    const authPage = new AuthPage(page)
    const workspacePage = new WorkspacePage(page)
    const tasksPage = new TasksPage(page)

    await authPage.goto()
    await authPage.signUp(subscriptionToggleCredentials)
    await workspacePage.createWorkspaceIfWorkspaceSelectorVisible("Notification Subscription Workspace")
    await workspacePage.ensureToolSelectorVisible()
    await tasksPage.navigateToTasks()
    await tasksPage.createProject("Subscription Project")
    await tasksPage.createTask("Subscription Task")

    return { tasksPage }
  }

  test("inbox marks unread notifications as read and navigates on selection", async ({ browser }) => {
    test.setTimeout(90000)

    const workspaceName = "Notifications Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Alice opens Bob's DM and sends a message to generate a notification.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()

    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)

    await alice.page.getByTestId(`workspace-member-${bobMemberId}`).click()
    await expect(alice.page.getByTestId("dm-conversation-container")).toBeVisible()
    await alice.page.getByTestId("dm-composer-editor").click()
    await alice.page.keyboard.type("Ping from Alice")
    await alice.page.getByTestId("dm-composer-editor-send").click()

    // Bob opens inbox and should see an unread notification + mark-all row.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
    const notificationRows = await waitForInboxNotifications(bob.page)
    await expect(bob.page.getByTestId("inbox-mark-all-read")).toBeVisible({ timeout: 15000 })
    await expect(notificationRows.first()).toBeVisible({ timeout: 15000 })

    // Mark all as read and verify the unread state clears.
    await bob.page.getByTestId("inbox-mark-all-read").click()
    await expect(bob.page.getByTestId("inbox-mark-all-read")).not.toBeVisible({ timeout: 15000 })
    await expect(notificationRows.first()).toHaveAttribute("data-unread", "false")

    // Alice sends a second DM so Bob gets a fresh unread notification.
    await alice.page.getByTestId("dm-composer-editor").click()
    await alice.page.keyboard.type("Second ping")
    await alice.page.getByTestId("dm-composer-editor-send").click()

    await openInboxForWorkspace(bob.page)
    await waitForInboxNotifications(bob.page)
    await expect(bob.page.getByTestId("inbox-mark-all-read")).toBeVisible({ timeout: 15000 })
    const refreshedRows = await waitForInboxNotifications(bob.page)
    await expect(refreshedRows.first()).toBeVisible({ timeout: 15000 })

    // Selecting the notification should navigate to the DM conversation view.
    await refreshedRows.first().click()
    await expect(bob.page.getByTestId("dm-conversation-container")).toBeVisible({ timeout: 15000 })

    await alice.context.close()
    await bob.context.close()
  })

  test("breadcrumb home icon shows unread indicator for new notifications", async ({ browser }) => {
    test.setTimeout(90000)

    const workspaceName = "Breadcrumb Notifications Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Generate an unread notification by sending a DM.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()

    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)
    await alice.page.getByTestId(`workspace-member-${bobMemberId}`).click()
    await expect(alice.page.getByTestId("dm-conversation-container")).toBeVisible()
    await alice.page.getByTestId("dm-composer-editor").click()
    await alice.page.keyboard.type("Unread breadcrumb ping")
    await alice.page.getByTestId("dm-composer-editor-send").click()

    // Open any tool to surface the breadcrumb bar and confirm the unread dot is visible.
    await bob.page.getByTestId("tool-contacts").click()
    await expect(bob.page.getByTestId("contacts-tool-container")).toBeVisible({ timeout: 15000 })
    await expect(bob.page.getByTestId("breadcrumb-home-unread-indicator")).toBeVisible({ timeout: 15000 })

    // Mark notifications as read and confirm the indicator clears.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-mark-all-read")).toBeVisible({ timeout: 15000 })
    await bob.page.getByTestId("inbox-mark-all-read").click()
    await expect(bob.page.getByTestId("inbox-mark-all-read")).not.toBeVisible({ timeout: 15000 })

    // Return to a tool view to verify the home icon no longer shows unread state.
    await bob.page.getByTestId("breadcrumb-back-button").click()
    await expect(bob.page.getByTestId("tool-selector")).toBeVisible({ timeout: 15000 })
    await bob.page.getByTestId("tool-contacts").click()
    await expect(bob.page.getByTestId("contacts-tool-container")).toBeVisible({ timeout: 15000 })
    await expect(bob.page.getByTestId("breadcrumb-home-unread-indicator")).toHaveCount(0)

    await alice.context.close()
    await bob.context.close()
  })

  test("subscribe/unsubscribe from task sidecar works", async ({ page }) => {
    test.setTimeout(30000)

    const { tasksPage } = await setupWorkspaceWithTaskForSubscriptionToggle(page)

    // Open task sidecar and verify subscription toggle flips in both directions.
    await tasksPage.openTaskSidecar("Subscription Task")
    const subscriptionToggleRow = page.getByTestId("task-subscription-toggle")
    await expect
      .poll(async () => ((await subscriptionToggleRow.textContent()) ?? "").trim(), { timeout: 10000 })
      .toMatch(/^(Mute|Unmute) notifications$/)

    const initialLabel = ((await subscriptionToggleRow.textContent()) ?? "").trim()
    const toggledLabel =
      initialLabel === "Mute notifications" ? "Unmute notifications" : "Mute notifications"

    // Toggle once and confirm the label flips.
    await subscriptionToggleRow.click()
    await expect(subscriptionToggleRow).toContainText(toggledLabel)

    // Toggle again and confirm it returns to the initial state.
    await subscriptionToggleRow.click()
    await expect(subscriptionToggleRow).toContainText(initialLabel)
  })

  test("notification count collapses for multiple events on same parent", async ({ browser }) => {
    test.setTimeout(90000)

    const workspaceName = "Notifications Collapse Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Alice sends two DMs before Bob opens the inbox to ensure collapse happens server-side.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()

    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)

    await alice.page.getByTestId(`workspace-member-${bobMemberId}`).click()
    await expect(alice.page.getByTestId("dm-conversation-container")).toBeVisible()

    await alice.page.getByTestId("dm-composer-editor").click()
    await alice.page.keyboard.type("First collapsed ping")
    await alice.page.getByTestId("dm-composer-editor-send").click()

    await alice.page.getByTestId("dm-composer-editor").click()
    await alice.page.keyboard.type("Second collapsed ping")
    await alice.page.getByTestId("dm-composer-editor-send").click()

    // Bob should see a single collapsed notification with a "+1 more" suffix.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
    await waitForInboxNotifications(bob.page)
    await expect(bob.page.getByTestId("inbox-mark-all-read")).toBeVisible({ timeout: 15000 })

    const collapsedNotificationRows = bob.page.getByTestId(/inbox-notification-row-/)
    await expect(collapsedNotificationRows).toHaveCount(1)
    await expect(collapsedNotificationRows.first()).toContainText("(+1 more notification)")

    await alice.context.close()
    await bob.context.close()
  })

  test("folder share notification shows actor and folder name", async ({ browser }) => {
    test.setTimeout(90000)

    const workspaceName = "Folder Notifications Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Resolve Bob's user ID for ACL selection.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()
    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)

    // Alice creates and shares a folder with Bob.
    const toolSelector = alice.page.getByTestId("tool-selector")
    if (!(await toolSelector.isVisible())) {
      const backButton = alice.page.getByTestId("breadcrumb-back-button")
      if (await backButton.isVisible().catch(() => false)) {
        await backButton.click()
      }
    }
    await expect(toolSelector).toBeVisible({ timeout: 10000 })
    const files = new FilesPage(alice.page)
    await files.navigateToFiles()
    await files.expectFilesListVisible()
    const folderName = "Shared Inbox Folder"
    await files.createFolder(folderName)
    await files.openFolderByName(folderName)
    await expect(alice.page.getByTestId("folder-manage-members")).toBeVisible({ timeout: 10000 })
    await alice.page.getByTestId("folder-manage-members").click()
    await expect(alice.page.getByTestId("acl-add-members")).toBeVisible({ timeout: 10000 })
    await alice.page.getByTestId("acl-add-members").click()
    await expect(alice.page.getByTestId(`add-subject-member-${bobMemberId}`)).toBeVisible({
      timeout: 10000,
    })
    // Clicking a member immediately adds them as Editor
    await alice.page.getByTestId(`add-subject-member-${bobMemberId}`).click()

    // Bob should see the notification with actor name + folder name.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
    await waitForInboxNotifications(bob.page)
    const folderShareRow = bob.page.locator('[data-testid^="inbox-notification-row-"]').first()
    await expect(folderShareRow).toContainText(alice.credentials.name, { timeout: 15000 })
    await expect(folderShareRow).toContainText(`shared ${folderName}`, { timeout: 15000 })
    await expect(folderShareRow).toContainText(folderName, { timeout: 15000 })

    await alice.context.close()
    await bob.context.close()
  })

  test("task comment notification shows actor and task title", async ({ browser }) => {
    test.setTimeout(90000)

    const workspaceName = "Task Notifications Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Resolve Bob's user ID for ACL selection.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()
    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)

    const tasks = new TasksPage(alice.page)
    await tasks.navigateToTasks()
    await tasks.createProject("Notification Project")
    await tasks.expectProjectSidecarVisible()
    await tasks.openManageMembers()
    await tasks.expectManageMembersSidecarVisible()
    await tasks.openAddMembers()
    // Clicking a member immediately adds them as Editor
    await alice.page.getByTestId(`add-subject-member-${bobMemberId}`).click()

    const taskTitle = "Inbox Task"
    await tasks.createTask(taskTitle)
    await tasks.openTaskSidecar(taskTitle)
    await tasks.addTaskComment("Comment for inbox")
    await tasks.waitForSync()

    // Bob should see a task comment notification with actor + task name.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
    await waitForInboxNotifications(bob.page)
    const commentRow = bob.page
      .locator('[data-testid^="inbox-notification-row-"]')
      .filter({ hasText: "commented on" })
      .first()
    await expect(commentRow).toContainText(alice.credentials.name, { timeout: 15000 })
    await expect(commentRow).toContainText(`commented on ${taskTitle}`, { timeout: 15000 })
    await expect(commentRow).toContainText(taskTitle, { timeout: 15000 })

    await alice.context.close()
    await bob.context.close()
  })

  test("clicking task comment notification shows all task comments", async ({ browser }) => {
    test.setTimeout(120000)

    const workspaceName = "Task Comment Navigation Workspace"
    const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

    // Resolve Bob's user ID for ACL selection.
    await alice.contacts.navigateToContacts()
    await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible()
    const bobMemberId = await resolveWorkspaceMemberIdByEmail(alice.page, bob.credentials.email)

    // Alice creates a project with Bob as a member.
    const tasks = new TasksPage(alice.page)
    await tasks.navigateToTasks()
    await tasks.createProject("All Comments Project")
    await tasks.expectProjectSidecarVisible()
    await tasks.openManageMembers()
    await tasks.expectManageMembersSidecarVisible()
    await tasks.openAddMembers()
    await alice.page.getByTestId(`add-subject-member-${bobMemberId}`).click()

    // Alice creates a task and adds multiple comments.
    const taskTitle = "Multi Comment Task"
    await tasks.createTask(taskTitle)
    await tasks.openTaskSidecar(taskTitle)
    await tasks.addTaskComment("First comment on this task")
    await tasks.addTaskComment("Second comment on this task")
    await tasks.addTaskComment("Third comment on this task")
    await tasks.waitForSync()

    // Verify Alice sees all three comments.
    await tasks.expectTaskCommentVisible("First comment on this task")
    await tasks.expectTaskCommentVisible("Second comment on this task")
    await tasks.expectTaskCommentVisible("Third comment on this task")

    // Bob clicks on the task comment notification from the inbox.
    await openInboxForWorkspace(bob.page)
    await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
    await waitForInboxNotifications(bob.page)
    const commentRow = bob.page
      .locator('[data-testid^="inbox-notification-row-"]')
      .filter({ hasText: "commented on" })
      .first()
    await expect(commentRow).toBeVisible({ timeout: 15000 })
    await commentRow.click()

    // Bob should be navigated to the task detail view.
    await expect(bob.page.getByTestId("task-detail-view")).toBeVisible({ timeout: 15000 })

    // Verify the task title is correct - confirms we're viewing the right task.
    await expect(bob.page.getByRole("heading", { name: taskTitle })).toBeVisible({ timeout: 5000 })

    // Bob should see ALL comments on the task, not just the one from the notification.
    // This tests that clicking a task comment notification properly loads all comments.
    const commentsContainer = bob.page.getByTestId("task-detail-comments")
    await expect(commentsContainer).toBeVisible({ timeout: 15000 })

    // Wait for comments to load. The retry mechanism in useTaskComments handles
    // race conditions during navigation from notifications.
    await expect(commentsContainer).toContainText("First comment", { timeout: 30000 })

    // Verify all 3 comments are present
    await expect(commentsContainer).toContainText("First comment on this task")
    await expect(commentsContainer).toContainText("Second comment on this task")
    await expect(commentsContainer).toContainText("Third comment on this task")

    await alice.context.close()
    await bob.context.close()
  })

  test(
    "discussion reply notification includes the discussion title in the main line",
    async ({ browser }) => {
      test.setTimeout(120000)

      const workspaceName = "Discussion Notifications Workspace"
      const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

      const aliceForums = new ForumsPage(alice.page)
      const bobForums = new ForumsPage(bob.page)

      const channelName = "Inbox Discussion Channel"
      const discussionTitle = "Domain Discussion"

      await aliceForums.navigateToForums()
      await aliceForums.createChannel(channelName)
      await aliceForums.openChannel(channelName)
      await aliceForums.openMembersSidecar()
      await aliceForums.addMemberViaName(bob.credentials.name)
      await aliceForums.expectMemberInSidecar(bob.credentials.name)

      await bobForums.navigateToForums()
      await bobForums.openChannel(channelName)
      const subscriptionToggle = bob.page.getByTestId("forum-channel-subscription-toggle")
      await expect(subscriptionToggle).toBeVisible({ timeout: 10000 })
      const subscriptionText = (await subscriptionToggle.textContent()) ?? ""
      if (subscriptionText.includes("Subscribe")) {
        await subscriptionToggle.click()
        await expect(subscriptionToggle).toContainText("Unsubscribe")
      }

      await aliceForums.createDiscussion(discussionTitle, "Inbox discussion content")
      await aliceForums.sendReply("Reply to trigger inbox notification")
      await aliceForums.waitForSync()

      await bobForums.navigateToForums()
      await bobForums.openChannel(channelName)
      await bobForums.expectDiscussionInList(discussionTitle)

      await openInboxForWorkspace(bob.page)
      await expect(bob.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
      await waitForInboxNotifications(bob.page)
      const replyRow = bob.page
        .locator('[data-testid^="inbox-notification-row-"]')
        .filter({ hasText: discussionTitle })
        .first()
      await expect(replyRow).toContainText(alice.credentials.name, { timeout: 15000 })
      await expect(replyRow).toContainText(`replied to ${discussionTitle}`, { timeout: 15000 })

      await alice.context.close()
      await bob.context.close()
    }
  )

  test(
    "reaction notifications appear in the reactions view without lighting up the inbox",
    async ({ browser }) => {
      test.setTimeout(120000)

      const workspaceName = "Reaction Notifications Workspace"
      const { alice, bob } = await setupTwoUsersForNotifications(browser, workspaceName)

      const bobContacts = new ContactsPage(bob.page)

      await alice.contacts.navigateToContacts()
      await alice.contacts.openConversationWithMember(bob.credentials.name)
      await alice.contacts.sendMessage("Reaction notification message")

      const messageRow = alice.page
        .locator('[data-testid^="dm-message-"]')
        .filter({ hasText: "Reaction notification message" })
        .first()
      await expect(messageRow).toBeVisible({ timeout: 10000 })
      const messageTestId = await messageRow.getAttribute("data-testid")
      expect(messageTestId).toBeTruthy()
      const messageId = (messageTestId ?? "").replace("dm-message-", "")

      await bobContacts.navigateToContacts()
      await bobContacts.openConversationWithMember(alice.credentials.name)
      await bobContacts.expectMessageInConversation("Reaction notification message")
      await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
      await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-0`).click()
      await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).toBeVisible({
        timeout: 10000,
      })
      await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
      await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-1`).click()
      await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-1`)).toBeVisible({
        timeout: 10000,
      })
      await alice.page.waitForTimeout(2000)

      await openInboxForWorkspace(alice.page)
      await expect(alice.page.getByTestId("inbox-tool-container")).toBeVisible({ timeout: 15000 })
      await expect(alice.page.getByTestId("inbox-reactions-row")).toBeVisible({ timeout: 15000 })
      await expect(alice.page.getByTestId("inbox-mark-all-read")).toHaveCount(0)
      await expect(alice.page.getByTestId("inbox-reactions-row")).toContainText("new reaction", {
        timeout: 10000,
      })

      await alice.page.getByTestId("inbox-reactions-row").click()
      await expect(alice.page.getByTestId("inbox-reactions-back")).toBeVisible({ timeout: 10000 })
      await expect(alice.page.getByTestId("inbox-reaction-row-1")).toBeVisible({ timeout: 10000 })
      await expect(alice.page.getByTestId("inbox-reaction-row-2")).toBeVisible({ timeout: 10000 })
      // Reaction history rows should not show unread styling.
      const reactionRow = alice.page.getByTestId("inbox-reaction-row-1")
      await expect(reactionRow).toHaveAttribute("data-unread", "false")

      await reactionRow.click()
      await expect(alice.page.getByTestId("contacts-tool-container")).toBeVisible({ timeout: 15000 })
      await alice.contacts.expectMessageInConversation("Reaction notification message")

      await openInboxForWorkspace(alice.page)
      await expect(alice.page.getByTestId("inbox-reactions-row")).toBeVisible({ timeout: 10000 })
      await expect(alice.page.getByTestId("inbox-reactions-row")).not.toContainText("new reaction", {
        timeout: 10000,
      })

      await alice.context.close()
      await bob.context.close()
    }
  )
})
