import { test, expect, Browser, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { ForumsPage } from "./pages/forums-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

// Forum flows are slower in containerized runs; extend default timeout and avoid parallel flake.
test.describe.configure({ timeout: 60000, mode: "serial" })

/**
 * Helper to resolve a workspace switcher item by visible name while anchoring on test IDs.
 */
const getWorkspaceSwitcherItemByName = (page: Page, name: string) =>
  page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name }).first()

/**
 * Helper to set up a single user with a workspace.
 * Returns page objects and credentials.
 */
async function setupSingleUser(browser: Browser, workspaceName: string = "Forum Test Workspace") {
  const userCreds = makeUser()
  const context = await browser.newContext()
  const page = await context.newPage()
  const auth = new AuthPage(page)
  const workspace = new WorkspacePage(page)
  const forums = new ForumsPage(page)

  await auth.goto()
  await auth.signUp(userCreds)
  await workspace.expectVisible()
  // Prefer existing workspaces (auto-selected or listed) before creating a new one.
  const toolSelectorIsVisible = await page.getByTestId("tool-selector").isVisible().catch(() => false)
  if (!toolSelectorIsVisible) {
    const existingWorkspaceRow = page.getByTestId(/workspace-row-/).first()
    let hasExistingWorkspaceRow = false
    for (let attempt = 0; attempt < 5; attempt++) {
      hasExistingWorkspaceRow = await existingWorkspaceRow.isVisible().catch(() => false)
      if (hasExistingWorkspaceRow) {
        break
      }
      await page.waitForTimeout(500)
    }

    if (hasExistingWorkspaceRow) {
      await existingWorkspaceRow.click()
      await workspace.expectToolSelectorVisible()
    } else {
      await workspace.createWorkspace(workspaceName)
      await workspace.expectToolSelectorVisible()
    }
  }

  return {
    context,
    page,
    auth,
    workspace,
    forums,
    credentials: userCreds,
  }
}

/**
 * Helper to set up two users in the same workspace via invite flow.
 * Returns page objects and credentials for both users.
 * Reused pattern from group-chats.spec.ts.
 */
async function setupTwoUsersInSameWorkspace(
  browser: Browser,
  workspaceName: string = "Shared Forum Workspace"
) {
  // User A (Alice) creates the workspace with a unique name to avoid conflicts
  const uniqueWorkspaceName = `${workspaceName} ${Date.now()}`
  const aliceCreds = makeUser()
  const contextAlice = await browser.newContext()
  const pageAlice = await contextAlice.newPage()
  const authAlice = new AuthPage(pageAlice)
  const workspaceAlice = new WorkspacePage(pageAlice)
  const forumsAlice = new ForumsPage(pageAlice)

  await authAlice.goto()
  await authAlice.signUp(aliceCreds)
  await workspaceAlice.expectVisible()

  // Explicitly create a new workspace with a unique name.
  // This avoids conflicts with default "Untitled Workspace" that both users may have.
  await workspaceAlice.createWorkspace(uniqueWorkspaceName)
  const resolvedWorkspaceName = uniqueWorkspaceName

  // Verify Alice is in the newly created workspace
  await expect(pageAlice.getByTestId("sidebar-workspace-switcher")).toContainText(resolvedWorkspaceName, {
    timeout: 10000,
  })

  // User B (Bob) creates account
  const bobCreds = makeUser()
  const contextBob = await browser.newContext()
  const pageBob = await contextBob.newPage()
  const authBob = new AuthPage(pageBob)
  const workspaceBob = new WorkspacePage(pageBob)
  const forumsBob = new ForumsPage(pageBob)

  await authBob.goto()
  await authBob.signUp(bobCreds)
  await workspaceBob.expectVisible()
  const bobToolSelectorVisible = await pageBob.getByTestId("tool-selector").isVisible().catch(() => false)
  if (!bobToolSelectorVisible) {
    const existingWorkspaceRow = pageBob.getByTestId(/workspace-row-/).first()
    let hasExistingWorkspace = false
    for (let attempt = 0; attempt < 5; attempt++) {
      hasExistingWorkspace = await existingWorkspaceRow.isVisible().catch(() => false)
      if (hasExistingWorkspace) {
        break
      }
      await pageBob.waitForTimeout(500)
    }
    if (hasExistingWorkspace) {
      await existingWorkspaceRow.click()
      await workspaceBob.expectToolSelectorVisible()
    } else {
      await workspaceBob.createWorkspace("Bob's Workspace")
      await workspaceBob.expectToolSelectorVisible()
    }
  }

  // Alice invites Bob by email
  await workspaceAlice.ensureToolSelectorVisible()
  await pageAlice.getByTestId("tool-settings").click()
  await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible()
  await pageAlice.getByTestId("settings-members-row").click()
  await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible()
  await pageAlice.getByTestId("invite-email-input").fill(bobCreds.email)
  await pageAlice.getByTestId("invite-submit-button").click()
  await pageAlice.waitForTimeout(1000)
  let pendingInviteVisible = await pageAlice.getByTestId("pending-invite-row").isVisible().catch(() => false)
  if (!pendingInviteVisible) {
    await pageAlice.reload()
    await expect(pageAlice.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await workspaceAlice.ensureToolSelectorVisible()
    await pageAlice.getByTestId("tool-settings").click()
    await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible({ timeout: 10000 })
  }
  await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 20000 })

  const reloadBobPage = async () => {
    const currentUrl = pageBob.url()
    try {
      // Use domcontentloaded to avoid SSE/polling reload stalls.
      await pageBob.reload({ waitUntil: "domcontentloaded" })
    } catch {
      await pageBob.goto(currentUrl, { waitUntil: "domcontentloaded" })
    }
  }

  // Bob reloads and accepts the invite from sidebar
  await reloadBobPage()
  await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
  await expect(pageBob.getByTestId("pending-invites-section")).toBeVisible({ timeout: 10000 })
  const pendingInviteItem = pageBob
    .getByTestId("pending-invite-item")
    .filter({ hasText: resolvedWorkspaceName })
  await expect(pendingInviteItem).toBeVisible({ timeout: 10000 })
  await pageBob.getByTestId("accept-invite-button").click()
  await pageBob.waitForTimeout(1000)
  await reloadBobPage()
  await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

  // Bob switches to the shared workspace
  const workspaceSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
  await workspaceSwitcher.click()
  await getWorkspaceSwitcherItemByName(pageBob, resolvedWorkspaceName).click()
  await expect(pageBob.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

  // Alice navigates back to tool selector (Home button goes all the way back)
  await pageAlice.getByTestId("breadcrumb-back-button").click()
  await workspaceAlice.expectToolSelectorVisible()

  // Clear window storage and reload Alice to get fresh workspace members list
  await pageAlice.evaluate(() => {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("shape_windows_")) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  })
  await pageAlice.reload()
  await workspaceAlice.expectToolSelectorVisible()

  return {
    alice: {
      context: contextAlice,
      page: pageAlice,
      auth: authAlice,
      workspace: workspaceAlice,
      forums: forumsAlice,
      credentials: aliceCreds,
    },
    bob: {
      context: contextBob,
      page: pageBob,
      auth: authBob,
      workspace: workspaceBob,
      forums: forumsBob,
      credentials: bobCreds,
    },
  }
}

test.describe("Forums - Channel List", () => {
  test("can view channels list and create a new channel", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Forum Channel Test")

    // Navigate to Forums tool
    await forums.navigateToForums()
    await forums.expectChannelsListVisible()

    // Initially no channels should exist
    const initialCount = await forums.getChannelCount()
    expect(initialCount).toBe(0)

    // Create a new channel
    await forums.createChannel("General")

    // Channel should now appear in the list
    await forums.expectChannelInList("General")

    // Clean up
    await context.close()
  })

  test("can open a channel", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Open Channel Test")

    // Create a channel and open it
    await forums.navigateToForums()
    await forums.createChannel("Engineering")
    await forums.openChannel("Engineering")

    // Should see the discussions list
    await forums.expectDiscussionsListVisible()

    // Clean up
    await context.close()
  })

  test("can rename a channel", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Rename Channel Test")

    // Create a channel
    await forums.navigateToForums()
    await forums.createChannel("Old Name")
    await forums.openChannel("Old Name")

    // Rename the channel
    await forums.renameChannel("New Name")

    // Go back to channels list and verify
    await forums.goBackToChannelsList()
    await forums.expectChannelInList("New Name")
    await forums.expectChannelNotInList("Old Name")

    // Clean up
    await context.close()
  })

  test("channel persists after page reload (E2EE roundtrip)", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Channel Persistence Test")

    // Create a channel
    await forums.navigateToForums()
    await forums.createChannel("Persistent Channel")
    await forums.waitForSync()

    // Reload and verify
    await forums.refreshForums()
    await forums.expectChannelInList("Persistent Channel")

    // Clean up
    await context.close()
  })
})

test.describe("Forums - Discussions", () => {
  test("can create a discussion in a channel", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Discussion Create Test")

    // Create a channel and open it
    await forums.navigateToForums()
    await forums.createChannel("Discussion Channel")
    await forums.openChannel("Discussion Channel")

    // Create a discussion
    await forums.createDiscussion("Welcome Thread", "Hello everyone, welcome to the forum!")

    // Should see the discussion view
    await forums.expectDiscussionViewVisible()
    const title = await forums.getDiscussionTitle()
    expect(title).toContain("Welcome Thread")

    // Go back and verify in list
    await forums.goBackToDiscussionsList()
    await forums.expectDiscussionInList("Welcome Thread")

    // Clean up
    await context.close()
  })

  test("discussion persists after page reload (E2EE roundtrip)", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Discussion Persistence Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Persistence Channel")
    await forums.openChannel("Persistence Channel")
    await forums.createDiscussion("Persistent Discussion", "This content should persist.")
    await forums.waitForSync()

    // Reload and verify
    await forums.refreshChannel("Persistence Channel")
    await forums.expectDiscussionInList("Persistent Discussion")

    // Open and verify content
    await forums.openDiscussion("Persistent Discussion")
    const body = await forums.getDiscussionBody()
    expect(body).toContain("This content should persist.")

    // Clean up
    await context.close()
  })

  test("can pin and unpin a discussion", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Pin Discussion Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Pin Test Channel")
    await forums.openChannel("Pin Test Channel")
    await forums.createDiscussion("Pin Me", "This discussion should be pinnable.")

    // Pin the discussion
    await forums.toggleDiscussionPin()

    // Go back and verify pinned
    await forums.goBackToDiscussionsList()
    await forums.expectDiscussionPinned("Pin Me")

    // Unpin
    await forums.openDiscussion("Pin Me")
    await forums.toggleDiscussionPin()

    // Verify unpinned
    await forums.goBackToDiscussionsList()
    await forums.expectDiscussionNotPinned("Pin Me")

    // Clean up
    await context.close()
  })

  test("can archive and unarchive a discussion", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Archive Discussion Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Archive Test Channel")
    await forums.openChannel("Archive Test Channel")
    await forums.createDiscussion("Archive Me", "This discussion should be archivable.")

    // Verify default state
    await forums.expectDiscussionArchivedStatus(false)

    // Archive the discussion
    await forums.toggleDiscussionArchive()
    await forums.expectDiscussionArchivedStatus(true)

    // Archived discussions should be hidden from the main list
    await forums.goBackToDiscussionsList()
    await forums.expectDiscussionNotInList("Archive Me")

    // Expand archived section to reveal archived discussions
    await forums.toggleArchivedDiscussions()
    await forums.expectDiscussionInList("Archive Me")

    // Unarchive the discussion from the archived list
    await forums.openDiscussion("Archive Me")
    await forums.toggleDiscussionArchive()
    await forums.expectDiscussionArchivedStatus(false)

    // Return to list and verify it's visible in active discussions
    await forums.goBackToDiscussionsList()
    await forums.expectDiscussionInList("Archive Me")

    // Clean up
    await context.close()
  })

  test("can edit a discussion", async ({ browser }) => {
    test.setTimeout(180000)

    const { context, forums } = await setupSingleUser(browser, "Edit Discussion Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Edit Test Channel")
    await forums.openChannel("Edit Test Channel")
    await forums.createDiscussion("Original Title", "Original content")

    // Edit the discussion
    await forums.editDiscussion("Updated Title", "Updated content")

    // Verify changes
    const title = await forums.getDiscussionTitle()
    expect(title).toContain("Updated Title")
    const body = await forums.getDiscussionBody()
    expect(body).toContain("Updated content")

    // Clean up
    await context.close()
  })

  test("can delete a discussion", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Delete Discussion Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Delete Test Channel")
    await forums.openChannel("Delete Test Channel")
    await forums.createDiscussion("Delete Me", "This will be deleted.")
    await forums.goBackToDiscussionsList()

    // Verify discussion exists
    await forums.expectDiscussionInList("Delete Me")

    // Delete the discussion
    await forums.openDiscussion("Delete Me")
    await forums.deleteDiscussion()

    // Should be back on discussions list
    await forums.expectDiscussionsListVisible()
    await forums.expectDiscussionNotInList("Delete Me")

    // Clean up
    await context.close()
  })
})

test.describe("Forums - Replies", () => {
  test("can reply to a discussion", async ({ browser }) => {
    test.setTimeout(120000)

    const { context, forums } = await setupSingleUser(browser, "Reply Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Reply Channel")
    await forums.openChannel("Reply Channel")
    await forums.createDiscussion("Reply Thread", "Start of discussion")

    // Send a reply
    await forums.sendReply("This is my first reply!")

    // Verify reply appears
    await forums.expectReplyInDiscussion("This is my first reply!")

    // Clean up
    await context.close()
  })

  test("reply persists after page reload (E2EE roundtrip)", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Reply Persistence Test")

    // Create channel, discussion, and reply
    await forums.navigateToForums()
    await forums.createChannel("Reply Persist Channel")
    await forums.openChannel("Reply Persist Channel")
    await forums.createDiscussion("Reply Persist Thread", "Content")
    await forums.sendReply("Persistent reply content")
    await forums.waitForSync()

    // Reload and verify
    await forums.refreshDiscussion("Reply Persist Channel", "Reply Persist Thread")
    await forums.expectReplyInDiscussion("Persistent reply content")

    // Clean up
    await context.close()
  })

  test("can send multiple replies", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Multiple Replies Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Multi Reply Channel")
    await forums.openChannel("Multi Reply Channel")
    await forums.createDiscussion("Multi Reply Thread", "Discussion start")

    // Send multiple replies
    await forums.sendReply("First reply")
    await forums.sendReply("Second reply")
    await forums.sendReply("Third reply")

    // Verify all replies exist
    await forums.expectReplyInDiscussion("First reply")
    await forums.expectReplyInDiscussion("Second reply")
    await forums.expectReplyInDiscussion("Third reply")

    // Verify count
    const count = await forums.getReplyCount()
    expect(count).toBe(3)

    // Clean up
    await context.close()
  })

  test("can delete own reply", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Delete Reply Test")

    // Create channel, discussion, and reply
    await forums.navigateToForums()
    await forums.createChannel("Delete Reply Channel")
    await forums.openChannel("Delete Reply Channel")
    await forums.createDiscussion("Delete Reply Thread", "Content")
    await forums.sendReply("This reply will be deleted")

    // Verify reply exists
    await forums.expectReplyInDiscussion("This reply will be deleted")

    // Delete the reply
    await forums.deleteReply("This reply will be deleted")

    // Verify reply is gone
    await forums.expectReplyNotInDiscussion("This reply will be deleted")

    // Clean up
    await context.close()
  })

  test("replies are ordered chronologically", async ({ browser }) => {
    test.setTimeout(120000)

    const { context, forums } = await setupSingleUser(browser, "Reply Order Test")

    // Create channel and discussion
    await forums.navigateToForums()
    await forums.createChannel("Order Channel")
    await forums.openChannel("Order Channel")
    await forums.createDiscussion("Order Thread", "Start")

    // Send replies in order
    await forums.sendReply("Reply 1")
    await forums.sendReply("Reply 2")
    await forums.sendReply("Reply 3")

    // Get all replies and verify order
    const replies = await forums.getAllReplyTexts()
    const reply1Index = replies.findIndex(r => r.includes("Reply 1"))
    const reply2Index = replies.findIndex(r => r.includes("Reply 2"))
    const reply3Index = replies.findIndex(r => r.includes("Reply 3"))

    expect(reply1Index).toBeLessThan(reply2Index)
    expect(reply2Index).toBeLessThan(reply3Index)

    // Clean up
    await context.close()
  })
})

test.describe("Forums - Reactions", () => {
  test("can add reactions to discussions and replies", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Forum Reactions Workspace")

    await alice.forums.navigateToForums()
    await alice.forums.createChannel("Reactions Channel")
    await alice.forums.openChannel("Reactions Channel")
    await alice.forums.openMembersSidecar()
    await alice.forums.addMemberViaName(bob.credentials.name)
    await alice.forums.waitForSync()

    await alice.forums.createDiscussion("Reaction Discussion", "Discussion body")
    await alice.forums.sendReply("Reaction reply")
    await alice.forums.waitForSync()

    const discussionReactionBar = alice.page
      .locator('[data-testid^="forum-discussion-"][data-testid$="-reaction-bar"]')
      .first()
    await expect(discussionReactionBar).toBeVisible({ timeout: 10000 })
    const discussionReactionTestId = await discussionReactionBar.getAttribute("data-testid")
    expect(discussionReactionTestId).toBeTruthy()
    const discussionId = (discussionReactionTestId ?? "")
      .replace("forum-discussion-", "")
      .replace("-reaction-bar", "")

    const replyRow = alice.page
      .locator('[data-testid^="forum-reply-"]')
      .filter({ hasText: "Reaction reply" })
      .first()
    await expect(replyRow).toBeVisible({ timeout: 10000 })
    const replyTestId = await replyRow.getAttribute("data-testid")
    expect(replyTestId).toBeTruthy()
    const replyId = (replyTestId ?? "").replace("forum-reply-", "")

    await bob.forums.refreshForums()
    await bob.forums.openChannel("Reactions Channel")
    await bob.forums.openDiscussion("Reaction Discussion")
    await bob.forums.expectReplyInDiscussion("Reaction reply")

    await bob.page.getByTestId(`forum-discussion-${discussionId}-reaction-add`).click()
    await bob.page.getByTestId(`forum-discussion-${discussionId}-reaction-add-quick-2`).click()

    await bob.page.getByTestId(`forum-reply-${replyId}-reaction-add`).click()
    await bob.page.getByTestId(`forum-reply-${replyId}-reaction-add-quick-0`).click()

    await expect(bob.page.getByTestId(`forum-discussion-${discussionId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alice.page.getByTestId(`forum-discussion-${discussionId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })
    await expect(bob.page.getByTestId(`forum-reply-${replyId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alice.page.getByTestId(`forum-reply-${replyId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Forums - Mentions", () => {
  test("shows mention suggestions in discussion and reply editors", async ({ browser }) => {
    test.setTimeout(120000)

    const { context, page, forums, credentials } = await setupSingleUser(browser, "Forum Mentions Workspace")

    await forums.navigateToForums()
    await forums.createChannel("Mentions Channel")
    await forums.openChannel("Mentions Channel")

    await page.getByTestId("new-discussion-button").click()
    await page.getByTestId("create-discussion-title-input").fill("Mention Discussion")

    const { suggestionItems: discussionSuggestions } = await openMentionSuggestions(
      page,
      "create-discussion-content-editor"
    )
    await expect(discussionSuggestions).toHaveCount(1)
    await discussionSuggestions.first().click()

    const discussionContent = page.getByTestId("create-discussion-content-editor-content")
    await expect(discussionContent).toContainText(credentials.name)

    await page.getByTestId("create-discussion-confirm-button").click()
    await forums.expectDiscussionViewVisible()

    const { suggestionItems: replySuggestions } = await openMentionSuggestions(
      page,
      "forum-compose-reply-editor"
    )
    await expect(replySuggestions).toHaveCount(1)
    await replySuggestions.first().click()

    const replyContent = page.getByTestId("forum-compose-reply-editor-content")
    await expect(replyContent).toContainText(credentials.name)

    await context.close()
  })
})

test.describe("Forums - ACL Management", () => {
  test("can add a member to a channel", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Forum ACL Add Test")

    // Alice creates a channel
    await alice.forums.navigateToForums()
    await alice.forums.createChannel("Shared Forum")
    await alice.forums.openChannel("Shared Forum")

    // Alice opens the members sidecar
    await alice.forums.openMembersSidecar()

    // Add Bob to the channel
    await alice.forums.addMemberViaName(bob.credentials.name)

    // Bob should now appear in the members list
    await alice.forums.expectMemberInSidecar(bob.credentials.name)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("added member can access the channel", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Forum ACL Access Test")

    // Alice creates a channel and adds Bob
    await alice.forums.navigateToForums()
    await alice.forums.createChannel("Shared Access Forum")
    await alice.forums.openChannel("Shared Access Forum")
    await alice.forums.openMembersSidecar()
    await alice.forums.addMemberViaName(bob.credentials.name)
    await alice.forums.waitForSync()

    // Alice creates a discussion
    await alice.forums.goBackToDiscussionsList()
    await alice.forums.createDiscussion("Welcome Thread", "Hello Bob!")
    await alice.forums.waitForSync()

    // Bob refreshes to pick up channel membership changes
    await bob.forums.refreshForums()

    // Bob should see the channel
    await bob.forums.expectChannelInList("Shared Access Forum")

    // Bob opens the channel and should see the discussion
    await bob.forums.openChannel("Shared Access Forum")
    await bob.forums.expectDiscussionInList("Welcome Thread")

    // Bob opens the discussion and should see Alice's content
    await bob.forums.openDiscussion("Welcome Thread")
    const body = await bob.forums.getDiscussionBody()
    expect(body).toContain("Hello Bob!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("user without channel access cannot see the channel", async ({ browser }) => {
    test.setTimeout(180000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Forum Privacy Test")

    // Alice creates a private channel (without adding Bob)
    await alice.forums.navigateToForums()
    await alice.forums.createChannel("Private Forum")
    await alice.forums.waitForSync()

    // Bob navigates to Forums
    await bob.forums.navigateToForums()

    // Bob should NOT see the private channel
    await bob.forums.expectChannelNotInList("Private Forum")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Forums - Multi-User Interaction", () => {
  test("two users can exchange replies in a discussion", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Forum Multi-User Test")

    // Alice creates a channel and adds Bob
    await alice.forums.navigateToForums()
    await alice.forums.createChannel("Team Forum")
    await alice.forums.openChannel("Team Forum")
    await alice.forums.openMembersSidecar()
    await alice.forums.addMemberViaName(bob.credentials.name)

    // Alice creates a discussion
    await alice.forums.goBackToDiscussionsList()
    await alice.forums.createDiscussion("Team Discussion", "Let's discuss!")
    await alice.forums.sendReply("Alice's first reply")
    await alice.forums.waitForSync()

    // Bob opens the discussion
    await bob.forums.navigateToForums()
    await bob.forums.openChannel("Team Forum")
    await bob.forums.openDiscussion("Team Discussion")

    // Bob should see Alice's reply
    await bob.forums.expectReplyInDiscussion("Alice's first reply")

    // Bob sends a reply
    await bob.forums.sendReply("Bob's reply!")
    await bob.forums.waitForSync()

    // Alice refreshes and should see Bob's reply
    await alice.forums.refreshDiscussion("Team Forum", "Team Discussion")
    await alice.forums.expectReplyInDiscussion("Bob's reply!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Forums - Channel Deletion", () => {
  test("can delete a channel", async ({ browser }) => {
    test.setTimeout(60000)

    const { context, forums } = await setupSingleUser(browser, "Delete Channel Test")

    // Create a channel
    await forums.navigateToForums()
    await forums.createChannel("Delete This Channel")
    await forums.expectChannelInList("Delete This Channel")

    // Delete the channel
    await forums.openChannel("Delete This Channel")
    await forums.deleteChannel()

    // Should be back on channels list
    await forums.expectChannelsListVisible()
    await forums.expectChannelNotInList("Delete This Channel")

    // Clean up
    await context.close()
  })
})
