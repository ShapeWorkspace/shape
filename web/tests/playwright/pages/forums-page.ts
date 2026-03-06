import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Forums tool interactions.
 * Used for testing forum channel, discussion, and reply flows with E2EE encryption.
 *
 * The Forums tool has a 3-level hierarchy:
 * 1. Forum Channels (ACL-protected, like Groups)
 * 2. Forum Discussions (within channels)
 * 3. Forum Discussion Replies (within discussions)
 */
export class ForumsPage {
  private readonly page: Page
  private readonly forumsToolButton: Locator
  private readonly forumsContainer: Locator
  private readonly discussionsListContainer: Locator
  private readonly discussionViewContainer: Locator
  private readonly channelNameInput: Locator
  private readonly discussionTitleInput: Locator
  private readonly discussionContentEditor: Locator
  private readonly replyEditor: Locator
  private readonly replySendButton: Locator
  private readonly breadcrumbBack: Locator
  private readonly sidecarContainer: Locator
  private readonly archivedToggleRow: Locator
  // Reply row test IDs are UUID-based; exclude reaction test IDs that share the prefix.
  private readonly replyRowTestIdPattern = /^forum-reply-[0-9a-f-]+$/i

  constructor(page: Page) {
    this.page = page
    this.forumsToolButton = page.getByTestId("tool-forum")
    this.forumsContainer = page.getByTestId("forum-tool-container")
    this.discussionsListContainer = page.getByTestId("forum-discussions-list")
    this.discussionViewContainer = page.getByTestId("forum-discussion-view")
    this.channelNameInput = page.getByTestId("create-channel-name-input")
    this.discussionTitleInput = page.getByTestId("create-discussion-title-input")
    this.discussionContentEditor = page.getByTestId("create-discussion-content-editor")
    this.replyEditor = page.getByTestId("forum-compose-reply-editor")
    // Send button is now inline inside the TipTap editor (testId pattern: ${editorTestId}-send)
    this.replySendButton = page.getByTestId("forum-compose-reply-editor-send")
    this.breadcrumbBack = page.getByTestId("breadcrumb-item-0")
    this.sidecarContainer = page.getByTestId("sidecar-container")
    this.archivedToggleRow = page.getByTestId("forum-discussions-archived-toggle")
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
   * Navigate to the Forums tool.
   * Handles multiple scenarios: tool selector, channel list, discussion list, or discussion view.
   */
  async navigateToForums(): Promise<void> {
    const result = await Promise.race([
      this.forumsToolButton.waitFor({ state: "visible", timeout: 10000 }).then(() => "tool-selector"),
      this.forumsContainer.waitFor({ state: "visible", timeout: 10000 }).then(() => "channels-list"),
      this.discussionsListContainer
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "discussions-list"),
      this.discussionViewContainer
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "discussion-view"),
    ])

    switch (result) {
      case "channels-list":
        // Already on channels list
        return

      case "discussions-list":
      case "discussion-view":
        // Go back to channels list
        await this.goBackToChannelsList()
        return

      case "tool-selector":
        // On tool selector, click to navigate to forums
        await this.forumsToolButton.click()
        await this.forumsContainer.waitFor({ state: "visible", timeout: 10000 })
        return
    }
  }

  /**
   * Assert that the forum channels list is visible.
   */
  async expectChannelsListVisible(): Promise<void> {
    await expect(this.forumsContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the discussions list is visible.
   */
  async expectDiscussionsListVisible(): Promise<void> {
    await expect(this.discussionsListContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the discussion view is visible.
   */
  async expectDiscussionViewVisible(): Promise<void> {
    await expect(this.discussionViewContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Get the number of channels shown in the list.
   */
  async getChannelCount(): Promise<number> {
    const channels = this.page.getByTestId(/^channel-item-/)
    return await channels.count()
  }

  /**
   * Assert that a channel with the given name is in the list.
   */
  async expectChannelInList(name: string): Promise<void> {
    const channelItem = this.page.locator('[data-testid^="channel-item-"]').filter({ hasText: name })
    await expect(channelItem).toBeVisible({ timeout: 15000 })
  }

  /**
   * Assert that a channel with the given name is NOT in the list.
   */
  async expectChannelNotInList(name: string): Promise<void> {
    const channelItem = this.page.locator('[data-testid^="channel-item-"]').filter({ hasText: name })
    await expect(channelItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Create a new forum channel with the given name.
   * After creation, navigates to the channel's discussions list, then back to channels.
   */
  async createChannel(name: string): Promise<void> {
    // Ensure the forum sidecar actions are ready before attempting to create.
    const newChannelAction = this.page.getByTestId("forum-new-channel-sidecar")
    await newChannelAction.waitFor({ state: "visible", timeout: 10000 })

    // Click the sidecar action to open the channel creation form.
    await newChannelAction.click({ force: true })
    try {
      await expect(this.channelNameInput).toBeVisible({ timeout: 5000 })
    } catch {
      // Retry once if the sidecar action click didn't open the form.
      await newChannelAction.click({ force: true })
      await expect(this.channelNameInput).toBeVisible({ timeout: 10000 })
    }
    await this.channelNameInput.fill(name)
    // Submit via Enter to avoid flaky sidecar button visibility in CI/containers.
    await this.channelNameInput.press("Enter")
    // Mutation is async; wait for either the discussions list or the new channel row to appear.
    const channelRow = this.page.locator('[data-testid^="channel-item-"]').filter({ hasText: name })
    await expect
      .poll(
        async () => {
          const discussionsVisible = await this.discussionsListContainer.isVisible().catch(() => false)
          const channelRowVisible = await channelRow.isVisible().catch(() => false)
          return discussionsVisible || channelRowVisible
        },
        { timeout: 20000 }
      )
      .toBe(true)

    // If the channel auto-opened, navigate back to the channels list.
    if (await this.discussionsListContainer.isVisible().catch(() => false)) {
      await this.goBackToChannelsList()
    } else {
      await this.forumsContainer.waitFor({ state: "visible", timeout: 10000 })
    }
  }

  /**
   * Open a channel by clicking on it in the list.
   * Waits for the discussions list to be visible.
   */
  async openChannel(channelName: string): Promise<void> {
    const channelItem = this.page.locator('[data-testid^="channel-item-"]').filter({ hasText: channelName })
    await expect(channelItem).toBeVisible({ timeout: 15000 })
    await expect
      .poll(
        async () => {
          if (await this.discussionsListContainer.isVisible().catch(() => false)) {
            return true
          }
          const row = this.page
            .locator('[data-testid^="channel-item-"]')
            .filter({ hasText: channelName })
            .first()
          const rowVisible = await row.isVisible().catch(() => false)
          if (!rowVisible) {
            return false
          }
          try {
            await row.click({ timeout: 1000 })
          } catch {
            return await this.discussionsListContainer.isVisible().catch(() => false)
          }
          return await this.discussionsListContainer.isVisible().catch(() => false)
        },
        { timeout: 15000 }
      )
      .toBe(true)
  }

  /**
   * Get the number of discussions shown in the current channel.
   */
  async getDiscussionCount(): Promise<number> {
    const discussions = this.page.getByTestId(/^discussion-item-/)
    return await discussions.count()
  }

  /**
   * Assert that a discussion with the given title is in the list.
   */
  async expectDiscussionInList(title: string): Promise<void> {
    const discussionItem = this.page.locator('[data-testid^="discussion-item-"]').filter({ hasText: title })
    await expect(discussionItem).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a discussion with the given title is NOT in the list.
   */
  async expectDiscussionNotInList(title: string): Promise<void> {
    const discussionItem = this.page.locator('[data-testid^="discussion-item-"]').filter({ hasText: title })
    await expect(discussionItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Expand or collapse archived discussions in the list.
   */
  async toggleArchivedDiscussions(): Promise<void> {
    await expect(this.archivedToggleRow).toBeVisible({ timeout: 5000 })
    await this.archivedToggleRow.click()
  }

  /**
   * Create a new discussion in the current channel.
   * Content is entered into a TipTapEditor (rich text).
   */
  async createDiscussion(title: string, content: string = ""): Promise<void> {
    await this.page.getByTestId("new-discussion-button").click()
    await expect(this.discussionTitleInput).toBeVisible({ timeout: 5000 })
    await this.discussionTitleInput.fill(title)
    if (content) {
      // TipTapEditor: click to focus, then type
      await this.discussionContentEditor.click()
      await this.page.keyboard.type(content)
    }
    await this.page.getByTestId("create-discussion-confirm-button").click()
    // App navigates to the discussion view after creation
    await this.discussionViewContainer.waitFor({ state: "visible", timeout: 10000 })
  }

  /**
   * Open a discussion by clicking on it in the list.
   */
  async openDiscussion(title: string): Promise<void> {
    const discussionItem = this.page.locator('[data-testid^="discussion-item-"]').filter({ hasText: title })
    await discussionItem.click()
    await this.discussionViewContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Get the discussion title from the view header.
   */
  async getDiscussionTitle(): Promise<string> {
    const header = this.page.getByTestId("forum-discussion-title")
    return (await header.textContent()) || ""
  }

  /**
   * Get the discussion body content.
   */
  async getDiscussionBody(): Promise<string> {
    const body = this.page.getByTestId("forum-discussion-body")
    return (await body.textContent()) || ""
  }

  /**
   * Send a reply in the current discussion.
   * Text is entered into a TipTapEditor (rich text).
   */
  async sendReply(text: string): Promise<void> {
    // TipTapEditor: click to focus, then type
    await this.replyEditor.click()
    await this.page.keyboard.type(text)
    await this.replySendButton.click()
    // Wait for reply to appear
    await this.expectReplyInDiscussion(text)
  }

  /**
   * Assert that a reply with the given text exists in the discussion.
   */
  async expectReplyInDiscussion(text: string): Promise<void> {
    const reply = this.page.getByTestId(this.replyRowTestIdPattern).filter({ hasText: text })
    await expect(reply).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a reply with the given text does NOT exist in the discussion.
   */
  async expectReplyNotInDiscussion(text: string): Promise<void> {
    const reply = this.page.getByTestId(this.replyRowTestIdPattern).filter({ hasText: text })
    await expect(reply).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Get the number of replies shown in the current discussion.
   */
  async getReplyCount(): Promise<number> {
    const replies = this.page.getByTestId(this.replyRowTestIdPattern)
    return await replies.count()
  }

  /**
   * Get all reply texts in the current discussion.
   */
  async getAllReplyTexts(): Promise<string[]> {
    const replies = this.page.getByTestId(this.replyRowTestIdPattern)
    const count = await replies.count()
    const texts: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await replies.nth(i).textContent()
      if (text) texts.push(text)
    }
    return texts
  }

  /**
   * Navigate back to channels list from discussions list or discussion view.
   */
  async goBackToChannelsList(): Promise<void> {
    // Click breadcrumb to go back
    await this.breadcrumbBack.click()
    // The list can take a moment to rehydrate after reload; wait before retrying.
    try {
      await this.forumsContainer.waitFor({ state: "visible", timeout: 3000 })
      return
    } catch {
      // Fallback: second click handles cases where the first click only steps back
      // one breadcrumb (discussion -> channel) before reaching the channels list.
      await this.breadcrumbBack.click()
      await this.forumsContainer.waitFor({ state: "visible", timeout: 5000 })
    }
  }

  /**
   * Navigate back to discussions list from discussion view.
   * Clicks the channel breadcrumb (item 1) to go back to discussions list.
   */
  async goBackToDiscussionsList(): Promise<void> {
    // When in discussion view, breadcrumb structure is: Forum (0) → Channel (1) → Discussion (current)
    // Click the channel breadcrumb to go back to discussions list
    await this.page.getByTestId("breadcrumb-item-1").click()
    await this.discussionsListContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Wait for data to sync to server.
   * Uses a conservative delay to account for debounce, network, and E2EE processing.
   */
  async waitForSync(): Promise<void> {
    await this.page.waitForTimeout(3000)
  }

  /**
   * Refresh the forums view by reloading and navigating back.
   * Uses "load" instead of "networkidle" to avoid hanging on SSE/polling connections.
   */
  async refreshForums(): Promise<void> {
    await this.clearWindowStorage()
    await this.page.reload({ waitUntil: "load" })
    await this.page.waitForTimeout(2000)
    const toolSelector = this.page.getByTestId("tool-selector")
    const homeButton = this.page.getByTestId("breadcrumb-back-button")

    // If we're not already on the tool selector, use the Home breadcrumb to reset.
    if (!(await toolSelector.isVisible())) {
      await homeButton.click()
      await toolSelector.waitFor({ state: "visible", timeout: 10000 })
    }

    // Re-enter the Forums tool to land on the channel list.
    await this.forumsToolButton.click()
    await this.forumsContainer.waitFor({ state: "visible", timeout: 10000 })
  }

  /**
   * Refresh and reopen a specific channel.
   */
  async refreshChannel(channelName: string): Promise<void> {
    await this.refreshForums()
    await this.openChannel(channelName)
  }

  /**
   * Refresh and reopen a specific discussion within a channel.
   */
  async refreshDiscussion(channelName: string, discussionTitle: string): Promise<void> {
    await this.refreshChannel(channelName)
    await this.openDiscussion(discussionTitle)
  }

  /**
   * Ensure the channel sidecar is visible.
   * The sidecar is automatically populated when viewing a channel's discussions list.
   */
  async openChannelSidecar(): Promise<void> {
    await this.ensureChannelSidecarActionVisible("forum-channel-rename")
  }

  /**
   * Ensure we're seeing the channel sidecar (not a stale/root sidecar).
   * Recovers with one reload if the expected channel action is missing.
   */
  private async ensureChannelSidecarActionVisible(testId: string): Promise<void> {
    const action = this.page.getByTestId(testId)
    await expect(this.sidecarContainer).toBeVisible({ timeout: 5000 })
    if (await action.isVisible().catch(() => false)) {
      return
    }

    await this.page.reload({ waitUntil: "domcontentloaded" })
    await this.discussionsListContainer.waitFor({ state: "visible", timeout: 10000 })
    await expect(this.sidecarContainer).toBeVisible({ timeout: 10000 })
    await expect(action).toBeVisible({ timeout: 10000 })
  }

  /**
   * Open the discussion sidecar for actions.
   * The sidecar is automatically populated when viewing a discussion,
   * but we click the header to ensure it's refreshed.
   */
  async openDiscussionSidecar(): Promise<void> {
    // The sidecar is auto-populated when viewing a discussion.
    // Click the discussion header to ensure we have the discussion sidecar open
    // (in case a reply sidecar was previously opened by clicking a reply).
    await this.page.getByTestId("forum-discussion-title").click()
    await expect(this.sidecarContainer).toBeVisible({ timeout: 5000 })
  }

  /**
   * Rename a channel via the sidecar.
   */
  async renameChannel(newName: string): Promise<void> {
    await this.openChannelSidecar()
    await this.page.getByTestId("forum-channel-rename").click()
    await this.page.getByTestId("forum-channel-rename-input").fill(newName)
    await this.page.getByTestId("forum-channel-rename-confirm").click()
    await this.page.waitForTimeout(1000)
  }

  /**
   * Delete a channel via the sidecar.
   */
  async deleteChannel(): Promise<void> {
    await this.openChannelSidecar()
    await this.page.getByTestId("forum-channel-delete").click()
    await this.page.getByTestId("confirm-delete-button").click()
    await this.page.waitForTimeout(1000)
  }

  /**
   * Pin or unpin a discussion via the sidecar.
   */
  async toggleDiscussionPin(): Promise<void> {
    await this.openDiscussionSidecar()
    await this.page.getByTestId("forum-discussion-pin-toggle").click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Archive or unarchive a discussion via the sidecar.
   */
  async toggleDiscussionArchive(): Promise<void> {
    await this.openDiscussionSidecar()
    await this.page.getByTestId("forum-discussion-archive-toggle").click()
  }

  /**
   * Assert whether the discussion is archived via the sidecar details.
   */
  async expectDiscussionArchivedStatus(expectedArchived: boolean): Promise<void> {
    await this.openDiscussionSidecar()
    const archivedMeta = this.page.getByTestId("forum-discussion-archived-meta")
    await expect(archivedMeta).toContainText(expectedArchived ? "Yes" : "No", { timeout: 5000 })
  }

  /**
   * Edit a discussion via the sidecar.
   * Body is entered into a TipTapEditor (rich text).
   */
  async editDiscussion(newTitle: string, newBody: string): Promise<void> {
    await this.openDiscussionSidecar()
    await this.page.getByTestId("forum-discussion-edit").click()
    await this.page.getByTestId("forum-discussion-edit-title-input").fill(newTitle)
    // TipTapEditor: need to clear existing content first, then type new content
    const bodyEditor = this.page.getByTestId("forum-discussion-edit-body-editor")
    await bodyEditor.click()
    // Select all and delete existing content
    await this.page.keyboard.press("Meta+A")
    await this.page.keyboard.press("Backspace")
    await this.page.keyboard.type(newBody)
    await this.page.getByTestId("forum-discussion-edit-confirm").click()
    await this.page.waitForTimeout(1000)
  }

  /**
   * Delete a discussion via the sidecar.
   */
  async deleteDiscussion(): Promise<void> {
    await this.openDiscussionSidecar()
    await this.page.getByTestId("forum-discussion-delete").click()
    await this.page.getByTestId("confirm-delete-button").click()
    await this.page.waitForTimeout(1000)
  }

  /**
   * Delete a reply by clicking on it to open sidecar and using delete action.
   */
  async deleteReply(replyText: string): Promise<void> {
    // Click on the reply to open its sidecar
    const reply = this.page.getByTestId(this.replyRowTestIdPattern).filter({ hasText: replyText })
    await reply.click()
    await expect(this.sidecarContainer).toBeVisible({ timeout: 5000 })
    // Click delete button in sidecar
    const deleteReplyRow = this.page.getByTestId("forum-reply-delete")
    await expect(deleteReplyRow).toBeVisible({ timeout: 10000 })
    await expect(deleteReplyRow).toHaveAttribute("data-disabled", "false")
    await deleteReplyRow.click()
    // Confirm deletion
    await this.page.getByTestId("confirm-delete-button").click()
    await this.page.waitForTimeout(1000)
  }

  /**
   * Assert that a discussion is pinned (has pin indicator).
   */
  async expectDiscussionPinned(title: string): Promise<void> {
    const discussionItem = this.page.locator('[data-testid^="discussion-item-"]').filter({ hasText: title })
    const pinIndicator = discussionItem.getByTestId("discussion-pinned-indicator")
    await expect(pinIndicator).toBeVisible({ timeout: 3000 })
  }

  /**
   * Assert that a discussion is NOT pinned.
   */
  async expectDiscussionNotPinned(title: string): Promise<void> {
    const discussionItem = this.page.locator('[data-testid^="discussion-item-"]').filter({ hasText: title })
    const pinIndicator = discussionItem.getByTestId("discussion-pinned-indicator")
    await expect(pinIndicator).not.toBeVisible({ timeout: 3000 })
  }

  /**
   * Open the members/ACL sidecar for the current channel.
   */
  async openMembersSidecar(): Promise<void> {
    await this.openChannelSidecar()
    await this.page.getByTestId("forum-channel-manage-members").click()
    await expect(this.page.getByTestId("acl-add-members")).toBeVisible({ timeout: 5000 })
  }

  /**
   * Add a member to the channel via the sidecar.
   * They are added as Editor by default.
   */
  async addMemberViaName(memberName: string): Promise<void> {
    await this.page.getByTestId("acl-add-members").click()
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
}
