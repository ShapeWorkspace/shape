import { HttpClient, HttpError, HttpRequestOptions } from "../../services/http-client"
import { AccountStore } from "../../store/account-store"
import { Logger } from "../../utils/logger"
import { isTauriRuntime } from "../../utils/tauri-runtime"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"

export class ExecuteAuthenticatedRequest {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly accountStore: AccountStore,
    private readonly refreshAuthTokens: RefreshAuthTokens,
    private readonly logger: Logger
  ) {}

  async executeGet<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.executeWithAuthRefresh(() => this.httpClient.get<T>(url, this.buildHeaders(), options))
  }

  async executePost<T>(url: string, data: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.executeWithAuthRefresh(() => this.httpClient.post<T>(url, data, this.buildHeaders(), options))
  }

  async executePostNoContent(url: string, data: string, options: HttpRequestOptions = {}): Promise<void> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.postNoContent(url, data, this.buildHeaders(), options)
    )
  }

  async executePostFormData<T>(
    url: string,
    formData: FormData,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.postFormData<T>(url, formData, this.buildHeaders(), options)
    )
  }

  async executePut<T>(url: string, data: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.executeWithAuthRefresh(() => this.httpClient.put<T>(url, data, this.buildHeaders(), options))
  }

  async executePatch<T>(url: string, data: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.patch<T>(url, data, this.buildHeaders(), options)
    )
  }

  async executeDelete<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    return this.executeWithAuthRefresh(() => this.httpClient.delete<T>(url, this.buildHeaders(), options))
  }

  async executeDownloadBinary(url: string, options: HttpRequestOptions = {}): Promise<Uint8Array> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.downloadBinary(url, this.buildHeaders(), options)
    )
  }

  /**
   * Execute a request with automatic retry on 401 after token refresh.
   */
  private async executeWithAuthRefresh<T>(request: () => Promise<T>, skipAuthRefresh = false): Promise<T> {
    try {
      return await request()
    } catch (error) {
      const httpError = error as HttpError
      if (httpError.status === 401 && !skipAuthRefresh) {
        const refreshed = await this.attemptTokenRefresh()
        if (refreshed) {
          // Retry the request with refreshed token (buildHeaders will get new token)
          return await request()
        }
      }
      throw error
    }
  }

  /**
   * Attempt token refresh with deduplication to prevent concurrent refresh attempts.
   */
  private async attemptTokenRefresh(): Promise<boolean | undefined> {
    const tokenRefreshPromise = this.accountStore.getTokenRefreshPromise()
    if (tokenRefreshPromise) {
      return tokenRefreshPromise
    }

    this.accountStore.setTokenRefreshPromise(
      this.refreshAuthTokens
        .execute()
        .then(result => result.getValue())
        .catch(error => {
          this.logger.error("Token refresh failed:", error)
          return false
        })
        .finally(() => {
          this.accountStore.setTokenRefreshPromise(undefined)
        })
    )

    return this.accountStore.getTokenRefreshPromise()
  }

  /**
   * Build headers for authenticated requests.
   * Always includes X-Active-Account-ID with the immutable userId.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Active-Account-ID": this.accountStore.getUserId(),
    }

    const appAuthToken = this.accountStore.getAppToken()
    if (appAuthToken) {
      headers["Authorization"] = `Bearer ${appAuthToken}`
    }

    const sseClientId = this.accountStore.getSSEClientId()
    if (sseClientId) {
      headers["X-SSE-Client-ID"] = sseClientId
    }

    // Indicate this is a Tauri app so the server knows to return an app_token on login.
    if (isTauriRuntime()) {
      headers["X-Client-Type"] = "tauri"
    }

    return headers
  }
}
