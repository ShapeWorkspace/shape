import { test, expect, Browser, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { GroupsPage } from "./pages/groups-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

// Group chat flows are heavy; run serially to avoid auth and sync flakes.
test.describe.configure({ mode: "serial", timeout: 120000 })

/**
 * Helper to resolve a workspace switcher item by visible name while anchoring on test IDs.
 */
const getWorkspaceSwitcherItemByName = (page: Page, name: string) =>
  page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name }).first()

/**
 * Helper to set up two users in the same workspace via invite flow.
 * Returns page objects and credentials for both users.
 * Reused pattern from direct-messages.spec.ts.
 */
async function setupTwoUsersInSameWorkspace(browser: Browser, workspaceName: string = "Shared Workspace") {
  // User A (Alice) creates the workspace with a unique name to avoid conflicts
  const uniqueWorkspaceName = `${workspaceName} ${Date.now()}`
  const aliceCreds = makeUser()
  const contextAlice = await browser.newContext()
  const pageAlice = await contextAlice.newPage()
  const authAlice = new AuthPage(pageAlice)
  const workspaceAlice = new WorkspacePage(pageAlice)
  const groupsAlice = new GroupsPage(pageAlice)

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
  const groupsBob = new GroupsPage(pageBob)

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
    try {
      await expect.poll(
        async () => pageAlice.getByTestId("pending-invite-row").isVisible().catch(() => false),
        { timeout: 15000 }
      ).toBe(true)
      pendingInviteVisible = true
    } catch {
      pendingInviteVisible = false
    }
  }
  if (!pendingInviteVisible) {
    const currentUrl = pageAlice.url()
    try {
      await pageAlice.reload({ waitUntil: "domcontentloaded" })
    } catch {
      await pageAlice.goto(currentUrl, { waitUntil: "domcontentloaded" })
    }
    await expect(pageAlice.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await workspaceAlice.ensureToolSelectorVisible()
    await pageAlice.getByTestId("tool-settings").click()
    await expect(pageAlice.getByTestId("settings-tool-container")).toBeVisible({ timeout: 10000 })
    await pageAlice.getByTestId("settings-members-row").click()
    await expect(pageAlice.getByTestId("workspace-members-tool-container")).toBeVisible({ timeout: 10000 })
  }
  await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 20000 })

  // Bob reloads and accepts the invite from sidebar
  const reloadBobPage = async () => {
    const currentUrl = pageBob.url()
    try {
      await pageBob.reload({ waitUntil: "domcontentloaded" })
    } catch {
      await pageBob.goto(currentUrl, { waitUntil: "domcontentloaded" })
    }
  }

  await reloadBobPage()
  await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
  await expect
    .poll(
      async () => pageBob.getByTestId("pending-invites-section").isVisible().catch(() => false),
      { timeout: 20000 }
    )
    .toBe(true)
  const pendingInviteItem = pageBob
    .getByTestId("pending-invite-item")
    .filter({ hasText: resolvedWorkspaceName })
    .first()
  await expect(pendingInviteItem).toBeVisible({ timeout: 10000 })
  await pendingInviteItem.getByTestId("accept-invite-button").click()
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
      groups: groupsAlice,
      credentials: aliceCreds,
    },
    bob: {
      context: contextBob,
      page: pageBob,
      auth: authBob,
      workspace: workspaceBob,
      groups: groupsBob,
      credentials: bobCreds,
    },
    workspaceName: resolvedWorkspaceName,
  }
}

test.describe("Group Chats - Group List", () => {
  test("can view groups list and create a new group", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Groups Test Workspace")

    // Alice navigates to Groups tool
    await alice.groups.navigateToGroups()
    await alice.groups.expectGroupsListVisible()

    // Initially no groups should exist
    const initialCount = await alice.groups.getGroupCount()
    expect(initialCount).toBe(0)

    // Alice creates a new group
    await alice.groups.createGroup("Team Chat")

    // Group should now appear in the list
    await alice.groups.expectGroupInList("Team Chat")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can open a group chat", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Open Group Test")

    // Alice creates a group and opens it
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Discussion Group")
    await alice.groups.openGroup("Discussion Group")

    // Should see the group chat view
    await alice.groups.expectGroupChatVisible()

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Messaging", () => {
  test("can send a message in a group", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Send Group Message Test")

    // Alice creates a group and opens it
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Messaging Group")
    await alice.groups.openGroup("Messaging Group")

    // Alice sends a message
    await alice.groups.sendMessage("Hello everyone, this is a group message!")

    // Message should appear in the chat
    await alice.groups.expectMessageInChat("Hello everyone, this is a group message!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("message persists after page reload (E2EE roundtrip)", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Message Persistence Test")

    // Alice creates a group and sends a message
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Persistence Group")
    await alice.groups.openGroup("Persistence Group")
    await alice.groups.sendMessage("This group message should persist after reload.")
    await alice.groups.waitForMessageSync()

    // Reload and re-open the group to validate persistence
    await alice.groups.refreshGroupChat("Persistence Group")

    // Message should still be visible (proves E2EE roundtrip works)
    await alice.groups.expectMessageInChat("This group message should persist after reload.")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can send multiple messages", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Multiple Group Messages Test")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Multi Message Group")
    await alice.groups.openGroup("Multi Message Group")

    // Send multiple messages
    await alice.groups.sendMessage("First group message")
    await alice.groups.sendMessage("Second group message")
    await alice.groups.sendMessage("Third group message")

    // All messages should be visible
    await alice.groups.expectMessageInChat("First group message")
    await alice.groups.expectMessageInChat("Second group message")
    await alice.groups.expectMessageInChat("Third group message")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Mentions", () => {
  test("shows mention suggestions in group chat composer", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Mentions Workspace")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Mentions Group")
    await alice.groups.openGroup("Mentions Group")

    const { suggestionItems } = await openMentionSuggestions(alice.page, "group-composer-editor")
    const suggestionCount = await suggestionItems.count()
    expect(suggestionCount).toBeGreaterThan(0)
    await suggestionItems.first().click()

    const composerContent = alice.page.getByTestId("group-composer-editor-content")
    await expect(composerContent).toContainText(/playwrightuser/i)

    await alice.context.close()
    await bob.context.close()
  })

  test("refreshes mention suggestions after adding a member via ACL", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(
      browser,
      "Group Mentions ACL Refresh Workspace"
    )

    // Alice creates and opens the group chat where ACL membership will change.
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Mentions ACL Refresh Group")
    await alice.groups.openGroup("Mentions ACL Refresh Group")

    // Alice adds Bob via the Manage Members sidecar.
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)
    await alice.groups.expectMemberInSidecar(bob.credentials.name)

    // Close the sidecar so the composer is unobstructed.
    await alice.page.getByTestId("sidecar-toggle").click()
    await expect(alice.page.getByTestId("sidecar-container")).not.toBeVisible({ timeout: 5000 })

    // Mention suggestions should include the newly added member without requiring a refresh.
    const { suggestionItems } = await openMentionSuggestions(alice.page, "group-composer-editor")
    const bobSuggestionItem = suggestionItems.filter({ hasText: bob.credentials.name })
    await expect(bobSuggestionItem).toBeVisible({ timeout: 10000 })

    await alice.context.close()
    await bob.context.close()
  })

  test("clicking a mention navigates to the contact conversation", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Mention Navigation Workspace")

    // Create a group chat where we can send a mention.
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Mention Navigation Group")
    await alice.groups.openGroup("Mention Navigation Group")

    // Ensure the mentioned contact is in the group ACL so they appear in suggestions.
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)
    await alice.groups.expectMemberInSidecar(bob.credentials.name)
    await alice.page.getByTestId("sidecar-toggle").click()
    await expect(alice.page.getByTestId("sidecar-container")).not.toBeVisible({ timeout: 5000 })

    // Open the mention suggestion list inside the group composer.
    const { suggestionItems } = await openMentionSuggestions(alice.page, "group-composer-editor")

    // Select the invited user so the mention targets the correct contact.
    const bobSuggestionItem = suggestionItems.filter({ hasText: bob.credentials.email }).first()
    await expect(bobSuggestionItem).toBeVisible({ timeout: 10000 })
    const bobSuggestionTestId = await bobSuggestionItem.getAttribute("data-testid")
    expect(bobSuggestionTestId).toBeTruthy()
    const mentionedUserIdFromSuggestion = bobSuggestionTestId?.replace("mention-suggestion-item-", "") || ""
    expect(mentionedUserIdFromSuggestion.length).toBeGreaterThan(0)
    await bobSuggestionItem.click()

    // Send a message that includes the mention so it renders as an entity link chip.
    const messageTextAfterMention = "hello from group chat"
    await alice.page.keyboard.type(messageTextAfterMention)
    await alice.page.getByTestId("group-composer-editor-send").click()

    // Confirm the message rendered in the conversation.
    const sentMessageLocator = alice.page
      .getByTestId(/^group-message-/)
      .filter({ hasText: messageTextAfterMention })
    await expect(sentMessageLocator).toBeVisible({ timeout: 10000 })

    // Click the rendered mention chip and verify we navigate to the DM route.
    const mentionChipLocator = sentMessageLocator.getByTestId("entity-link-chip").first()
    await expect(mentionChipLocator).toBeVisible({ timeout: 10000 })
    const mentionedUserIdFromMessage = await mentionChipLocator.getAttribute("data-entity-id")
    expect(mentionedUserIdFromMessage).toBe(mentionedUserIdFromSuggestion)
    await mentionChipLocator.click()

    await expect(alice.page.getByTestId("dm-conversation-container")).toBeVisible({ timeout: 10000 })
    await expect(alice.page).toHaveURL(new RegExp(`/contacts/${mentionedUserIdFromSuggestion}(\\?|$)`))

    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Quoting", () => {
  test("can quote a message during compose", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Quote Test")

    // Alice creates a group and sends an initial message
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Quote Group")
    await alice.groups.openGroup("Quote Group")
    await alice.groups.sendMessage("This is the original group message to quote.")

    // Alice quotes the message
    await alice.groups.quoteMessage("This is the original group message to quote.")

    // Quote preview should be visible
    await alice.groups.expectQuotedMessagePreviewVisible()
    await alice.groups.expectQuotedMessagePreviewContains("This is the original group message")

    // Alice sends a reply with the quote
    await alice.groups.sendMessage("This is my reply to the quoted group message.")

    // The sent message should show the quote reference
    await alice.groups.expectMessageHasQuote(
      "This is my reply to the quoted group message.",
      "This is the original group message"
    )

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("quoted message preview does not show HTML tags", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Quote HTML Test")

    // Alice creates a group and sends a message (TipTap wraps in <p> tags)
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("HTML Quote Group")
    await alice.groups.openGroup("HTML Quote Group")
    await alice.groups.sendMessage("And it's completely transparent. As an invitee to a workspace.")

    // Alice quotes the message
    await alice.groups.quoteMessage("And it's completely transparent")

    // Quote preview should show plain text, NOT HTML tags like <p>
    await alice.groups.expectQuotedMessagePreviewVisible()
    await alice.groups.expectQuotedMessagePreviewContains("And it's completely transparent")
    // This assertion catches the bug - if HTML is showing, this will find "<p>" in the preview
    await alice.groups.expectQuotedMessagePreviewDoesNotContainHtml()

    // Send the reply
    await alice.groups.sendMessage("Yeah I was trying to think of ways to call out the encryption somehow.")

    // The sent message quote reference should also not contain HTML
    await alice.groups.expectMessageHasQuote("Yeah I was trying to think", "And it's completely transparent")
    await alice.groups.expectMessageQuoteDoesNotContainHtml("Yeah I was trying to think")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can clear a quote before sending", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Clear Group Quote Test")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Clear Quote Group")
    await alice.groups.openGroup("Clear Quote Group")
    await alice.groups.sendMessage("Group message to quote then clear.")

    // Quote the message
    await alice.groups.quoteMessage("Group message to quote then clear.")
    await alice.groups.expectQuotedMessagePreviewVisible()

    // Clear the quote
    await alice.groups.clearQuote()

    // Quote preview should no longer be visible
    // (Verified by clearQuote() waiting for preview to disappear)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("quoted message reference persists after reload", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Quote Persistence Test")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Quote Persist Group")
    await alice.groups.openGroup("Quote Persist Group")

    // Send original and quoted reply
    await alice.groups.sendMessage("Original group message for quote persistence test.")
    await alice.groups.quoteMessage("Original group message for quote persistence test.")
    await alice.groups.sendMessage("Group reply with quote that should persist.")
    await alice.groups.waitForMessageSync()

    // Reload and re-open the group to validate quoted reference persistence
    await alice.groups.refreshGroupChat("Quote Persist Group")

    // Quote reference should still be visible
    await alice.groups.expectMessageHasQuote(
      "Group reply with quote that should persist.",
      "Original group message for quote"
    )

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - ACL Management", () => {
  test("can add a member to a group", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "ACL Add Member Test")

    // Alice creates a group
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Member Management Group")
    await alice.groups.openGroup("Member Management Group")

    // Alice opens the members sidecar
    await alice.groups.openMembersSidecar()

    // Add Bob to the group
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Bob should now appear in the members list
    await alice.groups.expectMemberInSidecar(bob.credentials.name)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("added member can access the group", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "ACL Access Test")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Shared Access Group")
    await alice.groups.openGroup("Shared Access Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends a message
    await alice.groups.sendMessage("Hello Bob, welcome to the group!")
    await alice.groups.waitForMessageSync()

    // Bob navigates to Groups
    await bob.groups.navigateToGroups()

    // Bob should see the group in his list
    await bob.groups.expectGroupInList("Shared Access Group")

    // Bob opens the group
    await bob.groups.openGroup("Shared Access Group")

    // Bob should see Alice's message
    await bob.groups.expectMessageInChatWithLongTimeout("Hello Bob, welcome to the group!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("removed member cannot access the group", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "ACL Remove Test")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Remove Access Group")
    await alice.groups.openGroup("Remove Access Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)
    await alice.groups.waitForMessageSync()

    // Bob can see the group initially
    await bob.groups.clearWindowStorage()
    await bob.page.reload({ waitUntil: "domcontentloaded" })
    await bob.groups.navigateToGroups()
    await bob.groups.expectGroupInList("Remove Access Group")

    // Alice removes Bob from the group
    await alice.groups.openMembersSidecar()
    await alice.groups.removeMemberViaName(bob.credentials.name)

    // Bob refreshes and should no longer see the group
    await bob.groups.clearWindowStorage()
    await bob.page.reload({ waitUntil: "load" })
    await bob.groups.navigateToGroups()
    await bob.groups.expectGroupNotInList("Remove Access Group")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Multi-User Messaging", () => {
  test("two users can exchange messages in a group", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Two Way Group Chat")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Team Discussion")
    await alice.groups.openGroup("Team Discussion")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends a message
    await alice.groups.sendMessage("Hi team! How is everyone doing?")
    await alice.groups.waitForMessageSync()

    // Bob opens the group
    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Team Discussion")

    // Bob should see Alice's message
    await bob.groups.expectMessageInChatWithLongTimeout("Hi team! How is everyone doing?")

    // Bob replies
    await bob.groups.sendMessage("Doing great, thanks for asking!")
    await bob.groups.waitForMessageSync()

    // Alice refreshes to see Bob's reply
    await alice.groups.refreshGroupChat("Team Discussion")
    await alice.groups.expectMessageInChatWithLongTimeout("Doing great, thanks for asking!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("messages from multiple users are ordered chronologically", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Message Order Test")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Order Test Group")
    await alice.groups.openGroup("Order Test Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends first message
    await alice.groups.sendMessage("Group Message 1 from Alice")
    await alice.groups.waitForMessageSync()

    // Bob opens the group and sends a reply
    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Order Test Group")
    await bob.groups.expectMessageInChatWithLongTimeout("Group Message 1 from Alice")
    await bob.groups.sendMessage("Group Message 2 from Bob")
    await bob.groups.waitForMessageSync()

    // Alice refreshes and sends another message
    await alice.groups.refreshGroupChat("Order Test Group")
    await alice.groups.expectMessageInChatWithLongTimeout("Group Message 2 from Bob")
    await alice.groups.sendMessage("Group Message 3 from Alice")
    await alice.groups.waitForMessageSync()

    // Bob refreshes and checks order
    await bob.groups.refreshGroupChat("Order Test Group")

    // Get all messages and verify order
    const messages = await bob.groups.getAllMessageTexts()
    expect(messages.length).toBeGreaterThanOrEqual(3)

    // Messages should appear in chronological order (newest at bottom)
    const msg1Index = messages.findIndex(m => m.includes("Group Message 1 from Alice"))
    const msg2Index = messages.findIndex(m => m.includes("Group Message 2 from Bob"))
    const msg3Index = messages.findIndex(m => m.includes("Group Message 3 from Alice"))

    expect(msg1Index).toBeLessThan(msg2Index)
    expect(msg2Index).toBeLessThan(msg3Index)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Real-Time SSE Updates", () => {
  /**
   * Tests that group messages are received in real-time via SSE without requiring a page refresh.
   * This validates the end-to-end flow:
   * 1. Alice creates a group and adds Bob
   * 2. Both Alice and Bob have the group chat open
   * 3. Bob sends a message
   * 4. Alice should see the message appear in real-time via SSE (no refresh)
   */
  test("receives group messages in real-time via SSE without refresh", async ({ browser }) => {
    test.setTimeout(240000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Real-Time SSE Test")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Real-Time Chat")
    await alice.groups.openGroup("Real-Time Chat")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends an initial message
    await alice.groups.sendMessage("Alice is here!")
    await alice.groups.waitForMessageSync()

    // Bob navigates to the group (both users have the chat open now)
    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Real-Time Chat")
    await bob.groups.expectMessageInChatWithLongTimeout("Alice is here!")

    // Bob sends a message - Alice should see it in real-time via SSE
    await bob.groups.sendMessage("Hello Alice, this should appear in real-time!")
    await bob.groups.waitForMessageSync()

    // Alice should see Bob's message WITHOUT refreshing the page (SSE real-time update)
    await alice.groups.expectMessageInChatWithLongTimeout("Hello Alice, this should appear in real-time!")

    // Verify bidirectional real-time: Alice replies, Bob should see it
    await alice.groups.sendMessage("I see you Bob! SSE is working!")
    await alice.groups.waitForMessageSync()

    // Bob should see Alice's reply in real-time
    await bob.groups.expectMessageInChatWithLongTimeout("I see you Bob! SSE is working!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("receives messages from multiple users in real-time", async ({ browser }) => {
    test.setTimeout(150000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Multi-User SSE Test")

    // Alice creates a group and adds Bob
    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Multi-User Real-Time")
    await alice.groups.openGroup("Multi-User Real-Time")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends initial message
    await alice.groups.sendMessage("Starting the conversation")
    await alice.groups.waitForMessageSync()

    // Bob opens the group
    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Multi-User Real-Time")
    await bob.groups.expectMessageInChatWithLongTimeout("Starting the conversation")

    // Rapid message exchange - all should appear in real-time
    await bob.groups.sendMessage("Bob message 1")
    await bob.groups.waitForMessageSync()
    await alice.groups.expectMessageInChatWithLongTimeout("Bob message 1")

    await alice.groups.sendMessage("Alice message 1")
    await alice.groups.waitForMessageSync()
    await bob.groups.expectMessageInChatWithLongTimeout("Alice message 1")

    await bob.groups.sendMessage("Bob message 2")
    await bob.groups.waitForMessageSync()
    await alice.groups.expectMessageInChatWithLongTimeout("Bob message 2")

    // Final message from Alice
    await alice.groups.sendMessage("Alice message 2")
    await alice.groups.waitForMessageSync()
    await bob.groups.expectMessageInChatWithLongTimeout("Alice message 2")

    // Verify all messages are present (using includes since getAllMessageTexts returns full row content)
    const aliceMessages = await alice.groups.getAllMessageTexts()
    const bobMessages = await bob.groups.getAllMessageTexts()

    // Helper to check if any message contains the text
    const hasMessage = (messages: string[], text: string) =>
      messages.some(m => m.includes(text))

    // Both should have all 5 messages
    expect(hasMessage(aliceMessages, "Starting the conversation")).toBe(true)
    expect(hasMessage(aliceMessages, "Bob message 1")).toBe(true)
    expect(hasMessage(aliceMessages, "Alice message 1")).toBe(true)
    expect(hasMessage(aliceMessages, "Bob message 2")).toBe(true)
    expect(hasMessage(aliceMessages, "Alice message 2")).toBe(true)

    expect(hasMessage(bobMessages, "Starting the conversation")).toBe(true)
    expect(hasMessage(bobMessages, "Bob message 1")).toBe(true)
    expect(hasMessage(bobMessages, "Alice message 1")).toBe(true)
    expect(hasMessage(bobMessages, "Bob message 2")).toBe(true)
    expect(hasMessage(bobMessages, "Alice message 2")).toBe(true)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Reactions", () => {
  test("can add and remove reactions on group messages", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Reactions Workspace")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Reaction Group")
    await alice.groups.openGroup("Reaction Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    await alice.groups.sendMessage("Group reaction message")
    await alice.groups.waitForMessageSync()

    const aliceMessageRow = alice.page
      .locator('[data-testid^="group-message-"]')
      .filter({ hasText: "Group reaction message" })
      .first()
    await expect(aliceMessageRow).toBeVisible({ timeout: 10000 })
    const aliceMessageTestId = await aliceMessageRow.getAttribute("data-testid")
    expect(aliceMessageTestId).toBeTruthy()
    const messageId = (aliceMessageTestId ?? "").replace("group-message-", "")

    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Reaction Group")
    await bob.groups.expectMessageInChatWithLongTimeout("Group reaction message")

    await bob.page.getByTestId(`group-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`group-message-${messageId}-reaction-add-quick-1`).click()

    await expect(bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alice.page.getByTestId(`group-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    await bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`).click()
    await expect(bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`)).not.toBeVisible({
      timeout: 10000,
    })

    await alice.context.close()
    await bob.context.close()
  })

  test("reactions are blocked while offline and show the global status message", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Group Reaction Offline Workspace")

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Offline Reaction Group")
    await alice.groups.openGroup("Offline Reaction Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    await alice.groups.sendMessage("Offline reaction guard message")
    await alice.groups.waitForMessageSync()

    const aliceMessageRow = alice.page
      .locator('[data-testid^="group-message-"]')
      .filter({ hasText: "Offline reaction guard message" })
      .first()
    await expect(aliceMessageRow).toBeVisible({ timeout: 10000 })
    const aliceMessageTestId = await aliceMessageRow.getAttribute("data-testid")
    expect(aliceMessageTestId).toBeTruthy()
    const messageId = (aliceMessageTestId ?? "").replace("group-message-", "")
    const offlineStatusId = `reaction-status-group-message-${messageId}-offline`

    await bob.groups.navigateToGroups()
    await bob.groups.openGroup("Offline Reaction Group")
    await bob.groups.expectMessageInChatWithLongTimeout("Offline reaction guard message")

    // Add one reaction while online so we can verify delete attempts are blocked offline.
    await bob.page.getByTestId(`group-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`group-message-${messageId}-reaction-add-quick-0`).click()
    await expect(bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    // Force offline and attempt to toggle/delete.
    await bob.context.setOffline(true)
    await bob.page.evaluate(() => window.dispatchEvent(new Event("offline")))

    await bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`).click()
    const offlineStatusItem = bob.page.getByTestId(`status-bar-item-${offlineStatusId}`)
    await expect(offlineStatusItem).toContainText("CAN'T CREATE REACTIONS WHILE OFFLINE.", {
      timeout: 10000,
    })

    // Reaction should still be present because delete is blocked offline.
    await expect(bob.page.getByTestId(`group-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    // Attempt to add another reaction while offline.
    await bob.page.getByTestId(`group-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`group-message-${messageId}-reaction-add-quick-1`).click()
    await expect(bob.page.getByTestId(`group-message-${messageId}-reaction-pill-1`)).toHaveCount(0)

    await bob.context.setOffline(false)
    await bob.page.evaluate(() => window.dispatchEvent(new Event("online")))

    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Group Chats - Privacy", () => {
  test("user without group access cannot see the group", async ({ browser }) => {
    test.setTimeout(150000)

    // Create three users: Alice, Bob, and Charlie all in same workspace
    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Privacy Test Workspace")

    // Create Charlie and add to workspace
    const charlieCreds = makeUser()
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    const authCharlie = new AuthPage(pageCharlie)
    const workspaceCharlie = new WorkspacePage(pageCharlie)
    const groupsCharlie = new GroupsPage(pageCharlie)

    await authCharlie.goto()
    await authCharlie.signUp(charlieCreds)
    await workspaceCharlie.expectVisible()
    await workspaceCharlie.createWorkspaceIfWorkspaceSelectorVisible("Charlie's Workspace")

    // Alice invites Charlie
    await alice.page.getByTestId("tool-settings").click()
    await expect(alice.page.getByTestId("settings-tool-container")).toBeVisible()
    await alice.page.getByTestId("settings-members-row").click()
    await expect(alice.page.getByTestId("workspace-members-tool-container")).toBeVisible()
    await alice.page.getByTestId("invite-email-input").fill(charlieCreds.email)
    await alice.page.getByTestId("invite-submit-button").click()
    await alice.page.waitForTimeout(1500)
    await expect(alice.page.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

    // Charlie accepts the invite
    const reloadCharliePage = async () => {
      const currentUrl = pageCharlie.url()
      try {
        await pageCharlie.reload({ waitUntil: "domcontentloaded" })
      } catch {
        await pageCharlie.goto(currentUrl, { waitUntil: "domcontentloaded" })
      }
    }

    await reloadCharliePage()
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await expect(pageCharlie.getByTestId("pending-invites-section")).toBeVisible({ timeout: 10000 })
    await pageCharlie.getByTestId("accept-invite-button").click()
    await pageCharlie.waitForTimeout(1500)
    await reloadCharliePage()
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

    // Charlie switches to Privacy Test Workspace
    const switcher = pageCharlie.getByTestId("sidebar-workspace-switcher")
    await switcher.click()
    await pageCharlie.getByText("Privacy Test Workspace").first().click()

    // Alice creates a private group and adds only Bob
    await alice.groups.clearWindowStorage()
    await alice.page.reload({ waitUntil: "load" })
    await alice.workspace.ensureToolSelectorVisible()

    await alice.groups.navigateToGroups()
    await alice.groups.createGroup("Private Alice-Bob Group")
    await alice.groups.openGroup("Private Alice-Bob Group")
    await alice.groups.openMembersSidecar()
    await alice.groups.addMemberViaName(bob.credentials.name)

    // Alice sends a message
    await alice.groups.sendMessage("Secret message for Bob only!")
    await alice.groups.waitForMessageSync()

    // Charlie navigates to Groups
    await groupsCharlie.navigateToGroups()

    // Charlie should NOT see the private group
    await groupsCharlie.expectGroupNotInList("Private Alice-Bob Group")

    // Clean up
    await alice.context.close()
    await bob.context.close()
    await contextCharlie.close()
  })
})
