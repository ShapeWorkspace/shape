import { test, expect, Browser, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { ContactsPage } from "./pages/contacts-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

test.describe.configure({ mode: "serial" })

/**
 * Helper to resolve a workspace switcher item by visible name while anchoring on test IDs.
 */
const getWorkspaceSwitcherItemByName = (page: Page, name: string) =>
  page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name }).first()

/**
 * Helper to set up two users in the same workspace via invite flow.
 * Returns page objects and credentials for both users.
 */
async function setupTwoUsersInSameWorkspace(browser: Browser, workspaceName: string = "Shared Workspace") {
  // User A (Alice) creates the workspace with a unique name to avoid conflicts
  const uniqueWorkspaceName = `${workspaceName} ${Date.now()}`
  const aliceCreds = makeUser()
  const contextAlice = await browser.newContext()
  const pageAlice = await contextAlice.newPage()
  const authAlice = new AuthPage(pageAlice)
  const workspaceAlice = new WorkspacePage(pageAlice)
  const contactsAlice = new ContactsPage(pageAlice)

  await authAlice.goto()
  await authAlice.signUp(aliceCreds)
  await workspaceAlice.expectVisible()

  // Explicitly create a new workspace with a unique name.
  // This avoids conflicts with default "Untitled Workspace" that both users may have.
  // We must use createWorkspace directly, not createWorkspaceIfWorkspaceSelectorVisible,
  // because the latter may skip creation if app auto-selected a workspace.
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
  const contactsBob = new ContactsPage(pageBob)

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
  await expect(pageAlice.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

  // Bob reloads to fetch fresh invite data, then should see the invite in sidebar.
  await pageBob.reload()
  // Wait for app to load - Bob might land on workspace selector or directly in a workspace
  await pageBob.waitForTimeout(2000)

  // Check if Bob is on workspace selector - if so, enter his default workspace first
  const bobWorkspaceSelector = pageBob.getByTestId("workspace-selector")
  const isBobOnWorkspaceSelector = await bobWorkspaceSelector.isVisible({ timeout: 3000 }).catch(() => false)
  if (isBobOnWorkspaceSelector) {
    // Click Bob's first workspace to get into app
    const firstWorkspaceRow = pageBob.getByTestId(/workspace-row-/).first()
    await firstWorkspaceRow.click()
  }

  // Now Bob should have the sidebar visible with pending invites
  await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

  // Bob should see the pending invite in the sidebar
  await expect(pageBob.getByTestId("pending-invites-section")).toBeVisible({ timeout: 35000 })
  const pendingInviteItem = pageBob
    .getByTestId("pending-invite-item")
    .filter({ hasText: resolvedWorkspaceName })
    .first()
  await expect(pendingInviteItem).toBeVisible({ timeout: 10000 })
  await pendingInviteItem.getByTestId("accept-invite-button").click()
  await pageBob.waitForTimeout(1000)
  await expect(pageBob.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

  // Bob switches to the shared workspace
  const workspaceSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
  await workspaceSwitcher.click()
  await getWorkspaceSwitcherItemByName(pageBob, resolvedWorkspaceName).click()
  await expect(pageBob.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

  // Verify Bob's switcher shows the correct workspace and wait for persistence
  await expect(pageBob.getByTestId("sidebar-workspace-switcher")).toContainText(resolvedWorkspaceName, {
    timeout: 5000,
  })
  // Wait for workspace selection to be persisted to IndexedDB
  await pageBob.waitForTimeout(1000)

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
  await contactsAlice.navigateToContacts()
  await contactsAlice.expectContactsListVisible()
  await contactsAlice.expectMemberInList(bobCreds.email)
  await workspaceAlice.ensureToolSelectorVisible()

  // Also verify Bob can see Alice in his contacts list (bidirectional verification)
  await pageBob.evaluate(() => {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith("shape_windows_")) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  })
  await pageBob.reload()

  // After reload, ensure Bob ends up in the shared workspace.
  // The app may show workspace selector or restore to a previously selected workspace.
  await pageBob.waitForTimeout(2000) // Wait for app to settle
  const workspaceSelector = pageBob.getByTestId("workspace-selector")
  const isOnWorkspaceSelector = await workspaceSelector.isVisible({ timeout: 3000 }).catch(() => false)

  if (isOnWorkspaceSelector) {
    // On workspace selector page - click the shared workspace row
    const sharedWorkspaceRow = pageBob.getByTestId(/workspace-row-/).filter({ hasText: resolvedWorkspaceName }).first()
    await expect(sharedWorkspaceRow).toBeVisible({ timeout: 10000 })
    await sharedWorkspaceRow.click()
    await expect(pageBob.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
  } else {
    // Already in a workspace - check if it's the right one
    const sidebarSwitcher = pageBob.getByTestId("sidebar-workspace-switcher")
    await expect(sidebarSwitcher).toBeVisible({ timeout: 10000 })
    const currentWorkspaceName = await sidebarSwitcher.textContent()

    if (!currentWorkspaceName?.includes(resolvedWorkspaceName)) {
      // Switch to the shared workspace via sidebar dropdown
      await sidebarSwitcher.click()
      // Wait for dropdown to populate and look for the shared workspace
      await pageBob.waitForTimeout(500)
      const workspaceItem = getWorkspaceSwitcherItemByName(pageBob, resolvedWorkspaceName)
      const isSharedWorkspaceVisible = await workspaceItem.isVisible().catch(() => false)
      if (!isSharedWorkspaceVisible) {
        // Debug: Log available workspaces
        const allWorkspaceItems = pageBob.getByTestId(/sidebar-workspace-item-/)
        const itemCount = await allWorkspaceItems.count()
        const itemTexts: string[] = []
        for (let i = 0; i < itemCount; i++) {
          const text = await allWorkspaceItems.nth(i).textContent()
          itemTexts.push(text || "(empty)")
        }
        throw new Error(
          `Shared workspace "${resolvedWorkspaceName}" not found in Bob's switcher. ` +
            `Available: [${itemTexts.join(", ")}]. Current: "${currentWorkspaceName}"`
        )
      }
      await workspaceItem.click()
      await expect(pageBob.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
    }
  }

  // Final verification that Bob is in the correct workspace
  await expect(pageBob.getByTestId("sidebar-workspace-switcher")).toContainText(resolvedWorkspaceName, {
    timeout: 5000,
  })
  await contactsBob.navigateToContacts()
  await contactsBob.expectContactsListVisible()
  await contactsBob.expectMemberInList(aliceCreds.email)
  await workspaceBob.ensureToolSelectorVisible()

  return {
    alice: {
      context: contextAlice,
      page: pageAlice,
      auth: authAlice,
      workspace: workspaceAlice,
      contacts: contactsAlice,
      credentials: aliceCreds,
    },
    bob: {
      context: contextBob,
      page: pageBob,
      auth: authBob,
      workspace: workspaceBob,
      contacts: contactsBob,
      credentials: bobCreds,
    },
    workspaceName: resolvedWorkspaceName,
  }
}

test.describe("Direct Messages - Contacts List", () => {
  test("can view workspace members in contacts", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Test Workspace")

    // Alice navigates to Contacts tool
    await alice.contacts.navigateToContacts()
    await alice.contacts.expectContactsListVisible()

    // Alice should see Bob in the contacts list (workspace members)
    await alice.contacts.expectMemberInList(bob.credentials.name)

    // Alice should NOT see herself in the contacts list
    await alice.contacts.expectMemberNotInList(alice.credentials.name)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can open conversation with workspace member", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Conversation Test")

    // Alice navigates to Contacts and opens conversation with Bob
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.email)

    // Should see the conversation view
    await alice.contacts.expectConversationVisible()

    // Header should show Bob's name
    const headerTitle = await alice.contacts.getConversationHeaderTitle()
    expect(headerTitle).toContain(bob.credentials.name)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Sending Messages", () => {
  test("can send a direct message", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Send Message Test")

    // Alice sends a message to Bob
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Hello Bob, this is a test message!")

    // Message should appear in conversation
    await alice.contacts.expectMessageInConversation("Hello Bob, this is a test message!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("message persists after page reload (E2EE roundtrip)", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Persistence Test")

    // Alice sends a message
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("This message should persist after reload.")
    await alice.contacts.waitForMessageSync()

    // Reload and restore conversation context
    await alice.contacts.refreshConversation(bob.credentials.name)

    // Message should still be visible (proves E2EE roundtrip works)
    await alice.contacts.expectMessageInConversation("This message should persist after reload.")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can send multiple messages", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Multiple Messages Test")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)

    // Send multiple messages
    await alice.contacts.sendMessage("First message")
    await alice.contacts.sendMessage("Second message")
    await alice.contacts.sendMessage("Third message")

    // All messages should be visible
    await alice.contacts.expectMessageInConversation("First message")
    await alice.contacts.expectMessageInConversation("Second message")
    await alice.contacts.expectMessageInConversation("Third message")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Mentions", () => {
  test("shows mention suggestions for DM participants", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Mentions Workspace")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)

    const { suggestionItems } = await openMentionSuggestions(alice.page, "dm-composer-editor")
    await expect(suggestionItems).toHaveCount(2)
    await suggestionItems.first().click()

    const composerContent = alice.page.getByTestId("dm-composer-editor-content")
    await expect(composerContent).toContainText(new RegExp(`${alice.credentials.name}|${bob.credentials.name}`))

    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Quoting", () => {
  test("can quote a message during compose", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Quote Test")

    // Alice sends an initial message
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("This is the original message to quote.")

    // Alice quotes the message
    await alice.contacts.quoteMessage("This is the original message to quote.")

    // Quote preview should be visible
    await alice.contacts.expectQuotedMessagePreviewVisible()
    await alice.contacts.expectQuotedMessagePreviewContains("This is the original message")

    // Alice sends a reply with the quote
    await alice.contacts.sendMessage("This is my reply to the quoted message.")

    // The sent message should show the quote reference
    await alice.contacts.expectMessageHasQuote(
      "This is my reply to the quoted message.",
      "This is the original message"
    )

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("quoted message preview does not show HTML tags", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Quote HTML Test")

    // Alice sends an initial message (TipTap wraps this in <p> tags internally)
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("And it's completely transparent. As an invitee to a workspace.")

    // Alice quotes the message
    await alice.contacts.quoteMessage("And it's completely transparent")

    // Quote preview should show plain text, NOT HTML tags like <p>
    await alice.contacts.expectQuotedMessagePreviewVisible()
    await alice.contacts.expectQuotedMessagePreviewContains("And it's completely transparent")
    // This assertion catches the bug - if HTML is showing, this will find "<p>" in the preview
    await alice.contacts.expectQuotedMessagePreviewDoesNotContainHtml()

    // Send the reply
    await alice.contacts.sendMessage("Yeah I was trying to think of ways to call out the encryption somehow.")

    // The sent message quote reference should also not contain HTML
    await alice.contacts.expectMessageHasQuote(
      "Yeah I was trying to think",
      "And it's completely transparent"
    )
    await alice.contacts.expectMessageQuoteDoesNotContainHtml("Yeah I was trying to think")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("can clear a quote before sending", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Clear Quote Test")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Message to quote then clear.")

    // Quote the message
    await alice.contacts.quoteMessage("Message to quote then clear.")
    await alice.contacts.expectQuotedMessagePreviewVisible()

    // Clear the quote
    await alice.contacts.clearQuote()

    // Quote preview should no longer be visible
    // (Verified by clearQuote() waiting for preview to disappear)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("quoted message reference persists after reload", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Quote Persistence Test")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)

    // Send original and quoted reply
    await alice.contacts.sendMessage("Original message for quote persistence test.")
    await alice.contacts.quoteMessage("Original message for quote persistence test.")
    await alice.contacts.sendMessage("Reply with quote that should persist.")
    await alice.contacts.waitForMessageSync()

    // Reload and restore conversation context
    await alice.contacts.refreshConversation(bob.credentials.name)

    // Quote reference should still be visible
    await alice.contacts.expectMessageHasQuote(
      "Reply with quote that should persist.",
      "Original message for quote"
    )

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Two-Way Communication", () => {
  test("two users can exchange messages", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Two Way Chat")

    // Alice sends a message to Bob
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Hi Bob! How are you?")
    await alice.contacts.waitForMessageSync()

    // Bob navigates to contacts and opens conversation with Alice
    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.email)

    // Bob should see Alice's message (use longer timeout for cross-user E2EE)
    await bob.contacts.expectMessageInConversationWithLongTimeout("Hi Bob! How are you?")

    // Bob replies
    await bob.contacts.sendMessage("Hi Alice! I'm doing great, thanks!")
    await bob.contacts.waitForMessageSync()

    // Alice refreshes to see Bob's reply
    await alice.contacts.refreshConversation(bob.credentials.email)
    await alice.contacts.expectMessageInConversationWithLongTimeout("Hi Alice! I'm doing great, thanks!")

    // Alice sends another message
    await alice.contacts.sendMessage("That's wonderful to hear!")
    await alice.contacts.waitForMessageSync()

    // Bob refreshes to see the new message
    await bob.contacts.refreshConversation(alice.credentials.email)
    await bob.contacts.expectMessageInConversationWithLongTimeout("That's wonderful to hear!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("messages from both users are ordered chronologically", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Message Order Test")

    // Alice sends first message
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Message 1 from Alice")
    await alice.contacts.waitForMessageSync()

    // Bob opens conversation and sends reply
    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)
    await bob.contacts.expectMessageInConversationWithLongTimeout("Message 1 from Alice")
    await bob.contacts.sendMessage("Message 2 from Bob")
    await bob.contacts.waitForMessageSync()

    // Alice refreshes and sends another message
    await alice.contacts.refreshConversation(bob.credentials.name)
    await alice.contacts.expectMessageInConversationWithLongTimeout("Message 2 from Bob")
    await alice.contacts.sendMessage("Message 3 from Alice")
    await alice.contacts.waitForMessageSync()

    // Bob refreshes and checks order
    await bob.contacts.refreshConversation(alice.credentials.name)

    // Get all messages and verify order
    const messages = await bob.contacts.getAllMessageTexts()
    expect(messages.length).toBeGreaterThanOrEqual(3)

    // Messages should appear in chronological order (newest at bottom)
    const msg1Index = messages.findIndex(m => m.includes("Message 1 from Alice"))
    const msg2Index = messages.findIndex(m => m.includes("Message 2 from Bob"))
    const msg3Index = messages.findIndex(m => m.includes("Message 3 from Alice"))

    expect(msg1Index).toBeLessThan(msg2Index)
    expect(msg2Index).toBeLessThan(msg3Index)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Real-Time SSE Updates", () => {
  /**
   * Tests that direct messages are received in real-time via SSE without requiring a page refresh.
   * This validates the end-to-end flow:
   * 1. Alice opens a conversation with Bob
   * 2. Bob opens a conversation with Alice (both have it open)
   * 3. Bob sends a message
   * 4. Alice should see the message appear in real-time via SSE (no refresh)
   */
  test("receives direct messages in real-time via SSE without refresh", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Real-Time SSE Test")

    // Alice opens conversation with Bob
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)

    // Alice sends an initial message
    await alice.contacts.sendMessage("Alice is online!")
    await alice.contacts.waitForMessageSync()

    // Bob opens conversation with Alice (both users have it open now)
    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)
    await bob.contacts.expectMessageInConversationWithLongTimeout("Alice is online!")

    // Bob sends a message - Alice should see it in real-time via SSE
    await bob.contacts.sendMessage("Hello Alice, this should appear in real-time!")
    await bob.contacts.waitForMessageSync()

    // Alice should see Bob's message WITHOUT refreshing the page (SSE real-time update)
    await alice.contacts.expectMessageInConversationWithLongTimeout(
      "Hello Alice, this should appear in real-time!"
    )

    // Verify bidirectional real-time: Alice replies, Bob should see it
    await alice.contacts.sendMessage("I see you Bob! SSE is working!")
    await alice.contacts.waitForMessageSync()

    // Bob should see Alice's reply in real-time
    await bob.contacts.expectMessageInConversationWithLongTimeout("I see you Bob! SSE is working!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })

  test("receives messages from other user in real-time during active conversation", async ({ browser }) => {
    test.setTimeout(150000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Multi-Message SSE Test")

    // Both users open conversation with each other
    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)

    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)

    // Rapid message exchange - all should appear in real-time
    await alice.contacts.sendMessage("Alice message 1")
    await alice.contacts.waitForMessageSync()
    await bob.contacts.expectMessageInConversationWithLongTimeout("Alice message 1")

    await bob.contacts.sendMessage("Bob message 1")
    await bob.contacts.waitForMessageSync()
    await alice.contacts.expectMessageInConversationWithLongTimeout("Bob message 1")

    await alice.contacts.sendMessage("Alice message 2")
    await alice.contacts.waitForMessageSync()
    await bob.contacts.expectMessageInConversationWithLongTimeout("Alice message 2")

    await bob.contacts.sendMessage("Bob message 2")
    await bob.contacts.waitForMessageSync()
    await alice.contacts.expectMessageInConversationWithLongTimeout("Bob message 2")

    // Verify all messages are present on both sides
    const aliceMessages = await alice.contacts.getAllMessageTexts()
    const bobMessages = await bob.contacts.getAllMessageTexts()

    // Helper to check if any message contains the text
    const hasMessage = (messages: string[], text: string) => messages.some(m => m.includes(text))

    expect(hasMessage(aliceMessages, "Alice message 1")).toBe(true)
    expect(hasMessage(aliceMessages, "Bob message 1")).toBe(true)
    expect(hasMessage(aliceMessages, "Alice message 2")).toBe(true)
    expect(hasMessage(aliceMessages, "Bob message 2")).toBe(true)

    expect(hasMessage(bobMessages, "Alice message 1")).toBe(true)
    expect(hasMessage(bobMessages, "Bob message 1")).toBe(true)
    expect(hasMessage(bobMessages, "Alice message 2")).toBe(true)
    expect(hasMessage(bobMessages, "Bob message 2")).toBe(true)

    // Clean up
    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Reactions", () => {
  test("can add and remove reactions on direct messages", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Reactions Workspace")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Hello reactions")

    const aliceMessageRow = alice.page
      .locator('[data-testid^="dm-message-"]')
      .filter({ hasText: "Hello reactions" })
      .first()
    await expect(aliceMessageRow).toBeVisible({ timeout: 10000 })

    const aliceMessageTestId = await aliceMessageRow.getAttribute("data-testid")
    expect(aliceMessageTestId).toBeTruthy()
    const messageId = (aliceMessageTestId ?? "").replace("dm-message-", "")

    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)
    await bob.contacts.expectMessageInConversation("Hello reactions")

    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-0`).click()

    await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alice.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    await bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`).click()

    await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).not.toBeVisible({
      timeout: 10000,
    })
  })

  test("reaction pills show counts, active state, and preserve first-used ordering", async ({ browser }) => {
    test.setTimeout(60000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Reaction Ordering Workspace")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Ordering reactions")

    const aliceMessageRow = alice.page
      .locator('[data-testid^="dm-message-"]')
      .filter({ hasText: "Ordering reactions" })
      .first()
    await expect(aliceMessageRow).toBeVisible({ timeout: 10000 })

    const aliceMessageTestId = await aliceMessageRow.getAttribute("data-testid")
    expect(aliceMessageTestId).toBeTruthy()
    const messageId = (aliceMessageTestId ?? "").replace("dm-message-", "")

    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)
    await bob.contacts.expectMessageInConversation("Ordering reactions")

    // Bob reacts first with 👍.
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-0`).click()

    // Alice reacts with 👍 as well (should increment count).
    await alice.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await alice.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-0`).click()

    // Bob adds 🎉 after 👍 so ordering should remain 👍 then 🎉.
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-1`).click()

    const aliceFirstPill = alice.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)
    const aliceSecondPill = alice.page.getByTestId(`dm-message-${messageId}-reaction-pill-1`)

    await expect(aliceFirstPill).toContainText("👍", { timeout: 10000 })
    await expect(aliceFirstPill).toContainText("2")
    await expect(aliceFirstPill).toHaveAttribute("data-active", "true")

    await expect(aliceSecondPill).toContainText("🎉", { timeout: 10000 })
    await expect(aliceSecondPill).toContainText("1")
    await expect(aliceSecondPill).toHaveAttribute("data-active", "false")

    await alice.context.close()
    await bob.context.close()
  })

  test("reactions are blocked while offline and surface a status message", async ({ browser }) => {
    test.setTimeout(120000)

    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "DM Reaction Offline Workspace")

    await alice.contacts.navigateToContacts()
    await alice.contacts.openConversationWithMember(bob.credentials.name)
    await alice.contacts.sendMessage("Offline reaction guard")

    const aliceMessageRow = alice.page
      .locator('[data-testid^="dm-message-"]')
      .filter({ hasText: "Offline reaction guard" })
      .first()
    await expect(aliceMessageRow).toBeVisible({ timeout: 10000 })

    const aliceMessageTestId = await aliceMessageRow.getAttribute("data-testid")
    expect(aliceMessageTestId).toBeTruthy()
    const messageId = (aliceMessageTestId ?? "").replace("dm-message-", "")
    const offlineStatusId = `reaction-status-direct-message-${messageId}-offline`

    await bob.contacts.navigateToContacts()
    await bob.contacts.openConversationWithMember(alice.credentials.name)
    await bob.contacts.expectMessageInConversation("Offline reaction guard")

    // Create an initial reaction while online so we can attempt offline toggles.
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-0`).click()
    await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    // Force offline state and attempt to toggle + add another reaction.
    await bob.context.setOffline(true)
    await bob.page.evaluate(() => window.dispatchEvent(new Event("offline")))

    await bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`).click()
    const offlineStatusItem = bob.page.getByTestId(`status-bar-item-${offlineStatusId}`)
    await expect(offlineStatusItem).toContainText("CAN'T CREATE REACTIONS WHILE OFFLINE.", {
      timeout: 10000,
    })

    // Reaction should still be present because delete is blocked offline.
    await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add`).click()
    await bob.page.getByTestId(`dm-message-${messageId}-reaction-add-quick-1`).click()

    // No new pill should appear while offline.
    await expect(bob.page.getByTestId(`dm-message-${messageId}-reaction-pill-1`)).toHaveCount(0)

    await bob.context.setOffline(false)
    await bob.page.evaluate(() => window.dispatchEvent(new Event("online")))

    await alice.context.close()
    await bob.context.close()
  })
})

test.describe("Direct Messages - Encryption Verification", () => {
  test("different users cannot see each other's DMs with third parties", async ({ browser }) => {
    test.setTimeout(150000)

    // Create three users: Alice, Bob, and Charlie all in same workspace
    const { alice, bob } = await setupTwoUsersInSameWorkspace(browser, "Privacy Test Workspace")

    // Create Charlie and add to workspace
    const charlieCreds = makeUser()
    const contextCharlie = await browser.newContext()
    const pageCharlie = await contextCharlie.newPage()
    const authCharlie = new AuthPage(pageCharlie)
    const workspaceCharlie = new WorkspacePage(pageCharlie)
    const contactsCharlie = new ContactsPage(pageCharlie)

    await authCharlie.goto()
    await authCharlie.signUp(charlieCreds)
    await workspaceCharlie.expectVisible()
    await workspaceCharlie.createWorkspace("Charlie's Workspace")
    await workspaceCharlie.expectToolSelectorVisible()

    // Alice is already at tool selector after setupTwoUsersInSameWorkspace

    // Alice invites Charlie
    await alice.page.getByTestId("tool-settings").click()
    await expect(alice.page.getByTestId("settings-tool-container")).toBeVisible()
    await alice.page.getByTestId("settings-members-row").click()
    await expect(alice.page.getByTestId("workspace-members-tool-container")).toBeVisible()
    await alice.page.getByTestId("invite-email-input").fill(charlieCreds.email)
    await alice.page.getByTestId("invite-submit-button").click()
    await alice.page.waitForTimeout(1500)
    await expect(alice.page.getByTestId("pending-invite-row")).toBeVisible({ timeout: 10000 })

    // Charlie reloads and accepts the invite
    await pageCharlie.reload()
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })
    await expect(pageCharlie.getByTestId("pending-invites-section")).toBeVisible({ timeout: 10000 })
    await pageCharlie.getByTestId("accept-invite-button").click()
    await pageCharlie.waitForTimeout(1500)
    await pageCharlie.reload()
    await expect(pageCharlie.getByTestId("navigation-sidebar")).toBeVisible({ timeout: 10000 })

    // Charlie switches to Privacy Test Workspace
    const switcher = pageCharlie.getByTestId("sidebar-workspace-switcher")
    await switcher.click()
    await pageCharlie.getByText("Privacy Test Workspace").first().click()
    await expect(pageCharlie.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    // Alice sends a private DM to Bob
    // First clear window storage and reload to ensure clean state
    await alice.contacts.refreshConversation(bob.credentials.name)
    await alice.contacts.sendMessage("Secret message from Alice to Bob only!")
    await alice.contacts.waitForMessageSync()

    // Charlie navigates to Contacts and opens conversation with Alice
    // Charlie should see an empty conversation (no messages with Alice)
    await contactsCharlie.navigateToContacts()
    await contactsCharlie.openConversationWithMember(alice.credentials.name)

    // Charlie should NOT see the message Alice sent to Bob
    // The conversation with Alice should be empty
    await contactsCharlie.expectMessageNotInConversation("Secret message from Alice to Bob only!")

    // Clean up
    await alice.context.close()
    await bob.context.close()
    await contextCharlie.close()
  })
})
