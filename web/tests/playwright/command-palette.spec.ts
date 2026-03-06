/* eslint-env node */
import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { makeUser } from "./utils/test-data"

test.describe("Command Palette", () => {
  // Set a longer timeout for tests that involve navigation and entity creation
  test.setTimeout(30000)

  const makeCreds = () => makeUser()

  /**
   * Helper to set up an authenticated user with a workspace.
   * Returns the page objects for further interaction.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    try {
      await workspace.expectToolSelectorVisible({ timeout: 20000 })
    } catch {
      await workspace.createWorkspace("Test Workspace")
      await workspace.expectToolSelectorVisible({ timeout: 20000 })
    }
    await workspace.ensureToolSelectorVisible()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/w\//, { timeout: 10000 })

    return { auth, workspace, credentials: { email, password } }
  }

  /**
   * Helper to open the command palette using Cmd+K
   */
  async function openCommandPalette(page: Page) {
    // Use Cmd+K on Mac, Ctrl+K on Windows/Linux.
    // Fall back to Ctrl+K on Mac if Meta isn't delivered in headless Chromium.
    const shortcutCandidates =
      process.platform === "darwin" ? ["Meta+k", "Control+k"] : ["Control+k"]
    const commandPaletteLocator = page.getByTestId("command-palette")
    const commandPaletteInputLocator = page.getByTestId("command-palette-input")

    await page.getByTestId("tool-selector").click({ position: { x: 4, y: 4 } })

    for (const shortcutCandidate of shortcutCandidates) {
      await page.keyboard.press(shortcutCandidate)
      const isCommandPaletteVisible = await commandPaletteLocator.isVisible().catch(() => false)
      if (isCommandPaletteVisible) {
        break
      }
    }

    await expect(commandPaletteLocator).toBeVisible({ timeout: 5000 })
    await expect(commandPaletteInputLocator).toBeVisible({ timeout: 10000 })
  }

  /**
   * Helper to close the command palette using Escape
   */
  async function closeCommandPalette(page: Page) {
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("command-palette")).not.toBeVisible({ timeout: 5000 })
  }

  test("can open command palette with Cmd+K", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    // Command palette should not be visible initially
    await expect(page.getByTestId("command-palette")).not.toBeVisible()

    // Open with keyboard shortcut
    await openCommandPalette(page)

    // Should show the search input
    await expect(page.getByTestId("command-palette-input")).toBeVisible()
    await expect(page.getByTestId("command-palette-input")).toBeFocused()
  })

  test("can close command palette with Escape", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)
    await expect(page.getByTestId("command-palette")).toBeVisible()

    await closeCommandPalette(page)
    await expect(page.getByTestId("command-palette")).not.toBeVisible()
  })

  test("can close command palette by clicking backdrop", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)
    await expect(page.getByTestId("command-palette")).toBeVisible()

    // Click on the backdrop (outside the palette)
    await page.locator('[role="dialog"]').click({ position: { x: 10, y: 10 } })
    await expect(page.getByTestId("command-palette")).not.toBeVisible()
  })

  test("shows actions when opened", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Should show some default actions
    await expect(page.getByTestId("command-palette-item-create-note")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("command-palette-item-go-to-notes")).toBeVisible({ timeout: 10000 })
  })

  test("can navigate to notes using command palette", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Filter directly to "Go to Memos" and select the first result.
    await page.getByTestId("command-palette-input").fill("Go to Memos")
    await expect(page.getByTestId("command-palette-item-go-to-notes")).toBeVisible({ timeout: 10000 })
    await page.keyboard.press("Enter")

    // Command palette should close
    await expect(page.getByTestId("command-palette")).not.toBeVisible()

    // Should navigate to memos tool (verify via URL)
    await expect(page).toHaveURL(/\/memos/, { timeout: 10000 })
  })

  test("can create a note using command palette", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Filter directly to "Create memo" and select the first result.
    await page.getByTestId("command-palette-input").fill("Create memo")
    await expect(page.getByTestId("command-palette-item-create-note")).toBeVisible({ timeout: 10000 })
    await page.keyboard.press("Enter")

    // Command palette should close
    await expect(page.getByTestId("command-palette")).not.toBeVisible()

    // Should navigate to new note editor (verify via URL and note title input)
    await expect(page).toHaveURL(/\/memos\//, { timeout: 15000 })
    await expect(page.getByTestId("note-title-input")).toBeVisible({ timeout: 10000 })
  })

  test("can use keyboard navigation to select actions", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Filter to show fewer results
    await page.getByTestId("command-palette-input").fill("go to")

    // Use arrow down to navigate to second item
    await page.keyboard.press("ArrowDown")

    // Press Enter to select
    await page.keyboard.press("Enter")

    // Command palette should close
    await expect(page.getByTestId("command-palette")).not.toBeVisible()
  })

  test("filters actions as user types", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Initially should show "Create note"
    await expect(page.getByTestId("command-palette-item-create-note")).toBeVisible({ timeout: 10000 })

    // Type to filter
    await page.getByTestId("command-palette-input").fill("file")

    // Should show project-related actions
    await expect(page.getByTestId("command-palette-item-upload-file")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("command-palette-item-go-to-files")).toBeVisible({ timeout: 10000 })

    // "Create note" should no longer be visible (filtered out)
    await expect(page.getByTestId("command-palette-item-create-note")).not.toBeVisible()
  })

  test("can toggle command palette open and closed with Cmd+K", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    // Open
    await openCommandPalette(page)
    await expect(page.getByTestId("command-palette")).toBeVisible()

    // Toggle closed
    const modifier = process.platform === "darwin" ? "Meta" : "Control"
    await page.keyboard.press(`${modifier}+k`)
    await expect(page.getByTestId("command-palette")).not.toBeVisible()

    // Toggle open again
    await page.keyboard.press(`${modifier}+k`)
    await expect(page.getByTestId("command-palette")).toBeVisible()
  })

  test("can navigate to settings using command palette", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    await openCommandPalette(page)

    // Type to filter to settings
    await page.getByTestId("command-palette-input").fill("Go to Settings")

    // Wait for "Go to Settings" action to be visible after filtering
    await expect(page.getByTestId("command-palette-item-go-to-settings")).toBeVisible({ timeout: 10000 })

    // Select the action via keyboard to avoid list re-render flakiness.
    await page.keyboard.press("Enter")

    // Command palette should close and navigate to settings (verify via URL)
    await expect(page.getByTestId("command-palette")).not.toBeVisible()
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 })
  })

  test("clears search query when closed", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    // Open and type something
    await openCommandPalette(page)
    await page.getByTestId("command-palette-input").fill("test query")
    await expect(page.getByTestId("command-palette-input")).toHaveValue("test query")

    // Close
    await closeCommandPalette(page)

    // Reopen - query should be cleared
    await openCommandPalette(page)
    await expect(page.getByTestId("command-palette-input")).toHaveValue("")
  })
})
