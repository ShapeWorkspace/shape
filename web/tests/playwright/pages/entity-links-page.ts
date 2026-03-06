import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Entity Links testing.
 * Provides utilities for testing entity link copy/paste/navigation functionality
 * across different tools (papers, tasks, notes, etc.).
 */
export class EntityLinksPage {
  private readonly page: Page
  private readonly copyLinkButton: Locator
  private readonly paperEditorContent: Locator

  constructor(page: Page) {
    this.page = page
    this.copyLinkButton = page.getByTestId("copy-entity-link")
    this.paperEditorContent = page.getByTestId("paper-tiptap-editor-content")
  }

  /**
   * Click the "Copy link" action in the sidecar.
   * Expects the sidecar to be visible with a Copy link action.
   */
  async clickCopyLink(): Promise<void> {
    await this.copyLinkButton.click()
  }

  /**
   * Assert that the Copy link button is visible in the sidecar.
   */
  async expectCopyLinkVisible(): Promise<void> {
    await expect(this.copyLinkButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Get the clipboard contents.
   * Note: This requires clipboard permissions in the browser context.
   */
  async getClipboardText(): Promise<string> {
    return await this.page.evaluate(async () => {
      return await navigator.clipboard.readText()
    })
  }

  /**
   * Verify that the clipboard contains a valid entity URL.
   * Checks that the URL matches the expected pattern: /w/{workspaceId}/{tool}/{itemId}
   * For tasks: /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
   */
  async expectClipboardContainsEntityUrl(tool: string): Promise<void> {
    const clipboardText = await this.getClipboardText()
    // URL patterns:
    // - tasks: /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
    // - others: /w/{workspaceId}/{tool}/{itemId}
    let urlPattern: RegExp
    if (tool === "tasks") {
      urlPattern = /\/w\/[a-zA-Z0-9-]+\/projects\/[a-zA-Z0-9-]+\/tasks\/[a-zA-Z0-9-]+/
    } else {
      urlPattern = new RegExp(`/w/[a-zA-Z0-9-]+/${tool}/[a-zA-Z0-9-]+`)
    }
    expect(clipboardText).toMatch(urlPattern)
  }

  /**
   * Paste content from clipboard into the TipTap editor.
   * Focuses the editor and triggers a paste event.
   */
  async pasteIntoEditor(): Promise<void> {
    await this.paperEditorContent.click()
    // Use keyboard shortcut to paste
    await this.page.keyboard.press("Meta+v")
  }

  /**
   * Type a URL directly into the TipTap editor.
   * Simulates typing a URL character by character.
   */
  async typeUrlIntoEditor(url: string): Promise<void> {
    await this.paperEditorContent.click()
    await this.page.keyboard.type(url)
  }

  /**
   * Assert that an entity link chip is visible in the editor.
   * Entity link chips have data-testid="entity-link-chip".
   */
  async expectEntityLinkChipVisible(): Promise<void> {
    const chip = this.paperEditorContent.locator('[data-testid="entity-link-chip"]')
    await expect(chip).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that an entity link chip with a specific title is visible.
   */
  async expectEntityLinkChipWithTitle(title: string): Promise<void> {
    const chip = this.paperEditorContent.locator(`[data-testid="entity-link-chip"]:has-text("${title}")`)
    await expect(chip).toBeVisible({ timeout: 5000 })
  }

  /**
   * Get the count of entity link chips in the editor.
   */
  async getEntityLinkChipCount(): Promise<number> {
    const chips = this.paperEditorContent.locator('[data-testid="entity-link-chip"]')
    return await chips.count()
  }

  /**
   * Click an entity link chip in the editor.
   * Clicks the first chip if multiple are present.
   */
  async clickEntityLinkChip(): Promise<void> {
    const chip = this.paperEditorContent.locator('[data-testid="entity-link-chip"]').first()
    await chip.click()
  }

  /**
   * Click an entity link chip with a specific title.
   */
  async clickEntityLinkChipWithTitle(title: string): Promise<void> {
    const chip = this.paperEditorContent.locator(`[data-testid="entity-link-chip"]:has-text("${title}")`)
    await chip.click()
  }

  /**
   * Assert that a new window tab was opened.
   * Checks that there are multiple window tabs visible.
   */
  async expectMultipleWindowTabs(): Promise<void> {
    const tabs = this.page.locator('[data-testid^="window-tab-"]')
    const count = await tabs.count()
    expect(count).toBeGreaterThan(1)
  }

  /**
   * Get the number of window tabs.
   */
  async getWindowTabCount(): Promise<number> {
    const tabs = this.page.locator('[data-testid^="window-tab-"]')
    return await tabs.count()
  }

  /**
   * Assert that the current URL contains the expected tool and item.
   */
  async expectUrlContains(tool: string, itemId?: string): Promise<void> {
    await expect.poll(() => this.page.url(), { timeout: 10000 }).toContain(`/${tool}`)
    if (itemId) {
      await expect.poll(() => this.page.url(), { timeout: 10000 }).toContain(`/${itemId}`)
    }
  }

  /**
   * Assert that a regular link (not entity link chip) is visible in the editor.
   * Regular links are rendered as <a> tags.
   */
  async expectRegularLinkVisible(): Promise<void> {
    const link = this.paperEditorContent.locator("a")
    await expect(link).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that no entity link chip is visible in the editor.
   */
  async expectNoEntityLinkChip(): Promise<void> {
    const chip = this.paperEditorContent.locator('[data-testid="entity-link-chip"]')
    await expect(chip).not.toBeVisible({ timeout: 3000 })
  }

  /**
   * Get the href of the first regular link in the editor.
   */
  async getFirstLinkHref(): Promise<string | null> {
    const link = this.paperEditorContent.locator("a").first()
    return await link.getAttribute("href")
  }

  /**
   * Wait for the editor to be ready for input.
   */
  async waitForEditorReady(): Promise<void> {
    await this.paperEditorContent.waitFor({ state: "visible", timeout: 5000 })
    // Small delay to ensure TipTap is fully initialized
    await this.page.waitForTimeout(200)
  }

  /**
   * Clear the editor content by selecting all and deleting.
   */
  async clearEditorContent(): Promise<void> {
    await this.paperEditorContent.click()
    await this.page.keyboard.press("Meta+a")
    await this.page.keyboard.press("Backspace")
  }
}
