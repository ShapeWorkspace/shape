import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { FilesPage } from "./pages/files-page"
import { SearchPage } from "./pages/search-page"
import { makeUser } from "./utils/test-data"

test.describe("Files Tool", () => {
  const makeCreds = () => makeUser()

  /**
   * Helper to set up an authenticated user with a workspace.
   * Returns page objects for further interaction.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, credentials: { email, password } }
  }

  test("can upload a text file", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to files tool
    await files.navigateToFiles()
    await files.expectFilesListVisible()

    // Wait for workspace registration to complete before uploading
    await files.waitForUploadsAvailable()

    // Upload a text file
    const fileName = "test-document.txt"
    const fileContent = "Hello, this is a test file for E2EE upload."

    await files.uploadFile(fileName, fileContent)

    // Wait for upload to complete and file to appear in list
    await files.waitForUploadComplete(fileName)
    await files.expectFileInList(fileName)
  })

  test("can view uploaded text file content", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.expectFilesListVisible()
    await files.waitForUploadsAvailable()

    // Upload a text file
    const fileName = "readable-file.txt"
    const fileContent = "This content should be decrypted and displayed."

    await files.uploadFile(fileName, fileContent, "text/plain")
    await files.waitForUploadComplete(fileName)

    // Open the file
    await files.openFileByName(fileName)

    // Verify text preview shows the decrypted content
    await files.expectTextPreview(fileContent)
  })

  test("can rename a file", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload a file
    const originalName = "original-name.txt"
    await files.uploadFile(originalName, "Content to rename")
    await files.waitForUploadComplete(originalName)

    // Open the file to access sidecar
    await files.openFileByName(originalName)
    await files.expectSidecarVisible()

    // Rename the file
    await files.clickRename()
    const newName = "renamed-file.txt"
    await files.renameFile(newName)

    // Go back to list and verify
    await files.goBackToList()
    await files.expectFileInList(newName)
    await files.expectFileNotInList(originalName)
  })

  test("can delete a file", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload a file
    const fileName = "file-to-delete.txt"
    await files.uploadFile(fileName, "This file will be deleted")
    await files.waitForUploadComplete(fileName)

    // Verify it exists
    await files.expectFileInList(fileName)

    // Open and delete
    await files.openFileByName(fileName)
    await files.expectSidecarVisible()

    // First click shows confirmation
    await files.clickDelete()
    // Second click confirms
    await files.confirmDelete()

    // Verify it's gone
    await files.expectFileNotInList(fileName)
  })

  test("file persists after page reload (encryption/decryption round-trip)", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload a file
    const fileName = "persistent-file.txt"
    const fileContent = "This encrypted file should survive a page reload."

    await files.uploadFile(fileName, fileContent, "text/plain")
    await files.waitForUploadComplete(fileName)

    // Clear window storage before reload
    await files.clearWindowStorage()

    // Reload the page - this tests:
    // 1. File metadata was encrypted and saved to server
    // 2. File content was encrypted to S3
    // 3. Workspace key is properly retrieved
    // 4. File is decrypted correctly on load
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to files after reload
    await files.navigateToFiles()
    await files.expectFileInList(fileName)

    // Open and verify content is decrypted correctly
    await files.openFileByName(fileName)
    await files.expectTextPreview(fileContent)
  })

  test("can search for files", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload multiple files
    await files.uploadFile("report-2023.txt", "Annual report")
    await files.waitForUploadComplete("report-2023.txt")

    await files.uploadFile("notes-meeting.txt", "Meeting notes")
    await files.waitForUploadComplete("notes-meeting.txt")

    await files.uploadFile("report-2024.txt", "Another report")
    await files.waitForUploadComplete("report-2024.txt")

    // Verify all files visible
    await files.expectFileInList("report-2023.txt")
    await files.expectFileInList("notes-meeting.txt")
    await files.expectFileInList("report-2024.txt")

    // Search for "report"
    await files.search("report")

    // Only report files should be visible
    await files.expectFileInList("report-2023.txt")
    await files.expectFileInList("report-2024.txt")
    await files.expectFileNotInList("notes-meeting.txt")

    // Clear search
    await files.clearSearch()

    // All files should be visible again
    await files.expectFileInList("report-2023.txt")
    await files.expectFileInList("notes-meeting.txt")
    await files.expectFileInList("report-2024.txt")
  })

  test("deleted file stays deleted after reload", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload and delete a file
    const fileName = "deleted-forever.txt"
    await files.uploadFile(fileName, "Goodbye forever")
    await files.waitForUploadComplete(fileName)
    await files.openFileByName(fileName)
    await files.clickDelete()
    await files.confirmDelete()
    await files.expectFileNotInList(fileName)

    // Clear window storage before reload
    await files.clearWindowStorage()

    // Reload and verify still gone
    await page.reload({ waitUntil: "domcontentloaded" })
    await files.navigateToFiles()
    await files.expectFileNotInList(fileName)
  })

  test("multiple files can be uploaded and persist", async ({ page }) => {
    // Extend timeout since this test uploads multiple files
    test.setTimeout(60000)

    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload multiple files
    const fileData = [
      { name: "first-file.txt", content: "First file content" },
      { name: "second-file.txt", content: "Second file content" },
      { name: "third-file.txt", content: "Third file content" },
    ]

    for (const file of fileData) {
      await files.uploadFile(file.name, file.content)
      await files.waitForUploadComplete(file.name)
    }

    // Verify all files exist
    for (const file of fileData) {
      await files.expectFileInList(file.name)
    }

    // Clear window storage before reload
    await files.clearWindowStorage()

    // Reload and verify all persist
    await page.reload({ waitUntil: "domcontentloaded" })
    await files.navigateToFiles()

    for (const file of fileData) {
      await files.expectFileInList(file.name)
    }
  })

  test("cancel delete does not delete file", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Upload a file
    const fileName = "keep-this-file.txt"
    await files.uploadFile(fileName, "This file should survive")
    await files.waitForUploadComplete(fileName)

    // Open and start delete process
    await files.openFileByName(fileName)
    await files.expectSidecarVisible()

    // Click delete but then cancel
    await files.clickDelete()
    await files.cancelDelete()

    // Go back to list and verify file still exists
    await files.goBackToList()
    await files.expectFileInList(fileName)
  })
})

test.describe("Files Encryption Verification", () => {
  const makeCreds = () => makeUser()

  test("different users cannot see each other's files", async ({ browser }) => {
    test.setTimeout(60000)

    // User 1: Upload a file
    const user1Creds = makeCreds()
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    const auth1 = new AuthPage(page1)
    const workspace1 = new WorkspacePage(page1)
    const files1 = new FilesPage(page1)

    await auth1.goto()
    await auth1.signUp(user1Creds)
    await workspace1.createWorkspace(`User1 Workspace ${user1Creds.name}`)
    await workspace1.expectToolSelectorVisible()
    await files1.navigateToFiles()
    await files1.waitForUploadsAvailable()

    // Upload a file as user 1
    await files1.uploadFile("user1-secret.txt", "User1's private data")
    await files1.waitForUploadComplete("user1-secret.txt")
    await context1.close()

    // User 2: Create their own workspace
    const user2Creds = makeCreds()
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    const auth2 = new AuthPage(page2)
    const workspace2 = new WorkspacePage(page2)
    const files2 = new FilesPage(page2)

    await auth2.goto()
    await auth2.signUp(user2Creds)
    await workspace2.createWorkspace(`User2 Workspace ${user2Creds.name}`)
    await workspace2.expectToolSelectorVisible()
    await files2.navigateToFiles()

    // User2 should NOT see User1's file
    await files2.expectFileNotInList("user1-secret.txt")

    await context2.close()
  })
})

test.describe("Folder Operations", () => {
  const makeCreds = () => makeUser()

  /**
   * Helper to set up an authenticated user with a workspace.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, credentials: { email, password } }
  }

  test("can create a folder", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.expectFilesListVisible()

    // Create a folder
    await files.createFolder("My Documents")

    // Verify it appears in the list
    await files.expectFolderInList("My Documents")
  })

  test("can rename a folder via sidecar", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.createFolder("Original Folder")

    // Open folder sidecar (this navigates INTO the folder)
    await files.openFolderByName("Original Folder")
    await files.expectSidecarVisible()

    // Rename the folder
    await files.clickFolderRename()
    await files.renameFolder("Renamed Folder")

    // Go back to root to verify rename worked
    await files.goBackToList()
    await files.expectFolderInList("Renamed Folder")
    await files.expectFolderNotInList("Original Folder")
  })

  test("can delete an empty folder", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.createFolder("To Delete")

    // Verify it exists
    await files.expectFolderInList("To Delete")

    // Open and delete
    await files.openFolderByName("To Delete")
    await files.expectSidecarVisible()
    await files.clickFolderDelete()
    await files.confirmFolderDelete()

    // Verify it's gone
    await files.expectFolderNotInList("To Delete")
  })

  test("folder persists after page reload", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.createFolder("Persistent Folder")
    await files.expectFolderInList("Persistent Folder")

    // Clear storage and reload
    await files.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back and verify
    await files.navigateToFiles()
    await files.expectFolderInList("Persistent Folder")
  })
})

test.describe("Breadcrumb Navigation", () => {
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, credentials: { email, password } }
  }

  test("clicking folder in breadcrumb shows folder contents not root", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()

    // Create a folder at root
    await files.createFolder("Finance")
    await files.expectFolderInList("Finance")

    // Navigate into the folder
    await files.openFolderByName("Finance")
    await files.waitForUploadsAvailable()

    // Upload a file inside the folder
    await files.uploadFile("Report.pdf", "Financial report content", "application/pdf")
    await files.waitForUploadComplete("Report.pdf")

    // Click on the file to open it (breadcrumb: Files > Finance > Report.pdf)
    await files.openFileByName("Report.pdf")

    // Now click on "Finance" in the breadcrumb to go back to the folder
    // The breadcrumb should be: Files > Finance > Report.pdf
    // Clicking Finance (index 1) should show the Finance folder contents
    await page.getByTestId("breadcrumb-item-1").click()

    // Verify we're in the Finance folder by checking the file is visible
    // If we're at root, the file wouldn't be visible (it's inside Finance)
    await files.expectFileInList("Report.pdf")

    // Also verify the folder is NOT in the list (we're inside it, not at root)
    await files.expectFolderNotInList("Finance")
  })
})

test.describe("File Move Operations", () => {
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, credentials: { email, password } }
  }

  test("can move a file to a folder", async ({ page }) => {
    test.setTimeout(30000)
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    await files.navigateToFiles()
    await files.waitForUploadsAvailable()

    // Create a folder
    await files.createFolder("Target Folder")

    // Upload a file at root
    await files.uploadFile("movable-file.txt", "This file will be moved")
    await files.waitForUploadComplete("movable-file.txt")

    // Open file and click move
    await files.openFileByName("movable-file.txt")
    await files.expectSidecarVisible()
    await files.clickFileMove()

    // Select the target folder
    await files.selectMoveDestination("Target Folder")

    // File should no longer be at root
    await files.expectFileNotInList("movable-file.txt")
  })
})

test.describe("Global File Drop Behavior", () => {
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, credentials: { email, password } }
  }

  /**
   * Helper to check if the global drop overlay is visible.
   * The overlay appears when dragging files over a droppable area.
   */
  async function isDropOverlayVisible(page: Page): Promise<boolean> {
    // The overlay has a Plus icon and specific styling
    const overlay = page.locator('[class*="dropTargetOverlay"]')
    return overlay.isVisible().catch(() => false)
  }

  /**
   * Helper to simulate dragging a file over the page.
   * Uses Playwright's native drag events to trigger the overlay.
   */
  async function simulateFileDragOver(page: Page): Promise<void> {
    // Dispatch dragenter event with Files type to trigger the overlay
    await page.evaluate(() => {
      // Create a DataTransfer with a file - this automatically populates types with "Files"
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File(["test"], "test.txt", { type: "text/plain" }))

      const event = new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      })
      window.dispatchEvent(event)
    })
    // Small wait for React state update
    await page.waitForTimeout(100)
  }

  /**
   * Helper to simulate drag leave.
   */
  async function simulateFileDragLeave(page: Page): Promise<void> {
    await page.evaluate(() => {
      const event = new DragEvent("dragleave", {
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
    })
    await page.waitForTimeout(100)
  }

  test("global drop overlay shows on root page (tool selector)", async ({ page }) => {
    const { workspace } = await setupAuthenticatedUserWithWorkspace(page)

    // Verify we're on the root page (tool selector)
    await workspace.expectToolSelectorVisible()

    // Simulate file drag over
    await simulateFileDragOver(page)

    // The drop overlay should be visible - use Playwright's auto-wait
    const overlay = page.locator('[class*="dropTargetOverlay"]')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    // Clean up
    await simulateFileDragLeave(page)
  })

  test("global drop overlay shows in Files tool", async ({ page }) => {
    const { files } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to Files tool
    await files.navigateToFiles()
    await files.expectFilesListVisible()

    // Simulate file drag over
    await simulateFileDragOver(page)

    // The drop overlay should be visible
    const overlayVisible = await isDropOverlayVisible(page)
    expect(overlayVisible).toBe(true)

    // Clean up
    await simulateFileDragLeave(page)
  })

  test("global drop overlay does NOT show in Notes tool", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to Notes tool
    await page.getByTestId("tool-memos").click()
    await page.getByTestId("notes-tool-container").waitFor({ state: "visible" })

    // Simulate file drag over
    await simulateFileDragOver(page)

    // The drop overlay should NOT be visible
    const overlayVisible = await isDropOverlayVisible(page)
    expect(overlayVisible).toBe(false)
  })

  test("global drop overlay does NOT show in Tasks/Projects tool", async ({ page }) => {
    await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to Projects tool (Tasks tool in the codebase)
    await page.getByTestId("tool-projects").click()
    await page.getByTestId("tasks-tool-container").waitFor({ state: "visible" })

    // Simulate file drag over
    await simulateFileDragOver(page)

    // The drop overlay should NOT be visible
    const overlayVisible = await isDropOverlayVisible(page)
    expect(overlayVisible).toBe(false)
  })
})

test.describe("Folder Search and Parent Navigation", () => {
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const workspaceName = `Test Workspace ${email.split("@")[0]}`
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const files = new FilesPage(page)
    const search = new SearchPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspace(workspaceName)
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, files, search, credentials: { email, password } }
  }

  test("clicking folder from search navigates correctly (not File not found)", async ({ page }) => {
    const { files, search } = await setupAuthenticatedUserWithWorkspace(page)

    // Navigate to files and create a folder
    await files.navigateToFiles()
    await files.createFolder("SearchableFolder")
    await files.expectFolderInList("SearchableFolder")

    // Go back to tool selector (root)
    await page.getByTestId("breadcrumb-back-button").click()
    await page.getByTestId("tool-selector").waitFor({ state: "visible" })

    // Wait for search index to be ready
    await search.waitForSearchIndexReady()

    // Search for the folder globally
    await search.searchGlobally("SearchableFolder")
    await search.expectSearchResultsVisible()
    await search.expectSearchResultWithText("SearchableFolder")

    // Click on the folder in search results
    await search.clickSearchResult("SearchableFolder")

    // Should NOT see "File not found" - should be in the folder
    const fileNotFound = page.getByText("File not found")
    await expect(fileNotFound).not.toBeVisible({ timeout: 3000 })

    // Should see the files container (we're inside the folder)
    await files.expectFilesListVisible()
  })

  test("navigating to nested folder from search shows .. breadcrumb for parent", async ({ page }) => {
    test.setTimeout(60000) // Extend timeout for this test

    const { files, search } = await setupAuthenticatedUserWithWorkspace(page)

    // Create nested folder structure: ParentFolder > ChildFolder (via move).
    await files.navigateToFiles()
    await files.createFolder("ParentFolder")
    await files.expectFolderInList("ParentFolder")

    // Create the child folder at root, then move it under ParentFolder.
    await files.createFolder("ChildFolder")
    await files.expectFolderInList("ChildFolder")

    await files.openFolderByName("ChildFolder")
    await files.clickFolderMove()
    await files.selectMoveDestination("ParentFolder")
    await files.goBackToList()

    // Verify the child now lives under the parent.
    await files.openFolderByName("ParentFolder")
    await files.expectFolderInList("ChildFolder")

    // Go back to tool selector (root) by clicking home
    await page.getByTestId("breadcrumb-back-button").click()
    await page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 })

    // Wait for search index to include the new folder
    await search.waitForSearchIndexReady()
    await page.waitForTimeout(2000) // Give index time to update

    // Search for the child folder globally
    await search.searchGlobally("ChildFolder")
    await search.expectSearchResultsVisible()
    await search.expectSearchResultWithText("ChildFolder")

    // Click on the child folder in search results
    await search.clickSearchResult("ChildFolder")

    // Should be in the files tool, in the child folder
    await files.expectFilesListVisible()

    // The ".." breadcrumb should appear since this folder has a parent
    // that's not in the navigation stack
    const parentBreadcrumb = page.getByTestId("breadcrumb-parent")
    await expect(parentBreadcrumb).toBeVisible({ timeout: 10000 })
    await expect(parentBreadcrumb).toHaveText("..")

    // Click ".." to navigate to parent folder
    await parentBreadcrumb.click()

    // Should now be in ParentFolder, which contains ChildFolder
    await files.expectFolderInList("ChildFolder")
  })
})
