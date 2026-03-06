import { Buffer } from "buffer"
import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Files tool interactions.
 * Used for testing file upload, preview, and management operations with E2EE encryption.
 */
export class FilesPage {
  private readonly page: Page
  private readonly filesToolButton: Locator
  private readonly filesContainer: Locator
  private readonly addFileButton: Locator
  private readonly addFolderButton: Locator
  private readonly newVideoRecordingButton: Locator
  private readonly newAudioRecordingButton: Locator
  private readonly fileInput: Locator
  private readonly searchInput: Locator
  private readonly sidecar: Locator
  private readonly filesListBreadcrumb: Locator
  private readonly recordingStartButton: Locator
  private readonly recordingStopButton: Locator
  private readonly recordingToolContainer: Locator

  constructor(page: Page) {
    this.page = page
    this.filesToolButton = page.getByTestId("tool-files")
    this.filesContainer = page.getByTestId("files-tool-container")
    this.addFileButton = page.getByTestId("add-file-button")
    this.addFolderButton = page.getByTestId("sidecar-new-folder")
    this.newVideoRecordingButton = page.getByTestId("sidecar-new-video-recording")
    this.newAudioRecordingButton = page.getByTestId("sidecar-new-audio-recording")
    this.fileInput = page.getByTestId("file-input")
    this.searchInput = page.getByTestId("files-search-input")
    this.sidecar = page.getByTestId("sidecar-container")
    // Click the first breadcrumb item to go back to files list
    this.filesListBreadcrumb = page.getByTestId("breadcrumb-item-0")
    this.recordingStartButton = page.getByTestId("recording-action-start")
    this.recordingStopButton = page.getByTestId("recording-action-stop")
    this.recordingToolContainer = page.getByTestId("recording-tool")
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
   * Navigate to the Files tool.
   * Handles multiple scenarios:
   * - From tool selector: clicks the files tool button
   * - Already on files list: does nothing
   * - On a file detail view: navigates back to list
   */
  async navigateToFiles(): Promise<void> {
    // Wait for page to stabilize - one of these states should become true
    const result = await Promise.race([
      this.filesToolButton.waitFor({ state: "visible", timeout: 10000 }).then(() => "tool-selector"),
      this.filesContainer.waitFor({ state: "visible", timeout: 10000 }).then(() => "files-list"),
      this.page
        .getByTestId("file-viewer")
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "file-detail"),
      this.page
        .getByTestId("paper-editor")
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "paper-detail"),
      this.page
        .getByText("File not found")
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "file-not-found"),
    ])

    switch (result) {
      case "files-list":
        // Already on files list, nothing to do
        return

      case "file-detail":
        // On a file detail view, navigate back to list
        await this.goBackToList()
        return

      case "paper-detail":
        // On a paper detail route, navigate directly to files for this workspace.
        {
          const currentUrl = this.page.url()
          const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
          if (workspaceMatch?.[1]) {
            await this.page.goto(`/w/${workspaceMatch[1]}/files`, { waitUntil: "domcontentloaded" })
            await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
            return
          }
        }
        break

      case "file-not-found":
        // Stale file route after delete; return to the list root.
        {
          const currentUrl = this.page.url()
          const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
          if (workspaceMatch?.[1]) {
            await this.page.goto(`/w/${workspaceMatch[1]}/files`, { waitUntil: "domcontentloaded" })
          }
        }
        await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
        return

      case "tool-selector":
        // On tool selector, click to navigate to files
        // Use a direct DOM click to avoid list-item stability flakes.
        await this.filesToolButton.waitFor({ state: "visible", timeout: 5000 })
        await this.filesToolButton.evaluate(button => {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        })
        await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
        return
    }

    // Fallback for any unexpected route state.
    const currentUrl = this.page.url()
    const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
    if (workspaceMatch?.[1]) {
      await this.page.goto(`/w/${workspaceMatch[1]}/files`, { waitUntil: "domcontentloaded" })
      await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
      return
    }

    throw new Error("Unable to navigate to Files tool from the current route.")
  }

  /**
   * Assert that the files list is visible
   */
  async expectFilesListVisible(): Promise<void> {
    await expect(this.filesContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Wait for file uploads to be available (workspace registered with server).
   * This should be called before attempting to upload files to ensure the workspace
   * registration has propagated to the UI state.
   */
  async waitForUploadsAvailable(): Promise<void> {
    // The add-file-button is disabled when uploads are blocked in local-only workspaces.
    // Wait for it to become enabled, indicating the workspace is registered.
    await expect(this.addFileButton).toBeEnabled({ timeout: 30000 })
    // Also wait for the file input to become enabled (they use the same disabled state)
    await expect(this.fileInput).toBeEnabled({ timeout: 5000 })
  }

  /**
   * Assert that the recording tool is visible.
   */
  async expectRecordingToolVisible(): Promise<void> {
    await expect(this.recordingToolContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Open the video recording tool from the files sidecar.
   */
  async openVideoRecordingTool(): Promise<void> {
    await this.expectSidecarVisible()
    const folderRecordingButton = this.page.getByTestId("folder-new-video-recording")
    const hasFolderAction = await folderRecordingButton.isVisible().catch(() => false)
    if (hasFolderAction) {
      await folderRecordingButton.click()
    } else {
      await this.newVideoRecordingButton.click()
    }
    await this.expectRecordingToolVisible()
  }

  /**
   * Open the audio recording tool from the files sidecar.
   */
  async openAudioRecordingTool(): Promise<void> {
    await this.expectSidecarVisible()
    const folderRecordingButton = this.page.getByTestId("folder-new-audio-recording")
    const hasFolderAction = await folderRecordingButton.isVisible().catch(() => false)
    if (hasFolderAction) {
      await folderRecordingButton.click()
    } else {
      await this.newAudioRecordingButton.click()
    }
    await this.expectRecordingToolVisible()
  }

  /**
   * Start a recording session.
   */
  async startRecording(): Promise<void> {
    await this.recordingStartButton.waitFor({ state: "visible", timeout: 10000 })
    await this.recordingStartButton.click({ force: true })
    await expect(this.recordingStopButton).toBeVisible({ timeout: 10000 })
  }

  /**
   * Stop a recording session.
   */
  async stopRecording(): Promise<void> {
    await this.recordingStopButton.waitFor({ state: "visible", timeout: 10000 })
    await this.recordingStopButton.click({ force: true })
    await expect(this.recordingStopButton).not.toBeVisible({ timeout: 15000 })
  }

  /**
   * Upload a file using the hidden file input.
   * Creates a test file with the given name and content.
   */
  async uploadFile(fileName: string, content: string, mimeType: string = "text/plain"): Promise<void> {
    // Create a buffer from the content
    const buffer = Buffer.from(content)

    // Set the file on the hidden input
    await this.fileInput.setInputFiles({
      name: fileName,
      mimeType: mimeType,
      buffer: buffer,
    })
  }

  /**
   * Upload an image file.
   */
  async uploadImageFile(fileName: string, _width: number = 100, _height: number = 100): Promise<void> {
    // Create a simple PNG buffer (1x1 pixel PNG is about 68 bytes)
    // For testing we'll use a minimal valid PNG
    const pngHeader = Buffer.from([
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
      0xde, // bit depth, color type, etc
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
      0xfe, // image data
      0xa3,
      0x6c,
      0xec,
      0x90, // CRC
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
      0x82, // CRC
    ])

    await this.fileInput.setInputFiles({
      name: fileName,
      mimeType: "image/png",
      buffer: pngHeader,
    })
  }

  /**
   * Click the Add file button to trigger file picker.
   * In tests, we use setInputFiles directly instead.
   */
  async clickAddFile(): Promise<void> {
    await this.addFileButton.click()
  }

  /**
   * Wait for an upload to complete by checking the file appears in the list.
   */
  async waitForUploadComplete(fileName: string): Promise<void> {
    // Wait for the file to appear in the list (upload row disappears, file row appears)
    await this.expectFileInList(fileName)
  }

  /**
   * Assert that a file with the given name exists in the list.
   */
  async expectFileInList(fileName: string): Promise<void> {
    // File items contain the file name as text
    const fileItem = this.filesContainer.locator('[data-testid^="file-item-"]').filter({ hasText: fileName }).first()
    await expect(fileItem).toBeVisible({ timeout: 20000 })
    await fileItem.scrollIntoViewIfNeeded()
  }

  /**
   * Assert that no file with the given name exists in the list.
   */
  async expectFileNotInList(fileName: string): Promise<void> {
    const fileItem = this.filesContainer.locator('[data-testid^="file-item-"]').filter({ hasText: fileName })
    await expect(fileItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Click on a file in the list to open it.
   */
  async openFileByName(fileName: string): Promise<void> {
    const fileItem = this.filesContainer.locator('[data-testid^="file-item-"]').filter({ hasText: fileName })
    await fileItem.click()
    // Wait for sidecar to appear (indicates file is selected)
    await expect(this.sidecar).toBeVisible({ timeout: 5000 })
  }

  /**
   * Navigate back to the files list.
   */
  async goBackToList(): Promise<void> {
    if (await this.filesListBreadcrumb.isVisible().catch(() => false)) {
      await this.filesListBreadcrumb.click()
    } else {
      const homeBreadcrumb = this.page.getByTestId("breadcrumb-back-button")
      await homeBreadcrumb.click()
    }
    await this.filesContainer.waitFor({ state: "visible", timeout: 5000 })
  }

  private async tryShowSidecarFromToggle(): Promise<void> {
    const sidecarToggle = this.page.getByTestId("sidecar-toggle")
    const canToggleSidecar = await sidecarToggle.isVisible().catch(() => false)
    if (!canToggleSidecar) {
      return
    }
    const toggleLabel = ((await sidecarToggle.getAttribute("aria-label")) ?? "").toLowerCase()
    if (toggleLabel.includes("show sidecar")) {
      await sidecarToggle.click()
    }
  }

  private async hasFolderSidecarActions(): Promise<boolean> {
    const hasMove = await this.sidecar.getByTestId("folder-move").isVisible().catch(() => false)
    const hasRename = await this.sidecar.getByTestId("folder-rename").isVisible().catch(() => false)
    return hasMove || hasRename
  }

  /**
   * Assert that the sidecar is visible.
   */
  async expectSidecarVisible(): Promise<void> {
    const sidecarAlreadyVisible = await this.sidecar.isVisible().catch(() => false)
    if (sidecarAlreadyVisible) {
      return
    }

    await this.tryShowSidecarFromToggle()

    await expect(this.sidecar).toBeVisible({ timeout: 10000 })
  }

  /**
   * Click the download action in the sidecar.
   */
  async clickDownload(): Promise<void> {
    await this.sidecar.getByText("Download").click()
  }

  /**
   * Click the rename action in the sidecar to open rename view.
   */
  async clickRename(): Promise<void> {
    await this.sidecar.getByText("Rename").click()
  }

  /**
   * Rename a file (after clicking rename).
   */
  async renameFile(newName: string): Promise<void> {
    // Find the input in the sidecar
    const input = this.sidecar.locator("input")
    await input.clear()
    await input.fill(newName)
    // Click save button
    await this.sidecar.getByText("Save").click()
    // Wait for sidecar to return to main view
    await expect(this.sidecar.getByText("Download")).toBeVisible({ timeout: 5000 })
  }

  /**
   * Click the delete action in the sidecar.
   */
  async clickDelete(): Promise<void> {
    await this.sidecar.getByTestId("file-delete").click()
  }

  /**
   * Confirm deletion after clicking delete.
   */
  async confirmDelete(): Promise<void> {
    await this.sidecar.getByTestId("file-delete-confirm").click()
  }

  /**
   * Cancel deletion.
   */
  async cancelDelete(): Promise<void> {
    await this.sidecar.getByTestId("file-delete-cancel").click()
  }

  /**
   * Search for files.
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query)
  }

  /**
   * Clear the search input.
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.fill("")
  }

  /**
   * Assert that the file viewer is showing an image preview.
   */
  async expectImagePreview(): Promise<void> {
    const img = this.page.locator('[class*="fileContent"] img')
    await expect(img).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that the file viewer is showing text content.
   */
  async expectTextPreview(content: string): Promise<void> {
    const pre = this.page.locator('[class*="fileContent"] pre')
    await expect(pre).toContainText(content, { timeout: 10000 })
  }

  /**
   * Assert an upload is in progress.
   */
  async expectUploadInProgress(fileName: string): Promise<void> {
    const uploadItem = this.page.locator('[data-testid^="upload-"]').filter({ hasText: fileName })
    await expect(uploadItem).toBeVisible({ timeout: 5000 })
  }

  /**
   * Get the count of files in the list.
   */
  async getFileCount(): Promise<number> {
    const items = this.filesContainer.locator('[data-testid^="file-item-"]')
    return await items.count()
  }

  // ============== Folder Operations ==============

  /**
   * Click the Add folder button to create a new folder.
   */
  async clickAddFolder(): Promise<void> {
    await this.expectSidecarVisible()
    await this.addFolderButton.click()
  }

  /**
   * Create a new folder with the given name.
   * Opens the create folder form, enters the name, and submits.
   */
  async createFolder(name: string): Promise<void> {
    // Wait for the sidecar to be visible first (FilesListSidecar at root level)
    await this.expectSidecarVisible()
    await this.clickAddFolder()
    // Fill in the folder name in the form
    const nameInput = this.page.getByTestId("create-folder-name-input")
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(name)
    // Submit the form
    const createButton = this.page.getByRole("button", { name: "Create" })
    await createButton.click()
    // Wait for folder to appear in list
    await this.expectFolderInList(name)
  }

  /**
   * Assert that a folder with the given name exists in the list.
   */
  async expectFolderInList(name: string): Promise<void> {
    // Use locator chain that's more stable - find by test ID pattern then filter by text
    const folderItem = this.filesContainer.locator('[data-testid^="folder-item-"]').filter({ hasText: name }).first()
    await expect(folderItem).toBeVisible({ timeout: 15000 })
  }

  /**
   * Assert that no folder with the given name exists in the list.
   */
  async expectFolderNotInList(name: string): Promise<void> {
    const folderItem = this.filesContainer.getByText(name, { exact: true })
    await expect(folderItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Click on a folder in the list to navigate into it.
   */
  async openFolderByName(name: string): Promise<void> {
    await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
    const folderItem = this.filesContainer.locator('[data-testid^="folder-item-"]').filter({ hasText: name }).first()
    await expect(folderItem).toBeVisible({ timeout: 10000 })

    for (let attempt = 0; attempt < 3; attempt++) {
      const currentFolderItem = this.filesContainer
        .locator('[data-testid^="folder-item-"]')
        .filter({ hasText: name })
        .first()
      await expect(currentFolderItem).toBeVisible({ timeout: 5000 })
      await currentFolderItem.scrollIntoViewIfNeeded()

      try {
        await currentFolderItem.evaluate(element => {
          element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        })
      } catch {
        await currentFolderItem.click({ force: true })
      }

      const folderSidecarReady = await expect
        .poll(async () => await this.hasFolderSidecarActions(), { timeout: 5000 })
        .toBe(true)
        .then(() => true)
        .catch(() => false)

      if (folderSidecarReady) {
        return
      }

      await this.tryShowSidecarFromToggle()
      await this.page.waitForTimeout(300)
    }

    // Last-resort refresh to recover from occasional stale sidecar state.
    await this.page.reload({ waitUntil: "domcontentloaded" })
    await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
    const refreshedFolderItem = this.filesContainer
      .locator('[data-testid^="folder-item-"]')
      .filter({ hasText: name })
      .first()
    await expect(refreshedFolderItem).toBeVisible({ timeout: 10000 })
    await refreshedFolderItem.click()
    await expect
      .poll(async () => await this.hasFolderSidecarActions(), { timeout: 15000 })
      .toBe(true)
  }

  /**
   * Navigate into a folder (single-click navigates and opens sidecar)
   */
  async navigateIntoFolder(name: string): Promise<void> {
    const folderItem = this.filesContainer.locator('[data-testid^="folder-item-"]').filter({ hasText: name })
    await folderItem.click()
  }

  /**
   * Click the rename action in the folder sidecar.
   */
  async clickFolderRename(): Promise<void> {
    await expect(this.sidecar).toBeVisible({ timeout: 5000 })
    const renameButton = this.sidecar.getByTestId("folder-rename")
    const renameInput = this.sidecar.getByTestId("folder-rename-input")

    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(renameButton).toBeVisible({ timeout: 5000 })
      try {
        await renameButton.evaluate(button => {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        })
      } catch {
        if (attempt === 3) {
          throw new Error("Unable to click folder rename action.")
        }
        await this.page.waitForTimeout(150)
        continue
      }

      const inputVisible = await renameInput
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false)
      if (inputVisible) {
        return
      }
      await this.page.waitForTimeout(150)
    }

    await expect(renameInput).toBeVisible({ timeout: 5000 })
  }

  /**
   * Rename a folder (after clicking rename).
   * Note: After renaming, we're still inside the folder (not at root).
   */
  async renameFolder(newName: string): Promise<void> {
    // Verify we're still on a page with a sidecar (not redirected to workspace selector)
    await expect(this.sidecar).toBeVisible({ timeout: 5000 })

    const input = this.sidecar.getByTestId("folder-rename-input")
    await expect(input).toBeVisible({ timeout: 5000 })
    // Use fill() which is more stable than keyboard.type() - it clears and sets value atomically
    await input.fill(newName)

    // Click Save button using evaluate to bypass any stability issues
    const saveButton = this.sidecar.getByRole("button", { name: "Save" })
    await expect(saveButton).toBeVisible({ timeout: 5000 })
    await saveButton.evaluate(button => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    // Wait for the rename input to disappear (indicates mutation completed and sidecar popped)
    await expect(input).not.toBeVisible({ timeout: 10000 })
  }

  /**
   * Click the move action in the folder sidecar.
   */
  async clickFolderMove(): Promise<void> {
    const moveButton = this.sidecar.getByTestId("folder-move")

    for (let attempt = 0; attempt < 4; attempt++) {
      const moveVisible = await moveButton.isVisible().catch(() => false)
      if (!moveVisible) {
        await this.tryShowSidecarFromToggle()
        if (!(await moveButton.isVisible().catch(() => false))) {
          // Recover from occasional stale sidecar state after folder navigation.
          await this.page.reload({ waitUntil: "domcontentloaded" })
          await this.filesContainer.waitFor({ state: "visible", timeout: 10000 })
        }
      }

      await expect(moveButton).toBeVisible({ timeout: 5000 })
      try {
        await moveButton.evaluate(button => {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        })
        return
      } catch {
        if (attempt === 3) {
          throw new Error("Unable to click folder move action.")
        }
        await this.page.waitForTimeout(150)
      }
    }
  }

  /**
   * Click the manage members action in the folder sidecar.
   */
  async clickFolderManageMembers(): Promise<void> {
    await this.sidecar.getByTestId("folder-manage-members").click()
  }

  /**
   * Click the delete action in the folder sidecar.
   */
  async clickFolderDelete(): Promise<void> {
    await this.sidecar.getByTestId("folder-delete").click()
  }

  /**
   * Confirm folder deletion.
   */
  async confirmFolderDelete(): Promise<void> {
    await this.sidecar.getByTestId("folder-delete-confirm").click()
  }

  /**
   * Click the move action in the file sidecar.
   */
  async clickFileMove(): Promise<void> {
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

  /**
   * Click manage members in the file sidecar.
   */
  async clickFileManageMembers(): Promise<void> {
    await this.sidecar.getByText("Manage members").click()
  }

  /**
   * Click add members in the ACL sidecar.
   */
  async clickAddMembers(): Promise<void> {
    await this.sidecar.getByTestId("acl-add-members").click()
  }

  /**
   * Get the count of folders in the list.
   */
  async getFolderCount(): Promise<number> {
    const items = this.filesContainer.locator('[data-testid^="folder-item-"]')
    return await items.count()
  }
}
