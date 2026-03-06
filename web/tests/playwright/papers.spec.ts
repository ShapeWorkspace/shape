import { Buffer } from "buffer"
import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { PapersPage } from "./pages/papers-page"
import { FilesPage } from "./pages/files-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

// Papers flows are heavy; run serially to avoid auth/editor flakes.
test.describe.configure({ mode: "serial", timeout: 60000 })

/**
 * Papers Tool E2E Tests
 *
 * Tests collaborative paper editing with TipTap editor, Yjs CRDT,
 * and end-to-end encryption. Papers use 500ms debounced saves.
 */
test.describe("Papers Tool", () => {
  // Increase test timeout for papers tests since they involve multiple operations
  test.setTimeout(60000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  /**
   * Helper to set up an authenticated user with a workspace.
   * Returns the page objects for further interaction.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password, name } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible(makeWorkspaceName())
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, papers, credentials: { email, password, name } }
  }

  test("can create a paper with title", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to papers tool
    await papers.navigateToPapers()
    await papers.expectPapersListVisible()

    // Create a new paper
    await papers.createPaper("My First Paper")

    // Verify we're in the editor
    await papers.expectEditorVisible()

    // Wait for autosave
    await papers.waitForAutosave()

    // Navigate back to list
    await papers.goBackToList()

    // Verify paper appears in list
    await papers.expectPaperInList("My First Paper")
  })

  test("navigates to a new paper before the create request completes", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.expectPapersListVisible()

    const createRequestGate: { release: () => void } = {
      release: () => {
        throw new Error("Create request interceptor was not installed")
      },
    }
    const createRequestReleased = new Promise<void>(resolve => {
      createRequestGate.release = resolve
    })

    await page.route("**/api/workspaces/*/entities", async route => {
      const request = route.request()
      if (request.method() !== "POST") {
        await route.fallback()
        return
      }

      const payload = request.postDataJSON()
      if (
        !payload ||
        typeof payload !== "object" ||
        !("entity_type" in payload) ||
        payload.entity_type !== "paper"
      ) {
        await route.fallback()
        return
      }

      await createRequestReleased
      await route.continue()
    })

    await page.getByTestId("new-paper-button").click()
    await expect(page).toHaveURL(/\/papers\/[^/]+$/, { timeout: 1000 })

    createRequestGate.release()

    await expect(page.getByTestId("paper-editor")).toBeVisible({ timeout: 15000 })
    await page.unroute("**/api/workspaces/*/entities")
  })

  test("can type content in TipTap editor", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Content Test Paper")

    // Type content into the TipTap editor
    const testContent = "This is some test content for the paper."
    await papers.typeContent(testContent)

    // Verify content appears in editor
    const content = await papers.getContent()
    expect(content).toContain(testContent)

    await papers.waitForAutosave()
  })

  test("can export a paper as markdown", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Export Paper")
    await papers.typeContent("Paper export content.")
    await papers.waitForAutosave()

    await page.getByTestId("paper-export-open").click()

    const exportCopyButton = page.getByTestId("export-copy-markdown")
    await expect(exportCopyButton).toHaveAttribute("data-disabled", "false")
    await exportCopyButton.click()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe("# Export Paper\n\nPaper export content.")
  })

  test("shows mention suggestions in the paper editor", async ({ page }) => {
    const { papers, credentials } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Mention Suggestions Paper")

    const { suggestionItems } = await openMentionSuggestions(page, "paper-tiptap-editor")
    await expect(suggestionItems).toHaveCount(1)
    await suggestionItems.first().click()

    const editorContent = page.getByTestId("paper-tiptap-editor-content")
    await expect(editorContent).toContainText(credentials.name)
  })

  // Skip for now - blocks are saved but not yet loaded into Yjs on page reload
  // TODO: Enable once usePaperYjs applies loaded blocks to the Yjs doc
  test("paper content persists after page reload (encryption/decryption round-trip)", async ({
    page,
  }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Persistent Paper")

    const testContent = "This paper should survive a page reload thanks to E2EE."
    await papers.typeContent(testContent)
    await papers.waitForAutosave()

    // Clear window storage before reload to ensure predictable navigation
    await papers.clearWindowStorage()

    // Reload the page - this tests:
    // 1. Paper was encrypted and saved to server
    // 2. Paper blocks were encrypted and saved
    // 3. Workspace key is properly cached/retrieved
    // 4. Paper and blocks are decrypted correctly on load
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to papers
    await papers.navigateToPapers()

    // Verify paper exists in list
    await papers.expectPaperInList("Persistent Paper")

    // Open the paper and verify content
    await papers.openPaperByTitle("Persistent Paper")
    await expect.poll(async () => await papers.getContent(), { timeout: 20000 }).toContain(testContent)
  })

  test("can edit an existing paper", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Original Paper Title")
    await papers.typeContent("Original content")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Open the paper again
    await papers.openPaperByTitle("Original Paper Title")

    // Edit the title
    await papers.fillTitle("Updated Paper Title")

    // Wait for title update to complete (500ms debounce + mutation)
    await papers.waitForAutosave()

    // Add more content
    await papers.typeContent(" with additional text")
    await papers.waitForAutosave()

    // Go back and verify updated title
    await papers.goBackToList()

    // Force refresh to ensure we get latest data from server
    await papers.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await papers.navigateToPapers()

    await papers.expectPaperInList("Updated Paper Title")
    await papers.expectPaperNotInList("Original Paper Title")
  })

  test("multiple papers can be created and persist", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()

    // Create first paper
    await papers.createPaper("First Paper")
    await papers.typeContent("Content of the first paper.")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Create second paper
    await papers.createPaper("Second Paper")
    await papers.typeContent("Content of the second paper.")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Create third paper
    await papers.createPaper("Third Paper")
    await papers.typeContent("Content of the third paper.")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Verify all papers exist
    await papers.expectPaperInList("First Paper")
    await papers.expectPaperInList("Second Paper")
    await papers.expectPaperInList("Third Paper")

    // Reload and verify persistence
    await papers.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await papers.navigateToPapers()

    await papers.expectPaperInList("First Paper")
    await papers.expectPaperInList("Second Paper")
    await papers.expectPaperInList("Third Paper")
  })

  test("paper with empty title keeps untitled fallback naming", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()

    // Create paper with empty title by clearing it after creation
    await papers.createPaper("Temporary Title")
    await papers.fillTitle("")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Empty titles are not persisted; paper keeps its generated untitled fallback.
    await expect(page.getByTestId("paper-list-item").filter({ hasText: /^Untitled Paper\b/ }).first()).toBeVisible()
  })
})

test.describe("Paper Comments", () => {
  test.setTimeout(45000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible(makeWorkspaceName())
    await workspace.expectToolSelectorVisible()

    return { papers }
  }

  test("can create a comment thread and reply", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Paper Comments")
    await papers.typeContent("This paragraph needs a comment.")

    await papers.openCommentComposerFromSelection()
    await papers.submitNewComment("Please review this sentence.")

    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("Please review this sentence.")

    await papers.submitReply("Adding a reply for context.")
    await expect(page.getByTestId("paper-comment-reply-item")).toHaveCount(1)
    await expect(page.getByTestId("paper-comment-reply-body")).toContainText("Adding a reply for context.")
  })

  test("pushes reply detail sidecar when a reply is selected", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Reply Detail")
    await papers.typeContent("Reply detail anchor.")

    await papers.openCommentComposerFromText("Reply detail anchor.")
    await papers.submitNewComment("Thread body.")
    await papers.submitReply("Reply detail body.")

    await papers.openFirstReplyDetail()
    const replyDetail = page.getByTestId("paper-comment-reply-detail-sidecar")
    await expect(replyDetail.getByTestId("paper-comment-reply-body")).toContainText("Reply detail body.")
  })

  test("can resolve and reopen a comment thread", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Resolve Comments")
    await papers.typeContent("Resolve this comment thread.")

    await papers.openCommentComposerFromSelection()
    await papers.submitNewComment("Resolve me.")

    await papers.toggleResolveComment()
    await expect(page.getByTestId("paper-comment-reply-disabled")).toBeVisible({ timeout: 10000 })

    await papers.toggleResolveComment()
    await expect(page.getByTestId("paper-comment-reply-open-row")).toBeVisible({ timeout: 10000 })
  })

  test("can delete a comment thread", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Delete Comment Thread")
    await papers.typeContent("This comment will be removed.")

    await papers.openCommentComposerFromSelection()
    await papers.submitNewComment("Delete this comment.")

    await papers.deleteActiveComment()
    await expect(page.getByTestId("paper-comments-empty")).toBeVisible({ timeout: 5000 })
  })

  test("delete action shows confirm and cancel sub-rows", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Delete Confirmation Timeout")
    await papers.typeContent("Delete confirmation anchor.")

    await papers.openCommentComposerFromText("Delete confirmation anchor.")
    await papers.submitNewComment("Delete confirmation body.")

    const actionToggleRow = page.getByTestId("paper-comment-actions-toggle")
    await actionToggleRow.click()

    const deleteActionRow = page.getByTestId("paper-comment-delete")
    await expect(deleteActionRow).toBeVisible()
    await deleteActionRow.click()
    await expect(page.getByTestId("paper-comment-delete-confirm")).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId("paper-comment-delete-cancel")).toBeVisible({ timeout: 5000 })
    await page.getByTestId("paper-comment-delete-cancel").click()
    await expect(page.getByTestId("paper-comment-delete-confirm")).toHaveCount(0)
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("Delete confirmation body.")
  })

  test("supports keyboard activation for the manage comment row", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Comment Actions Keyboard")
    await papers.typeContent("Manage comment row anchor.")

    await papers.openCommentComposerFromText("Manage comment row anchor.")
    await papers.submitNewComment("Keyboard action row body.")

    const actionToggleRow = page.getByTestId("paper-comment-actions-toggle")
    await actionToggleRow.focus()
    await page.keyboard.press("Enter")

    await expect(page.getByTestId("paper-comment-delete")).toBeVisible()
  })

  test("keeps comment actions collapsed until explicitly expanded", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Comment Actions Collapsed")
    await papers.typeContent("Comment actions anchor.")

    await papers.openCommentComposerFromText("Comment actions anchor.")
    await papers.submitNewComment("Action row body.")

    const deleteRow = page.getByTestId("paper-comment-delete")
    await expect(deleteRow).toHaveCount(0)

    const actionToggleRow = page.getByTestId("paper-comment-actions-toggle")
    await actionToggleRow.click()
    await expect(deleteRow).toBeVisible()
  })

  test("shows mention suggestions in the comment composer", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Comment Mentions")
    await papers.typeContent("Mention this anchor.")

    await papers.openCommentComposerFromText("Mention this anchor.")

    const { suggestionList, suggestionItems } = await openMentionSuggestions(
      page,
      "paper-comment-new-composer-editor"
    )
    await expect(suggestionList).toBeVisible()
    await expect(suggestionItems.first()).toBeVisible()
  })

  test("shows reply composer only after opening it and tabs to the reply action row", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Reply Composer Toggle")
    await papers.typeContent("Reply composer anchor.")

    await papers.openCommentComposerFromText("Reply composer anchor.")
    await papers.submitNewComment("Thread body.")

    const replyComposer = page.getByTestId("paper-comment-reply-composer-editor")
    await expect(replyComposer).toHaveCount(0)

    const replyOpenRow = page.getByTestId("paper-comment-reply-open-row")
    await replyOpenRow.click()

    const replyComposerContent = page.getByTestId("paper-comment-reply-composer-editor-content")
    await expect(replyComposerContent).toBeVisible()
    await replyComposerContent.click()
    await replyComposerContent.type("Tab focus reply body.")
    await replyComposerContent.press("Tab")

    const replySubmitRow = page.getByTestId("paper-comment-reply-submit-row")
    await expect(replySubmitRow).toBeFocused()
  })

  test("supports offline comment drafts", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Offline Comment Draft")
    await papers.typeContent("Offline comment draft content.")

    await page.context().setOffline(true)

    try {
      await papers.openCommentComposerFromSelection()
      await papers.submitNewComment("Offline comment body.", { waitForThreadBody: false })
    } finally {
      await page.context().setOffline(false)
    }

    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("Offline comment body.")
  })

  test("disables overlapping comment creation on existing highlights", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Overlap Prevention")
    await papers.typeContent("Overlap me.")

    await papers.openCommentComposerFromText("Overlap me.")
    await papers.submitNewComment("First comment.")

    await papers.selectTextInEditor("Overlap me.")
    await papers.expectCommentBubbleDisabled()
  })

  test("keeps orphaned comments listed without an anchor preview", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Orphaned Comments")
    await papers.typeContent("First anchor text.")
    await page.keyboard.press("Enter")
    await papers.typeContent("Second anchor text.")

    await papers.openCommentComposerFromText("First anchor text.")
    await papers.submitNewComment("Orphaned comment body.")

    await papers.openCommentComposerFromText("Second anchor text.")
    await papers.submitNewComment("Anchored comment body.")

    await papers.selectTextInEditor("First anchor text.")
    await page.keyboard.press("Backspace")

    await papers.returnToCommentsList()

    const listItems = page.getByTestId("paper-comment-list-item")
    await expect(listItems).toHaveCount(2)

    const anchoredCommentItem = listItems.filter({ hasText: "Anchored comment body." }).first()
    await expect(anchoredCommentItem).toBeVisible()
    await expect(anchoredCommentItem.getByTestId("paper-comment-body-preview")).toContainText(
      "Anchored comment body."
    )
    await expect(anchoredCommentItem.getByTestId("paper-comment-anchor-preview")).toBeVisible()

    const orphanedCommentItem = listItems.filter({ hasText: "Orphaned comment body." }).first()
    await expect(orphanedCommentItem).toBeVisible()
    await expect(orphanedCommentItem.getByTestId("paper-comment-body-preview")).toContainText(
      "Orphaned comment body."
    )
    await expect(orphanedCommentItem.getByTestId("paper-comment-anchor-preview")).toHaveCount(0)
  })

  test("opens comment detail when clicking a highlighted anchor", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Highlight Navigation")
    await papers.typeContent("Click highlight text.")

    await papers.openCommentComposerFromText("Click highlight text.")
    await papers.submitNewComment("Clicking the highlight should open details.")
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText(
      "Clicking the highlight should open details."
    )

    await papers.returnToCommentsList()

    const highlight = page
      .getByTestId("paper-tiptap-editor-content")
      .locator(".paper-comment-highlight")
      .first()
    await expect(highlight).toBeVisible()
    await highlight.click()
    await expect(page.getByTestId("paper-comment-detail-sidecar")).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText(
      "Clicking the highlight should open details."
    )
  })

  test("keeps resolved comments collapsed by default", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Resolved Comments")
    await papers.typeContent("Resolve this comment.")

    await papers.openCommentComposerFromText("Resolve this comment.")
    await papers.submitNewComment("This will be resolved.")

    await papers.toggleResolveComment()
    await papers.returnToCommentsList()

    const optionsToggle = page.getByTestId("paper-comments-options-toggle")
    await optionsToggle.click()
    const resolvedToggle = page.getByTestId("paper-comments-show-resolved")
    await expect(resolvedToggle).toBeVisible()
    const resolvedList = page.getByTestId("paper-comments-resolved-list")
    await expect(resolvedList).toHaveCount(0)

    await resolvedToggle.click()
    await expect(page.getByTestId("paper-comment-list-item")).toHaveCount(1)
    await expect(page.getByTestId("paper-comments-resolved-list")).toBeVisible()
  })

  test("opens comment composer with keyboard shortcut", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Shortcut Comment")
    await papers.typeContent("Shortcut selection.")

    await papers.selectTextInEditor("Shortcut selection.")
    await page.keyboard.press("Control+Alt+C")

    await expect(page.getByTestId("paper-comment-detail-sidecar")).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId("paper-comment-new-composer-editor")).toBeVisible()
  })

  test("sorts comments by recency when requested", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Comment Sorting")
    await papers.typeContent("First anchor text.")
    await page.keyboard.press("Enter")
    await papers.typeContent("Second anchor text.")

    await papers.openCommentComposerFromText("First anchor text.")
    await papers.submitNewComment("First comment body.")
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("First comment body.")

    await page.waitForFunction(start => Date.now() - start > 1100, Date.now())

    await papers.openCommentComposerFromText("Second anchor text.")
    await papers.submitNewComment("Second comment body.")
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("Second comment body.")

    const firstCommentId = await page.evaluate(anchorText => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-paper-comment-id]"))
      const match = matches.find(node => node.textContent?.includes(anchorText))
      return match?.getAttribute("data-paper-comment-id") ?? null
    }, "First anchor text.")

    const secondCommentId = await page.evaluate(anchorText => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-paper-comment-id]"))
      const match = matches.find(node => node.textContent?.includes(anchorText))
      return match?.getAttribute("data-paper-comment-id") ?? null
    }, "Second anchor text.")

    expect(firstCommentId).not.toBeNull()
    expect(secondCommentId).not.toBeNull()

    await papers.returnToCommentsList()

    const listItems = page.getByTestId("paper-comment-list-item")
    await expect(listItems).toHaveCount(2)

    await page.getByTestId("paper-comments-options-toggle").click()
    await page.getByTestId("paper-comments-sort-recent").click()
    await expect(listItems).toHaveCount(2)
    const recentOrder = await listItems.evaluateAll(items =>
      items.map(item => item.getAttribute("data-comment-id"))
    )

    expect(recentOrder).toEqual([secondCommentId, firstCommentId])
  })

  test("can edit comment threads and replies", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Edit Comment")
    await papers.typeContent("Edit this anchor.")

    await papers.openCommentComposerFromText("Edit this anchor.")
    await papers.submitNewComment("Original comment body.")
    await papers.submitReply("Original reply body.")

    await papers.editActiveComment("Updated comment body.")
    await expect(page.getByTestId("paper-comment-thread-body")).toContainText("Updated comment body.")

    await papers.editFirstReply("Updated reply body.")
    await expect(page.getByTestId("paper-comment-reply-body").first()).toContainText("Updated reply body.")
  })

  test("can delete a reply from a thread", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Delete Reply")
    await papers.typeContent("Reply deletion anchor.")

    await papers.openCommentComposerFromText("Reply deletion anchor.")
    await papers.submitNewComment("Thread body.")
    await papers.submitReply("First reply.")
    await papers.submitReply("Second reply.")

    await expect(page.getByTestId("paper-comment-reply-item")).toHaveCount(2)
    await papers.deleteFirstReply()
    await expect(page.getByTestId("paper-comment-reply-item")).toHaveCount(1)
    await expect(page.getByTestId("paper-comment-reply-body").first()).toContainText("Second reply.")
  })

  test("keeps replies ordered oldest-first", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Reply Order")
    await papers.typeContent("Reply order anchor.")

    await papers.openCommentComposerFromText("Reply order anchor.")
    await papers.submitNewComment("Thread body.")
    await papers.submitReply("First reply.")
    await papers.submitReply("Second reply.")

    const replies = page.getByTestId("paper-comment-reply-item")
    await expect(replies.nth(0).getByTestId("paper-comment-reply-body")).toContainText("First reply.")
    await expect(replies.nth(1).getByTestId("paper-comment-reply-body")).toContainText("Second reply.")
  })

  test("removes highlight marks when deleting a comment thread", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Highlight Removal")
    await papers.typeContent("Highlight removal text.")

    await papers.openCommentComposerFromText("Highlight removal text.")
    await papers.submitNewComment("Thread body.")

    const highlight = page
      .getByTestId("paper-tiptap-editor-content")
      .locator(".paper-comment-highlight")
    await expect(highlight).toHaveCount(1)

    await papers.deleteActiveComment()
    await expect(highlight).toHaveCount(0)
  })

  test("orders comments by document position by default", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Document Order")
    await papers.typeContent("Top anchor text.")
    await page.keyboard.press("Enter")
    await papers.typeContent("Bottom anchor text.")

    await papers.openCommentComposerFromText("Bottom anchor text.")
    await papers.submitNewComment("Bottom comment body.")

    await papers.openCommentComposerFromText("Top anchor text.")
    await papers.submitNewComment("Top comment body.")

    await papers.returnToCommentsList()

    const listItems = page.getByTestId("paper-comment-list-item")
    await expect(listItems.nth(0).getByTestId("paper-comment-anchor-preview")).toContainText(
      "Top anchor text."
    )
    await expect(listItems.nth(1).getByTestId("paper-comment-anchor-preview")).toContainText(
      "Bottom anchor text."
    )
  })

  test("activates highlight styling for the selected comment", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Active Highlight")
    await papers.typeContent("Active highlight text.")

    await papers.openCommentComposerFromText("Active highlight text.")
    await papers.submitNewComment("Thread body.")

    const activeHighlight = page
      .getByTestId("paper-tiptap-editor-content")
      .locator(".paper-comment-active")
    await expect(activeHighlight).toHaveCount(1)
  })

  test("marks resolved highlights and allows new comments on resolved text", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Resolved Highlight")
    await papers.typeContent("Resolved highlight text.")

    await papers.openCommentComposerFromText("Resolved highlight text.")
    await papers.submitNewComment("Thread body.")

    await papers.toggleResolveComment()

    const highlight = page
      .getByTestId("paper-tiptap-editor-content")
      .locator(".paper-comment-highlight")
      .first()
    await expect(highlight).toHaveAttribute("data-paper-comment-resolved", "true")

    await papers.selectTextInEditor("Resolved highlight text.")
    await papers.expectCommentBubbleEnabled()
  })

  test("shows reply count in the comments list", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Reply Count")
    await papers.typeContent("Reply count anchor.")

    await papers.openCommentComposerFromText("Reply count anchor.")
    await papers.submitNewComment("Thread body.")
    await papers.submitReply("First reply.")

    await papers.returnToCommentsList()

    const listItem = page.getByTestId("paper-comment-list-item").first()
    await expect(listItem).toContainText("1 reply")
  })

  test("canceling a new comment returns to the list", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Cancel Comment")
    await papers.typeContent("Cancel anchor.")

    await papers.openCommentComposerFromText("Cancel anchor.")
    await page.getByTestId("paper-comment-cancel-row").click()

    await expect(page.getByTestId("paper-comments-sidecar-header")).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId("paper-comments-empty")).toBeVisible()
  })
})

// NOTE: Papers Folder Navigation tests removed.
// With unified folders, PapersTool shows a flat list of all papers.
// Folder creation and navigation is handled by the Files tool.

/**
 * Paper Move Operations Tests
 *
 * Tests moving papers between folders via the sidecar.
 * Folders are unified and created via the Files tool, but papers can
 * be moved to folders via the paper sidecar's move action.
 */
test.describe("Paper Move Operations", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible(makeWorkspaceName())
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, papers, files }
  }

  // Skip: move functionality has pre-existing issues unrelated to draft-first implementation
  test("can move a paper to a folder", async ({ page }) => {
    const { papers, files } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a folder in the Files tool (folders are unified)
    await files.navigateToFiles()
    await files.createFolder("Test Folder")
    await files.expectFolderInList("Test Folder")

    // Now go to Papers and create a paper
    await papers.navigateToPapers()
    await papers.createPaper("Movable Paper")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Open paper sidecar and move to folder
    await papers.openPaperByTitle("Movable Paper")
    await papers.expectSidecarVisible()
    await papers.clickPaperMove()
    await papers.selectMoveDestination("Test Folder")

    // Verify paper shows folder location in flat list
    // The paper should still be visible but now shows folder path
    await papers.expectPaperInList("Movable Paper")
  })

  // Skip: move functionality has pre-existing issues unrelated to draft-first implementation
  test("can move a paper from folder back to root", async ({ page }) => {
    const { papers, files } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a folder in Files tool first
    await files.navigateToFiles()
    await files.createFolder("Test Folder")
    await files.expectFolderInList("Test Folder")

    // Create a paper at root
    await papers.navigateToPapers()
    await papers.createPaper("Paper In Folder")
    await papers.waitForAutosave()
    await papers.goBackToList()

    // Move it to the folder
    await papers.openPaperByTitle("Paper In Folder")
    await papers.expectSidecarVisible()
    await papers.clickPaperMove()
    await papers.selectMoveDestination("Test Folder")

    // Now move it back to root
    await papers.goBackToList()
    await papers.openPaperByTitle("Paper In Folder")
    await papers.expectSidecarVisible()
    await papers.clickPaperMove()
    await papers.selectMoveDestinationRoot()

    // Paper should still be in flat list (at root now)
    await papers.expectPaperInList("Paper In Folder")
  })
})

/**
 * Papers Collaborative Editing Tests
 *
 * Tests multi-user scenarios with SSE-based realtime updates.
 * Uses two browser contexts to simulate two users.
 */
test.describe("Papers Collaborative Editing", () => {
  // Skip collaborative tests for now - will be enabled when Phase 2 is complete
  test("two users can see each other's changes in realtime", async ({ browser }) => {
    // This test will use two browser contexts to simulate two users
    // Both users will connect to the same paper and verify they receive
    // SSE events when the other user makes changes

    // Create first user context
    const context1 = await browser.newContext()
    await context1.newPage()

    // Create second user context
    const context2 = await browser.newContext()
    await context2.newPage()

    // TODO: Implement after Phase 2 is complete
    // 1. User 1 creates workspace and paper
    // 2. User 1 invites User 2 to workspace
    // 3. User 2 opens the same paper
    // 4. User 1 types content
    // 5. User 2 sees content appear via SSE

    await context1.close()
    await context2.close()
  })
})

/**
 * Papers Offline Caching Tests
 *
 * Tests that papers are available from IndexedDB cache when API is unavailable.
 */
test.describe("Papers Offline Caching", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible(makeWorkspaceName())
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, papers, credentials: { email, password } }
  }

  test("paper is displayed from offline cache when API is unavailable", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    // Step 1: Navigate to papers and create a paper
    await papers.navigateToPapers()
    await papers.createPaper("Offline Cached Paper")
    await papers.typeContent("This paper should be available offline from IndexedDB cache.")
    await papers.waitForAutosave()

    // Go back to list to ensure paper is saved
    await papers.goBackToList()
    await papers.expectPaperInList("Offline Cached Paper")

    // Step 2: Reload (still online)
    await papers.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for app to fully initialize (reload may land on tool selector or papers list).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("papers-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    // Step 3: Go offline BEFORE navigating to papers
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Step 4: Click papers (while offline)
    await papers.navigateToPapers()

    // Step 5: Paper should appear from cache
    await papers.expectPapersListVisible()
    await papers.expectPaperInList("Offline Cached Paper")

    // Restore routing
    await page.unroute("**/api/**")
  })

  test("multiple papers are available offline after caching", async ({ page }) => {
    test.setTimeout(60000)

    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()

    // Create multiple papers
    const paperData = [
      { title: "Offline Paper 1", content: "First offline paper content" },
      { title: "Offline Paper 2", content: "Second offline paper content" },
      { title: "Offline Paper 3", content: "Third offline paper content" },
    ]

    for (const paper of paperData) {
      await papers.createPaper(paper.title)
      await papers.typeContent(paper.content)
      await papers.waitForAutosave()
      await papers.goBackToList()
    }

    // Verify all papers are in the list
    for (const paper of paperData) {
      await papers.expectPaperInList(paper.title)
    }

    // Clear window storage and reload to populate cache
    await papers.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for tool selector or papers list after reload (state restoration may skip selector).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("papers-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    // Navigate to papers
    await papers.navigateToPapers()

    // Wait for papers list and first paper to appear
    await papers.expectPapersListVisible()
    await expect(page.getByTestId("paper-list-item").first()).toBeVisible({ timeout: 10000 })

    // Verify all papers loaded correctly
    for (const paper of paperData) {
      await papers.expectPaperInList(paper.title)
    }

    // Clear window storage
    await papers.clearWindowStorage()

    // Block API requests to simulate network failure
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Reload with API blocked
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for app to initialize
    await page.waitForTimeout(1000)

    // Wait for tool selector or papers list after reload (state restoration may skip selector).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("papers-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    await papers.navigateToPapers()

    // Wait for papers list and first paper to appear from cache
    await papers.expectPapersListVisible()
    await expect(page.getByTestId("paper-list-item").first()).toBeVisible({ timeout: 10000 })

    // Verify all papers are available from cache
    for (const paper of paperData) {
      await papers.expectPaperInList(paper.title)
    }

    // Restore routing
    await page.unroute("**/api/**")
  })
})

/**
 * Papers Offline Drafts Tests
 *
 * Tests that offline edits persist as drafts and appear in Drafts tool.
 */
test.describe("Papers Offline Drafts", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible(makeWorkspaceName())
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, papers, credentials: { email, password } }
  }

  test("offline paper title edits persist as drafts and appear in Drafts tool", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Original Paper Title")
    await papers.typeContent("Original content before going offline.")
    await papers.waitForAutosave()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Edit the title while offline
    await papers.fillTitle("Offline Draft Paper Title")
    await papers.waitForAutosave()

    await papers.goBackToList()
    await papers.expectPaperInList("Offline Draft Paper Title")
    await papers.expectDraftBadgeInList("Offline Draft Paper Title", 7000)

    // Navigate home to the tool selector and verify Drafts tool is shown
    await page.getByTestId("breadcrumb-back-button").click()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("tool-drafts")).toBeVisible()

    // Open Drafts tool and verify the draft entry exists
    await page.getByTestId("tool-drafts").click()
    await expect(page.getByTestId("drafts-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByTestId("draft-list-item").filter({ hasText: "Offline Draft Paper Title" })
    ).toBeVisible()

    // Open the draft and confirm the offline title is loaded
    await page.getByTestId("draft-list-item").filter({ hasText: "Offline Draft Paper Title" }).click()
    await expect(papers.titleInput).toHaveValue("Offline Draft Paper Title")

    // Restore routing
    await page.unroute("**/api/**")
  })

  // Skip: transient window timing is flaky in CI, the core draft badge functionality is tested in other tests
  test("paper draft badge waits for transient window and sidecar shows warning", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Transient Paper Draft")
    await papers.typeContent("Initial content")
    await papers.waitForAutosave()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Edit title while offline
    await papers.fillTitle("Updated Transient Paper")
    await papers.waitForAutosave()

    // Sidecar should not show draft warning immediately (within transient window)
    await expect(page.getByTestId("sidecar-draft-warning")).not.toBeVisible({ timeout: 1000 })

    // Wait for transient window (5s) to expire, then sidecar should show draft warning
    await expect(page.getByTestId("sidecar-draft-warning")).toBeVisible({ timeout: 8000 })

    await papers.goBackToList()

    const paperItem = page.getByTestId("paper-list-item").filter({ hasText: "Updated Transient Paper" })
    const draftBadge = paperItem.getByTestId("paper-draft-badge")

    // After the sidecar warning is visible (post-transient window), badge should be visible too.
    await expect(draftBadge).toBeVisible({ timeout: 3000 })

    // Restore routing
    await page.unroute("**/api/**")
  })

  test("Drafts tool appears first when paper drafts exist", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Drafts Tool Ordering Paper")
    await papers.typeContent("Offline content for drafts tool ordering")
    await papers.waitForAutosave()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Edit title while offline
    await papers.fillTitle("Updated Drafts Tool Ordering Paper")
    await papers.waitForAutosave()

    await papers.goBackToList()
    await papers.expectDraftBadgeInList("Updated Drafts Tool Ordering Paper", 7000)

    await page.getByTestId("breadcrumb-back-button").click()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    const toolIds = await page.locator('[data-testid^="tool-"]').evaluateAll(nodes =>
      nodes
        .map(node => node.getAttribute("data-testid"))
        .filter((id): id is string => Boolean(id))
        .filter(id => id !== "tool-selector" && id !== "tool-selector-search-input")
    )
    expect(toolIds[0]).toBe("tool-drafts")

    // Restore routing
    await page.unroute("**/api/**")
  })

  test("offline paper create persists as draft", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()

    // Go offline before creating paper
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create paper while offline - should work with draft-first architecture
    await papers.createPaper("Offline Created Paper")
    await papers.typeContent("This paper was created while offline.")
    await papers.waitForAutosave()

    // Editor should still be visible (not "Paper not found")
    await papers.expectEditorVisible()

    await papers.goBackToList()

    // Paper should appear in list
    await papers.expectPaperInList("Offline Created Paper")

    // Draft badge should appear after transient window (5s)
    await papers.expectDraftBadgeInList("Offline Created Paper", 7000)

    // Restore routing
    await page.unroute("**/api/**")
  })
})

/**
 * Paper File Attachments Tests
 *
 * Tests file drag-and-drop attachments in the TipTap editor.
 * Files attached to papers are encrypted and uploaded in chunks.
 * Attached files should NOT appear in the Files tool.
 */
test.describe("Paper File Attachments", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()
  const makeWorkspaceName = () => `Test Workspace ${Date.now()}-${Math.floor(Math.random() * 1000)}`

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = makeWorkspaceName()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const papers = new PapersPage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()
    await expect(page.getByTestId("sidebar-workspace-switcher")).toContainText(workspaceName, {
      timeout: 10000,
    })

    return { auth, workspace, papers, files, credentials: { email, password } }
  }

  // TODO: These tests are skipped because TipTap's FileHandler uses complex ProseMirror
  // event handling that doesn't work correctly with Playwright's simulated DragEvents.
  // The implementation is tested via integration tests in files.integration.test.ts.
  // Manual testing confirms file drag-drop works correctly.

  test("can drag and drop a text file into paper", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to papers and create a new paper
    await papers.navigateToPapers()
    await papers.createPaper("Paper with Attachment")
    await papers.expectEditorVisible()

    // Drop a text file into the editor
    const testFileName = "test-document.txt"
    const testContent = "This is test content for the attachment."
    await papers.dropFileIntoEditor(testFileName, testContent, "text/plain")

    // Wait for upload to complete
    await papers.waitForUploadComplete()

    // Verify the attachment appears in the editor
    await papers.expectAttachmentVisible(testFileName)

    // Wait for autosave
    await papers.waitForAutosave()
  })

  test("can drag and drop an image file into paper", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Paper with Image")
    await papers.expectEditorVisible()

    // Create a minimal PNG image buffer
    const pngBuffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01, // 1x1 dimensions
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53,
      0xde,
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41,
      0x54, // IDAT chunk
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xff,
      0xff,
      0xff,
      0x00,
      0x05,
      0xfe,
      0x02,
      0xfe,
      0xa3,
      0x6c,
      0xec,
      0x90,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44, // IEND chunk
      0xae,
      0x42,
      0x60,
      0x82,
    ])

    await papers.dropFileIntoEditor("test-image.png", pngBuffer, "image/png")

    // Wait for upload to complete
    await papers.waitForUploadComplete()

    // Verify an image appears in the editor
    await papers.expectImageAttachmentVisible()

    await papers.waitForAutosave()
  })

  test("can drop multiple files at once", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Paper with Multiple Files")
    await papers.expectEditorVisible()

    // Drop multiple files at once
    await papers.dropMultipleFilesIntoEditor([
      { name: "file1.txt", content: "Content of file 1" },
      { name: "file2.txt", content: "Content of file 2" },
      { name: "file3.txt", content: "Content of file 3" },
    ])

    // Wait for uploads to complete
    await papers.waitForUploadComplete()

    // Verify all attachments appear
    await papers.expectAttachmentVisible("file1.txt")
    await papers.expectAttachmentVisible("file2.txt")
    await papers.expectAttachmentVisible("file3.txt")

    await papers.waitForAutosave()
  })

  test("attached files do not appear in Files tool", async ({ page }) => {
    const { papers, files } = await setupAuthenticatedUserWithWorkspace(page)

    // First, create a paper with an attached file
    await papers.navigateToPapers()
    await papers.createPaper("Paper with Hidden File")
    await papers.expectEditorVisible()

    const attachedFileName = "paper-attachment.txt"
    await papers.dropFileIntoEditor(attachedFileName, "This file should not appear in Files tool")
    await papers.waitForUploadComplete()
    await papers.expectAttachmentVisible(attachedFileName)
    await papers.waitForAutosave()

    // Navigate to Files tool
    await files.navigateToFiles()
    await files.expectFilesListVisible()

    // Verify the attached file is NOT in the Files list
    await files.expectFileNotInList(attachedFileName)
  })

  test("file attachment persists after page reload", async ({ page }) => {
    const { papers } = await setupAuthenticatedUserWithWorkspace(page)

    await papers.navigateToPapers()
    await papers.createPaper("Persistent Attachment Paper")
    await papers.expectEditorVisible()

    const testFileName = "persistent-file.txt"
    await papers.dropFileIntoEditor(testFileName, "This file should persist")
    await papers.waitForUploadComplete()
    await papers.expectAttachmentVisible(testFileName)
    await papers.waitForAutosave()

    // Give extra time for Yjs to sync
    await page.waitForTimeout(1000)

    // Clear localStorage and reload
    await papers.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to the paper
    await papers.navigateToPapers()
    await papers.openPaperByTitle("Persistent Attachment Paper")
    await papers.expectEditorVisible()

    // Verify the attachment is still there
    await papers.expectAttachmentVisible(testFileName)
  })
})
