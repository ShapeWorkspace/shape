import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for workspace selection functionality.
 * Used when a user is authenticated but hasn't selected a workspace.
 */
export class WorkspacePage {
  private readonly page: Page
  private readonly container: Locator
  private readonly createWorkspaceOption: Locator
  private readonly workspaceNameInput: Locator
  private readonly createButton: Locator
  private readonly toolSelector: Locator
  private readonly workspaceSwitcherButton: Locator
  private readonly sidebarCreateWorkspaceButton: Locator

  constructor(page: Page) {
    this.page = page
    this.container = page.getByTestId("workspace-selector")
    this.createWorkspaceOption = page.getByTestId("create-workspace-option")
    this.workspaceNameInput = page.getByTestId("workspace-name-input")
    this.createButton = page.getByTestId("create-workspace-button")
    this.toolSelector = page.getByTestId("tool-selector")
    this.workspaceSwitcherButton = page.getByTestId("sidebar-workspace-switcher")
    this.sidebarCreateWorkspaceButton = page.getByTestId("sidebar-workspace-create-button")
  }

  private hasWorkspaceRoute(): boolean {
    return /\/w\/[^/]+/.test(this.page.url())
  }

  /**
   * Ensure we're inside an actual workspace route (/w/{workspaceId}), not only
   * looking at a tool-selector-like UI shell.
   */
  private async ensureWorkspaceRoute(name: string, options?: { timeout?: number }): Promise<void> {
    if (this.hasWorkspaceRoute()) {
      return
    }

    const timeout = options?.timeout ?? 20000
    await this.page.goto("/workspaces", { waitUntil: "domcontentloaded" })
    await this.container.waitFor({ state: "visible", timeout })

    const namedWorkspaceRow = this.getWorkspaceRowByName(name).first()
    const namedWorkspaceVisible = await namedWorkspaceRow.isVisible().catch(() => false)
    if (namedWorkspaceVisible) {
      await namedWorkspaceRow.click({ force: true })
      await this.toolSelector.waitFor({ state: "visible", timeout })
      return
    }

    const firstWorkspaceRow = this.page.getByTestId(/workspace-row-/).first()
    const firstWorkspaceVisible = await firstWorkspaceRow.isVisible().catch(() => false)
    if (firstWorkspaceVisible) {
      await firstWorkspaceRow.click({ force: true })
      await this.toolSelector.waitFor({ state: "visible", timeout })
      return
    }

    await this.createWorkspace(name)
  }

  /**
   * Resolve workspace selector rows by visible name while still anchoring on test IDs.
   */
  private getWorkspaceRowByName(name: string): Locator {
    return this.page.getByTestId(/workspace-row-/).filter({ hasText: name })
  }

  /**
   * Resolve sidebar workspace switcher items by visible name while still anchoring on test IDs.
   */
  private getWorkspaceSwitcherItemByName(name: string): Locator {
    return this.page.getByTestId(/sidebar-workspace-item-/).filter({ hasText: name })
  }

  /**
   * Click the first workspace row with retries to handle list re-renders.
   */
  private async clickFirstWorkspaceRowWithRetry(options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 15000
    for (let attempt = 0; attempt < 3; attempt++) {
      const workspaceRow = this.page.getByTestId(/workspace-row-/).first()
      await workspaceRow.waitFor({ state: "visible", timeout })

      try {
        await workspaceRow.click({ force: true })
        return
      } catch (error) {
        if (attempt === 2) {
          throw error
        }
      }
    }
  }

  /**
   * Assert that the workspace selector is visible (authenticated but no workspace selected)
   * After signup, the user is redirected to /workspaces. Wait for either the workspace selector
   * or the tool selector (if a workspace was auto-selected) to become visible.
   */
  async expectVisible(): Promise<void> {
    await expect(this.container.or(this.toolSelector)).toBeVisible({ timeout: 20000 })
  }

  /**
   * Assert that the tool selector is visible (workspace is selected).
   * Handles the case where WorkspaceGuard might redirect back to /workspaces
   * if the workspace store hasn't loaded yet. Keeps retrying until stable.
   */
  async expectToolSelectorVisible(options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 30000

    // Wait until either the workspace selector or tool selector appears.
    await expect(this.container.or(this.toolSelector)).toBeVisible({ timeout })

    // If the tool selector is already visible, we're done.
    const toolSelectorVisible = await this.toolSelector.isVisible().catch(() => false)
    if (toolSelectorVisible) {
      return
    }

    // Workspace selector path: click a workspace row to enter the workspace.
    const workspaceSelectorVisible = await this.container.isVisible().catch(() => false)
    const isWorkspaceSelectorRoute = this.page.url().includes("/workspaces")
    if (workspaceSelectorVisible && isWorkspaceSelectorRoute) {
      await this.clickFirstWorkspaceRowWithRetry({ timeout: 15000 })
    }

    // Navigate home if a tool stack is still open, then assert visibility.
    await this.ensureToolSelectorVisible({ timeout })
  }

  /**
   * Navigate back to the tool selector using the breadcrumb home button.
   * Avoids full page reloads to keep in-memory caches intact.
   */
  async navigateHomeViaBreadcrumb(options?: { timeout?: number }): Promise<void> {
    if (await this.toolSelector.isVisible().catch(() => false)) {
      return
    }

    const homeButton = this.page.getByTestId("breadcrumb-back-button")
    if (!(await homeButton.isVisible().catch(() => false))) {
      return
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      await homeButton.click()
      try {
        await this.toolSelector.waitFor({ state: "visible", timeout: 2000 })
        return
      } catch {
        await this.page.waitForTimeout(200)
      }
    }

    await this.toolSelector.waitFor({ state: "visible", timeout: options?.timeout ?? 15000 })
  }

  /**
   * Ensure the tool selector is visible by navigating back if needed.
   * Some flows open a tool immediately after workspace creation, hiding the selector.
   */
  async ensureToolSelectorVisible(options?: { timeout?: number }): Promise<void> {
    if (await this.toolSelector.isVisible().catch(() => false)) {
      return
    }

    const workspaceSelectorVisible = await this.container.isVisible().catch(() => false)
    const isWorkspaceSelectorRoute = this.page.url().includes("/workspaces")
    if (workspaceSelectorVisible && isWorkspaceSelectorRoute) {
      const workspaceRowVisible = await this.page
        .getByTestId(/workspace-row-/)
        .first()
        .waitFor({ state: "visible", timeout: options?.timeout ?? 15000 })
        .then(() => true)
        .catch(() => false)

      if (!workspaceRowVisible) {
        throw new Error("Workspace selector is visible but no workspace rows are available.")
      }

      await this.clickFirstWorkspaceRowWithRetry({ timeout: options?.timeout ?? 15000 })
      const toolSelectorVisible = await this.toolSelector
        .waitFor({ state: "visible", timeout: options?.timeout ?? 20000 })
        .then(() => true)
        .catch(() => false)

      if (toolSelectorVisible) {
        return
      }
    }

    const homeButton = this.page.getByTestId("breadcrumb-back-button")
    if (await homeButton.isVisible().catch(() => false)) {
      // Prefer in-app breadcrumb navigation to avoid forcing a full page reload.
      // Some tool stacks require multiple back clicks to reach the tool selector.
      for (let attempt = 0; attempt < 4; attempt++) {
        await homeButton.click()
        try {
          await this.toolSelector.waitFor({ state: "visible", timeout: 2000 })
          return
        } catch {
          await this.page.waitForTimeout(200)
        }
      }
    } else {
      const currentUrl = this.page.url()
      const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
      if (workspaceMatch) {
        // Settings pages skip breadcrumbs; navigate directly to the workspace root.
        await this.page.goto(`/w/${workspaceMatch[1]}`, { waitUntil: "domcontentloaded" })
      }
    }

    try {
      await this.toolSelector.waitFor({ state: "visible", timeout: options?.timeout ?? 15000 })
    } catch {
      // Reset window state so the tool selector isn't skipped on reload.
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

      const currentUrl = this.page.url()
      const workspaceMatch = currentUrl.match(/\/w\/([^/]+)/)
      const targetUrl = workspaceMatch ? `/w/${workspaceMatch[1]}` : "/"
      await this.page.goto(targetUrl, { waitUntil: "domcontentloaded" })
      await this.toolSelector.waitFor({ state: "visible", timeout: options?.timeout ?? 15000 })
    }
  }

  /**
   * Create a new workspace with the given name
   */
  async createWorkspace(name: string): Promise<void> {
    const workspaceSelectorIsVisible = await this.container
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false)

    const submitWorkspaceName = async () => {
      const workspaceCreateRequestPromise = this.page.waitForRequest(
        request => {
          const url = request.url()
          const isPost = request.method() === "POST"
          const normalizedUrl = url.split("?")[0]
          const isWorkspaceCreate = /\/workspaces\/?$/.test(normalizedUrl)
          return isPost && isWorkspaceCreate
        },
        { timeout: 10000 }
      )

      await this.workspaceNameInput.waitFor({ state: "visible", timeout: 10000 })
      await this.workspaceNameInput.fill(name)

      const createButtonIsVisible = await this.createButton.isVisible().catch(() => false)
      if (createButtonIsVisible) {
        await this.createButton.click({ force: true })
      } else {
        await this.workspaceNameInput.press("Enter")
      }

      const createRequest = await workspaceCreateRequestPromise.catch(() => null)
      if (!createRequest) {
        throw new Error("Workspace creation request was not sent.")
      }

      const requestHeaders = createRequest.headers()
      if (!requestHeaders["x-active-account-id"]) {
        throw new Error("Workspace creation request missing X-Active-Account-ID header.")
      }
      const requestBody = createRequest.postData() ?? ""
      if (!requestBody) {
        throw new Error("Workspace creation request body was empty.")
      }

      const createResponse = await this.page
        .waitForResponse(response => response.request() === createRequest, { timeout: 20000 })
        .catch(() => null)
      if (!createResponse) {
        throw new Error(
          `Workspace creation response was not received for ${createRequest.url()} (active account ${requestHeaders["x-active-account-id"]}).`
        )
      }
      if (!createResponse.ok()) {
        const responseText = await createResponse.text().catch(() => "")
        throw new Error(
          `Workspace creation failed: ${createResponse.status()} ${responseText || createResponse.statusText()}`
        )
      }

      // Wait for the modal to close so its overlay doesn't block subsequent clicks.
      const modalClosed = await this.workspaceNameInput
        .waitFor({ state: "hidden", timeout: 5000 })
        .then(() => true)
        .catch(() => false)

      if (!modalClosed) {
        // Force-close the modal overlay to unblock UI interactions.
        await this.page.mouse.click(5, 5)
        await this.workspaceNameInput.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {})
      }
    }

    const openCreateModalFromSelector = async (): Promise<boolean> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.createWorkspaceOption.waitFor({ state: "visible", timeout: 10000 })
          await this.createWorkspaceOption.click({ force: true })
          const inputVisible = await this.workspaceNameInput
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false)
          if (inputVisible) {
            return true
          }
        } catch (error) {
          if (attempt === 2) {
            throw error
          }
        }

        await this.page.waitForTimeout(200)
      }

      return false
    }

    const openCreateModalFromSidebar = async (): Promise<boolean> => {
      const selectorVisible = await this.container.isVisible().catch(() => false)
      if (selectorVisible) {
        return false
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.ensureToolSelectorVisible({ timeout: 20000 })
          await this.workspaceSwitcherButton.waitFor({ state: "visible", timeout: 20000 })
          await this.workspaceSwitcherButton.click()
          await this.sidebarCreateWorkspaceButton.waitFor({ state: "visible", timeout: 20000 })
          await this.sidebarCreateWorkspaceButton.click({ force: true })
          const inputVisible = await this.workspaceNameInput
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false)
          if (inputVisible) {
            return true
          }
        } catch (error) {
          if (attempt === 2) {
            throw error
          }
        }

        await this.page.waitForTimeout(200)
      }

      return false
    }

    const waitForWorkspaceSelection = async () => {
      const workspaceRow = this.getWorkspaceRowByName(name)
      const switcherItem = this.getWorkspaceSwitcherItemByName(name)

      // Wait until we can see either the workspace selector or the sidebar switcher.
      await expect(this.container.or(this.workspaceSwitcherButton)).toBeVisible({ timeout: 40000 })

      const workspaceSelectorIsVisible = await this.container.isVisible().catch(() => false)
      if (workspaceSelectorIsVisible) {
        await workspaceRow.first().waitFor({ state: "visible", timeout: 40000 })
        await workspaceRow.first().click({ force: true })
        await this.ensureToolSelectorVisible({ timeout: 20000 })
        return
      }

      await this.workspaceSwitcherButton.waitFor({ state: "visible", timeout: 40000 })
      await this.workspaceSwitcherButton.click()
      await switcherItem.first().waitFor({ state: "visible", timeout: 40000 })
      await switcherItem.first().click({ force: true })
      await this.ensureToolSelectorVisible({ timeout: 20000 })
    }

    if (workspaceSelectorIsVisible) {
      // Workspace selector flow: create from the selector list modal.
      await this.container.waitFor({ state: "visible", timeout: 20000 })
      const modalOpened = await openCreateModalFromSelector()
      if (!modalOpened) {
        throw new Error("Create workspace modal did not open from the selector")
      }
      await submitWorkspaceName()
      await waitForWorkspaceSelection()
      return
    }

    // Prefer the workspace selector for additional workspace creation because it
    // avoids UI state from the currently selected workspace (SSE, sync, etc.).
    await this.page.goto("/workspaces", { waitUntil: "domcontentloaded" })
    const selectorVisibleAfterNavigation = await this.container
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false)

    if (selectorVisibleAfterNavigation) {
      const fallbackModalOpened = await openCreateModalFromSelector()
      if (!fallbackModalOpened) {
        throw new Error("Create workspace modal did not open from the workspace selector")
      }
      await submitWorkspaceName()
      await waitForWorkspaceSelection()
      return
    }

    // Sidebar flow: ensure tools are reachable, then create from the switcher menu.
    const sidebarModalOpened = await openCreateModalFromSidebar()
    if (sidebarModalOpened) {
      await submitWorkspaceName()
      await waitForWorkspaceSelection()
      return
    }

    throw new Error("Create workspace modal did not open from the sidebar switcher")
  }

  /**
   * Create a workspace only when the workspace selector is visible (new user flow).
   * If the app already auto-selected a workspace, we simply ensure tools are reachable.
   */
  async createWorkspaceIfWorkspaceSelectorVisible(name: string): Promise<void> {
    // Wait for either the workspace selector or tool selector to become visible.
    // After signup, user is redirected to /workspaces, so we need to wait for that load.
    await expect(this.container.or(this.toolSelector)).toBeVisible({ timeout: 20000 })

    const workspaceSelectorIsVisible = await this.container.isVisible().catch(() => false)
    if (workspaceSelectorIsVisible) {
      // If the app auto-selects a workspace, avoid racing the selector UI.
      const toolSelectorBecameVisible = await this.toolSelector
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false)
      if (toolSelectorBecameVisible) {
        const selectorStillVisible = await this.container.isVisible().catch(() => false)
        if (!selectorStillVisible) {
          await this.ensureWorkspaceRoute(name, { timeout: 20000 })
          return
        }
      }

      // Prefer selecting an existing workspace row to match current UI behavior.
      await this.container.waitFor({ state: "visible", timeout: 15000 })
      const desiredWorkspaceRow = this.getWorkspaceRowByName(name)
      const desiredWorkspaceRowIsVisible = await desiredWorkspaceRow.first().isVisible().catch(() => false)
      if (desiredWorkspaceRowIsVisible) {
        await desiredWorkspaceRow.first().click()
        // Wait for navigation to complete - clicking a workspace row navigates to /w/{uuid}
        // which should show the tool selector once the workspace is loaded.
        await this.ensureToolSelectorVisible({ timeout: 20000 })
        await this.ensureWorkspaceRoute(name, { timeout: 20000 })
        return
      }

      // If the named workspace doesn't exist yet, create it explicitly.
      try {
        await this.createWorkspace(name)
        await this.ensureWorkspaceRoute(name, { timeout: 20000 })
        return
      } catch (error) {
        // If we navigated into tools during creation, accept that as success.
        const toolSelectorVisibleAfterFailure = await this.toolSelector.isVisible().catch(() => false)
        const workspaceSwitcherVisibleAfterFailure = await this.workspaceSwitcherButton.isVisible().catch(() => false)
        if (toolSelectorVisibleAfterFailure || workspaceSwitcherVisibleAfterFailure) {
          await this.ensureWorkspaceRoute(name, { timeout: 20000 })
          return
        }
        throw error
      }
    }

    // If we're outside the workspace selector flow, ensure the tool selector is visible.
    // The workspace switcher being visible isn't enough - we need the actual tool selector.
    await this.ensureToolSelectorVisible({ timeout: 20000 })
    await this.ensureWorkspaceRoute(name, { timeout: 20000 })
  }

  /**
   * Select an existing workspace by name
   */
  async selectWorkspace(name: string): Promise<void> {
    const workspaceRow = this.getWorkspaceRowByName(name)
    const selectorVisible = await this.container.isVisible().catch(() => false)
    if (selectorVisible) {
      const namedWorkspaceVisible = await workspaceRow.first().isVisible().catch(() => false)
      if (namedWorkspaceVisible) {
        await workspaceRow.first().click()
      } else {
        const allWorkspaceRows = this.page.getByTestId(/workspace-row-/)
        const workspaceCount = await allWorkspaceRows.count()
        if (workspaceCount === 1) {
          await allWorkspaceRows.first().click()
        } else {
          throw new Error(`Workspace "${name}" not found in selector (rows=${workspaceCount}).`)
        }
      }
      await this.toolSelector.waitFor({ state: "visible", timeout: 20000 })
      return
    }

    // When already inside a workspace, select via the sidebar switcher.
    await this.workspaceSwitcherButton.click()
    const switcherItem = this.getWorkspaceSwitcherItemByName(name)
    await switcherItem.first().click()
    await this.toolSelector.waitFor({ state: "visible", timeout: 20000 })
  }

  /**
   * Assert that a specific tool is visible in the tool selector
   */
  async expectToolVisible(toolName: string): Promise<void> {
    // Tools are rendered as clickable divs with the tool name as text content
    const toolRow = this.page.getByText(toolName, { exact: true })
    await expect(toolRow).toBeVisible({ timeout: 5000 })
  }

  /**
   * Wait for workspace to be registered with the server.
   * This ensures features requiring server sync (like file uploads) will work.
   * Waits for the "local-only mode" warning to disappear from the Files tool.
   */
  async waitForWorkspaceRegistration(): Promise<void> {
    // Navigate to files to check for registration status
    await this.page.getByTestId("tool-files").click()
    await this.page.getByTestId("files-tool-container").waitFor({ state: "visible", timeout: 10000 })

    // If workspace is not registered, the "Upload file" button is disabled
    // Wait for it to become enabled
    const uploadButton = this.page.getByTestId("add-file-button")
    await expect(uploadButton).toBeEnabled({ timeout: 30000 })

    // Also wait for the file input to be enabled (ensures React state has propagated)
    const fileInput = this.page.getByTestId("file-input")
    await expect(fileInput).toBeEnabled({ timeout: 5000 })

    // Navigate back to tool selector
    await this.navigateHomeViaBreadcrumb()
  }
}
