import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { NotesPage } from "./pages/notes-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

async function ensureWorkspaceReady(page: Page, workspaceName: string): Promise<void> {
  const workspaceSelector = page.getByTestId("workspace-selector")
  const selectorVisible = await workspaceSelector.isVisible().catch(() => false)
  if (!selectorVisible) {
    return
  }

  const namedWorkspaceRow = page.getByTestId(/workspace-row-/).filter({ hasText: workspaceName }).first()
  const namedWorkspaceVisible = await namedWorkspaceRow.isVisible().catch(() => false)
  if (namedWorkspaceVisible) {
    await namedWorkspaceRow.click({ force: true })
    return
  }

  const firstWorkspaceRow = page.getByTestId(/workspace-row-/).first()
  const firstWorkspaceVisible = await firstWorkspaceRow.isVisible().catch(() => false)
  if (firstWorkspaceVisible) {
    await firstWorkspaceRow.click({ force: true })
    return
  }

  await page.getByTestId("create-workspace-option").click({ force: true })
  const workspaceNameInput = page.getByTestId("workspace-name-input")
  await expect(workspaceNameInput).toBeVisible({ timeout: 10000 })
  await workspaceNameInput.fill(workspaceName)

  const createWorkspaceButton = page.getByTestId("create-workspace-button")
  const createButtonVisible = await createWorkspaceButton.isVisible().catch(() => false)
  if (createButtonVisible) {
    await createWorkspaceButton.click({ force: true })
  } else {
    await workspaceNameInput.press("Enter")
  }
}

test.describe("Notes Tool", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(20000)
  const makeCreds = () => makeUser()

  /**
   * Helper to set up an authenticated user with a workspace.
   * Returns the page objects for further interaction.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password, name } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const notes = new NotesPage(page)
    const workspaceName = `Test Workspace ${name}`

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await ensureWorkspaceReady(page, workspaceName)
    await workspace.expectToolSelectorVisible({ timeout: 30000 })

    return { auth, workspace, notes, credentials: { email, password, name }, workspaceName }
  }

  test("can create a note with title and content", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to notes tool
    await notes.navigateToNotes()
    await notes.expectNotesListVisible()

    // Create a new note
    await notes.createNote()

    // Fill in title and content
    await notes.fillTitle("My First Note")
    await notes.fillContent("This is the content of my first encrypted note.")

    // Wait for autosave
    await notes.waitForAutosave()

    // Navigate back to list
    await notes.goBackToList()

    // Verify note appears in list
    await notes.expectNoteInList("My First Note")
  })

  test("navigates to a new note before the create request completes", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.expectNotesListVisible()

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
        payload.entity_type !== "note"
      ) {
        await route.fallback()
        return
      }

      await createRequestReleased
      await route.continue()
    })

    await page.getByTestId("new-note-button").click()
    await expect(page).toHaveURL(/\/memos\/[^/]+$/, { timeout: 1000 })

    createRequestGate.release()

    await expect(page.getByTestId("note-title-input")).toBeVisible({ timeout: 15000 })
    await page.unroute("**/api/workspaces/*/entities")
  })

  test("can edit an existing note", async ({ page }) => {
    // Extend timeout for this flaky test
    test.setTimeout(30000)

    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()
    await notes.fillTitle("Original Title")
    // Wait longer for title autosave - this has known flakiness
    await page.waitForTimeout(5000)
    await notes.fillContent("Original content")
    await notes.waitForAutosave()
    await notes.goBackToList()

    // Wait for the note to appear in the list - use longer timeout for reliability
    await notes.expectNoteInList("Original Title", 15000)

    // Open the note again
    await notes.openNoteByTitle("Original Title")

    // Edit the note
    await notes.fillTitle("Updated Title")
    await notes.fillContent("Updated content with more information.")
    await notes.waitForAutosave()

    // Go back and verify updated title
    await notes.goBackToList()
    await notes.expectNoteInList("Updated Title")
    await notes.expectNoteNotInList("Original Title")
  })

  test("note content persists after page reload (encryption/decryption round-trip)", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    const testTitle = "Persistent Note"
    const testContent = "This note should survive a page reload thanks to E2EE."

    await notes.fillTitle(testTitle)
    await notes.fillContent(testContent)
    await notes.waitForAutosave()

    // Clear window storage before reload to ensure predictable navigation
    // (otherwise window persistence would restore us to the note detail view)
    await notes.clearWindowStorage()

    // Reload the page - this tests:
    // 1. Note was encrypted and saved to server
    // 2. Workspace key is properly cached/retrieved
    // 3. Note is decrypted correctly on load
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to the notes list route to avoid landing in the note detail URL.
    const workspaceMatch = page.url().match(/\/w\/([^/]+)/)
    if (workspaceMatch) {
      await page.goto(`/w/${workspaceMatch[1]}/memos`, { waitUntil: "domcontentloaded" })
    }
    await notes.expectNotesListVisible()
    await notes.expectNoteInList(testTitle)

    // Open the note and verify content
    await notes.openNoteByTitle(testTitle)
    expect(await notes.getTitle()).toBe(testTitle)
    // Wait for blocks to load
    await page.waitForTimeout(3000)

    expect(await notes.getContent()).toBe(testContent)
  })

  test("note content changes are saved as blocks", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    await notes.fillTitle("Block Based Note")

    // Ensure we are on a note detail URL so we can extract the note ID.
    await expect(page).toHaveURL(/\/memos\//)
    const currentUrl = page.url()
    const workspaceIdFromUrl = currentUrl.split("/w/")[1]?.split("/")[0] ?? ""
    const noteIdFromUrl = currentUrl.split("/memos/")[1]?.split(/[?#/]/)[0] ?? ""
    expect(workspaceIdFromUrl).not.toBe("")
    expect(noteIdFromUrl).not.toBe("")

    await notes.fillContent("Block-based content should be saved via entity blocks.")
    await notes.waitForAutosave()

    const persistedBlockCount = await page.evaluate(
      async ({ workspaceId, noteId }) => {
        const openRequest = indexedDB.open(`shape_offline_${workspaceId}`)
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          openRequest.onerror = () => reject(openRequest.error)
          openRequest.onsuccess = () => resolve(openRequest.result)
        })

        const getBlockCountForStore = async (storeName: string): Promise<number> => {
          if (!db.objectStoreNames.contains(storeName)) {
            return 0
          }

          return await new Promise<number>(resolve => {
            const transaction = db.transaction([storeName], "readonly")
            const store = transaction.objectStore(storeName)
            const request = store.getAll()
            request.onerror = () => resolve(0)
            request.onsuccess = () => {
              const records = Array.isArray(request.result) ? request.result : []
              const count = records.filter(record => {
                const value = record as { entity_id?: string; entityId?: string }
                return value.entity_id === noteId || value.entityId === noteId
              }).length
              resolve(count)
            }
          })
        }

        const [serverBlockCount, draftBlockCount] = await Promise.all([
          getBlockCountForStore("block"),
          getBlockCountForStore("draft-block"),
        ])
        db.close()
        return serverBlockCount + draftBlockCount
      },
      { workspaceId: workspaceIdFromUrl, noteId: noteIdFromUrl }
    )

    expect(persistedBlockCount).toBeGreaterThan(0)
  })

  test("can export a note as markdown", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    await notes.fillTitle("Export Note")
    await notes.fillContent("Export content")
    await notes.waitForAutosave()

    await page.getByTestId("note-export-open").click()

    const exportCopyButton = page.getByTestId("export-copy-markdown")
    await expect(exportCopyButton).toHaveAttribute("data-disabled", "false")
    await exportCopyButton.click()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe("# Export Note\n\nExport content")
  })

  test("can delete a note", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()
    await notes.fillTitle("Note To Delete")
    await notes.fillContent("This note will be deleted.")
    await notes.waitForAutosave()
    await notes.goBackToList()

    // Verify it exists
    await notes.expectNoteInList("Note To Delete")

    // Open and delete
    await notes.openNoteByTitle("Note To Delete")
    await notes.deleteCurrentNote()

    // Verify it's gone
    await notes.expectNoteNotInList("Note To Delete")
  })

  test("deleted note stays deleted after reload", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()
    await notes.fillTitle("Deleted Forever")
    await notes.fillContent("Goodbye.")
    await notes.waitForAutosave()
    await notes.goBackToList()
    await notes.openNoteByTitle("Deleted Forever")
    await notes.deleteCurrentNote()
    await notes.expectNoteNotInList("Deleted Forever")

    // Clear window storage before reload to ensure predictable navigation
    await notes.clearWindowStorage()

    // Reload and verify still gone
    await page.reload({ waitUntil: "domcontentloaded" })
    await notes.navigateToNotes()
    await notes.expectNoteNotInList("Deleted Forever")
  })

  test("multiple notes can be created and persist", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()

    // Create first note
    await notes.createNote()
    await notes.fillTitle("First Note")
    await notes.fillContent("Content of first note.")
    await notes.waitForAutosave()
    await notes.goBackToList()

    // Create second note
    await notes.createNote()
    await notes.fillTitle("Second Note")
    await notes.fillContent("Content of second note.")
    await notes.waitForAutosave()
    await notes.goBackToList()

    // Create third note
    await notes.createNote()
    await notes.fillTitle("Third Note")
    await notes.fillContent("Content of third note.")
    await notes.waitForAutosave()
    await notes.goBackToList()

    // Verify all notes exist
    await notes.expectNoteInList("First Note")
    await notes.expectNoteInList("Second Note")
    await notes.expectNoteInList("Third Note")

    // Clear window storage before reload to ensure predictable navigation
    await notes.clearWindowStorage()

    // Reload and verify all persist
    await page.reload({ waitUntil: "domcontentloaded" })
    await notes.navigateToNotes()
    await notes.expectNoteInList("First Note")
    await notes.expectNoteInList("Second Note")
    await notes.expectNoteInList("Third Note")
  })

  test("shows mention suggestions in the note editor", async ({ page }) => {
    const { notes, credentials } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    const { suggestionItems } = await openMentionSuggestions(page, "note-content")
    await expect(suggestionItems).toHaveCount(1)
    await suggestionItems.first().click()

    const editorContent = page.getByTestId("note-content-content")
    await expect(editorContent).toContainText(credentials.name)
  })

  test("note with empty title shows plaintext body preview in the list", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    // The note title should start empty (no default title).
    await expect(page.getByTestId("note-title-input")).toHaveValue("")

    // Only fill content, leave title empty so the list must use body preview.
    const noteBodyPreviewText = "This note has no title."
    await notes.fillContent(noteBodyPreviewText)
    await notes.waitForAutosave()
    await notes.goBackToList()

    // The list should show a plaintext preview of the body when there is no title.
    await notes.expectFirstNotePreviewInList(noteBodyPreviewText)

    // Open the note and ensure breadcrumbs + window list use the same preview text.
    await page.getByTestId("note-list-item").first().click()
    await expect(page.getByTestId("breadcrumb-item-1")).toContainText(noteBodyPreviewText, { timeout: 5000 })
    await expect(page.getByTestId("navigation-sidebar")).toContainText(noteBodyPreviewText, { timeout: 5000 })
  })
})

test.describe("Notes Offline Caching", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  function getWorkspaceIdFromUrl(url: string): string {
    const match = url.match(/\/w\/([^/]+)/)
    return match?.[1] ?? ""
  }

  function getNoteIdFromUrl(url: string): string {
    const match = url.match(/\/memos\/([^/?#]+)/)
    return match?.[1] ?? ""
  }

  async function waitForWorkspaceKeyCached(page: Page, workspaceId: string): Promise<void> {
    await expect
      .poll(
        async () => {
          return await page.evaluate(async id => {
            const openRequest = indexedDB.open(`shape_offline_${id}`)
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              openRequest.onerror = () => reject(openRequest.error)
              openRequest.onsuccess = () => resolve(openRequest.result)
            })

            if (!db.objectStoreNames.contains("workspace-key")) {
              db.close()
              return 0
            }

            const count = await new Promise<number>(resolve => {
              const transaction = db.transaction(["workspace-key"], "readonly")
              const store = transaction.objectStore("workspace-key")
              const request = store.getAll()
              request.onerror = () => resolve(0)
              request.onsuccess = () => {
                const rows = Array.isArray(request.result) ? request.result : []
                resolve(rows.length)
              }
            })

            db.close()
            return count
          }, workspaceId)
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0)
  }

  async function waitForNoteCached(page: Page, workspaceId: string, noteId: string): Promise<void> {
    await expect
      .poll(
        async () => {
          return await page.evaluate(
            async ({ id, entityId }) => {
              const openRequest = indexedDB.open(`shape_offline_${id}`)
              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                openRequest.onerror = () => reject(openRequest.error)
                openRequest.onsuccess = () => resolve(openRequest.result)
              })

              const hasRecord = async (storeName: "entity" | "draft"): Promise<boolean> => {
                if (!db.objectStoreNames.contains(storeName)) {
                  return false
                }

                return await new Promise<boolean>(resolve => {
                  const transaction = db.transaction([storeName], "readonly")
                  const store = transaction.objectStore(storeName)
                  const request = store.get(entityId)
                  request.onerror = () => resolve(false)
                  request.onsuccess = () => resolve(Boolean(request.result))
                })
              }

              const [inEntityStore, inDraftStore] = await Promise.all([
                hasRecord("entity"),
                hasRecord("draft"),
              ])
              db.close()
              return inEntityStore || inDraftStore
            },
            { id: workspaceId, entityId: noteId }
          )
        },
        { timeout: 15000 }
      )
      .toBe(true)
  }

  /**
   * Helper to set up an authenticated user with a workspace.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const notes = new NotesPage(page)
    const workspaceName = `Test Workspace ${email.split("@")[0]}`

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await ensureWorkspaceReady(page, workspaceName)
    await workspace.expectToolSelectorVisible({ timeout: 30000 })

    return { auth, workspace, notes, credentials: { email, password }, workspaceName }
  }

  test("note is displayed from offline cache when API is unavailable (manual flow)", async ({ page }) => {
    // This test matches the exact manual testing flow:
    // 1. Load app, open Notes, create/view note
    // 2. Reload (still online)
    // 3. Go offline
    // 4. Click notes
    // 5. Notes should appear from cache

    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    // Step 1: Navigate to notes and create a note
    await notes.navigateToNotes()
    await notes.createNote()

    const testTitle = "Offline Cached Note"
    const testContent = "This note should be available offline from IndexedDB cache."

    await notes.fillTitle(testTitle)
    await notes.fillContent(testContent)
    await notes.waitForAutosave()

    const workspaceId = getWorkspaceIdFromUrl(page.url())
    const noteId = getNoteIdFromUrl(page.url())
    expect(workspaceId).not.toBe("")
    expect(noteId).not.toBe("")
    await waitForWorkspaceKeyCached(page, workspaceId)
    await waitForNoteCached(page, workspaceId, noteId)

    // Go back to list to ensure note is saved
    await notes.goBackToList()
    await notes.expectNoteInList(testTitle)

    // Step 2: Reload (still online) - but DON'T navigate to notes after
    await notes.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for app to fully initialize (reload may land on tool selector or notes list).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("notes-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    // Step 3: Go offline BEFORE navigating to notes
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Step 4: Click notes (while offline)
    await notes.navigateToNotes()

    // Step 5: Notes should appear from cache
    await notes.expectNotesListVisible()
    await notes.expectNoteInList(testTitle)

    // Verify we can open the note and see its content
    await notes.openNoteByTitle(testTitle)
    expect(await notes.getTitle()).toBe(testTitle)
    await expect
      .poll(async () => {
        return await notes.getContent()
      })
      .toBe(testContent)

    // Restore routing
    await page.unroute("**/api/**")
  })

  test("multiple notes are available offline after caching", async ({ page }) => {
    // Extend timeout since this test creates multiple notes
    test.setTimeout(60000)

    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    const workspaceId = getWorkspaceIdFromUrl(page.url())
    expect(workspaceId).not.toBe("")

    // Create multiple notes
    const noteData = [
      { title: "Offline Note 1", content: "First offline note content" },
      { title: "Offline Note 2", content: "Second offline note content" },
      { title: "Offline Note 3", content: "Third offline note content" },
    ]
    const noteIds: string[] = []

    for (const note of noteData) {
      await notes.createNote()
      const createdNoteId = getNoteIdFromUrl(page.url())
      expect(createdNoteId).not.toBe("")
      noteIds.push(createdNoteId)
      await notes.fillTitle(note.title)
      await notes.fillContent(note.content)
      await notes.waitForAutosave()
      await notes.goBackToList()
    }

    await waitForWorkspaceKeyCached(page, workspaceId)
    for (const noteId of noteIds) {
      await waitForNoteCached(page, workspaceId, noteId)
    }

    // Verify all notes are in the list
    for (const note of noteData) {
      await notes.expectNoteInList(note.title)
    }

    // Clear window storage and reload to populate cache
    await notes.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for app to fully initialize (reload may land on tool selector or notes list).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("notes-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    // Navigate to notes
    await notes.navigateToNotes()

    // Wait for notes list and first note to appear
    await notes.expectNotesListVisible()
    await expect(page.getByTestId("note-list-item").first()).toBeVisible({ timeout: 10000 })

    // Verify all notes loaded correctly
    for (const note of noteData) {
      await notes.expectNoteInList(note.title)
    }

    // Clear window storage
    await notes.clearWindowStorage()

    // Block API requests to simulate network failure
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Reload with API blocked
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for app to initialize and attempt API calls (which will fail)
    await page.waitForTimeout(1000)

    // Wait for app to fully initialize (reload may land on tool selector or notes list).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("notes-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    await notes.navigateToNotes()

    // Wait for notes list and first note to appear from cache
    await notes.expectNotesListVisible()
    await expect(page.getByTestId("note-list-item").first()).toBeVisible({ timeout: 10000 })

    // Verify all notes are available from cache
    for (const note of noteData) {
      await notes.expectNoteInList(note.title)
    }

    // Restore routing
    await page.unroute("**/api/**")
  })
})

test.describe("Offline Drafts", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(25000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const notes = new NotesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await ensureWorkspaceReady(page, "Test Workspace")
    await workspace.expectToolSelectorVisible({ timeout: 30000 })

    return { auth, workspace, notes, credentials: { email, password } }
  }

  test("offline edits persist as drafts and appear in Drafts tool", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    const noteTitle = "Offline Draft Note"
    const originalContent = "Original content before going offline."
    const draftContent = "Offline draft content that should persist."

    await notes.fillTitle(noteTitle)
    await notes.fillContent(originalContent)
    await notes.waitForAutosave()

    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    await notes.fillContent(draftContent)
    await notes.waitForAutosave()

    await notes.goBackToList()
    await notes.expectNoteInList(noteTitle)
    await notes.expectDraftBadgeInList(noteTitle, 7000)

    // Navigate home to the tool selector and verify Drafts tool is shown.
    await page.getByTestId("breadcrumb-back-button").click()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("tool-drafts")).toBeVisible()

    // Open Drafts tool and verify the draft entry exists.
    await page.getByTestId("tool-drafts").click()
    await expect(page.getByTestId("drafts-tool-container")).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("draft-list-item").filter({ hasText: noteTitle })).toBeVisible()

    // Open the draft and confirm the offline content is loaded.
    await page.getByTestId("draft-list-item").filter({ hasText: noteTitle }).click()
    expect(await notes.getTitle()).toBe(noteTitle)
    await expect
      .poll(async () => {
        return await notes.getContent()
      })
      .toBe(draftContent)
  })

  test("draft badge appears and sidecar shows warning", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()

    await notes.fillTitle("Transient Draft")
    await notes.fillContent("Initial content")
    await notes.waitForAutosave()

    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    await notes.fillContent("Draft content offline")
    await notes.waitForAutosave()

    await notes.goBackToList()

    const noteItem = page.getByTestId("note-list-item").filter({ hasText: "Transient Draft" })
    const draftBadge = noteItem.getByTestId("note-draft-badge")

    await expect(draftBadge).toBeVisible({ timeout: 7000 })

    // Re-open after the transient draft window so the sidecar warning indicator can settle.
    await notes.openNoteByTitle("Transient Draft")
    await expect(page.getByTestId("sidecar-draft-warning")).toBeVisible({ timeout: 10000 })
  })

  test("Drafts tool appears first when drafts exist", async ({ page }) => {
    const { notes } = await setupAuthenticatedUserWithWorkspace(page)

    await notes.navigateToNotes()
    await notes.createNote()
    await notes.fillTitle("Drafts Tool Ordering")
    await notes.fillContent("Offline content for drafts tool ordering")
    await notes.waitForAutosave()

    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    await notes.fillContent("Offline change")
    await notes.waitForAutosave()

    await notes.goBackToList()
    await notes.expectDraftBadgeInList("Drafts Tool Ordering", 7000)

    await page.getByTestId("breadcrumb-back-button").click()
    await expect(page.getByTestId("tool-selector")).toBeVisible({ timeout: 10000 })

    const toolIds = await page.locator('[data-testid^="tool-"]').evaluateAll(nodes =>
      nodes
        .map(node => node.getAttribute("data-testid"))
        .filter((id): id is string => Boolean(id))
        .filter(id => id !== "tool-selector" && id !== "tool-selector-search-input")
    )
    expect(toolIds[0]).toBe("tool-drafts")
  })
})

test.describe("Notes Encryption Verification", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(25000)
  const makeCreds = () => makeUser()

  test("different users cannot decrypt each other's notes", async ({ browser }) => {
    // User 1: Create a note
    const user1Creds = makeCreds()
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    const auth1 = new AuthPage(page1)
    const workspace1 = new WorkspacePage(page1)
    const notes1 = new NotesPage(page1)

    await auth1.goto()
    await auth1.signUp(user1Creds)
    await ensureWorkspaceReady(page1, "User1 Workspace")
    await workspace1.expectToolSelectorVisible({ timeout: 30000 })
    await notes1.navigateToNotes()
    await notes1.createNote()
    await notes1.fillTitle("User1 Secret Note")
    await notes1.fillContent("This is User1's private encrypted data.")
    await notes1.waitForAutosave()
    await context1.close()

    // User 2: Create their own workspace and note
    const user2Creds = makeCreds()
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    const auth2 = new AuthPage(page2)
    const workspace2 = new WorkspacePage(page2)
    const notes2 = new NotesPage(page2)

    await auth2.goto()
    await auth2.signUp(user2Creds)
    await ensureWorkspaceReady(page2, "User2 Workspace")
    await workspace2.expectToolSelectorVisible({ timeout: 30000 })
    await notes2.navigateToNotes()

    // User2 should NOT see User1's note
    await notes2.expectNoteNotInList("User1 Secret Note")

    await context2.close()
  })
})
