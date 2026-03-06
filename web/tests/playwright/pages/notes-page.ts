import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Notes tool interactions.
 * Used for testing note CRUD operations with E2EE encryption.
 */
export class NotesPage {
  private readonly page: Page
  private readonly notesToolButton: Locator
  private readonly notesContainer: Locator
  private readonly busyMain: Locator
  private readonly newNoteButton: Locator
  private readonly noteTitleInput: Locator
  private readonly noteContentInput: Locator
  private readonly noteDeleteButton: Locator
  private readonly notesListBreadcrumb: Locator
  private readonly searchInput: Locator

  constructor(page: Page) {
    this.page = page
    this.notesToolButton = page.getByTestId("tool-memos")
    this.notesContainer = page.getByTestId("notes-tool-container")
    this.busyMain = page.locator('main[aria-busy="true"]')
    this.newNoteButton = page.getByTestId("new-note-button")
    this.noteTitleInput = page.getByTestId("note-title-input")
    // TipTap-based note content editor
    this.noteContentInput = page.getByTestId("note-content")
    this.noteDeleteButton = page.getByTestId("note-delete-button")
    // Click the "Memos" breadcrumb item (first in stack) to go back to the notes list
    this.notesListBreadcrumb = page.getByTestId("breadcrumb-item-0")
    this.searchInput = page.getByTestId("notes-search-input")
  }

  /**
   * Dispatch a programmatic click to bypass pointer-event blocking overlays.
   */
  private async dispatchClick(locator: Locator): Promise<void> {
    await locator.evaluate(node => {
      if (node instanceof HTMLElement) {
        node.click()
      }
    })
  }

  /**
   * Wait for workspace/auth guards to stop blocking main-content interactions.
   */
  private async waitForMainContentReady(timeoutMs = 15000): Promise<void> {
    await this.busyMain.waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => {})
  }

  /**
   * Resolve active workspace ID from URL first, then from persisted window keys.
   */
  private async resolveWorkspaceId(): Promise<string | null> {
    return await this.page.evaluate(() => {
      const pathMatch = window.location.pathname.match(/\/w\/([^/]+)/)
      if (pathMatch?.[1]) {
        return pathMatch[1]
      }

      const storagePrefix = "shape_windows_"
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(storagePrefix)) {
          return key.slice(storagePrefix.length)
        }
      }

      return null
    })
  }

  /**
   * Ensure a workspace is selected when the app lands on /workspaces.
   */
  private async ensureWorkspaceSelected(timeoutMs = 15000): Promise<boolean> {
    const workspaceSelector = this.page.getByTestId("workspace-selector")
    const workspaceSelectorVisible = await workspaceSelector.isVisible().catch(() => false)
    if (!workspaceSelectorVisible) {
      return true
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const firstWorkspaceRow = this.page.getByTestId(/workspace-row-/).first()
      const hasWorkspaceRow = await firstWorkspaceRow.isVisible().catch(() => false)
      if (hasWorkspaceRow) {
        await this.dispatchClick(firstWorkspaceRow)
      } else {
        const createWorkspaceOption = this.page.getByTestId("create-workspace-option")
        const canCreateWorkspace = await createWorkspaceOption.isVisible().catch(() => false)
        if (!canCreateWorkspace) {
          break
        }

        await this.dispatchClick(createWorkspaceOption)
        const workspaceNameInput = this.page.getByTestId("workspace-name-input")
        const nameInputVisible = await workspaceNameInput
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => true)
          .catch(() => false)
        if (!nameInputVisible) {
          continue
        }

        await workspaceNameInput.fill(`Test Workspace ${Date.now()}`)
        const createWorkspaceButton = this.page.getByTestId("create-workspace-button")
        const canUseCreateButton = await createWorkspaceButton.isVisible().catch(() => false)
        if (canUseCreateButton) {
          await this.dispatchClick(createWorkspaceButton)
        } else {
          await workspaceNameInput.press("Enter")
        }
      }

      const selectorHidden = await workspaceSelector
        .waitFor({ state: "hidden", timeout: timeoutMs })
        .then(() => true)
        .catch(() => false)
      if (selectorHidden) {
        return true
      }
    }

    return !(await workspaceSelector.isVisible().catch(() => false))
  }

  /**
   * Clear window storage to reset navigation state.
   * Call this before page reload to ensure predictable test behavior.
   * Without this, window persistence would restore the previous location.
   */
  async clearWindowStorage(): Promise<void> {
    await this.page.evaluate(() => {
      // Clear all shape_windows_ keys from localStorage
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
   * Navigate to the Notes tool and ensure we're at the notes list.
   * Handles multiple scenarios:
   * - From tool selector: clicks the notes tool button
   * - Already on notes list (e.g., after reload with window persistence): does nothing
   * - On a note detail (editing a note): navigates back to list
   */
  async navigateToNotes(): Promise<void> {
    const workspaceSelected = await this.ensureWorkspaceSelected()
    if (!workspaceSelected) {
      throw new Error(`Workspace selection did not complete before navigating to memos (url=${this.page.url()})`)
    }

    await this.waitForMainContentReady()

    const notesVisible = await this.notesContainer
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (notesVisible) {
      const noteDetailVisible = await this.noteTitleInput.isVisible().catch(() => false)
      if (noteDetailVisible) {
        await this.goBackToList()
      }
      return
    }

    const toolButtonVisible = await this.notesToolButton.isVisible().catch(() => false)
    if (toolButtonVisible) {
      await this.notesToolButton.click().catch(async () => {
        await this.dispatchClick(this.notesToolButton)
      })
      await this.waitForMainContentReady()
      const notesVisibleFromToolNavigation = await this.notesContainer
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false)
      if (notesVisibleFromToolNavigation) {
        const noteDetailVisible = await this.noteTitleInput.isVisible().catch(() => false)
        if (noteDetailVisible) {
          await this.goBackToList()
        }
        return
      }
    }

    // Ensure we're on workspace home where the tool selector rows are rendered.
    const workspaceId = await this.resolveWorkspaceId()
    if (!workspaceId) {
      throw new Error(`Failed to resolve active workspace before navigating to memos (url=${this.page.url()})`)
    }

    await this.page.goto(`/w/${workspaceId}/memos`, { waitUntil: "domcontentloaded" })
    await this.waitForMainContentReady()

    let notesVisibleAfterNavigation = await this.notesContainer
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    if (!notesVisibleAfterNavigation) {
      const workspaceSelectedAfterRetry = await this.ensureWorkspaceSelected(10000)
      if (workspaceSelectedAfterRetry) {
        await this.page.goto(`/w/${workspaceId}/memos`, { waitUntil: "domcontentloaded" })
        await this.waitForMainContentReady()
        notesVisibleAfterNavigation = await this.notesContainer
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => true)
          .catch(() => false)
      }
    }
    if (!notesVisibleAfterNavigation) {
      throw new Error(`Memos list did not render after navigation (url=${this.page.url()})`)
    }

    const noteDetailVisible = await this.noteTitleInput.isVisible().catch(() => false)
    if (noteDetailVisible) {
      await this.goBackToList()
    }
  }

  /**
   * Assert that the notes list is visible
   */
  async expectNotesListVisible(): Promise<void> {
    await expect(this.notesContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Create a new note and navigate to its editor
   */
  async createNote(): Promise<void> {
    await this.waitForMainContentReady()
    await this.newNoteButton.waitFor({ state: "visible", timeout: 10000 })
    await this.newNoteButton.click()

    let editorVisible = await this.noteTitleInput
      .waitFor({ state: "visible", timeout: 12000 })
      .then(() => true)
      .catch(() => false)
    if (editorVisible) {
      return
    }

    await this.dispatchClick(this.newNoteButton)
    editorVisible = await this.noteTitleInput
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (editorVisible) {
      return
    }

    const firstNoteItem = this.page.getByTestId("note-list-item").first()
    const firstNoteVisible = await firstNoteItem.isVisible().catch(() => false)
    if (firstNoteVisible) {
      await this.dispatchClick(firstNoteItem)
      const editorOpenedFromList = await this.noteTitleInput
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false)
      if (editorOpenedFromList) {
        return
      }
    }

    throw new Error(`Failed to open note editor after creating a memo (url=${this.page.url()})`)
  }

  /**
   * Fill in the note title
   */
  async fillTitle(title: string): Promise<void> {
    // Clear and fill using keyboard to ensure React onChange events fire properly
    await this.noteTitleInput.click()
    await this.noteTitleInput.fill("")
    await this.noteTitleInput.fill(title)
    // Verify the value was set
    await expect(this.noteTitleInput).toHaveValue(title)
  }

  /**
   * Fill in the note content.
   * Uses keyboard.type() for TipTap editor input.
   * Clears existing content before typing (handles edit case).
   */
  async fillContent(content: string): Promise<void> {
    // Wait for TipTap editor to be ready before clicking
    await this.noteContentInput.waitFor({ state: "visible", timeout: 5000 })
    // Click on the TipTap editor content area (inside the wrapper)
    // The .ProseMirror element is the actual editable area
    const editorContent = this.noteContentInput.locator(".ProseMirror")
    await editorContent.click()
    // Clear any existing content first (for edit case)
    const selectAllShortcut = process.platform === "darwin" ? "Meta+a" : "Control+a"
    await this.page.keyboard.press(selectAllShortcut)
    await this.page.keyboard.press("Backspace")
    // Type new content
    await this.page.keyboard.type(content)
  }

  /**
   * Get the current note title value
   */
  async getTitle(): Promise<string> {
    return await this.noteTitleInput.inputValue()
  }

  /**
   * Get the current note content value.
   * Uses textContent() on the ProseMirror element for TipTap editor.
   */
  async getContent(): Promise<string> {
    const editorContent = this.noteContentInput.locator(".ProseMirror")
    return (await editorContent.textContent()) || ""
  }

  /**
   * Navigate back to the notes list by clicking the "Memos" breadcrumb item.
   */
  async goBackToList(): Promise<void> {
    await this.notesListBreadcrumb.click()
    await this.notesContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Click on a note in the list by its title
   */
  async openNoteByTitle(title: string): Promise<void> {
    const noteItem = this.page.getByTestId(`note-list-item`).filter({ hasText: title })
    await noteItem.click()
    await this.noteTitleInput.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Assert that a note with the given title exists in the list
   */
  async expectNoteInList(title: string, timeoutMs = 10000): Promise<void> {
    const noteItem = this.page.getByTestId(`note-list-item`).filter({ hasText: title })
    await expect(noteItem).toBeVisible({ timeout: timeoutMs })
  }

  /**
   * Assert that no note with the given title exists in the list
   */
  async expectNoteNotInList(title: string): Promise<void> {
    const noteItem = this.page.getByTestId(`note-list-item`).filter({ hasText: title })
    await expect(noteItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a note shows a draft badge in the list.
   */
  async expectDraftBadgeInList(title: string, timeoutMs = 5000): Promise<void> {
    const noteItem = this.page.getByTestId(`note-list-item`).filter({ hasText: title })
    const draftBadge = noteItem.getByTestId("note-draft-badge")
    await expect(draftBadge).toBeVisible({ timeout: timeoutMs })
  }

  /**
   * Assert that the first note in the list shows the expected preview text.
   * This is used for untitled notes that surface body content as a preview.
   */
  async expectFirstNotePreviewInList(previewText: string, timeoutMs = 5000): Promise<void> {
    const noteItem = this.page.getByTestId("note-list-item").first()
    await expect(noteItem).toContainText(previewText, { timeout: timeoutMs })
  }

  /**
   * Delete the currently open note.
   * Uses explicit confirm/cancel sub-rows.
   */
  async deleteCurrentNote(): Promise<void> {
    // First click reveals confirm/cancel sub-rows.
    await this.noteDeleteButton.click()
    await expect(this.page.getByTestId("note-delete-confirm")).toBeVisible({ timeout: 2000 })
    await this.page.getByTestId("note-delete-confirm").click()
    // Wait for navigation back to list
    await this.notesContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Wait for autosave to complete.
   * The notes tool uses a 500ms debounce for autosave.
   */
  async waitForAutosave(): Promise<void> {
    // Wait for debounce (500ms) + network round trip + cache propagation.
    // Using a generous timeout to handle flaky title saves.
    await this.page.waitForTimeout(4000)
  }

  /**
   * Search for notes using the search input
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query)
  }

  /**
   * Clear the search input
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.fill("")
  }
}
