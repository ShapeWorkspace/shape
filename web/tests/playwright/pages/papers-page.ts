import { Buffer } from "buffer"
import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Papers tool interactions.
 * Used for testing paper CRUD operations with TipTap editor and E2EE encryption.
 * Papers use Yjs for collaborative editing with 500ms debounced saves.
 */
export class PapersPage {
  private readonly page: Page
  private readonly papersToolButton: Locator
  private readonly papersContainer: Locator
  private readonly newPaperButton: Locator
  private readonly newFolderButton: Locator
  // In-editor title input (used when editing paper title)
  private readonly paperEditorTitleInput: Locator
  private readonly paperEditorContent: Locator
  private readonly paperEditor: Locator
  // Click the "Papers" breadcrumb item (first in stack) to go back to the papers list
  private readonly papersListBreadcrumb: Locator
  // Sidecar container for paper actions
  private readonly sidecar: Locator
  private readonly paperCommentsOpenButton: Locator
  private readonly commentBubbleButton: Locator

  constructor(page: Page) {
    this.page = page
    this.papersToolButton = page.getByTestId("tool-papers")
    this.papersContainer = page.getByTestId("papers-tool-container")
    this.newPaperButton = page.getByTestId("new-paper-button")
    this.newFolderButton = page.getByTestId("add-folder-button")
    this.paperEditorTitleInput = page.getByTestId("paper-title")
    this.paperEditorContent = page.getByTestId("paper-tiptap-editor-content")
    this.paperEditor = page.getByTestId("paper-editor")
    this.papersListBreadcrumb = page.getByTestId("breadcrumb-item-0")
    this.sidecar = page.getByTestId("sidecar-container")
    this.paperCommentsOpenButton = page.getByTestId("paper-comments-open")
    this.commentBubbleButton = page.getByTestId("paper-comment-bubble-button")
  }

  /**
   * Public getter for the title input locator (used in assertions).
   */
  get titleInput(): Locator {
    return this.paperEditorTitleInput
  }

  private getWorkspaceIdFromUrl(): string | null {
    const match = this.page.url().match(/\/w\/([^/]+)/)
    return match?.[1] ?? null
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
   * Navigate to the Papers tool and ensure we're at the papers list.
   * Handles multiple scenarios:
   * - From tool selector: clicks the papers tool button
   * - Already on papers list: does nothing
   * - On a paper detail (editing a paper): navigates back to list
   */
  async navigateToPapers(): Promise<void> {
    const isPaperDetailVisible = await this.paperEditor.isVisible().catch(() => false)
    if (isPaperDetailVisible) {
      await this.goBackToList()
      return
    }

    const isPapersListVisible = await this.papersContainer.isVisible().catch(() => false)
    if (isPapersListVisible) {
      return
    }

    const isToolSelectorVisible = await this.papersToolButton.isVisible().catch(() => false)
    if (isToolSelectorVisible) {
      await this.papersToolButton.click()
      await this.papersContainer.waitFor({ state: "visible", timeout: 10000 })
      return
    }

    const homeButton = this.page.getByRole("button", { name: "Home" })
    if (await homeButton.isVisible()) {
      await homeButton.click()
      await this.papersToolButton.waitFor({ state: "visible", timeout: 10000 })
      await this.papersToolButton.click()
      await this.papersContainer.waitFor({ state: "visible", timeout: 10000 })
      return
    }

    const workspaceId = this.getWorkspaceIdFromUrl()
    if (workspaceId) {
      await this.clearWindowStorage()
      await this.page.goto(`/w/${workspaceId}/papers`)
      await this.papersContainer.waitFor({ state: "visible", timeout: 10000 })
      return
    }

    throw new Error("Unable to navigate to Papers tool")
  }

  /**
   * Assert that the papers list is visible
   */
  async expectPapersListVisible(): Promise<void> {
    await expect(this.papersContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Create a new paper by clicking "New paper" button.
   * Papers are created with an auto-generated title "Untitled Paper {datetime}".
   * If a title is provided, it will be set after the paper is created.
   */
  async createPaper(title?: string): Promise<void> {
    await this.newPaperButton.click()
    // Wait for the paper editor to appear (paper is created immediately)
    await this.paperEditor.waitFor({ state: "visible", timeout: 15000 })
    // If a title is provided, update the paper title
    if (title) {
      await this.fillTitle(title)
    }
  }

  /**
   * Type content into the TipTap editor.
   * Uses keyboard typing to trigger Yjs updates.
   */
  async typeContent(content: string): Promise<void> {
    // Click into the editor to focus it
    await this.paperEditorContent.click()
    // Type the content character by character to trigger proper Yjs events
    await this.page.keyboard.type(content)
  }

  /**
   * Get the current paper content from the TipTap editor.
   * Returns the text content of the editor.
   */
  async getContent(): Promise<string> {
    return (await this.paperEditorContent.textContent()) ?? ""
  }

  /**
   * Get the current paper title value from the editor
   */
  async getTitle(): Promise<string> {
    return await this.paperEditorTitleInput.inputValue()
  }

  /**
   * Update the paper title in the editor.
   * Uses select-all + type to ensure React onChange events fire properly.
   * The .clear() method can miss events, so we use Ctrl+A to select all.
   */
  async fillTitle(title: string): Promise<void> {
    await this.paperEditorTitleInput.click()
    await this.paperEditorTitleInput.fill(title)
  }

  /**
   * Navigate back to the papers list (root) by clicking the "Papers" breadcrumb item
   */
  async goBackToList(): Promise<void> {
    await this.papersListBreadcrumb.click()
    await this.papersContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Navigate back to the parent folder by clicking the folder breadcrumb item.
   * Use this when inside a paper that's in a folder to go back to the folder.
   */
  async goBackToParentFolder(): Promise<void> {
    await this.page.getByTestId("breadcrumb-item-1").click()
    await this.newPaperButton.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Click on a paper in the list by its title.
   * Paper items have testId pattern: paper-item-{id} and are divs with title text.
   */
  async openPaperByTitle(title: string): Promise<void> {
    // Find the paper row by looking for the title text within the container
    const paperItem = this.papersContainer.locator(`div:has(> span:text-is("${title}"))`).first()
    await paperItem.click()
    await this.paperEditor.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Assert that a paper with the given title exists in the list
   */
  async expectPaperInList(title: string): Promise<void> {
    const isPaperDetailVisible = await this.paperEditor.isVisible().catch(() => false)
    if (isPaperDetailVisible) {
      await this.goBackToList()
    }

    // Look for a list item containing the exact title text
    // Use a longer timeout since data may need to be fetched from the server after reload
    const paperItem = this.papersContainer.getByText(title, { exact: true })
    await expect(paperItem).toBeVisible({ timeout: 15000 })
  }

  /**
   * Assert that no paper with the given title exists in the list
   */
  async expectPaperNotInList(title: string): Promise<void> {
    const paperItem = this.papersContainer.getByText(title, { exact: true })
    await expect(paperItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a paper with the given title has a draft badge visible in the list.
   * Uses a longer timeout since draft badges wait for a transient window before appearing.
   */
  async expectDraftBadgeInList(title: string, timeout: number = 7000): Promise<void> {
    const paperItem = this.page.getByTestId("paper-list-item").filter({ hasText: title })
    const draftBadge = paperItem.getByTestId("paper-draft-badge")
    await expect(draftBadge).toBeVisible({ timeout })
  }

  /**
   * Wait for autosave to complete.
   * Papers use a 500ms debounce for autosave.
   */
  async waitForAutosave(): Promise<void> {
    // Wait for debounce (500ms) + network round trip + buffer
    await this.page.waitForTimeout(1200)
  }

  async openCommentsSidecar(): Promise<void> {
    await this.paperCommentsOpenButton.click()
    await expect(this.page.getByTestId("paper-comments-sidecar-header")).toBeVisible({ timeout: 5000 })
  }

  async selectAllEditorContent(): Promise<void> {
    await this.paperEditorContent.click()
    await this.page.keyboard.press("ControlOrMeta+A")
  }

  /**
   * Select specific text inside the TipTap editor to drive selection-based actions.
   * Uses a DOM range so we can target a precise substring.
   */
  async selectTextInEditor(text: string): Promise<void> {
    await this.paperEditorContent.click()

    const didSelect = await this.page.evaluate(
      ({ editorTestId, textToSelect }) => {
        const root = document.querySelector<HTMLElement>(`[data-testid="${editorTestId}"]`)
        if (!root) {
          return false
        }

        root.focus()

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode
          const nodeText = node.textContent ?? ""
          const startIndex = nodeText.indexOf(textToSelect)
          if (startIndex === -1) {
            continue
          }

          const range = document.createRange()
          range.setStart(node, startIndex)
          range.setEnd(node, startIndex + textToSelect.length)

          const selection = window.getSelection()
          if (!selection) {
            return false
          }
          selection.removeAllRanges()
          selection.addRange(range)
          document.dispatchEvent(new Event("selectionchange"))
          return true
        }

        return false
      },
      { editorTestId: "paper-tiptap-editor-content", textToSelect: text }
    )

    if (!didSelect) {
      throw new Error(`Unable to select text in editor: "${text}"`)
    }

    const selectionText = await this.page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(selectionText).toContain(text)
  }

  async openCommentComposerFromSelection(): Promise<void> {
    await this.selectAllEditorContent()
    await expect(this.commentBubbleButton).toBeVisible({ timeout: 5000 })
    await expect(this.commentBubbleButton).toBeEnabled()
    await this.commentBubbleButton.click()
    await expect(this.page.getByTestId("paper-comment-detail-sidecar")).toBeVisible({ timeout: 5000 })
  }

  async openCommentComposerFromText(text: string): Promise<void> {
    await this.selectTextInEditor(text)
    await expect(this.commentBubbleButton).toBeVisible({ timeout: 5000 })
    await expect(this.commentBubbleButton).toBeEnabled()
    await this.commentBubbleButton.click()
    await expect(this.page.getByTestId("paper-comment-detail-sidecar")).toBeVisible({ timeout: 5000 })
  }

  async expectCommentBubbleDisabled(): Promise<void> {
    await expect(this.commentBubbleButton).toBeVisible({ timeout: 5000 })
    await expect(this.commentBubbleButton).toBeDisabled()
  }

  async expectCommentBubbleEnabled(): Promise<void> {
    await expect(this.commentBubbleButton).toBeVisible({ timeout: 5000 })
    await expect(this.commentBubbleButton).toBeEnabled()
  }

  async returnToCommentsList(): Promise<void> {
    const didClick = await this.page.evaluate(() => {
      const breadcrumbItems = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="sidecar-breadcrumb-item-"]')
      )
      const commentsItem = breadcrumbItems.find(item => item.textContent?.trim() === "Comments")
      if (!commentsItem) {
        return false
      }
      commentsItem.click()
      return true
    })

    if (!didClick) {
      throw new Error("Unable to navigate back to the comments list")
    }
    await expect(this.page.getByTestId("paper-comments-sidecar-header")).toBeVisible({ timeout: 5000 })
  }

  async submitNewComment(text: string, options?: { waitForThreadBody?: boolean }): Promise<void> {
    const composer = this.page
      .getByTestId("paper-comment-composer")
      .filter({ has: this.page.getByTestId("paper-comment-new-composer-editor") })
    const editorContent = composer.getByTestId("paper-comment-new-composer-editor-content")
    await editorContent.click()
    await editorContent.type(text)
    const submitRow = this.page.getByTestId("paper-comment-submit-row")
    await expect(submitRow).toBeEnabled()
    await submitRow.click()
    const shouldWaitForThreadBody = options?.waitForThreadBody ?? true
    if (shouldWaitForThreadBody) {
      await expect(this.page.getByTestId("paper-comment-thread-body")).toBeVisible({ timeout: 10000 })
    }
  }

  async submitReply(text: string): Promise<void> {
    await expect(this.page.getByTestId("paper-comment-thread-body")).toBeVisible({ timeout: 10000 })

    const replyComposerContent = this.page.getByTestId("paper-comment-reply-composer-editor-content")
    if (!(await replyComposerContent.isVisible())) {
      const openRow = this.page.getByTestId("paper-comment-reply-open-row")
      await expect(openRow).toBeVisible({ timeout: 5000 })
      await openRow.click()
    }

    await expect(replyComposerContent).toBeVisible({ timeout: 5000 })
    const editorContent = replyComposerContent
    await editorContent.click()
    await editorContent.type(text)
    const submitRow = this.page.getByTestId("paper-comment-reply-submit-row")
    await expect(submitRow).toBeEnabled()
    await submitRow.click()
  }

  async openFirstReplyDetail(): Promise<void> {
    const replyItem = this.page.getByTestId("paper-comment-reply-item").first()
    await replyItem.click()
    await expect(this.page.getByTestId("paper-comment-reply-detail-sidecar")).toBeVisible({ timeout: 5000 })
  }

  async editActiveComment(text: string): Promise<void> {
    await this.ensureCommentActionsExpanded()
    await this.page.getByTestId("paper-comment-edit").click()
    const composer = this.page
      .getByTestId("paper-comment-composer")
      .filter({ has: this.page.getByTestId("paper-comment-edit-composer-editor") })
    const editorContent = composer.getByTestId("paper-comment-edit-composer-editor-content")
    await editorContent.click()
    await editorContent.press("ControlOrMeta+A")
    await editorContent.press("Backspace")
    await editorContent.type(text)
    const submitRow = this.page.getByTestId("paper-comment-save-row")
    await expect(submitRow).toBeEnabled()
    await submitRow.click()
  }

  async editFirstReply(text: string): Promise<void> {
    await this.openFirstReplyDetail()
    await this.page.getByTestId("paper-comment-reply-edit").click()
    const composer = this.page
      .getByTestId("paper-comment-composer")
      .filter({ has: this.page.getByTestId("paper-comment-reply-composer-editor") })
    const editorContent = composer.getByTestId("paper-comment-reply-composer-editor-content")
    await editorContent.click()
    await editorContent.press("ControlOrMeta+A")
    await editorContent.press("Backspace")
    await editorContent.type(text)
    const submitRow = this.page.getByTestId("paper-comment-reply-save-row")
    await expect(submitRow).toBeEnabled()
    await submitRow.click()
  }

  async deleteFirstReply(): Promise<void> {
    await this.openFirstReplyDetail()
    const deleteRow = this.page.getByTestId("paper-comment-reply-delete")
    await deleteRow.click()
    await this.page.getByTestId("paper-comment-reply-delete-confirm").click()
    await expect(this.page.getByTestId("paper-comment-detail-sidecar")).toBeVisible({ timeout: 5000 })
  }

  async toggleResolveComment(): Promise<void> {
    await this.ensureCommentActionsExpanded()
    await this.page.getByTestId("paper-comment-resolve-toggle").click()
  }

  async deleteActiveComment(): Promise<void> {
    await this.ensureCommentActionsExpanded()
    const deleteRow = this.page.getByTestId("paper-comment-delete")
    await deleteRow.click()
    await this.page.getByTestId("paper-comment-delete-confirm").click()
  }

  private async ensureCommentActionsExpanded(): Promise<void> {
    const deleteRow = this.page.getByTestId("paper-comment-delete")
    if (await deleteRow.isVisible()) {
      return
    }
    const toggleRow = this.page.getByTestId("paper-comment-actions-toggle")
    await toggleRow.scrollIntoViewIfNeeded()
    await toggleRow.click()
    await expect(deleteRow).toBeVisible()
  }

  /**
   * Assert that the paper editor is visible
   */
  async expectEditorVisible(): Promise<void> {
    await expect(this.paperEditor).toBeVisible({ timeout: 5000 })
  }

  // ==================== Folder Operations ====================

  /**
   * Create a new folder in the papers tool.
   * The folder is created with default name "Untitled Folder".
   */
  async createFolder(): Promise<void> {
    await this.newFolderButton.click()
    // Wait for folder to appear in list (debounce + network)
    await this.page.waitForTimeout(500)
  }

  /**
   * Click on a folder in the list by its name to navigate into it.
   * Folder items have testId pattern: folder-item-{id}.
   */
  async openFolderByName(name: string): Promise<void> {
    const folderItem = this.papersContainer.locator(`div:has(> span:text-is("${name}"))`).first()
    await folderItem.click()
    // Wait for URL to update (folder navigation)
    await this.page.waitForTimeout(300)
  }

  /**
   * Assert that a folder with the given name exists in the list
   */
  async expectFolderInList(name: string): Promise<void> {
    const folderItem = this.papersContainer.getByText(name, { exact: true })
    await expect(folderItem).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that no folder with the given name exists in the list
   */
  async expectFolderNotInList(name: string): Promise<void> {
    const folderItem = this.papersContainer.getByText(name, { exact: true })
    await expect(folderItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Navigate to a folder via the URL by adding ?folder={folderId} parameter.
   * This simulates direct folder navigation.
   */
  async navigateToFolderById(folderId: string): Promise<void> {
    const currentUrl = new URL(this.page.url())
    currentUrl.searchParams.set("folder", folderId)
    await this.page.goto(currentUrl.toString())
    await this.newPaperButton.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Check if the URL contains the folder parameter
   */
  async expectInFolder(): Promise<boolean> {
    const url = new URL(this.page.url())
    return url.searchParams.has("folder")
  }

  /**
   * Get the current folder ID from the URL, or null if at root
   */
  async getCurrentFolderId(): Promise<string | null> {
    const url = new URL(this.page.url())
    return url.searchParams.get("folder")
  }

  // ==================== Sidecar Operations ====================

  /**
   * Assert that the sidecar is visible
   */
  async expectSidecarVisible(): Promise<void> {
    await expect(this.sidecar).toBeVisible({ timeout: 5000 })
  }

  /**
   * Click the Move action in the paper sidecar.
   */
  async clickPaperMove(): Promise<void> {
    await this.sidecar.getByText("Move").click()
  }

  /**
   * Select a destination folder in the move sidecar.
   */
  async selectMoveDestination(folderName: string): Promise<void> {
    await this.sidecar.getByText(folderName).click()
  }

  /**
   * Select root as move destination.
   */
  async selectMoveDestinationRoot(): Promise<void> {
    await this.sidecar.getByTestId("move-destination-root").click()
  }

  // ==================== File Attachment Operations ====================

  /**
   * Drag and drop a file into the TipTap editor.
   * Simulates file drag-and-drop using Playwright's DataTransfer API.
   */
  async dropFileIntoEditor(
    fileName: string,
    content: string | Buffer,
    mimeType: string = "text/plain"
  ): Promise<void> {
    const buffer = typeof content === "string" ? Buffer.from(content) : content
    const attachmentInput = this.page.getByTestId("paper-tiptap-editor-file-input")
    await attachmentInput.setInputFiles({
      name: fileName,
      mimeType,
      buffer,
    })
  }

  /**
   * Drop multiple files into the TipTap editor at once.
   */
  async dropMultipleFilesIntoEditor(
    files: Array<{ name: string; content: string | Buffer; mimeType?: string }>
  ): Promise<void> {
    const attachmentInput = this.page.getByTestId("paper-tiptap-editor-file-input")
    await attachmentInput.setInputFiles(
      files.map(file => ({
        name: file.name,
        mimeType: file.mimeType ?? "text/plain",
        buffer: typeof file.content === "string" ? Buffer.from(file.content) : file.content,
      }))
    )
  }

  /**
   * Wait for file upload indicator to appear.
   */
  async waitForUploadIndicatorVisible(): Promise<void> {
    await this.page.getByTestId("upload-indicator").waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Wait for file upload indicator to disappear (upload complete).
   */
  async waitForUploadComplete(): Promise<void> {
    // Wait for indicator to appear first, then disappear
    // Use a shorter timeout for appearing since it may not appear for small files
    try {
      await this.page.getByTestId("upload-indicator").waitFor({ state: "visible", timeout: 2000 })
    } catch {
      // Indicator may not appear for very fast uploads, that's ok
    }
    await this.page.getByTestId("upload-indicator").waitFor({ state: "hidden", timeout: 30000 })
  }

  /**
   * Assert that a file attachment with the given name is visible in the editor.
   * Looks for any attachment type (uploading, complete file, complete image, error).
   */
  async expectAttachmentVisible(fileName: string): Promise<void> {
    // Attachment nodes have different testIds based on status: attachment-file, attachment-image, attachment-uploading, attachment-error
    // All contain the filename in a span, so we look for any of them with the text
    const attachment = this.page.locator(`[data-testid^="attachment-"]:has-text("${fileName}")`)
    await expect(attachment).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that an image attachment is visible in the editor.
   */
  async expectImageAttachmentVisible(): Promise<void> {
    // Look for an img element inside the editor content
    const image = this.page.getByTestId("paper-tiptap-editor-content").locator("img")
    await expect(image).toBeVisible({ timeout: 10000 })
  }

  /**
   * Get the number of attachment nodes in the editor.
   */
  async getAttachmentCount(): Promise<number> {
    const attachments = this.page.locator(`[data-testid="attachment-node"]`)
    return await attachments.count()
  }
}
