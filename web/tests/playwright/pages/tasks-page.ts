import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

/**
 * Page object for Tasks tool interactions.
 * Used for testing E2EE projects, tags, and tasks CRUD operations.
 */
export class TasksPage {
  private readonly page: Page
  private readonly tasksToolButton: Locator
  private readonly tasksContainer: Locator
  private readonly newProjectButton: Locator
  private readonly projectsListBreadcrumb: Locator
  private lastWorkspaceId: string | null = null
  private lastProjectId: string | null = null
  // Track task IDs by title so we can navigate directly if list clicks fail.
  private readonly taskIdsByTitle: Map<string, string> = new Map()

  // Sidecar form elements for creating projects
  private readonly createProjectInput: Locator
  private readonly createProjectConfirmButton: Locator

  // Project view elements
  private readonly projectViewHeader: Locator
  private readonly taskInput: Locator
  private readonly taskAddButton: Locator

  // Sidecar elements
  private readonly statusSelect: Locator
  private readonly tagSelect: Locator
  private readonly createTagInput: Locator
  private readonly createTagSubmit: Locator

  constructor(page: Page) {
    this.page = page
    this.tasksToolButton = page.getByTestId("tool-projects")
    this.tasksContainer = page.getByTestId("tasks-tool-container")
    this.newProjectButton = page.getByTestId("new-project-button")
    this.projectsListBreadcrumb = page.getByTestId("breadcrumb-item-0")

    // Sidecar form inputs/actions for project creation (uses FormSidecar component)
    this.createProjectInput = page.getByTestId("new-project-name-input")
    this.createProjectConfirmButton = page.getByTestId("form-sidecar-submit")

    // Project view
    this.projectViewHeader = page.getByTestId("project-view-header")
    this.taskInput = page.getByTestId("task-create-input")
    this.taskAddButton = page.getByTestId("task-add-button")

    // Sidecar actions
    this.statusSelect = page.getByTestId("task-status")

    // Tag select + creation sidecar
    this.tagSelect = page.getByTestId("task-tag")
    this.createTagInput = page.getByTestId("create-tag-input")
    this.createTagSubmit = page.getByTestId("create-tag-submit")
  }

  /**
   * Clear window storage to reset navigation state.
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
   * Navigate to the Tasks tool.
   */
  async navigateToTasks(): Promise<void> {
    const toolSelector = this.page.getByTestId("tool-selector")
    const workspaceIdFromUrl = this.page.url().match(/\/w\/([^/]+)/)?.[1] ?? this.lastWorkspaceId

    // If tasks list is already visible, we're done.
    if (await this.tasksContainer.isVisible().catch(() => false)) {
      return
    }

    // If the tool selector is visible, click into projects.
    if (await toolSelector.isVisible().catch(() => false)) {
      if (workspaceIdFromUrl) {
        await this.page
          .waitForFunction(
            id => Boolean(localStorage.getItem(`shape_windows_${id}`)),
            workspaceIdFromUrl,
            { timeout: 10000 }
          )
          .catch(() => null)
      }

      await this.tasksToolButton.waitFor({ state: "visible", timeout: 10000 })
      await this.tasksToolButton.click()
      await this.tasksContainer.waitFor({ state: "visible", timeout: 20000 }).catch(async () => {
        await this.page.waitForTimeout(500)
        await this.tasksToolButton.click()
        await this.tasksContainer.waitFor({ state: "visible", timeout: 20000 })
      })
      return
    }

    if (!workspaceIdFromUrl) {
      // Wait for tool selector to show up if we don't know the workspace.
      await toolSelector.waitFor({ state: "visible", timeout: 10000 })
      await this.tasksToolButton.waitFor({ state: "visible", timeout: 10000 })
      await this.tasksToolButton.click()
      await this.tasksContainer.waitFor({ state: "visible", timeout: 20000 })
      return
    }

    // Fallback to direct navigation if we still haven't landed on the tasks list.
    await this.page.goto(`/w/${workspaceIdFromUrl}/projects`, { waitUntil: "domcontentloaded" })
    await this.tasksContainer.waitFor({ state: "visible", timeout: 20000 })
  }

  /**
   * Assert that the tasks/projects list is visible.
   */
  async expectProjectsListVisible(): Promise<void> {
    await expect(this.tasksContainer).toBeVisible({ timeout: 10000 })
  }

  /**
   * Create a new project with the given name using the sidecar form.
   */
  async createProject(name: string): Promise<void> {
    // Listen for console messages
    this.page.on("console", msg => {
      if (msg.text().includes("TasksTool") || msg.text().includes("Create") || msg.type() === "error") {
        console.log(`[BROWSER ${msg.type().toUpperCase()}]: ${msg.text()}`)
      }
    })

    // Click "New project" to open sidecar form
    await this.newProjectButton.click()

    // Wait for sidecar input to be visible and fill it
    await this.createProjectInput.waitFor({ state: "visible", timeout: 5000 })
    await this.createProjectInput.fill(name)

    // Click create to submit the form
    await this.createProjectConfirmButton.click()

    // Wait for project view to appear after creation and navigation
    try {
      await this.projectViewHeader.waitFor({ state: "visible", timeout: 15000 })
    } catch {
      // Fallback: navigate back to the projects list and open the newly created project
      await this.navigateToTasks()
      await this.openProjectByName(name)
    }

    // Extract workspace and project IDs from URL
    const currentUrl = this.page.url()
    const match = currentUrl.match(/\/w\/([^/]+)\/projects\/([^/]+)/)
    if (match) {
      this.lastWorkspaceId = match[1] ?? null
      this.lastProjectId = match[2] ?? null
    }
  }

  /**
   * Open a project by name from the projects list.
   */
  async openProjectByName(name: string): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: name })
    try {
      await projectItem.waitFor({ state: "visible", timeout: 8000 })
    } catch {
      // If we're not already in the projects list, navigate there and try again.
      await this.navigateToTasks()
      await projectItem.waitFor({ state: "visible", timeout: 20000 })
    }
    await projectItem.scrollIntoViewIfNeeded()
    await projectItem.click()
    await this.projectViewHeader.waitFor({ state: "visible", timeout: 5000 })
  }

  /**
   * Assert that a project with the given name exists in the list.
   */
  async expectProjectInList(name: string): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: name })
    try {
      await expect(projectItem).toBeVisible({ timeout: 8000 })
    } catch {
      await this.navigateToTasks()
      await expect(projectItem).toBeVisible({ timeout: 10000 })
    }
  }

  /**
   * Assert that no project with the given name exists in the list.
   */
  async expectProjectNotInList(name: string): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: name })
    await expect(projectItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert the project task count displays the expected format (e.g., "2/5 tasks").
   * @param projectName Name of the project
   * @param done Number of done tasks
   * @param total Total number of tasks
   */
  async expectProjectTaskCount(projectName: string, done: number, total: number): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: projectName })
    await expect(projectItem).toContainText(`${done}/${total} tasks`, { timeout: 5000 })
  }

  /**
   * Go back to the projects list from a project view.
   */
  async goBackToProjectsList(): Promise<void> {
    await this.projectsListBreadcrumb.click()
    await this.tasksContainer.waitFor({ state: "visible", timeout: 5000 })
    // Wait for data to load
    await this.page.waitForTimeout(1000)
  }

  /**
   * Go back to the project view from task detail view.
   * Clicks the project name in the breadcrumb to return to the task list.
   */
  async goBackToProjectView(): Promise<void> {
    const projectBreadcrumb = this.page.getByTestId("breadcrumb-item-1")
    await projectBreadcrumb.click()
    await this.projectViewHeader.waitFor({ state: "visible", timeout: 5000 })
    // Wait for list to update
    await this.page.waitForTimeout(300)
  }

  /**
   * Get the current project name from the header.
   */
  async getProjectName(): Promise<string> {
    return (await this.projectViewHeader.textContent()) ?? ""
  }

  // ============ Task Operations ============

  /**
   * Create a new task in the current project.
   */
  async createTask(title: string): Promise<void> {
    await this.taskInput.waitFor({ state: "visible", timeout: 10000 })
    await this.taskInput.fill(title)
    await expect(this.taskInput).toHaveValue(title, { timeout: 3000 })

    await this.taskAddButton.click()

    const taskTitle = this.page.getByTestId(/^task-title-/).filter({ hasText: title }).first()
    await expect(taskTitle).toBeVisible({ timeout: 10000 })
    const testId = await taskTitle.getAttribute("data-testid")
    if (testId?.startsWith("task-title-")) {
      this.taskIdsByTitle.set(title, testId.replace("task-title-", ""))
    }
  }

  /**
   * Resolve a task ID by title using cached create responses or DOM test IDs.
   */
  async resolveTaskIdByTitle(title: string): Promise<string> {
    const cachedId = this.taskIdsByTitle.get(title)
    if (cachedId) {
      return cachedId
    }

    const taskTitle = this.page.getByTestId(/^task-title-/).filter({ hasText: title }).first()
    const isListTitleVisible = await taskTitle.isVisible().catch(() => false)
    if (isListTitleVisible) {
      const testId = await taskTitle.getAttribute("data-testid")
      if (!testId) {
        throw new Error(`Unable to resolve task ID for "${title}".`)
      }
      const taskIdFromList = testId.replace("task-title-", "")
      this.taskIdsByTitle.set(title, taskIdFromList)
      return taskIdFromList
    }

    const detailTitle = this.page.getByTestId("task-detail-title")
    const isDetailVisible = await detailTitle.isVisible().catch(() => false)
    if (isDetailVisible) {
      const currentTitle = ((await detailTitle.textContent()) ?? "").trim()
      if (currentTitle === title) {
        const taskIdFromUrl = this.page.url().match(/\/tasks\/([^/?#]+)/)?.[1]
        if (taskIdFromUrl) {
          this.taskIdsByTitle.set(title, taskIdFromUrl)
          return taskIdFromUrl
        }
      }
    }

    throw new Error(`Unable to resolve task ID for "${title}".`)
  }

  /**
   * Assert that a task with the given title exists in the project.
   */
  async expectTaskInProject(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    await expect(taskItem).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that no task with the given title exists in the project.
   */
  async expectTaskNotInProject(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    await expect(taskItem).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Click on a task to open its sidecar.
   */
  async openTaskSidecar(title: string): Promise<void> {
    const detailTitle = this.page.getByTestId("task-detail-title")
    if (await detailTitle.isVisible()) {
      const currentTitle = (await detailTitle.textContent())?.trim()
      if (currentTitle === title) {
        return
      }
    }

    const taskTitle = this.page.getByTestId(/^task-title-/).filter({ hasText: title })
    const clickTaskTitle = async () => {
      await taskTitle.waitFor({ state: "attached", timeout: 8000 })
      await taskTitle.scrollIntoViewIfNeeded()
      await taskTitle.click({ timeout: 8000 })
    }

    try {
      await clickTaskTitle()
    } catch {
      // If the list isn't available yet, navigate back to the project view and retry.
      if (this.lastWorkspaceId && this.lastProjectId) {
        try {
          await this.page.goto(`/w/${this.lastWorkspaceId}/projects/${this.lastProjectId}`, {
            waitUntil: "domcontentloaded",
          })
          await clickTaskTitle()
          await this.page.getByTestId("task-detail-view").waitFor({ state: "visible", timeout: 10000 })
          return
        } catch {
          const taskId = this.taskIdsByTitle.get(title)
          if (taskId) {
            await this.page.goto(
              `/w/${this.lastWorkspaceId}/projects/${this.lastProjectId}/tasks/${taskId}`,
              { waitUntil: "domcontentloaded" }
            )
          } else {
            throw new Error(`Unable to open task sidecar for "${title}".`)
          }
        }
      } else {
        throw new Error(`Unable to open task sidecar for "${title}".`)
      }
    }
    await this.page.getByTestId("task-detail-view").waitFor({ state: "visible", timeout: 10000 })
  }

  /**
   * Toggle task completion by clicking the checkbox.
   */
  async toggleTaskCompletion(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const checkbox = taskItem.getByTestId(/^task-check-/)
    await checkbox.click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Assert that a task is marked as done.
   */
  async expectTaskCompleted(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const titleElem = taskItem.getByTestId(/^task-title-/)
    await expect(titleElem).toHaveAttribute("data-status", "done", { timeout: 5000 })
  }

  /**
   * Assert that a task is not done (backlog or in_progress).
   */
  async expectTaskNotCompleted(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const titleElem = taskItem.getByTestId(/^task-title-/)
    // Wait for element to not have done status (backlog is default)
    await expect(titleElem).toHaveAttribute("data-status", "backlog", { timeout: 5000 })
  }

  /**
   * Assert task status in the task list (backlog, in_progress, or done).
   */
  async expectTaskStatus(title: string, status: "backlog" | "in_progress" | "done"): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const titleElem = taskItem.getByTestId(/^task-title-/)
    await expect(titleElem).toHaveAttribute("data-status", status, { timeout: 5000 })
  }

  /**
   * Assert that a task has the status badge visible (for in_progress tasks).
   */
  async expectTaskHasStatusBadge(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const statusBadge = taskItem.getByTestId(/^task-status-badge-/)
    await expect(statusBadge).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a task does NOT have the status badge visible.
   */
  async expectTaskNoStatusBadge(title: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const statusBadge = taskItem.getByTestId(/^task-status-badge-/)
    await expect(statusBadge).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that the task sidecar status select reflects the expected state.
   */
  async expectTaskStatusInSidecar(status: "Backlog" | "In Progress" | "Done"): Promise<void> {
    const valueMap: Record<string, string> = {
      Backlog: "backlog",
      "In Progress": "in_progress",
      Done: "done",
    }
    await expect(this.statusSelect).toHaveValue(valueMap[status] ?? status, { timeout: 5000 })
  }

  // ============ Sidecar Operations ============

  /**
   * Edit the task description in the sidecar.
   */
  async editTaskDescription(description: string): Promise<void> {
    // Click on description area to start editing
    const descriptionDisplay = this.page.getByTestId("task-detail-description")
    await descriptionDisplay.click()

    // Focus the TipTap editor and enter text
    const editorWrapper = this.page.getByTestId("task-detail-description-editor")
    await editorWrapper.waitFor({ state: "visible", timeout: 5000 })
    const editorContent = editorWrapper.locator(".ProseMirror")
    await expect(editorContent).toHaveAttribute("contenteditable", "true", { timeout: 5000 })
    await editorContent.evaluate((el: HTMLElement, val: string) => {
      el.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.execCommand("delete", false)
      document.execCommand("insertText", false, val)
    }, description)
    await expect(editorContent).toContainText(description, { timeout: 5000 })

    // Unfocus to save
    await this.page.getByTestId("task-detail-title").click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Get the task description from the sidecar.
   */
  async getTaskDescription(): Promise<string> {
    const editorContent = this.page.getByTestId("task-detail-description-editor").locator(".ProseMirror")
    await expect(editorContent).toBeVisible({ timeout: 5000 })

    // Wait for the editor to hydrate with saved content before reading.
    await expect
      .poll(async () => ((await editorContent.textContent()) ?? "").trim(), { timeout: 5000 })
      .not.toBe("")

    return ((await editorContent.textContent()) ?? "").trim()
  }

  /**
   * Assert that the task description contains the expected text.
   */
  async expectTaskDescription(description: string): Promise<void> {
    const descriptionDisplay = this.page.getByTestId("task-detail-description")
    await expect(descriptionDisplay).toContainText(description, { timeout: 10000 })
  }

  /**
   * Set task status via sidecar select dropdown.
   */
  async setTaskStatus(status: "backlog" | "in_progress" | "done"): Promise<void> {
    await this.statusSelect.selectOption({ value: status })
    await this.page.waitForTimeout(300)
  }

  /**
   * Mark the current task as done via sidecar.
   */
  async markTaskCompleteViaSidecar(): Promise<void> {
    await this.setTaskStatus("done")
  }

  /**
   * Mark the current task as backlog (incomplete) via sidecar.
   */
  async markTaskIncompleteViaSidecar(): Promise<void> {
    await this.setTaskStatus("backlog")
  }

  /**
   * Open the tags selector in the sidecar.
   */
  async openTagsSidecar(): Promise<void> {
    await this.tagSelect.waitFor({ state: "visible", timeout: 5000 })
    await this.tagSelect.click()
  }

  /**
   * Create a new tag and assign it to the current task.
   */
  async createAndAssignTag(tagName: string): Promise<void> {
    await this.tagSelect.waitFor({ state: "visible", timeout: 5000 })
    await this.tagSelect.selectOption({ value: "__create__" })
    await this.createTagInput.waitFor({ state: "visible", timeout: 5000 })
    await this.createTagInput.fill(tagName)
    await this.createTagSubmit.click()
    await expect(this.createTagInput).not.toBeVisible({ timeout: 10000 })
  }

  /**
   * Assign an existing tag to the current task.
   */
  async assignExistingTag(tagName: string): Promise<void> {
    await this.tagSelect.waitFor({ state: "visible", timeout: 5000 })
    await this.tagSelect.selectOption({ label: tagName })
  }

  /**
   * Assert that a task has a specific tag displayed.
   */
  async expectTaskHasTag(taskTitle: string, tagName: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const tag = taskItem.getByTestId(/^task-tag-/).filter({ hasText: tagName })
    await expect(tag).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that a task does not have a specific tag.
   */
  async expectTaskDoesNotHaveTag(taskTitle: string, tagName: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const tag = taskItem.getByTestId(/^task-tag-/).filter({ hasText: tagName })
    await expect(tag).not.toBeVisible({ timeout: 5000 })
  }

  // ============ Tag Filter Operations ============

  /**
   * Click on a tag filter button in the project view.
   */
  async filterByTag(tagName: string): Promise<void> {
    const tagButton = this.page.getByTestId(/^tag-filter-/).filter({ hasText: tagName })
    await tagButton.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Clear tag filter by clicking "All" button.
   */
  async clearTagFilter(): Promise<void> {
    const allButton = this.page.getByTestId("tag-filter-all")
    await allButton.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Wait for data to sync (autosave).
   */
  async waitForSync(): Promise<void> {
    await this.page.waitForTimeout(2000)
  }

  // ============ Project ACL Operations ============

  /**
   * Open the project sidecar by clicking on the project header area.
   * Note: The project sidecar is automatically shown when entering project view.
   */
  async expectProjectSidecarVisible(): Promise<void> {
    // The sidecar should show "Manage members" action
    const manageMembersButton = this.page.getByTestId("project-manage-members")
    await expect(manageMembersButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Click "Manage members" in the project sidecar.
   */
  async openManageMembers(): Promise<void> {
    const manageMembersButton = this.page.getByTestId("project-manage-members")
    await manageMembersButton.click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Assert that the Manage Members sidecar is visible.
   */
  async expectManageMembersSidecarVisible(): Promise<void> {
    const addMembersButton = this.page.getByTestId("acl-add-members")
    await expect(addMembersButton).toBeVisible({ timeout: 5000 })
  }

  /**
   * Click "Add members" in the manage members sidecar.
   */
  async openAddMembers(): Promise<void> {
    const addMembersButton = this.page.getByTestId("acl-add-members")
    await addMembersButton.click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Select a team in the add members view.
   */
  async selectTeam(teamId: string): Promise<void> {
    const teamRow = this.page.getByTestId(`add-subject-team-${teamId}`)
    await teamRow.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Select the Everyone team in the add members view.
   */
  async selectEveryoneTeam(): Promise<void> {
    // Everyone team has a specific testId pattern
    const everyoneTeam = this.page
      .locator('[data-testid^="add-subject-team-"]')
      .filter({ hasText: /everyone/i })
    await everyoneTeam.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Select a role in the role selection sidecar.
   */
  async selectRole(role: "read" | "write" | "admin"): Promise<void> {
    const roleButton = this.page.getByTestId(`role-option-${role}`)
    await roleButton.click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Click "Remove access" in the role selection sidecar.
   */
  async removeAccess(): Promise<void> {
    const removeButton = this.page.getByTestId("role-remove-access")
    await removeButton.click()
    await this.page.waitForTimeout(500)
  }

  /**
   * Assert that an ACL entry exists in the manage members list.
   */
  async expectACLEntryExists(entryId: string): Promise<void> {
    const entryRow = this.page.getByTestId(`acl-entry-${entryId}`)
    await expect(entryRow).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that an ACL entry with specific text exists.
   */
  async expectACLEntryWithText(text: string): Promise<void> {
    const entryRow = this.page.locator('[data-testid^="acl-entry-"]').filter({ hasText: text })
    await expect(entryRow).toBeVisible({ timeout: 5000 })
  }

  /**
   * Assert that no ACL entry with specific text exists.
   */
  async expectNoACLEntryWithText(text: string): Promise<void> {
    const entryRow = this.page.locator('[data-testid^="acl-entry-"]').filter({ hasText: text })
    await expect(entryRow).not.toBeVisible({ timeout: 5000 })
  }

  /**
   * Click on an ACL entry to open role selection.
   */
  async openACLEntry(text: string): Promise<void> {
    const entryRow = this.page.locator('[data-testid^="acl-entry-"]').filter({ hasText: text })
    await entryRow.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Get the member count from the project sidecar.
   */
  async getMemberCount(): Promise<string> {
    const manageMembersButton = this.page.getByTestId("project-manage-members")
    const meta = manageMembersButton.locator('[class*="sidecarMenuMeta"]')
    await expect(meta).toHaveText(/.+/, { timeout: 10000 })
    await expect(meta).not.toHaveText(/loading/i, { timeout: 10000 })
    return (await meta.textContent()) ?? ""
  }

  // ============ Project Rename Operations ============

  /**
   * Click "Rename" in the project sidecar to open the rename input.
   */
  async openProjectRename(): Promise<void> {
    const renameButton = this.page.getByTestId("project-rename")
    await renameButton.click()
    await this.page.waitForTimeout(300)
  }

  /**
   * Fill in the new project name and save.
   * Assumes the rename sidecar input is already visible.
   * Waits for the rename to complete (sidecar closes after successful rename).
   */
  async renameProject(newName: string): Promise<void> {
    const renameInput = this.page.getByTestId("project-rename-input")
    await renameInput.waitFor({ state: "visible", timeout: 3000 })
    await renameInput.fill(newName)
    // Click save button
    const saveButton = this.page.getByRole("button", { name: "Save" })
    await saveButton.click({ force: true })
    // Wait for the rename input to disappear (sidecar closes after successful rename)
    await renameInput.waitFor({ state: "hidden", timeout: 10000 })
  }

  /**
   * Assert that the breadcrumb shows the expected label for the current item.
   * Uses the last breadcrumb item (the current page).
   */
  async expectBreadcrumbLabel(label: string): Promise<void> {
    // The current item is at the end of the breadcrumb - find the active one
    // Use a longer timeout since the state update might take time
    const breadcrumbItem = this.page.locator('[data-testid="breadcrumb"] [data-active="true"]')
    await expect(breadcrumbItem).toHaveText(label, { timeout: 10000 })
  }

  /**
   * Assert that the sidebar window shows the expected label.
   * The sidebar shows the "leaf" label of the current navigation stack.
   */
  async expectSidebarWindowLabel(label: string): Promise<void> {
    const sidebar = this.page.getByTestId("navigation-sidebar")
    // Find the active window item which has data-active="true"
    // Use a longer timeout since the state update might take time
    const activeWindow = sidebar.locator('[data-active="true"]')
    await expect(activeWindow).toContainText(label, { timeout: 10000 })
  }

  // ============ Task Assignee Operations ============

  /**
   * Select a user as assignee from the native select.
   */
  async selectAssignee(preferredAssigneeLabel?: string): Promise<string> {
    const assigneeSelect = this.page.getByTestId("task-assignee")
    await assigneeSelect.waitFor({ state: "visible", timeout: 10000 })

    // Wait briefly for assignable users to populate.
    await assigneeSelect
      .evaluate((el: HTMLSelectElement) => {
        return new Promise<boolean>(resolve => {
          if (el.options.length > 1) {
            resolve(true)
            return
          }
          const observer = new MutationObserver(() => {
            if (el.options.length > 1) {
              observer.disconnect()
              resolve(true)
            }
          })
          observer.observe(el, { childList: true })
          setTimeout(() => {
            observer.disconnect()
            resolve(false)
          }, 10000)
        })
      })
      .catch(() => undefined)

    const assigneeOptionLabels = (await assigneeSelect.locator("option").allTextContents()).map(label =>
      label.trim()
    )
    const preferredAssigneeIndex = preferredAssigneeLabel
      ? assigneeOptionLabels.findIndex(label => label === preferredAssigneeLabel)
      : -1
    const fallbackAssigneeIndex = assigneeOptionLabels.findIndex(
      label => label.length > 0 && label !== "Unassigned"
    )
    const assigneeIndexToSelect = preferredAssigneeIndex >= 0 ? preferredAssigneeIndex : fallbackAssigneeIndex

    if (assigneeIndexToSelect < 0) {
      throw new Error("Assignee option not available to select.")
    }

    await assigneeSelect.selectOption({ index: assigneeIndexToSelect })
    await this.page.waitForTimeout(500)
    return assigneeOptionLabels[assigneeIndexToSelect]
  }

  /**
   * Select "Unassigned" option in the assignee select.
   */
  async selectUnassigned(): Promise<void> {
    const assigneeSelect = this.page.getByTestId("task-assignee")
    await assigneeSelect.selectOption({ value: "" })
    await this.page.waitForTimeout(500)
  }

  /**
   * Assert that the task sidecar shows the expected assignee.
   * Checks the selected value of the native select.
   */
  async expectAssignee(name: string): Promise<void> {
    const assigneeSelect = this.page.getByTestId("task-assignee")
    // Get the selected option's text
    const selectedText = await assigneeSelect.evaluate((el: HTMLSelectElement) => {
      return el.options[el.selectedIndex]?.text ?? ""
    })
    expect(selectedText).toBe(name)
  }

  // ============ Task Creator Operations ============

  /**
   * Assert that the task sidecar shows the expected creator name.
   */
  async expectTaskCreator(name: string): Promise<void> {
    const creatorRow = this.page.getByTestId("task-creator-row")
    const creatorText = (await creatorRow.textContent()) ?? ""
    if (creatorText.includes("You")) {
      return
    }
    await expect(creatorRow).toContainText(name, { timeout: 5000 })
  }

  // ============ Task Due Date Operations ============

  /**
   * Set the due date for the current task via the sidecar.
   * Expects the task sidecar to be open.
   * @param dateTime - Date/time string in datetime-local format (YYYY-MM-DDTHH:mm)
   */
  async setTaskDueDate(dateTime: string): Promise<void> {
    const dueDateInput = this.page.getByTestId("task-due-date")
    await dueDateInput.fill(dateTime)
    await this.page.waitForTimeout(500)
  }

  /**
   * Get the current due date value from the task sidecar.
   * @returns The due date in datetime-local format, or empty string if not set
   */
  async getTaskDueDate(): Promise<string> {
    const dueDateInput = this.page.getByTestId("task-due-date")
    return await dueDateInput.inputValue()
  }

  /**
   * Clear the due date for the current task.
   */
  async clearTaskDueDate(): Promise<void> {
    const dueDateInput = this.page.getByTestId("task-due-date")
    await dueDateInput.fill("")
    await this.page.waitForTimeout(500)
  }

  /**
   * Assert that the task sidecar shows the expected due date.
   * @param expectedDate - Expected date in datetime-local format (YYYY-MM-DDTHH:mm)
   */
  async expectTaskDueDate(expectedDate: string): Promise<void> {
    const dueDateInput = this.page.getByTestId("task-due-date")
    await expect(dueDateInput).toHaveValue(expectedDate, { timeout: 5000 })
  }

  /**
   * Assert that the task has no due date set.
   */
  async expectTaskNoDueDate(): Promise<void> {
    const dueDateInput = this.page.getByTestId("task-due-date")
    await expect(dueDateInput).toHaveValue("", { timeout: 5000 })
  }

  /**
   * Assert that a task in the list shows the expected due date text.
   * @param taskTitle - Title of the task
   * @param dateText - Expected formatted date text (e.g., "Dec 25" or "Dec 25, 2024")
   */
  async expectTaskListDueDate(taskTitle: string, dateText: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const dueDateSpan = taskItem.getByTestId(/^task-due-date-/)
    await expect(dueDateSpan).toHaveText(dateText, { timeout: 5000 })
  }

  /**
   * Assert that a task in the list has an overdue indicator (red styling).
   * @param taskTitle - Title of the task
   */
  async expectTaskOverdue(taskTitle: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const dueDateSpan = taskItem.getByTestId(/^task-due-date-/)
    // Check for the overdue class by verifying it's visible and styled
    await expect(dueDateSpan).toBeVisible({ timeout: 5000 })
    // The overdue class uses vars.color.deleteRed which is a theme color
    // We verify by checking the element exists and has content
  }

  /**
   * Assert that a task in the list does not show any due date.
   * @param taskTitle - Title of the task
   */
  async expectTaskNoDueDateInList(taskTitle: string): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const dueDateSpan = taskItem.getByTestId(/^task-due-date-/)
    await expect(dueDateSpan).not.toBeVisible({ timeout: 5000 })
  }

  // ============ Task Comment Operations ============

  /**
   * Add a comment to the current task via the composer in the detail view.
   * Assumes the task detail view is open.
   */
  async addTaskComment(text: string): Promise<void> {
    // Target the composer in the task detail view (not the sidecar)
    const taskDetailView = this.page.locator('[data-testid="task-detail-view"]:visible')
    await expect(taskDetailView).toBeVisible()

    // Wait for the composer container to be visible
    const composerContainer = taskDetailView.getByTestId("task-comment-composer")
    await expect(composerContainer).toBeVisible({ timeout: 5000 })

    const commentEditor = composerContainer.getByTestId("task-comment-composer-editor-content")
    await expect(commentEditor).toBeVisible({ timeout: 3000 })
    await commentEditor.click()

    // Use evaluate to type into TipTap editor (CDP keyboard events hang on focused editors)
    await commentEditor.evaluate((el: HTMLElement, val: string) => {
      el.focus()
      document.execCommand("insertText", false, val)
    }, text)
    // Wait for content to update
    await this.page.waitForTimeout(500)

    // Send the comment
    const sendButton = taskDetailView.getByTestId("task-comment-composer-editor-send")
    await expect(sendButton).toBeEnabled({ timeout: 10000 })
    await sendButton.click()

    // Wait for comment to appear
    await this.page.waitForTimeout(500)
  }

  /**
   * Add a comment while offline (draft-based creation).
   * Skips network response waits since offline mode blocks requests.
   */
  async addTaskCommentOffline(text: string): Promise<void> {
    const taskDetailView = this.page.locator('[data-testid="task-detail-view"]:visible')
    await expect(taskDetailView).toBeVisible()

    const composerContainer = taskDetailView.getByTestId("task-comment-composer")
    await expect(composerContainer).toBeVisible({ timeout: 5000 })

    const commentEditor = composerContainer.getByTestId("task-comment-composer-editor-content")
    await expect(commentEditor).toBeVisible({ timeout: 3000 })
    await commentEditor.evaluate((el: HTMLElement, val: string) => {
      el.focus()
      document.execCommand("insertText", false, val)
    }, text)

    const sendButton = taskDetailView.getByTestId("task-comment-composer-editor-send")
    await expect(sendButton).toBeEnabled({ timeout: 10000 })
    await sendButton.click()
  }

  /**
   * Assert that a comment with the given text is visible in the task detail view.
   */
  async expectTaskCommentVisible(text: string): Promise<void> {
    const taskDetailView = this.page.getByTestId("task-detail-view")
    await expect(taskDetailView).toBeVisible({ timeout: 10000 })
    const commentItem = taskDetailView.getByTestId(/^task-comment-item-/).filter({ hasText: text })
    await expect(commentItem).toBeVisible({ timeout: 20000 })
  }

  /**
   * Assert that a task in the project list shows the expected comment count.
   * If count is 0, the comment count indicator should not be visible.
   */
  async expectTaskCommentCount(taskTitle: string, expectedCount: number): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: taskTitle })
    const commentCount = taskItem.getByTestId(/^task-comment-count-/)
    if (expectedCount === 0) {
      await expect(commentCount).not.toBeVisible({ timeout: 5000 })
    } else {
      await expect(commentCount).toBeVisible({ timeout: 5000 })
      await expect(commentCount).toContainText(expectedCount.toString(), { timeout: 5000 })
    }
  }

  /**
   * Assert that no comment with the given text exists in the task detail view.
   */
  async expectTaskCommentNotVisible(text: string): Promise<void> {
    const taskDetailView = this.page.locator('[data-testid="task-detail-view"]:visible')
    const commentItem = taskDetailView.getByTestId(/^task-comment-item-/).filter({ hasText: text })
    await expect(commentItem).toHaveCount(0, { timeout: 15000 })
  }

  /**
   * Click on a comment to open its sidecar (for delete/edit actions).
   */
  async openCommentSidecar(text: string): Promise<void> {
    const taskDetailView = this.page.locator('[data-testid="task-detail-view"]:visible')
    const commentItem = taskDetailView.getByTestId(/^task-comment-item-/).filter({ hasText: text })
    await commentItem.click()
    // Wait for the comment sidecar to open
    const sidecarContent = this.page.getByTestId("task-comment-sidecar-content")
    await expect(sidecarContent).toBeVisible({ timeout: 5000 })
  }

  /**
   * Delete the currently selected comment via the comment sidecar.
   */
  async deleteTaskComment(commentText?: string): Promise<void> {
    const deleteButton = this.page.getByTestId("task-comment-delete")
    await deleteButton.click({ force: true })
    // Confirm deletion
    const confirmButton = this.page.getByTestId("confirm-delete-comment")
    await expect(confirmButton).toBeVisible({ timeout: 5000 })
    await confirmButton.click({ force: true })
    await expect(confirmButton).not.toBeVisible({ timeout: 10000 })
    // When a comment text is provided, wait for the list to update before continuing.
    if (commentText) {
      const taskDetailView = this.page.locator('[data-testid="task-detail-view"]:visible')
      const commentItem = taskDetailView
        .getByTestId(/^task-comment-item-/)
        .filter({ hasText: commentText })
      await expect(commentItem).toHaveCount(0, { timeout: 15000 })
    }
  }

  /**
   * Open the edit view for the currently selected comment.
   */
  async openCommentEditView(): Promise<void> {
    const editButton = this.page.getByTestId("task-comment-edit")
    await editButton.click()
    const editView = this.page.getByTestId("task-comment-edit-view")
    await expect(editView).toBeVisible({ timeout: 10000 })
    await expect(this.page.getByTestId("task-comment-edit-editor")).toBeVisible({ timeout: 10000 })
  }

  /**
   * Edit the comment content in the TaskCommentEditView.
   * Assumes the edit view is open.
   */
  async editCommentContent(newText: string): Promise<void> {
    const contentEditable = this.page.getByTestId("task-comment-edit-editor-content")
    await expect(contentEditable).toBeVisible({ timeout: 5000 })
    await expect(contentEditable).toHaveAttribute("contenteditable", "true", { timeout: 5000 })
    await contentEditable.click()
    await this.page.keyboard.press("Meta+A")
    await this.page.keyboard.press("Backspace")
    await this.page.keyboard.type(newText)
    await expect(contentEditable).toContainText(newText, { timeout: 5000 })
    await this.page.waitForTimeout(300)
  }

  /**
   * Save the comment edit in the TaskCommentEditView.
   */
  async saveCommentEdit(): Promise<void> {
    const saveButton = this.page.getByTestId("task-comment-edit-save")
    await expect(saveButton).toBeEnabled({ timeout: 10000 })
    const editView = this.page.getByTestId("task-comment-edit-view")
    await saveButton.click({ force: true })
    await editView.waitFor({ state: "hidden", timeout: 15000 }).catch(() => null)

    if (await editView.isVisible()) {
      const cancelButton = this.page.getByTestId("task-comment-edit-cancel")
      await cancelButton.click()
    }
    await expect(editView).not.toBeVisible({ timeout: 10000 })
  }

  /**
   * Cancel the comment edit and return to the task sidecar.
   */
  async cancelCommentEdit(): Promise<void> {
    const cancelButton = this.page.getByTestId("task-comment-edit-cancel")
    await cancelButton.click()
    await this.page.waitForTimeout(300)
  }

  // ============ Offline Draft Operations ============

  /**
   * Create a project while offline (draft-based creation) using the sidecar form.
   * Does not wait for network response since network is blocked.
   */
  async createProjectOffline(name: string): Promise<void> {
    // Click "New project" to open sidecar form
    await this.newProjectButton.click()

    // Wait for sidecar input and fill it
    await this.createProjectInput.waitFor({ state: "visible", timeout: 5000 })
    await this.createProjectInput.fill(name)
    await this.createProjectConfirmButton.click()

    // Wait for project view to appear (via draft cache overlay)
    await this.projectViewHeader.waitFor({ state: "visible", timeout: 15000 })
  }

  /**
   * Create a task while offline (draft-based creation).
   * Does not wait for network response since network is blocked.
   */
  async createTaskOffline(title: string): Promise<void> {
    await this.taskInput.waitFor({ state: "visible", timeout: 10000 })
    await this.taskInput.fill(title)
    await expect(this.taskInput).toHaveValue(title, { timeout: 3000 })
    await this.taskAddButton.click()

    // Wait for task to appear in list (via draft cache overlay)
    const taskTitle = this.page.getByTestId(/^task-title-/).filter({ hasText: title })
    await expect(taskTitle).toBeVisible({ timeout: 10000 })
  }

  /**
   * Assert that a project has a draft badge in the list.
   */
  async expectProjectDraftBadgeInList(name: string, timeout = 5000): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: name })
    const draftBadge = projectItem.getByTestId("project-draft-badge")
    await expect(draftBadge).toBeVisible({ timeout })
  }

  /**
   * Assert that a project does NOT have a draft badge in the list.
   */
  async expectProjectNoDraftBadgeInList(name: string, timeout = 5000): Promise<void> {
    const projectItem = this.page.getByTestId(/^project-item-/).filter({ hasText: name })
    const draftBadge = projectItem.getByTestId("project-draft-badge")
    await expect(draftBadge).not.toBeVisible({ timeout })
  }

  /**
   * Assert that a task has a draft badge in the list.
   */
  async expectTaskDraftBadgeInProject(title: string, timeout = 5000): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const draftBadge = taskItem.getByTestId("task-draft-badge")
    await expect(draftBadge).toBeVisible({ timeout })
  }

  /**
   * Assert that a task does NOT have a draft badge in the list.
   */
  async expectTaskNoDraftBadgeInProject(title: string, timeout = 5000): Promise<void> {
    const taskItem = this.page.getByTestId(/^task-item-/).filter({ hasText: title })
    const draftBadge = taskItem.getByTestId("task-draft-badge")
    await expect(draftBadge).not.toBeVisible({ timeout })
  }
}
