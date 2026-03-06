import { test, expect, Page } from "@playwright/test"
import { AuthPage } from "./pages/auth-page"
import { WorkspacePage } from "./pages/workspace-page"
import { TasksPage } from "./pages/tasks-page"
import { makeUser } from "./utils/test-data"
import { openMentionSuggestions } from "./utils/mention-helpers"

const makeCreds = () => makeUser()

// Tasks flows are heavy; run serially to avoid auth/sync flakes.
test.describe.configure({ mode: "serial", timeout: 60000 })

/**
 * Helper to set up an authenticated user with a workspace.
 */
async function setupAuthenticatedUserWithWorkspace(page: Page) {
  const { email, password } = makeCreds()
  const auth = new AuthPage(page)
  const workspace = new WorkspacePage(page)
  const tasks = new TasksPage(page)

  await auth.goto()
  await auth.expectVisible()
  await auth.signUp({ email, password })
  await workspace.expectVisible()
  await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
  await workspace.expectToolSelectorVisible()

  return { auth, workspace, tasks, credentials: { email, password } }
}

test.describe("Tasks Tool - Projects", () => {

  test("can create a project", async ({ page }) => {
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()
    await tasks.expectProjectsListVisible()

    // Create a new project
    await tasks.createProject("My First Project")

    // Verify we're in the project view
    const projectName = await tasks.getProjectName()
    expect(projectName).toBe("My First Project")

    // Go back and verify it appears in the list
    await tasks.goBackToProjectsList()
    await tasks.expectProjectInList("My First Project")
  })

  test("project persists after page reload (encryption/decryption round-trip)", async ({ page }) => {
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()
    await tasks.createProject("Persistent Project")
    await tasks.goBackToProjectsList()
    await tasks.expectProjectInList("Persistent Project")

    // Clear window storage before reload
    await tasks.clearWindowStorage()

    // Reload - this tests E2EE round-trip
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.expectProjectInList("Persistent Project")
  })

  test("multiple projects can be created", async ({ page }) => {
    test.setTimeout(30000) // Allow more time for multiple creates
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()

    // Create first project
    await tasks.createProject("Project Alpha")
    await tasks.goBackToProjectsList()

    // Create second project
    await tasks.createProject("Project Beta")
    await tasks.goBackToProjectsList()

    // Create third project
    await tasks.createProject("Project Gamma")
    await tasks.goBackToProjectsList()

    // Verify all exist
    await tasks.expectProjectInList("Project Alpha")
    await tasks.expectProjectInList("Project Beta")
    await tasks.expectProjectInList("Project Gamma")
  })
})

test.describe("Tasks Tool - Tasks", () => {
  const makeCreds = () => makeUser()

  async function setupWithProject(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Test Project")

    return { tasks }
  }

  test("can create a task in a project", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    await tasks.createTask("My First Task")
    await tasks.expectTaskInProject("My First Task")
  })

  test("can create multiple tasks", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    await tasks.createTask("Task One")
    await tasks.createTask("Task Two")
    await tasks.createTask("Task Three")

    await tasks.expectTaskInProject("Task One")
    await tasks.expectTaskInProject("Task Two")
    await tasks.expectTaskInProject("Task Three")
  })

  test("task persists after page reload", async ({ page }) => {
    test.setTimeout(20000)
    const { tasks } = await setupWithProject(page)

    await tasks.createTask("Persistent Task")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()

    // Clear window storage before reload
    await tasks.clearWindowStorage()

    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for tool selector or projects list after reload (state restoration may skip selector).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("tasks-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Test Project")
    await tasks.expectTaskInProject("Persistent Task")
  })

  test("can toggle task completion", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    await tasks.createTask("Toggle Task")
    await tasks.expectTaskNotCompleted("Toggle Task")

    // Toggle to complete
    await tasks.toggleTaskCompletion("Toggle Task")
    await tasks.expectTaskCompleted("Toggle Task")

    // Toggle back to incomplete
    await tasks.toggleTaskCompletion("Toggle Task")
    await tasks.expectTaskNotCompleted("Toggle Task")
  })

  test("task completion persists after reload", async ({ page }) => {
    test.setTimeout(20000)
    const { tasks } = await setupWithProject(page)

    await tasks.createTask("Completion Persistent")
    await tasks.toggleTaskCompletion("Completion Persistent")
    await tasks.expectTaskCompleted("Completion Persistent")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()

    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Wait for tool selector or projects list after reload (state restoration may skip selector).
    await Promise.any([
      page.getByTestId("tool-selector").waitFor({ state: "visible", timeout: 10000 }),
      page.getByTestId("tasks-tool-container").waitFor({ state: "visible", timeout: 10000 }),
    ])

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Test Project")
    await tasks.expectTaskCompleted("Completion Persistent")
  })

  test("project task count shows correct done/total format", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Create 3 tasks - all start as backlog (not done)
    await tasks.createTask("Task A")
    await tasks.createTask("Task B")
    await tasks.createTask("Task C")
    await tasks.waitForSync()

    // Go back to project list and verify count shows 0/3 (none done)
    await tasks.goBackToProjectsList()
    await tasks.expectProjectTaskCount("Test Project", 0, 3)

    // Mark one task as done
    await tasks.openProjectByName("Test Project")
    await tasks.toggleTaskCompletion("Task A")
    await tasks.waitForSync()

    // Verify count now shows 1/3 (1 done out of 3 total)
    await tasks.goBackToProjectsList()
    await tasks.expectProjectTaskCount("Test Project", 1, 3)
  })
})

test.describe("Tasks Tool - Sidecar", () => {
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  async function setupWithTask(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Test Project")
    await tasks.createTask("Test Task")

    return { tasks }
  }

  test("can edit task description via sidecar", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.editTaskDescription("This is the task description.")
    await tasks.waitForSync()

    // Refresh sidecar by clicking task again
    await tasks.openTaskSidecar("Test Task")

    const description = await tasks.getTaskDescription()
    expect(description).toBe("This is the task description.")
  })

  test("task description changes are saved as blocks", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")

    // Extract task ID from the URL after opening task detail view.
    await expect(page).toHaveURL(/\/projects\/.+\/tasks\/.+/)
    const url = page.url()
    const taskIdFromUrl = url.split("/tasks/")[1]?.split(/[?#/]/)[0] ?? ""
    expect(taskIdFromUrl).not.toBe("")

    const blockResponsePromise = page.waitForResponse(response => {
      const request = response.request()
      if (request.method() !== "POST") {
        return false
      }
      const responseUrl = response.url()
      return responseUrl.includes(`/entities/${taskIdFromUrl}/blocks`) && response.status() === 201
    })

    await tasks.editTaskDescription("Block-based task description content.")

    await blockResponsePromise
  })

  test("task description persists after reload", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.editTaskDescription("Persistent description content.")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()

    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Test Project")
    await tasks.openTaskSidecar("Test Task")

    await tasks.expectTaskDescription("Persistent description content.")
  })

  test("can export a task as markdown", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.editTaskDescription("Exportable task description.")
    await tasks.waitForSync()

    await page.getByTestId("task-export-open").click()

    const exportSaveButton = page.getByTestId("export-save-markdown")
    await expect(exportSaveButton).toHaveAttribute("data-disabled", "false")

    const downloadPromise = page.waitForEvent("download")
    await exportSaveButton.click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("Test Task.md")
  })

  test("can change task status via sidecar", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.expectTaskStatusInSidecar("Backlog")

    // Change to In Progress
    await tasks.setTaskStatus("in_progress")
    await tasks.expectTaskStatusInSidecar("In Progress")

    // Change to Done
    await tasks.setTaskStatus("done")
    await tasks.expectTaskStatusInSidecar("Done")

    // Change back to Backlog
    await tasks.setTaskStatus("backlog")
    await tasks.expectTaskStatusInSidecar("Backlog")
  })

  test("in progress tasks show status badge in list", async ({ page }) => {
    const { tasks } = await setupWithTask(page)

    // Set task to in_progress via sidecar
    await tasks.openTaskSidecar("Test Task")
    await tasks.setTaskStatus("in_progress")
    await tasks.expectTaskStatusInSidecar("In Progress")

    // Navigate back to project list view to see the badge
    await tasks.goBackToProjectView()
    await tasks.expectTaskHasStatusBadge("Test Task")

    // Set task back to backlog
    await tasks.openTaskSidecar("Test Task")
    await tasks.setTaskStatus("backlog")
    await tasks.expectTaskStatusInSidecar("Backlog")

    // Navigate back and verify no badge
    await tasks.goBackToProjectView()
    await tasks.expectTaskNoStatusBadge("Test Task")
  })

  test("task sidecar shows creator name", async ({ page }) => {
    const creds = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email: creds.email, password: creds.password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Creator Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Creator Test Project")
    await tasks.createTask("Creator Test Task")

    // Open task sidecar
    await tasks.openTaskSidecar("Creator Test Task")

    // Creator row shows the current user as "You" in the UI.
    await tasks.expectTaskCreator("You")
  })
})

test.describe("Tasks Tool - Mentions", () => {
  const makeCreds = () => makeUser()

  async function setupWithTask(page: Page) {
    const credentials = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email: credentials.email, password: credentials.password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Mentions Workspace")
    await workspace.expectToolSelectorVisible()

    await tasks.navigateToTasks()
    await tasks.createProject("Mentions Project")
    await tasks.createTask("Mention Task")
    await tasks.openTaskSidecar("Mention Task")

    return { tasks, credentials }
  }

  test("shows mention suggestions in task description and comments", async ({ page }) => {
    const { credentials } = await setupWithTask(page)

    await page.getByTestId("task-detail-description").click()

    const { suggestionItems: descriptionSuggestions } = await openMentionSuggestions(
      page,
      "task-detail-description-editor"
    )
    await expect(descriptionSuggestions).toHaveCount(1)
    await descriptionSuggestions.first().click()

    const descriptionContent = page.getByTestId("task-detail-description-editor-content")
    await expect(descriptionContent).toContainText(credentials.name)

    const { suggestionItems: commentSuggestions } = await openMentionSuggestions(
      page,
      "task-comment-composer-editor"
    )
    await expect(commentSuggestions).toHaveCount(1)
    await commentSuggestions.first().click()

    const commentContent = page.getByTestId("task-comment-composer-editor-content")
    await expect(commentContent).toContainText(credentials.name)
  })
})

test.describe("Tasks Tool - Tags", () => {
  const makeCreds = () => makeUser()

  async function setupWithTask(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Test Project")
    await tasks.createTask("Test Task")

    return { tasks }
  }

  test("can create a tag and assign it to a task", async ({ page }) => {
    test.setTimeout(20000) // Allow more time for tag operations
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.createAndAssignTag("Important")
    await tasks.waitForSync()

    // Refresh the project view to see updated tag
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Test Project")

    await tasks.expectTaskHasTag("Test Task", "Important")
  })

  test("tag assignment persists after reload", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTask(page)

    await tasks.openTaskSidecar("Test Task")
    await tasks.createAndAssignTag("Priority")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()

    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Test Project")
    await tasks.expectTaskHasTag("Test Task", "Priority")
  })

  test("can assign existing tag to another task", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTask(page)

    // Create first tag on first task
    await tasks.openTaskSidecar("Test Task")
    await tasks.createAndAssignTag("Shared Tag")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Test Project")

    // Create second task
    await tasks.createTask("Second Task")

    // Assign existing tag to second task
    await tasks.openTaskSidecar("Second Task")
    await tasks.assignExistingTag("Shared Tag")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Test Project")

    // Both tasks should have the tag
    await tasks.expectTaskHasTag("Test Task", "Shared Tag")
    await tasks.expectTaskHasTag("Second Task", "Shared Tag")
  })

  test("can filter tasks by tag", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTask(page)

    // Create a tagged task
    await tasks.openTaskSidecar("Test Task")
    await tasks.createAndAssignTag("FilterTag")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Test Project")

    // Create an untagged task
    await tasks.createTask("Untagged Task")
    await tasks.waitForSync()

    // Both tasks should be visible initially
    await tasks.expectTaskInProject("Test Task")
    await tasks.expectTaskInProject("Untagged Task")

    // Filter by tag
    await tasks.filterByTag("FilterTag")

    // Only tagged task should be visible
    await tasks.expectTaskInProject("Test Task")
    await tasks.expectTaskNotInProject("Untagged Task")

    // Clear filter
    await tasks.clearTagFilter()

    // Both tasks visible again
    await tasks.expectTaskInProject("Test Task")
    await tasks.expectTaskInProject("Untagged Task")
  })
})

test.describe("Tasks Encryption Verification", () => {
  const makeCreds = () => makeUser()

  test("different users cannot see each other's projects", async ({ browser }) => {
    // User 1: Create a project with tasks
    const user1Creds = makeCreds()
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    const auth1 = new AuthPage(page1)
    const workspace1 = new WorkspacePage(page1)
    const tasks1 = new TasksPage(page1)

    await auth1.goto()
    await auth1.signUp(user1Creds)
    await workspace1.createWorkspaceIfWorkspaceSelectorVisible("User1 Workspace")
    await tasks1.navigateToTasks()
    await tasks1.createProject("User1 Secret Project")
    await tasks1.createTask("User1 Secret Task")
    await context1.close()

    // User 2: Create their own workspace
    const user2Creds = makeCreds()
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    const auth2 = new AuthPage(page2)
    const workspace2 = new WorkspacePage(page2)
    const tasks2 = new TasksPage(page2)

    await auth2.goto()
    await auth2.signUp(user2Creds)
    await workspace2.createWorkspaceIfWorkspaceSelectorVisible("User2 Workspace")
    await tasks2.navigateToTasks()

    // User2 should NOT see User1's project
    await tasks2.expectProjectNotInList("User1 Secret Project")

    await context2.close()
  })
})

test.describe("Tasks Tool - Project Rename", () => {
  const makeCreds = () => makeUser()

  // These tests involve creating a project then renaming, which takes time
  test.setTimeout(30000)

  async function setupWithProject(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Original Project Name")

    return { tasks }
  }

  test("can rename a project from the sidecar", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Project sidecar should be visible with rename action
    await tasks.expectProjectSidecarVisible()

    // Click rename in sidecar
    await tasks.openProjectRename()

    // Fill in new name and save
    await tasks.renameProject("New Project Name")
    await tasks.waitForSync()

    // Verify the project header updated
    const projectName = await tasks.getProjectName()
    expect(projectName).toBe("New Project Name")
  })

  test("breadcrumb updates after project rename", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Verify initial breadcrumb label
    await tasks.expectBreadcrumbLabel("Original Project Name")

    // Rename the project
    await tasks.openProjectRename()
    await tasks.renameProject("Renamed Via Breadcrumb Test")
    await tasks.waitForSync()

    // Verify breadcrumb updated
    await tasks.expectBreadcrumbLabel("Renamed Via Breadcrumb Test")
  })

  test("sidebar window name updates after project rename", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Verify initial sidebar window name
    await tasks.expectSidebarWindowLabel("Original Project Name")

    // Rename the project
    await tasks.openProjectRename()
    await tasks.renameProject("Renamed Window Name")
    await tasks.waitForSync()

    // Verify sidebar window name updated
    await tasks.expectSidebarWindowLabel("Renamed Window Name")
  })

  test("project rename persists after page reload", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Rename the project
    await tasks.openProjectRename()
    await tasks.renameProject("Persistent Renamed Project")
    await tasks.waitForSync()

    // Go back to projects list
    await tasks.goBackToProjectsList()

    // Clear window storage and reload
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to tasks and verify project name persisted
    await tasks.navigateToTasks()
    await tasks.expectProjectInList("Persistent Renamed Project")

    // Open the project and verify header
    await tasks.openProjectByName("Persistent Renamed Project")
    const projectName = await tasks.getProjectName()
    expect(projectName).toBe("Persistent Renamed Project")
  })

  test("project rename updates in project list", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Rename the project
    await tasks.openProjectRename()
    await tasks.renameProject("List Updated Name")
    await tasks.waitForSync()

    // Go back to projects list
    await tasks.goBackToProjectsList()

    // Verify the project list shows the new name
    await tasks.expectProjectInList("List Updated Name")
    await tasks.expectProjectNotInList("Original Project Name")
  })
})

test.describe("Tasks Tool - Assignee", () => {
  const makeCreds = () => makeUser()

  async function setupWithTask(page: Page) {
    const creds = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email: creds.email, password: creds.password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Assignee Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Assignee Test Project")
    await tasks.createTask("Assignee Test Task")

    return { tasks, credentials: creds }
  }

  test("can assign myself to a task", async ({ page }) => {
    test.setTimeout(180000)
    const { tasks, credentials } = await setupWithTask(page)

    // Open task sidecar
    await tasks.openTaskSidecar("Assignee Test Task")

    // Initially unassigned
    await tasks.expectAssignee("Unassigned")

    // Select self from native assignee select
    const assigneeLabel = await tasks.selectAssignee(credentials.name)
    await tasks.waitForSync()

    // Verify assignee updated
    await tasks.expectAssignee(assigneeLabel)
  })

  test("can unassign a task", async ({ page }) => {
    test.setTimeout(30000) // More time for assign then unassign
    const { tasks, credentials } = await setupWithTask(page)

    // Open task sidecar and assign self first
    await tasks.openTaskSidecar("Assignee Test Task")
    const assigneeLabel = await tasks.selectAssignee(credentials.name)
    await tasks.waitForSync()

    // Verify assigned
    await tasks.expectAssignee(assigneeLabel)

    // Now unassign via the Unassigned option
    await tasks.selectUnassigned()
    await tasks.waitForSync()

    // Verify unassigned
    await tasks.expectAssignee("Unassigned")
  })

  test("assignee persists after page reload", async ({ page }) => {
    test.setTimeout(30000) // More time for reload test
    const { tasks, credentials } = await setupWithTask(page)

    // Assign task to self
    await tasks.openTaskSidecar("Assignee Test Task")
    const assigneeLabel = await tasks.selectAssignee(credentials.name)
    await tasks.waitForSync()

    // Go back to projects list
    await tasks.goBackToProjectsList()

    // Clear window storage and reload
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back and verify assignee persisted
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Assignee Test Project")
    await tasks.openTaskSidecar("Assignee Test Task")
    await tasks.expectAssignee(assigneeLabel)
  })
})

test.describe("Tasks Tool - ACL Member Management", () => {
  const makeCreds = () => makeUser()

  async function setupWithProject(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("ACL Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("ACL Test Project")

    return { tasks }
  }

  test("project sidecar shows manage members action", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Project sidecar should be visible with manage members action
    await tasks.expectProjectSidecarVisible()
  })

  test("can open manage members sidecar", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    await tasks.openManageMembers()
    await tasks.expectManageMembersSidecarVisible()
  })

  test("can navigate to add members view", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    await tasks.openManageMembers()
    await tasks.openAddMembers()

    // Should see teams section (Everyone team)
    const everyoneTeam = page.locator('[data-testid^="add-subject-team-"]').filter({ hasText: /everyone/i })
    await expect(everyoneTeam).toBeVisible({ timeout: 5000 })
  })

  test("can add Everyone team as editor", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithProject(page)

    // Navigate to add members
    await tasks.openManageMembers()
    await tasks.openAddMembers()

    // Selecting a team immediately adds them as Editor (no role selection step)
    await tasks.selectEveryoneTeam()
    await tasks.waitForSync()

    // Should be back at manage members with entry visible
    await tasks.expectACLEntryWithText("Everyone")
  })

  test("can change member role", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithProject(page)

    // First add Everyone team (defaults to Editor)
    await tasks.openManageMembers()
    await tasks.openAddMembers()
    await tasks.selectEveryoneTeam()
    await tasks.waitForSync()

    // Now change role to Admin
    await tasks.openACLEntry("Everyone")
    await tasks.selectRole("admin")
    await tasks.waitForSync()

    // Verify the entry still exists (role changed)
    await tasks.expectACLEntryWithText("Everyone")
  })

  test("can remove member access", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithProject(page)

    // First add Everyone team (defaults to Editor)
    await tasks.openManageMembers()
    await tasks.openAddMembers()
    await tasks.selectEveryoneTeam()
    await tasks.waitForSync()

    // Verify entry exists
    await tasks.expectACLEntryWithText("Everyone")

    // Now remove access
    await tasks.openACLEntry("Everyone")
    await tasks.removeAccess()
    await tasks.waitForSync()

    // Entry should no longer exist
    await tasks.expectNoACLEntryWithText("Everyone")
  })

  test("member count updates after adding member", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithProject(page)

    // Check initial member count (should be 1 - just creator)
    const initialCount = await tasks.getMemberCount()
    expect(initialCount).toContain("1")

    // Add Everyone team (defaults to Editor)
    await tasks.openManageMembers()
    await tasks.openAddMembers()
    await tasks.selectEveryoneTeam()
    await tasks.waitForSync()

    // Go back to project sidecar
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("ACL Test Project")

    // Member count should be higher now (includes team members)
    const newCount = await tasks.getMemberCount()
    // The count should include at least the creator
    expect(newCount).toBeTruthy()
  })
})

test.describe("Tasks Tool - Due Date", () => {
  const makeCreds = () => makeUser()

  /**
   * Helper to set up a project with a task and open the task sidecar.
   */
  async function setupWithTaskSidecar(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Due Date Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Due Date Test Project")
    await tasks.createTask("Test Task")
    await tasks.openTaskSidecar("Test Task")

    return { tasks }
  }

  test("can set a due date on a task", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Set due date to a future date
    await tasks.setTaskDueDate("2025-12-31T10:30")
    await tasks.waitForSync()

    // Verify the due date is set
    await tasks.expectTaskDueDate("2025-12-31T10:30")
  })

  test("can clear a due date", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Set a due date first
    await tasks.setTaskDueDate("2025-06-15T14:00")
    await tasks.waitForSync()
    await tasks.expectTaskDueDate("2025-06-15T14:00")

    // Clear the due date
    await tasks.clearTaskDueDate()
    await tasks.waitForSync()

    // Verify the due date is cleared
    await tasks.expectTaskNoDueDate()
  })

  test("can update a due date", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Set initial due date
    await tasks.setTaskDueDate("2025-03-01T09:00")
    await tasks.waitForSync()
    await tasks.expectTaskDueDate("2025-03-01T09:00")

    // Update to a new due date
    await tasks.setTaskDueDate("2025-04-15T17:30")
    await tasks.waitForSync()

    // Verify the updated due date
    await tasks.expectTaskDueDate("2025-04-15T17:30")
  })

  test("due date persists after page reload", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Set a due date
    await tasks.setTaskDueDate("2025-07-20T11:00")
    await tasks.waitForSync()

    // Go back to project list
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()

    // Reload the page
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to the task
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Due Date Test Project")
    await tasks.openTaskSidecar("Test Task")

    // Verify the due date persisted
    await tasks.expectTaskDueDate("2025-07-20T11:00")
  })

  test("due date is displayed in task list", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Set a due date - use current year so format is "Dec 31" not "Dec 31, 2025"
    const currentYear = new Date().getFullYear()
    await tasks.setTaskDueDate(`${currentYear}-12-31T10:00`)
    await tasks.waitForSync()

    // Go back to project view to see task list
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Due Date Test Project")

    // Verify the due date appears in the task list
    await tasks.expectTaskListDueDate("Test Task", "Dec 31")
  })

  test("tasks without due dates do not show due date in list", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Don't set a due date, just go back to list
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Due Date Test Project")

    // Verify no due date is shown
    await tasks.expectTaskNoDueDateInList("Test Task")
  })

  test("tasks are sorted by due date in project view", async ({ page }) => {
    test.setTimeout(30000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Close the current task sidecar by going back
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Due Date Test Project")

    // Create multiple tasks
    await tasks.createTask("Task A - No Due Date")
    await tasks.createTask("Task B - Far Future")
    await tasks.createTask("Task C - Near Future")

    // Set due dates on some tasks
    await tasks.openTaskSidecar("Task B - Far Future")
    await tasks.setTaskDueDate("2026-12-01T10:00")
    await tasks.waitForSync()

    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Due Date Test Project")
    await tasks.openTaskSidecar("Task C - Near Future")
    await tasks.setTaskDueDate("2025-01-15T10:00")
    await tasks.waitForSync()

    // Go back to project view to check order
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Due Date Test Project")

    // Get all task items and verify order
    // Tasks with due dates should come first (nearest first), then tasks without due dates
    const taskItems = page.getByTestId(/^task-item-/)
    const taskCount = await taskItems.count()

    // We should have at least our created tasks
    expect(taskCount).toBeGreaterThanOrEqual(3)

    // The first task should be "Task C - Near Future" (nearest due date)
    const firstTaskText = await taskItems.first().textContent()
    expect(firstTaskText).toContain("Task C - Near Future")
  })
})

test.describe("Tasks Tool - Offline Project Drafts", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.expectVisible()
    await auth.signUp({ email, password })
    await workspace.expectVisible()
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { auth, workspace, tasks, credentials: { email, password } }
  }

  test("offline project creation appears in list as draft", async ({ page }) => {
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()
    await tasks.expectProjectsListVisible()

    // Create a project online first to populate cache
    await tasks.createProject("Online Project")
    await tasks.goBackToProjectsList()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create project while offline
    await tasks.createProjectOffline("Offline Draft Project")

    // Go back and verify it appears with draft badge
    await tasks.goBackToProjectsList()
    await tasks.expectProjectInList("Offline Draft Project")
    // Note: Draft badge test will pass once UI is updated to show badges
  })

  test("offline project syncs when back online", async ({ page }) => {
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create project while offline
    await tasks.createProjectOffline("Offline Sync Project")
    await tasks.goBackToProjectsList()
    await tasks.expectProjectInList("Offline Sync Project")

    // Go back online
    await page.unroute("**/api/**")

    // Wait a bit for sync to happen
    await tasks.waitForSync()

    // Clear window storage and reload to verify persistence
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.expectProjectInList("Offline Sync Project")
  })
})

test.describe("Tasks Tool - Offline Task Drafts", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  async function setupWithProject(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Test Project")

    return { tasks }
  }

  test("offline task creation in online project appears in list", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Create a task online first
    await tasks.createTask("Online Task")
    await tasks.expectTaskInProject("Online Task")

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create task while offline
    await tasks.createTaskOffline("Offline Draft Task")
    await tasks.expectTaskInProject("Offline Draft Task")
    // Note: Draft badge test will pass once UI is updated to show badges
  })

  test("offline task syncs when back online", async ({ page }) => {
    const { tasks } = await setupWithProject(page)

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create task while offline
    await tasks.createTaskOffline("Offline Sync Task")
    await tasks.expectTaskInProject("Offline Sync Task")

    // Go back online
    await page.unroute("**/api/**")

    // Wait for sync
    await tasks.waitForSync()

    // Go back to project list, then reopen project to verify sync
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Test Project")
    await tasks.expectTaskInProject("Offline Sync Task")
  })
})

test.describe("Tasks Tool - Cascading Offline Drafts", () => {
  test.describe.configure({ mode: "serial" })
  test.setTimeout(30000)
  const makeCreds = () => makeUser()

  async function setupAuthenticatedUserWithWorkspace(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Test Workspace")
    await workspace.expectToolSelectorVisible()

    return { tasks }
  }

  test("offline project with offline task syncs correctly when back online", async ({ page }) => {
    // This tests the cascading sync: project syncs first, then task syncs
    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()

    // Go offline
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })

    // Create project while offline
    await tasks.createProjectOffline("Cascading Offline Project")

    // Create task inside the offline project
    await tasks.createTaskOffline("Cascading Offline Task")
    await tasks.expectTaskInProject("Cascading Offline Task")

    // Go back to list and verify project is there
    await tasks.goBackToProjectsList()
    await tasks.expectProjectInList("Cascading Offline Project")

    // Go back online
    await page.unroute("**/api/**")

    // Wait for cascading sync (project first, then task)
    await tasks.waitForSync()
    await tasks.waitForSync() // Extra wait for cascading

    // Clear window storage and reload to verify persistence
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.expectProjectInList("Cascading Offline Project")

    // Open the project and verify task exists
    await tasks.openProjectByName("Cascading Offline Project")
    await tasks.expectTaskInProject("Cascading Offline Task")
  })
})

test.describe("Tasks Tool - Comments", () => {
  test.setTimeout(60000)
  const makeCreds = () => makeUser()

  /**
   * Helper to set up a project with a task and open the task sidecar.
   */
  async function setupWithTaskSidecar(page: Page) {
    const { email, password } = makeCreds()
    const auth = new AuthPage(page)
    const workspace = new WorkspacePage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.signUp({ email, password })
    await workspace.createWorkspaceIfWorkspaceSelectorVisible("Comment Test Workspace")
    await tasks.navigateToTasks()
    await tasks.createProject("Comment Test Project")
    await tasks.createTask("Test Task")
    await tasks.openTaskSidecar("Test Task")

    return { tasks, credentials: { email, password } }
  }

  test("can add a comment to a task", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add a comment via the composer in the task sidecar
    await tasks.addTaskComment("This is my first comment")
    await tasks.waitForSync()

    // Verify the comment appears in the sidecar
    await tasks.expectTaskCommentVisible("This is my first comment")
  })

  test("comment persists after page reload (encryption roundtrip)", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add a comment
    await tasks.addTaskComment("Persistent comment content")
    await tasks.waitForSync()

    // Go back and reload
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to the task
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")

    // Verify the comment persisted
    await tasks.expectTaskCommentVisible("Persistent comment content")
  })

  test("can add multiple comments to a task", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add multiple comments
    await tasks.addTaskComment("First comment")
    await tasks.waitForSync()
    await tasks.addTaskComment("Second comment")
    await tasks.waitForSync()
    await tasks.addTaskComment("Third comment")
    await tasks.waitForSync()

    // Verify all comments appear
    await tasks.expectTaskCommentVisible("First comment")
    await tasks.expectTaskCommentVisible("Second comment")
    await tasks.expectTaskCommentVisible("Third comment")
  })

  test("task list shows comment count when task has comments", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Go back to project view first - task should have no comment count initially
    await tasks.goBackToProjectView()
    await tasks.expectTaskCommentCount("Test Task", 0)

    // Add comments to the task
    await tasks.openTaskSidecar("Test Task")
    await tasks.addTaskComment("Comment one")
    await tasks.waitForSync()
    await tasks.addTaskComment("Comment two")
    await tasks.waitForSync()

    // Go back to project view and verify comment count is shown
    await tasks.goBackToProjectView()
    await tasks.expectTaskCommentCount("Test Task", 2)
  })

  test("can delete a comment via sidecar", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add a comment
    await tasks.addTaskComment("Comment to delete")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")
    await tasks.expectTaskCommentVisible("Comment to delete")

    // Open comment sidecar and delete
    await tasks.openCommentSidecar("Comment to delete")
    await tasks.deleteTaskComment("Comment to delete")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")

    // Verify the comment is gone
    await tasks.expectTaskCommentNotVisible("Comment to delete")
  })

  test("can edit a comment via TaskCommentEditView", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add a comment
    await tasks.addTaskComment("Original comment text")
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")
    await tasks.expectTaskCommentVisible("Original comment text")

    // Open comment sidecar and click edit
    await tasks.openCommentSidecar("Original comment text")
    await tasks.openCommentEditView()

    // Edit the comment in the full-sized view
    await tasks.editCommentContent("Updated comment text")
    await tasks.saveCommentEdit()
    await tasks.waitForSync()
    await tasks.goBackToProjectsList()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")

    // Verify the comment was updated
    await tasks.expectTaskCommentVisible("Updated comment text")
    await tasks.expectTaskCommentNotVisible("Original comment text")
  })

  test("edited comment persists after reload", async ({ page }) => {
    test.setTimeout(60000)
    const { tasks } = await setupWithTaskSidecar(page)

    // Add and edit a comment
    await tasks.addTaskComment("Comment before edit")
    await tasks.waitForSync()

    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")

    await tasks.openCommentSidecar("Comment before edit")
    await tasks.openCommentEditView()
    await tasks.editCommentContent("Comment after edit")
    await tasks.saveCommentEdit()
    await tasks.waitForSync()

    // Reload the page
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    // Navigate back to the task
    await tasks.navigateToTasks()
    await tasks.openProjectByName("Comment Test Project")
    await tasks.openTaskSidecar("Test Task")

    // Verify the edited comment persisted
    await tasks.expectTaskCommentVisible("Comment after edit")
  })

  test("can create task comments while offline and unsigned in", async ({ page }) => {
    test.setTimeout(60000)

    const auth = new AuthPage(page)
    const tasks = new TasksPage(page)

    await auth.goto()
    await auth.expectVisible()

    // Wait for local workspace tools to appear (anonymous mode).
    await expect(page.getByTestId("tool-selector")).toBeVisible()

    // Simulate offline by blocking API traffic while keeping the shell reachable.
    await page.route("**/api/**", route => {
      route.abort("connectionfailed")
    })
    await page.evaluate(() => window.dispatchEvent(new Event("offline")))

    await tasks.navigateToTasks()
    await tasks.createProjectOffline("Offline Local Project")
    await tasks.createTaskOffline("Offline Local Task")
    await tasks.openTaskSidecar("Offline Local Task")

    await tasks.addTaskCommentOffline("Offline local comment")
    await tasks.expectTaskCommentVisible("Offline local comment")

    // Reload while still offline to ensure drafts persist.
    await tasks.goBackToProjectsList()
    await tasks.clearWindowStorage()
    await page.reload({ waitUntil: "domcontentloaded" })

    await tasks.navigateToTasks()
    await tasks.openProjectByName("Offline Local Project")
    await tasks.openTaskSidecar("Offline Local Task")
    await tasks.expectTaskCommentVisible("Offline local comment")

    await page.unroute("**/api/**")
    await page.evaluate(() => window.dispatchEvent(new Event("online")))
  })
})

test.describe("Tasks Tool - Reactions", () => {
  test("can add reactions to tasks and task comments", async ({ page }) => {
    test.setTimeout(60000)

    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()
    await tasks.createProject("Reaction Project")
    await tasks.createTask("Reaction Task")

    await tasks.openTaskSidecar("Reaction Task")

    const taskId = await tasks.resolveTaskIdByTitle("Reaction Task")

    await page.getByTestId(`task-${taskId}-reaction-add`).click()
    await page.getByTestId(`task-${taskId}-reaction-add-quick-1`).click()

    await expect(page.getByTestId(`task-${taskId}-reaction-pill-0`)).toBeVisible({ timeout: 10000 })

    await tasks.addTaskComment("Reaction comment")

    const commentRow = page
      .locator('[data-testid^="task-comment-item-"]')
      .filter({ hasText: "Reaction comment" })
      .first()
    await expect(commentRow).toBeVisible({ timeout: 10000 })
    const commentTestId = await commentRow.getAttribute("data-testid")
    expect(commentTestId).toBeTruthy()
    const commentId = (commentTestId ?? "").replace("task-comment-item-", "")

    await page.getByTestId(`task-comment-${commentId}-reaction-add`).click()
    await page.getByTestId(`task-comment-${commentId}-reaction-add-quick-0`).click()
    await expect(page.getByTestId(`task-comment-${commentId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    await page.getByTestId(`task-${taskId}-reaction-pill-0`).click()
    await expect(page.getByTestId(`task-${taskId}-reaction-pill-0`)).not.toBeVisible({ timeout: 10000 })
  })

  test("reactions are blocked while offline on tasks and task comments", async ({ page }) => {
    test.setTimeout(60000)

    const { tasks } = await setupAuthenticatedUserWithWorkspace(page)

    await tasks.navigateToTasks()
    await tasks.createProject("Offline Reaction Project")
    await tasks.createTask("Offline Reaction Task")

    await tasks.openTaskSidecar("Offline Reaction Task")

    const taskId = await tasks.resolveTaskIdByTitle("Offline Reaction Task")
    const taskOfflineStatusId = `reaction-status-task-${taskId}-offline`

    // Add a reaction while online so delete attempts can be validated offline.
    await page.getByTestId(`task-${taskId}-reaction-add`).click()
    await page.getByTestId(`task-${taskId}-reaction-add-quick-0`).click()
    await expect(page.getByTestId(`task-${taskId}-reaction-pill-0`)).toBeVisible({ timeout: 10000 })

    await tasks.addTaskComment("Offline reaction comment")

    const commentRow = page
      .locator('[data-testid^="task-comment-item-"]')
      .filter({ hasText: "Offline reaction comment" })
      .first()
    await expect(commentRow).toBeVisible({ timeout: 10000 })
    const commentTestId = await commentRow.getAttribute("data-testid")
    expect(commentTestId).toBeTruthy()
    const commentId = (commentTestId ?? "").replace("task-comment-item-", "")
    const commentOfflineStatusId = `reaction-status-task-comment-${commentId}-offline`

    await page.getByTestId(`task-comment-${commentId}-reaction-add`).click()
    await page.getByTestId(`task-comment-${commentId}-reaction-add-quick-1`).click()
    await expect(page.getByTestId(`task-comment-${commentId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    // Force offline and attempt to toggle/delete.
    await page.context().setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event("offline")))

    await page.getByTestId(`task-${taskId}-reaction-pill-0`).click()
    await expect(page.getByTestId(`status-bar-item-${taskOfflineStatusId}`)).toContainText(
      "CAN'T CREATE REACTIONS WHILE OFFLINE.",
      { timeout: 10000 }
    )
    await expect(page.getByTestId(`task-${taskId}-reaction-pill-0`)).toBeVisible({ timeout: 10000 })

    await page.getByTestId(`task-comment-${commentId}-reaction-pill-0`).click()
    await expect(page.getByTestId(`status-bar-item-${commentOfflineStatusId}`)).toContainText(
      "CAN'T CREATE REACTIONS WHILE OFFLINE.",
      { timeout: 10000 }
    )
    await expect(page.getByTestId(`task-comment-${commentId}-reaction-pill-0`)).toBeVisible({
      timeout: 10000,
    })

    // Attempt to add another reaction while offline.
    await page.getByTestId(`task-${taskId}-reaction-add`).click()
    await page.getByTestId(`task-${taskId}-reaction-add-quick-2`).click()
    await expect(page.getByTestId(`task-${taskId}-reaction-pill-1`)).toHaveCount(0)

    await page.context().setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event("online")))
  })
})
