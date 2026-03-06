import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Groups tool interactions.
 * Used for testing group chat flows with E2EE encryption and ACL-based access control.
 *
 * The Groups tool shows the user's group chats (based on ACL) and allows
 * sending messages within groups. Group chats use ACL for access control
 * (similar to Projects) and entity encryption for message content.
 */
type GroupsNavigationState = "tool-selector" | "groups-list" | "group-chat"

export class GroupsPage {
  private readonly page: Page
  private readonly groupsToolButton: Locator
  private readonly groupsContainer: Locator
  private readonly groupChatContainer: Locator
  private readonly messageInput: Locator
  private readonly sendButton: Locator
  private readonly quotedMessagePreview: Locator
  private readonly clearQuoteButton: Locator
  private readonly createGroupButton: Locator
  private readonly createGroupNameInput: Locator
  private readonly createGroupSubmitButton: Locator
  private readonly breadcrumbBack: Locator
  private readonly sidecarContainer: Locator
  private readonly sidecarToggleButton: Locator

  constructor(page: Page) {
    this.page = page
    this.groupsToolButton = page.getByTestId("tool-groups")
    this.groupsContainer = page.getByTestId("groups-tool-container")
    this.groupChatContainer = page.getByTestId("group-chat-conversation-container")
    // TipTap-based chat composer with inline send button
    this.messageInput = page.getByTestId("group-composer-editor")
    this.sendButton = page.getByTestId("group-composer-editor-send")
    this.quotedMessagePreview = page.getByTestId("group-composer-quoted-preview")
    this.clearQuoteButton = page.getByTestId("group-composer-clear-quote")
    this.createGroupButton = page.getByTestId("groups-create-button")
    this.createGroupNameInput = page.getByTestId("create-group-name-input")
    this.createGroupSubmitButton = page.getByTestId("form-sidecar-submit")
    this.breadcrumbBack = page.getByTestId("breadcrumb-item-0")
    this.sidecarContainer = page.getByTestId("sidecar-container")
    this.sidecarToggleButton = page.getByTestId("sidecar-toggle")
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
   * Navigate to the Groups tool.
   * Handles multiple scenarios: tool selector, group list, or group chat view.
   */
  async navigateToGroups(): Promise<void> {
    let navigationStateResult: GroupsNavigationState | null = null
    try {
      const waitForToolSelectorVisibility: Promise<GroupsNavigationState> = this.groupsToolButton
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "tool-selector")
      const waitForGroupsListVisibility: Promise<GroupsNavigationState> = this.groupsContainer
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "groups-list")
      const waitForGroupChatVisibility: Promise<GroupsNavigationState> = this.groupChatContainer
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "group-chat")

      navigationStateResult = await Promise.race([
        waitForToolSelectorVisibility,
        waitForGroupsListVisibility,
        waitForGroupChatVisibility,
      ])
    } catch {
      navigationStateResult = null
    }

    switch (navigationStateResult) {
      case "groups-list":
        // Already on groups list
        return

      case "group-chat":
        // In group chat view, go back to list
        await this.goBackToList()
        return

      case "tool-selector":
        // On tool selector, click to navigate to groups
        await this.groupsToolButton.click()
        await this.groupsContainer.waitFor({ state: "visible", timeout: 10000 })
        return
    }

    const currentUrl = this.page.url()
    const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
    if (workspaceMatch) {
      // Fallback for routes without the tool selector (e.g., Settings).
      await this.page.goto(`/w/${workspaceMatch[1]}/groups`, { waitUntil: "domcontentloaded" })
      await this.groupsContainer.waitFor({ state: "visible", timeout: 10000 })
      return
    }

    throw new Error("Unable to navigate to Groups tool from the current route.")
  }

  /**
   * Assert that the groups list is visible.
   */
  async expectGroupsListVisible(): Promise<void> {
    await expect(this.groupsContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the group chat view is visible.
   */
  async expectGroupChatVisible(): Promise<void> {
    await expect(this.groupChatContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Get the number of group chats shown in the list.
   */
  async getGroupCount(): Promise<number> {
    const groups = this.page.getByTestId(/^group-chat-row-/)
    return await groups.count()
  }

  /**
   * Assert that a group with the given name is in the list.
   */
  async expectGroupInList(name: string): Promise<void> {
    const groupItem = this.page.locator('[data-testid^="group-chat-row-"]').filter({ hasText: name })
    await expect(groupItem).toBeVisible({ timeout: 15000 })
  }

  /**
   * Assert that a group with the given name is NOT in the list.
   */
  async expectGroupNotInList(name: string): Promise<void> {
    const groupItem = this.page.locator('[data-testid^="group-chat-row-"]').filter({ hasText: name })
    await expect(groupItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Create a new group chat with the given name.
   * After creation, navigates back to the groups list.
   */
  async createGroup(name: string): Promise<void> {
    await this.createGroupButton.click()
    await expect(this.createGroupNameInput).toBeVisible({ timeout: 5000 })
    await this.createGroupNameInput.fill(name)
    await this.createGroupSubmitButton.click()
    // App navigates to the group chat after creation, wait for it
    await this.groupChatContainer.waitFor({ state: "visible", timeout: 10000 })
    // Navigate back to the list
    await this.goBackToList()
  }

  /**
   * Open a group chat by clicking on it in the list.
   * Waits for the chat container to be visible and loading to complete.
   */
  async openGroup(groupName: string): Promise<void> {
    await this.navigateToGroups()
    const groupItem = this.page.locator('[data-testid^="group-chat-row-"]').filter({ hasText: groupName })
    let opened = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await expect(groupItem).toBeVisible({ timeout: 20000 })
        // Group rows can re-render during sync; use DOM click to avoid stability checks.
        await groupItem.evaluate(element => {
          element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        })
        opened = true
        break
      } catch {
        await this.page.reload({ waitUntil: "domcontentloaded" })
        await this.navigateToGroups()
      }
    }

    if (!opened) {
      throw new Error(`Group chat not visible in list: ${groupName}`)
    }
    await this.groupChatContainer.waitFor({ state: "visible", timeout: 5000 })
    // Wait for chat to finish loading
    await this.waitForChatLoaded()
  }

  /**
   * Wait for the group chat to finish loading.
   * This waits for either messages to appear or the empty state message.
   */
  async waitForChatLoaded(): Promise<void> {
    const messagesLocator = this.page.locator('[data-testid^="group-message-"]').first()
    const emptyState = this.page.getByText("No messages yet")

    await Promise.race([
      messagesLocator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      emptyState.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
    ])

    // Additional small delay for rendering stability
    await this.page.waitForTimeout(300)
  }

  /**
   * Send a message in the current group chat.
   * Uses keyboard.type() for TipTap editor input.
   */
  async sendMessage(text: string): Promise<void> {
    const editorContent = this.page.getByTestId("group-composer-editor-content")
    await expect(editorContent).toBeVisible({ timeout: 5000 })
    await this.messageInput.click()
    await editorContent.click()
    await this.page.keyboard.type(text)
    await expect
      .poll(async () => await this.sendButton.isEnabled().catch(() => false), { timeout: 5000 })
      .toBe(true)
    await this.sendButton.click()
    // Wait for the message to appear in the chat
    await this.expectMessageInChat(text)
  }

  /**
   * Assert that a message with the given text exists in the group chat.
   */
  async expectMessageInChat(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: text })
    await expect(message).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a message with the given text does NOT exist in the group chat.
   */
  async expectMessageNotInChat(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: text })
    await expect(message).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Quote a message by clicking its quote button.
   * The message is identified by its text content.
   */
  async quoteMessage(messageText: string): Promise<void> {
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: messageText })
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
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: messageText })
    const quoteRef = message.locator('[data-testid="group-quoted-reference"]')
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
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: messageText })
    const quoteRef = message.locator('[data-testid="group-quoted-reference"]')
    const quoteText = await quoteRef.textContent()
    // Check for common HTML tags that shouldn't be displayed as raw text
    const htmlPatterns = ["<p>", "</p>", "<br>", "<div>", "</div>", "<span>", "</span>", "&nbsp;", "&lt;", "&gt;"]
    for (const pattern of htmlPatterns) {
      expect(quoteText).not.toContain(pattern)
    }
  }

  /**
   * Navigate back to the groups list from group chat view.
   */
  async goBackToList(): Promise<void> {
    await this.breadcrumbBack.click()
    await this.groupsContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Wait for message to sync to server.
   * Uses a conservative delay to account for debounce, network, and E2EE processing.
   */
  async waitForMessageSync(): Promise<void> {
    await this.page.waitForTimeout(3000)
  }

  /**
   * Refresh the group chat by reloading and navigating back.
   * Use this in multi-user tests to ensure fresh data is fetched.
   */
  async refreshGroupChat(groupName: string): Promise<void> {
    await this.clearWindowStorage()
    await this.page.reload({ waitUntil: "load" })
    // Give the app a beat to restore shell state before navigation.
    await this.page.waitForTimeout(1000)
    const toolSelector = this.page.getByTestId("tool-selector")
    const homeButton = this.page.getByTestId("breadcrumb-back-button")

    // Ensure we are at the tool selector before re-entering Groups.
    if (!(await toolSelector.isVisible().catch(() => false))) {
      await homeButton.click()
      await toolSelector.waitFor({ state: "visible", timeout: 10000 })
    }

    await this.groupsToolButton.click()
    await this.groupsContainer.waitFor({ state: "visible", timeout: 10000 })
    await this.openGroup(groupName)
  }

  /**
   * Assert that a message with the given text exists in the group chat.
   * Uses a longer timeout suitable for cross-user scenarios with E2EE.
   */
  async expectMessageInChatWithLongTimeout(text: string): Promise<void> {
    const message = this.page.locator('[data-testid^="group-message-"]').filter({ hasText: text })
    await expect(message).toBeVisible({ timeout: 15000 })
  }

  /**
   * Get all message texts in the current group chat.
   */
  async getAllMessageTexts(): Promise<string[]> {
    const messages = this.page.locator('[data-testid^="group-message-"]')
    const count = await messages.count()
    const texts: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await messages.nth(i).textContent()
      if (text) texts.push(text)
    }
    return texts
  }

  /**
   * Open the members sidecar for the current group.
   * This opens the GroupChatSidecar first, then navigates to ManageMembersSidecarMenu.
   */
  async openMembersSidecar(): Promise<void> {
    if (!(await this.sidecarContainer.isVisible())) {
      await this.sidecarToggleButton.click()
      await expect(this.sidecarContainer).toBeVisible({ timeout: 5000 })
    }
    const manageMembersView = this.page.getByTestId("acl-add-members")
    // If we are already in the manage members view, no need to navigate deeper.
    if (await manageMembersView.isVisible()) {
      return
    }
    // Click "Manage members" to go to the member management view
    await this.page.getByTestId("group-chat-manage-members").click()
    // Wait for the manage members view to load
    await expect(manageMembersView).toBeVisible({ timeout: 5000 })
  }

  /**
   * Add a member to the group via the sidecar.
   * The member is identified by their name. They are added as Editor by default.
   */
  async addMemberViaName(memberName: string): Promise<void> {
    // Click "Add members" in the manage members sidecar
    await this.page.getByTestId("acl-add-members").click()
    // Wait for subject selection view to load
    await this.page.waitForTimeout(500)
    // Clicking a member/team immediately adds them as Editor
    const subjectItem = this.page.locator('[data-testid^="add-subject-"]').filter({ hasText: memberName })
    await subjectItem.click()
    // Wait for the ACL entry to be created
    await this.page.waitForTimeout(1000)
  }

  /**
   * Assert that a member is in the sidecar members list.
   */
  async expectMemberInSidecar(memberName: string): Promise<void> {
    const memberItem = this.page.locator('[data-testid^="acl-entry-"]').filter({ hasText: memberName })
    await expect(memberItem).toBeVisible({ timeout: 5000 })
  }

  /**
   * Remove a member from the group via the sidecar.
   */
  async removeMemberViaName(memberName: string): Promise<void> {
    const memberItem = this.page.locator('[data-testid^="acl-entry-"]').filter({ hasText: memberName })
    await expect(memberItem).toBeVisible({ timeout: 10000 })
    await memberItem.click()
    const removeAccessButton = this.page.getByTestId("role-remove-access")
    await expect(removeAccessButton).toBeVisible({ timeout: 5000 })
    await removeAccessButton.click()
    await expect(memberItem).not.toBeVisible({ timeout: 15000 })
  }
}
