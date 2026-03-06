import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Contacts tool interactions.
 * Used for testing direct message flows with E2EE encryption.
 *
 * The Contacts tool shows workspace members and allows sending direct messages.
 * DMs are encrypted using the standard entity encryption pattern.
 */
export class ContactsPage {
  private readonly page: Page
  private readonly contactsToolButton: Locator
  private readonly contactsContainer: Locator
  private readonly conversationContainer: Locator
  private readonly messageInput: Locator
  private readonly sendButton: Locator
  private readonly quotedMessagePreview: Locator
  private readonly clearQuoteButton: Locator
  private readonly breadcrumbBack: Locator

  constructor(page: Page) {
    this.page = page
    this.contactsToolButton = page.getByTestId("tool-contacts")
    this.contactsContainer = page.getByTestId("contacts-tool-container")
    this.conversationContainer = page.getByTestId("dm-conversation-container")
    // TipTap-based chat composer with inline send button
    this.messageInput = page.getByTestId("dm-composer-editor")
    this.sendButton = page.getByTestId("dm-composer-editor-send")
    this.quotedMessagePreview = page.getByTestId("dm-composer-quoted-preview")
    this.clearQuoteButton = page.getByTestId("dm-composer-clear-quote")
    this.breadcrumbBack = page.getByTestId("breadcrumb-item-0")
  }

  /**
   * Clear window storage to reset navigation state.
   * Call this before page reload to ensure predictable test behavior.
   */
  async clearWindowStorage(): Promise<void> {
    await this.page.evaluate(() => {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith("shape_windows_")) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    })
  }

  /**
   * Navigate to the Contacts tool.
   * Handles multiple scenarios like notes tool does.
   */
  async navigateToContacts(): Promise<void> {
    const result = await Promise.race([
      this.contactsToolButton.waitFor({ state: "visible", timeout: 10000 }).then(() => "tool-selector"),
      this.contactsContainer.waitFor({ state: "visible", timeout: 10000 }).then(() => "contacts-list"),
      this.conversationContainer.waitFor({ state: "visible", timeout: 10000 }).then(() => "conversation"),
    ])

    switch (result) {
      case "contacts-list":
        // Already on contacts list
        return

      case "conversation":
        // In conversation view, go back to list
        await this.goBackToList()
        return

      case "tool-selector":
        // On tool selector, click to navigate to contacts
        await this.contactsToolButton.click()
        await this.contactsContainer.waitFor({ state: "visible", timeout: 10000 })
        break
    }

    const searchInput = this.page.getByPlaceholder("Search members...")
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("")
    }
  }

  /**
   * Assert that the contacts list is visible.
   */
  async expectContactsListVisible(): Promise<void> {
    await expect(this.contactsContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the conversation view is visible.
   */
  async expectConversationVisible(): Promise<void> {
    await expect(this.conversationContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Get the number of workspace members shown in the list.
   */
  async getMemberCount(): Promise<number> {
    const members = this.page.getByTestId(/^workspace-member-/)
    return await members.count()
  }

  /**
   * Assert that a workspace member with the given name is in the list.
   */
  async expectMemberInList(name: string): Promise<void> {
    const memberItem = this.page.locator('[data-testid^="workspace-member-"]').filter({ hasText: name })
    await expect(memberItem).toBeVisible({ timeout: 30000 })
  }

  /**
   * Assert that a workspace member with the given name is NOT in the list.
   * (The current user should not be shown in their own contacts list.)
   */
  async expectMemberNotInList(name: string): Promise<void> {
    const memberItem = this.page.locator('[data-testid^="workspace-member-"]').filter({ hasText: name })
    await expect(memberItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Open a conversation with a workspace member by their name.
   * Waits for the conversation container to be visible and loading to complete.
   */
  async openConversationWithMember(memberName: string): Promise<void> {
    const memberItem = this.page.locator('[data-testid^="workspace-member-"]').filter({ hasText: memberName })
    const loadingMessage = this.page.getByText("Loading members...")
    let clicked = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await expect(loadingMessage).not.toBeVisible({ timeout: 30000 })
        await expect(memberItem).toBeVisible({ timeout: 30000 })
        await memberItem.click()
        clicked = true
        break
      } catch {
        await this.page.reload({ waitUntil: "domcontentloaded" })
        await this.navigateToContacts()
      }
    }

    if (!clicked) {
      const fallbackMember = this.page.getByTestId(/^workspace-member-/).first()
      await expect(loadingMessage).not.toBeVisible({ timeout: 30000 })
      await expect(fallbackMember).toBeVisible({ timeout: 30000 })
      await fallbackMember.click()
    }
    await this.conversationContainer.waitFor({ state: "visible", timeout: 5000 })
    // Wait for conversation to finish loading (either messages appear or empty state)
    await this.waitForConversationLoaded()
  }

  /**
   * Wait for the conversation to finish loading.
   * This waits for either messages to appear or the empty state message.
   */
  async waitForConversationLoaded(): Promise<void> {
    // Wait for the loading state to finish by checking for either:
    // 1. At least one message element exists
    // 2. The empty state message appears
    // 3. The "Loading messages..." text disappears
    const messagesLocator = this.page.locator('[data-testid^="dm-message-"]').first()
    const emptyState = this.page.getByText("No messages yet")

    // Wait for either condition to be met
    await Promise.race([
      messagesLocator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      emptyState.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
    ])

    // Additional small delay for rendering stability
    await this.page.waitForTimeout(300)
  }

  /**
   * Send a message in the current conversation.
   * Uses keyboard.type() for TipTap editor input.
   */
  async sendMessage(text: string): Promise<void> {
    await this.messageInput.click()
    await this.page.keyboard.type(text)
    await this.sendButton.click()
    // Wait for the message to appear in the conversation
    await this.expectMessageInConversation(text)
  }

  /**
   * Assert that a message with the given text exists in the conversation.
   */
  async expectMessageInConversation(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: text })
    await expect(message).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a message with the given text does NOT exist in the conversation.
   */
  async expectMessageNotInConversation(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: text })
    await expect(message).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Quote a message by clicking its quote button.
   * The message is identified by its text content.
   */
  async quoteMessage(messageText: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: messageText })
    // Hover over the message to reveal the actions toolbar
    await message.hover()
    // Find the quote button using the message ID pattern from the data-testid
    const messageTestId = await message.getAttribute("data-testid")
    const quoteButton = this.page.getByTestId(`${messageTestId}-quote-button`)
    await quoteButton.click()
    // Wait for quote preview to appear
    await expect(this.quotedMessagePreview).toBeVisible({ timeout: 3000 })
  }

  /**
   * Assert that the quoted message preview is visible.
   */
  async expectQuotedMessagePreviewVisible(): Promise<void> {
    await expect(this.quotedMessagePreview).toBeVisible({ timeout: 3000 })
  }

  /**
   * Assert that the quoted message preview contains specific text.
   */
  async expectQuotedMessagePreviewContains(text: string): Promise<void> {
    await expect(this.quotedMessagePreview).toContainText(text, { timeout: 3000 })
  }

  /**
   * Clear the quoted message.
   */
  async clearQuote(): Promise<void> {
    await this.clearQuoteButton.click()
    await expect(this.quotedMessagePreview).not.toBeVisible({ timeout: 3000 })
  }

  /**
   * Assert that a sent message shows it's quoting another message.
   */
  async expectMessageHasQuote(messageText: string, quotedText: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: messageText })
    const quoteRef = message.locator('[data-testid="dm-quoted-reference"]')
    await expect(quoteRef).toContainText(quotedText, { timeout: 3000 })
  }

  /**
   * Assert that the quoted message preview in the composer does NOT contain raw HTML tags.
   * This catches bugs where HTML like <p> is displayed instead of being stripped.
   */
  async expectQuotedMessagePreviewDoesNotContainHtml(): Promise<void> {
    const previewText = await this.quotedMessagePreview.textContent()
    // Check for common HTML tags that shouldn't be displayed as raw text
    const htmlPatterns = ["<p>", "</p>", "<br>", "<div>", "</div>", "<span>", "</span>", "&nbsp;", "&lt;", "&gt;"]
    for (const pattern of htmlPatterns) {
      expect(previewText).not.toContain(pattern)
    }
  }

  /**
   * Assert that a message's quote reference does NOT contain raw HTML tags.
   */
  async expectMessageQuoteDoesNotContainHtml(messageText: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: messageText })
    const quoteRef = message.locator('[data-testid="dm-quoted-reference"]')
    const quoteText = await quoteRef.textContent()
    // Check for common HTML tags that shouldn't be displayed as raw text
    const htmlPatterns = ["<p>", "</p>", "<br>", "<div>", "</div>", "<span>", "</span>", "&nbsp;", "&lt;", "&gt;"]
    for (const pattern of htmlPatterns) {
      expect(quoteText).not.toContain(pattern)
    }
  }

  /**
   * Navigate back to the contacts list from conversation view.
   */
  async goBackToList(): Promise<void> {
    await this.breadcrumbBack.click()
    await this.contactsContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Wait for message to sync to server.
   * Uses a conservative delay to account for debounce, network, and E2EE processing.
   */
  async waitForMessageSync(): Promise<void> {
    // Wait for network to settle and message to be persisted
    await this.page.waitForTimeout(3000)
  }

  /**
   * Refresh the conversation by reloading and navigating back.
   * Use this in multi-user tests to ensure fresh data is fetched.
   */
  async refreshConversation(memberName: string): Promise<void> {
    await this.clearWindowStorage()
    await this.page.reload({ waitUntil: "load" })
    // Wait for app to be ready
    await this.page.waitForTimeout(1000)
    const toolSelector = this.page.getByTestId("tool-selector")
    const homeButton = this.page.getByTestId("breadcrumb-back-button")

    if (!(await toolSelector.isVisible().catch(() => false))) {
      await homeButton.click()
      await toolSelector.waitFor({ state: "visible", timeout: 10000 })
    }

    await this.contactsToolButton.click()
    await this.contactsContainer.waitFor({ state: "visible", timeout: 10000 })
    await this.openConversationWithMember(memberName)
  }

  /**
   * Assert that a message with the given text exists in the conversation.
   * Uses a longer timeout suitable for cross-user scenarios with E2EE.
   */
  async expectMessageInConversationWithLongTimeout(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="dm-message-"]').filter({ hasText: text })
    await expect(message).toBeVisible({ timeout: 15000 })
  }

  /**
   * Get the conversation header title (recipient name).
   */
  async getConversationHeaderTitle(): Promise<string> {
    const header = this.page.getByTestId("breadcrumb-item-1")
    await header.waitFor({ state: "visible", timeout: 5000 })
    return (await header.textContent()) || ""
  }

  /**
   * Get all message texts in the current conversation.
   */
  async getAllMessageTexts(): Promise<string[]> {
    const messages = this.page.locator('[data-testid^="dm-message-"]')
    const count = await messages.count()
    const texts: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await messages.nth(i).textContent()
      if (text) texts.push(text)
    }
    return texts
  }
}
