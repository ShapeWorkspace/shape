import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"

export class AuthPage {
  private readonly page: Page
  private readonly onboardingSignInButton: Locator
  private readonly onboardingSignUpButton: Locator
  private readonly emailInput: Locator
  private readonly passwordInput: Locator
  private readonly submitButton: Locator
  private readonly navigationSidebar: Locator
  private readonly toolSelector: Locator
  private readonly workspaceSelector: Locator

  constructor(page: Page) {
    this.page = page
    this.onboardingSignInButton = page.getByTestId("onboarding-signin")
    this.onboardingSignUpButton = page.getByTestId("onboarding-signup")
    this.emailInput = page.getByTestId("auth-email-input")
    this.passwordInput = page.getByTestId("auth-password-input")
    this.submitButton = page.getByTestId("form-sidecar-submit")
    this.navigationSidebar = page.getByTestId("navigation-sidebar")
    this.toolSelector = page.getByTestId("tool-selector")
    this.workspaceSelector = page.getByTestId("workspace-selector")
  }

  async goto(): Promise<void> {
    // The app hydrates quickly, so we wait for DOM content instead of the full load event which
    // can stall when long-lived connections (WebSockets, event streams) are present.
    await this.page.goto("/", { waitUntil: "domcontentloaded", timeout: 45000 })
  }

  async expectVisible(): Promise<void> {
    // On first launch, anonymous users see the tools UI with the onboarding sidecar.
    await expect(this.toolSelector).toBeVisible({ timeout: 30000 })
    await expect(this.onboardingSignInButton.or(this.emailInput)).toBeVisible({ timeout: 30000 })

    const hasOnboardingRoot = await this.onboardingSignInButton.isVisible().catch(() => false)
    if (hasOnboardingRoot) {
      await expect(this.onboardingSignUpButton).toBeVisible({ timeout: 30000 })
      return
    }

    // If we're already in the auth form sidecar, ensure inputs are visible instead.
    await expect(this.emailInput).toBeVisible({ timeout: 30000 })
  }

  private async openAuthForm(mode: "signin" | "signup"): Promise<void> {
    const isFormVisible = await this.emailInput.isVisible().catch(() => false)
    if (isFormVisible) {
      return
    }

    const targetButton = mode === "signin" ? this.onboardingSignInButton : this.onboardingSignUpButton
    await targetButton.click()
    await expect(this.emailInput).toBeVisible({ timeout: 10000 })
  }

  async signUp(params: { email: string; password: string }): Promise<void> {
    const { email, password } = params
    await this.openAuthForm("signup")

    // Fill the form fields (name is derived from email on the client).
    // Clear first to avoid flaky browser autofill behavior.
    await this.emailInput.fill("")
    await this.passwordInput.fill("")
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    // Re-assert and reapply in case browser autofill or sidecar re-renders swap values.
    const resolvedEmailValue = await this.emailInput.inputValue()
    if (resolvedEmailValue !== email) {
      await this.emailInput.fill(email)
    }
    const resolvedPasswordValue = await this.passwordInput.inputValue()
    if (resolvedPasswordValue !== password) {
      await this.passwordInput.fill(password)
    }
    await expect(this.emailInput).toHaveValue(email)
    await expect(this.passwordInput).toHaveValue(password)
    await this.submitButton.click()

    // Ensure auth form has fully dismissed before proceeding with workspace assertions.
    await this.waitForAuthFormToDisappear()

    // Wait for post-auth workspace resolution to settle.
    // Sidebar visibility alone is insufficient because it can already be visible pre-auth.
    await expect
      .poll(
        async () => {
          const workspaceSelectorVisible = await this.workspaceSelector.isVisible().catch(() => false)
          if (workspaceSelectorVisible) {
            return true
          }

          const pathname = new URL(this.page.url()).pathname
          const hasWorkspaceRoute = /\/w\/[^/]+/.test(pathname)
          const sidebarVisible = await this.navigationSidebar.isVisible().catch(() => false)
          return hasWorkspaceRoute && sidebarVisible
        },
        { timeout: 240000 }
      )
      .toBe(true)

  }

  /**
   * Wait for the auth form to disappear after successful authentication.
   * This guards against tests racing ahead before workspace registration completes.
   */
  async waitForAuthFormToDisappear(): Promise<void> {
    await expect(this.emailInput).toBeHidden({ timeout: 60000 })
  }

  async signIn(params: { email: string; password: string }): Promise<void> {
    const { email, password } = params
    await this.openAuthForm("signin")

    // Clear first to avoid flaky browser autofill behavior.
    await this.emailInput.fill("")
    await this.passwordInput.fill("")
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    // Re-assert and reapply in case browser autofill or sidecar re-renders swap values.
    const resolvedEmailValue = await this.emailInput.inputValue()
    if (resolvedEmailValue !== email) {
      await this.emailInput.fill(email)
    }
    const resolvedPasswordValue = await this.passwordInput.inputValue()
    if (resolvedPasswordValue !== password) {
      await this.passwordInput.fill(password)
    }
    await expect(this.emailInput).toHaveValue(email)
    await expect(this.passwordInput).toHaveValue(password)
    await this.submitButton.click()

    await this.waitForAuthFormToDisappear()

    // Wait for post-auth workspace resolution to settle.
    await expect
      .poll(
        async () => {
          const workspaceSelectorVisible = await this.workspaceSelector.isVisible().catch(() => false)
          if (workspaceSelectorVisible) {
            return true
          }

          const pathname = new URL(this.page.url()).pathname
          const hasWorkspaceRoute = /\/w\/[^/]+/.test(pathname)
          const sidebarVisible = await this.navigationSidebar.isVisible().catch(() => false)
          return hasWorkspaceRoute && sidebarVisible
        },
        { timeout: 240000 }
      )
      .toBe(true)

  }

  /**
   * Attempts to sign in but does NOT wait for success.
   * Use this for testing failed login scenarios where the auth page should remain visible.
   */
  async trySignIn(params: { email: string; password: string }): Promise<void> {
    const { email, password } = params
    await this.openAuthForm("signin")

    // Clear first to avoid flaky browser autofill behavior (same as signIn).
    await this.emailInput.fill("")
    await this.passwordInput.fill("")
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    // Re-assert and reapply in case browser autofill or sidecar re-renders swap values.
    const resolvedEmailValue = await this.emailInput.inputValue()
    if (resolvedEmailValue !== email) {
      await this.emailInput.fill(email)
    }
    const resolvedPasswordValue = await this.passwordInput.inputValue()
    if (resolvedPasswordValue !== password) {
      await this.passwordInput.fill(password)
    }
    await expect(this.emailInput).toHaveValue(email)
    await expect(this.passwordInput).toHaveValue(password)

    // Wait for submit button to be enabled (form validation passed)
    await expect(this.submitButton).toBeEnabled({ timeout: 5000 })
    await this.submitButton.click()

    // Wait for the error state to surface (failed login should keep the form visible).
    await expect(this.page.getByTestId("form-sidecar-error")).toBeVisible({ timeout: 10000 })
  }
}
