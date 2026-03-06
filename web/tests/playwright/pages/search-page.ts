import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Search functionality across all tools.
 * Used for testing the FlexSearch-powered full-text search with context chips.
 */
export class SearchPage {
  private readonly page: Page
  private readonly toolSelectorSearchInput: Locator
  private readonly notesSearchInput: Locator
  private readonly tasksSearchInput: Locator
  private readonly searchResultsList: Locator

  constructor(page: Page) {
    this.page = page
    // Global search on the tool selector (root page)
    this.toolSelectorSearchInput = page.getByTestId("tool-selector-search-input")
    // Tool-specific search inputs
    this.notesSearchInput = page.getByTestId("notes-search-input")
    this.tasksSearchInput = page.getByTestId("tasks-search-input")
    // Search results container
    this.searchResultsList = page.getByTestId("search-results-list")
  }

  /**
   * Fill an input using page.evaluate to work around CDP keyboard event issues.
   * Uses React's internal fiber to trigger onChange properly.
   */
  private async fillInputViaEvaluate(testId: string, value: string): Promise<void> {
    // Use Playwright's locator.evaluate to set the value and trigger React's onChange.
    // We type character-by-character using InputEvent to simulate real user typing,
    // which works with React's synthetic event system on controlled inputs.
    const locator = this.page.getByTestId(testId)
    await locator.evaluate((el: HTMLInputElement, val: string) => {
      el.focus()
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set
      if (!nativeSetter) throw new Error("Cannot find native value setter")

      // Clear existing value first
      nativeSetter.call(el, "")
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }))

      // Type each character to trigger React's onChange via InputEvent
      for (const char of val) {
        const prevValue = el.value
        nativeSetter.call(el, prevValue + char)
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }))
      }
    }, value)
  }

  /**
   * Clear window storage to reset navigation state.
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
   * Perform a global search from the tool selector (root page).
   * This searches across ALL entity types with no initial filter.
   */
  async searchGlobally(query: string): Promise<void> {
    await this.fillInputViaEvaluate("tool-selector-search-input", query)
    await this.page.waitForTimeout(500)
  }

  /**
   * Focus the global search input on the tool selector.
   */
  async focusGlobalSearch(): Promise<void> {
    await this.toolSelectorSearchInput.focus()
  }

  /**
   * Perform a search within the Notes tool.
   */
  async searchInNotes(query: string): Promise<void> {
    await this.fillInputViaEvaluate("notes-search-input", query)
    await this.page.waitForTimeout(500)
  }

  /**
   * Focus the notes search input.
   */
  async focusNotesSearch(): Promise<void> {
    await this.notesSearchInput.focus()
  }

  /**
   * Perform a search within the Tasks tool.
   */
  async searchInTasks(query: string): Promise<void> {
    await this.fillInputViaEvaluate("tasks-search-input", query)
    await this.page.waitForTimeout(500)
  }

  /**
   * Focus the tasks search input.
   */
  async focusTasksSearch(): Promise<void> {
    await this.tasksSearchInput.focus()
  }

  /**
   * Clear the search input (any active search).
   */
  async clearSearch(): Promise<void> {
    // Clear any active search input by setting empty value
    await this.page.evaluate(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        '[data-testid="notes-search-input"], [data-testid="tool-selector-search-input"], [data-testid="tasks-search-input"]'
      )
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set
      if (!nativeSetter) return
      for (const el of inputs) {
        if (el.value) {
          nativeSetter.call(el, "")
          el.dispatchEvent(new Event("input", { bubbles: true }))
        }
      }
    })
    await this.page.waitForTimeout(300)
  }

  /**
   * Assert that search results are visible.
   */
  async expectSearchResultsVisible(): Promise<void> {
    await expect(this.searchResultsList).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that a search result with the given text is visible.
   * Uses .first() to handle cases where multiple results contain the text.
   */
  async expectSearchResultWithText(text: string): Promise<void> {
    const resultItem = this.page.getByTestId("search-result-item").filter({ hasText: text }).first()
    await expect(resultItem).toBeVisible({ timeout: 15000 })
  }

  /**
   * Wait for a search result containing the given text to appear.
   * Useful for newly indexed entities that may take a moment to show up.
   */
  async waitForSearchResultWithText(text: string, timeoutMs = 20000): Promise<void> {
    await expect
      .poll(
        async () => {
          const resultItem = this.page.getByTestId("search-result-item").filter({ hasText: text })
          return await resultItem.count()
        },
        { timeout: timeoutMs }
      )
      .toBeGreaterThan(0)
  }

  /**
   * Wait for at least a minimum number of search results to appear.
   */
  async waitForSearchResultCountAtLeast(minCount: number, timeoutMs = 20000): Promise<void> {
    await expect
      .poll(async () => await this.getSearchResultCount(), { timeout: timeoutMs })
      .toBeGreaterThanOrEqual(minCount)
  }

  /**
   * Wait for the search results count to equal an exact value.
   */
  async waitForSearchResultCount(expectedCount: number, timeoutMs = 20000): Promise<void> {
    await expect
      .poll(async () => await this.getSearchResultCount(), { timeout: timeoutMs })
      .toBe(expectedCount)
  }

  /**
   * Wait for a search result containing the given text to disappear.
   * Useful for asserting index updates after edits/deletes.
   */
  async waitForSearchResultToDisappear(text: string, timeoutMs = 20000): Promise<void> {
    await expect
      .poll(
        async () => {
          const resultItem = this.page.getByTestId("search-result-item").filter({ hasText: text })
          return await resultItem.count()
        },
        { timeout: timeoutMs }
      )
      .toBe(0)
  }

  /**
   * Assert that no search result with the given text is visible.
   */
  async expectNoSearchResultWithText(text: string): Promise<void> {
    const resultItem = this.page.getByTestId("search-result-item").filter({ hasText: text })
    await expect(resultItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Click on a search result with the given text.
   */
  async clickSearchResult(text: string): Promise<void> {
    const resultItem = this.page.getByTestId("search-result-item").filter({ hasText: text })
    await resultItem.click()
  }

  /**
   * Click the first visible search result.
   */
  async clickFirstSearchResult(): Promise<void> {
    const resultItem = this.page.getByTestId("search-result-item").first()
    await resultItem.click()
  }

  /**
   * Assert that the search bar has no filter chips (new UI defaults to chipless search).
   */
  async expectNoSearchChips(): Promise<void> {
    const chips = this.page.getByTestId("search-chip")
    await expect(chips).toHaveCount(0)
  }

  /**
   * Assert that search results are grouped by entity type.
   */
  async expectSearchResultsGroupedByType(): Promise<void> {
    // Check for section headers in search results
    const sectionHeaders = this.page.getByTestId("search-results-section-header")
    await expect(sectionHeaders.first()).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a specific section header is visible in search results.
   */
  async expectSearchSectionVisible(sectionName: string): Promise<void> {
    const sectionHeader = this.page
      .getByTestId("search-results-section-header")
      .filter({ hasText: sectionName })
    await expect(sectionHeader).toBeVisible({ timeout: 5000 })
  }

  /**
   * Wait for the search index to be ready.
   * The FlexSearch index uses a 2.5s debounce before flushing queued documents.
   * Wait long enough for the debounce to complete plus buffer.
   */
  async waitForSearchIndexReady(): Promise<void> {
    // Wait for the FlexSearch debounce (2.5s) to flush + buffer
    await this.page.waitForTimeout(4000)
  }

  /**
   * Get the count of search results.
   */
  async getSearchResultCount(): Promise<number> {
    const results = this.page.getByTestId("search-result-item")
    return await results.count()
  }

  /**
   * Assert that global search has no chips (searches everything).
   */
  async expectGlobalSearchHasNoChips(): Promise<void> {
    await this.focusGlobalSearch()
    await this.expectNoSearchChips()
  }
}
