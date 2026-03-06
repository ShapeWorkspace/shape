import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Focuses a TipTap editor and opens the @ mention suggestion list.
 * Returns the suggestion list + item locators for assertions.
 */
export async function openMentionSuggestions(
  page: Page,
  editorTestId: string
): Promise<{ suggestionList: Locator; suggestionItems: Locator }> {
  const editorContent = page.getByTestId(`${editorTestId}-content`)
  await editorContent.click()
  await page.keyboard.type("@")

  const suggestionList = page.getByTestId("mention-suggestion-list")
  await expect(suggestionList).toBeVisible({ timeout: 20000 })

  const suggestionItems = page.getByTestId(/mention-suggestion-item-/)
  await expect(suggestionItems.first()).toBeVisible({ timeout: 20000 })

  return { suggestionList, suggestionItems }
}
