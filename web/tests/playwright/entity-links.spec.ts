import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { TasksPage } from "./pages/tasks-page"
import { PapersPage } from "./pages/papers-page"
import { EntityLinksPage } from "./pages/entity-links-page"
import { makeUser } from "./utils/test-data"

/**
 * Entity Links E2E Tests
 *
 * Tests entity link functionality:
 * - Copy link action in sidecars
 * - Paste entity links renders as chips
 * - Clicking chips navigates to entities
 * - External links render as regular links
 */
test.describe.configure({ mode: "serial" })

test.describe("Entity Links - Copy Link", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()

  /**
   * Helper to set up an authenticated user with a workspace and page objects.
   */
  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)
    const papers = new PapersPage(page)
    const entityLinks = new EntityLinksPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, tasks, papers, entityLinks, credentials: { email, password } }
  }

  test("can copy link from task sidecar", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a project and task
    await tasks.navigateToTasks()
    await tasks.createProject("Test Project")
    await tasks.createTask("Test Task for Copy Link")

    // Open the task sidecar
    await tasks.openTaskSidecar("Test Task for Copy Link")

    // Verify Copy link button is visible and click it
    await entityLinks.expectCopyLinkVisible()
    await entityLinks.clickCopyLink()

    // Verify clipboard contains a valid task URL
    await entityLinks.expectClipboardContainsEntityUrl("tasks")
  })

  test("can copy link from paper sidecar", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a paper
    await papers.navigateToPapers()
    await papers.createPaper("Test Paper for Copy Link")
    await papers.waitForAutosave()

    // The paper sidecar should be visible when editing
    await entityLinks.expectCopyLinkVisible()
    await entityLinks.clickCopyLink()

    // Verify clipboard contains a valid papers URL
    await entityLinks.expectClipboardContainsEntityUrl("papers")
  })
})

test.describe("Entity Links - Paste and Render", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)
    const papers = new PapersPage(page)
    const entityLinks = new EntityLinksPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, tasks, papers, entityLinks, credentials: { email, password } }
  }

  test("pasting entity link into paper editor renders as chip", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a task to link to
    await tasks.navigateToTasks()
    await tasks.createProject("Link Test Project")
    await tasks.createTask("Task to Link To")
    await tasks.openTaskSidecar("Task to Link To")

    // Copy the task link
    await entityLinks.clickCopyLink()

    // Navigate with route-aware helper (tool selector may be hidden in detail views)
    await papers.navigateToPapers()
    await papers.createPaper("Paper with Entity Link")
    await entityLinks.waitForEditorReady()

    // Paste the copied link
    await entityLinks.pasteIntoEditor()

    // Wait for link to be processed and rendered as chip
    await page.waitForTimeout(500)

    // Verify entity link chip is visible
    await entityLinks.expectEntityLinkChipVisible()
  })

  test("pasting external link renders as regular link, not chip", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a paper
    await papers.navigateToPapers()
    await papers.createPaper("Paper with External Link")
    await entityLinks.waitForEditorReady()

    // Write an external URL to clipboard
    await page.evaluate(() => {
      navigator.clipboard.writeText("https://example.com/some-page")
    })

    // Paste the external link
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(500)

    // Verify it's NOT rendered as an entity link chip
    await entityLinks.expectNoEntityLinkChip()

    // Verify a regular link is rendered
    await entityLinks.expectRegularLinkVisible()
    const href = await entityLinks.getFirstLinkHref()
    expect(href).toBe("https://example.com/some-page")
  })

  test("multiple entity links can be pasted and rendered as chips", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create two tasks to link to
    await tasks.navigateToTasks()
    await tasks.createProject("Multi-Link Project")
    await tasks.createTask("First Task")
    await tasks.createTask("Second Task")

    // Copy first task link
    await tasks.openTaskSidecar("First Task")
    await entityLinks.clickCopyLink()

    // Navigate with route-aware helper (tool selector may be hidden in detail views)
    await papers.navigateToPapers()
    await papers.createPaper("Paper with Multiple Links")
    await entityLinks.waitForEditorReady()
    await papers.waitForAutosave()
    const createdPaperId = page.url().match(/\/papers\/([^/?#]+)/)?.[1] ?? ""
    expect(createdPaperId).toBeTruthy()

    // Paste first link
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(300)

    // Type some text between links
    await page.keyboard.type(" and also ")
    await papers.waitForAutosave()

    // Go back and copy second task link
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Multi-Link Project")
    await tasks.openTaskSidecar("Second Task")
    await entityLinks.clickCopyLink()

    // Go back to paper and paste second link
    const workspaceId = page.url().match(/\/w\/([^/?#]+)/)?.[1] ?? ""
    expect(workspaceId).toBeTruthy()
    await page.goto(`/w/${workspaceId}/papers/${createdPaperId}`, { waitUntil: "domcontentloaded" })
    await entityLinks.waitForEditorReady()

    // Navigate to end of content and paste
    await page.keyboard.press("End")
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(300)

    // Verify two entity link chips are visible
    const chipCount = await entityLinks.getEntityLinkChipCount()
    expect(chipCount).toBe(2)
  })
})

test.describe("Entity Links - Navigation", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)
    const papers = new PapersPage(page)
    const entityLinks = new EntityLinksPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, tasks, papers, entityLinks, credentials: { email, password } }
  }

  test("clicking entity link chip opens new window to entity", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a task to link to
    await tasks.navigateToTasks()
    await tasks.createProject("Navigation Test Project")
    await tasks.createTask("Task for Navigation Test")
    await tasks.openTaskSidecar("Task for Navigation Test")

    // Copy the task link
    await entityLinks.clickCopyLink()

    // Navigate with route-aware helper (tool selector may be hidden in detail views)
    await papers.navigateToPapers()
    await papers.createPaper("Paper for Navigation Test")
    await entityLinks.waitForEditorReady()
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(500)

    const windowTabs = page.getByTestId(/^window-tab-/)
    const initialWindowTabIds = await windowTabs.evaluateAll(elements =>
      elements
        .map(element => element.getAttribute("data-testid") ?? "")
        .filter((value): value is string => value.length > 0)
    )

    // Get initial window tab count
    const initialTabCount = await entityLinks.getWindowTabCount()

    // Click the entity link chip
    await entityLinks.clickEntityLinkChip()
    await page.waitForTimeout(500)

    // Verify a new window tab was opened
    const newTabCount = await entityLinks.getWindowTabCount()
    expect(newTabCount).toBe(initialTabCount + 1)

    const nextWindowTabIds = await windowTabs.evaluateAll(elements =>
      elements
        .map(element => element.getAttribute("data-testid") ?? "")
        .filter((value): value is string => value.length > 0)
    )
    const newWindowTabId = nextWindowTabIds.find(testId => !initialWindowTabIds.includes(testId))
    expect(newWindowTabId).toBeTruthy()
    await page.getByTestId(newWindowTabId ?? "").click()

    // Verify the opened window routes to task view
    await entityLinks.expectUrlContains("tasks")
  })

  test("entity link chip shows correct entity title", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    const taskTitle = "Unique Task Title for Chip Display"

    // Create a task with a specific title
    await tasks.navigateToTasks()
    await tasks.createProject("Chip Display Project")
    await tasks.createTask(taskTitle)
    await tasks.openTaskSidecar(taskTitle)

    // Copy the task link
    await entityLinks.clickCopyLink()

    // Navigate with route-aware helper (tool selector may be hidden in detail views)
    await papers.navigateToPapers()
    await papers.createPaper("Paper to Test Chip Display")
    await entityLinks.waitForEditorReady()
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(500)

    // Verify the chip displays the task title
    await entityLinks.expectEntityLinkChipWithTitle(taskTitle)
  })
})

test.describe("Entity Links - Cross-Entity Linking", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)
    const papers = new PapersPage(page)
    const entityLinks = new EntityLinksPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, tasks, papers, entityLinks, credentials: { email, password } }
  }

  test("can link from paper to task and navigate back", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a task
    await tasks.navigateToTasks()
    await tasks.createProject("Cross-Link Project")
    await tasks.createTask("Task to Link From Paper")
    await tasks.openTaskSidecar("Task to Link From Paper")
    await entityLinks.clickCopyLink()

    // Create a paper and paste the task link
    await papers.navigateToPapers()
    await papers.createPaper("Paper Linking to Task")
    await entityLinks.waitForEditorReady()
    await entityLinks.pasteIntoEditor()
    await page.waitForTimeout(500)

    // Verify chip is visible
    await entityLinks.expectEntityLinkChipVisible()

    // Click chip to navigate to task
    await entityLinks.clickEntityLinkChip()
    await page.waitForTimeout(500)

    // Verify we're now viewing the task
    await entityLinks.expectUrlContains("tasks")
  })

  test("can link from task comment to paper", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"])

    const { tasks, papers, entityLinks } = await setupAuthenticatedUserWithWorkspace(page)

    // Create a paper first
    await papers.navigateToPapers()
    await papers.createPaper("Paper to Reference in Task")
    await papers.waitForAutosave()

    // Copy the paper link
    await entityLinks.clickCopyLink()

    // Create a task
    await tasks.navigateToTasks()
    await tasks.createProject("Task with Paper Link")
    await tasks.createTask("Task Referencing Paper")

    // Open task sidecar (which shows task detail with comment composer)
    await tasks.openTaskSidecar("Task Referencing Paper")
    await page.waitForTimeout(300)

    // Find the task comment composer (TipTap editor) and paste
    const commentComposer = page.getByTestId("task-comment-composer")
    const contentEditable = commentComposer.locator('[contenteditable="true"]')
    await contentEditable.click()
    await page.keyboard.press("Meta+v")
    await page.waitForTimeout(500)

    // Verify entity link chip is visible in the comment composer
    const chip = commentComposer.locator('[data-testid="entity-link-chip"]')
    await expect(chip).toBeVisible({ timeout: 5000 })
  })
})
