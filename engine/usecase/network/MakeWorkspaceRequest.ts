import { HttpClient, HttpError, HttpRequestOptions } from "../../services/http-client"
import { AccountStore } from "../../store/account-store"
import { ApiResult } from "../../utils/ApiResult"
import { Logger } from "../../utils/logger"
import { isTauriRuntime } from "../../utils/tauri-runtime"
import { RefreshAuthTokens } from "../user/RefreshAuthTokens"

export class MakeWorkspaceRequest {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly accountStore: AccountStore,
    private readonly refreshAuthTokens: RefreshAuthTokens,
    private readonly logger: Logger,
    private readonly workspaceId: string
  ) {}

  private buildUrl(path: string): string {
    // Normalize relative paths so callers can omit a leading slash without breaking routes.
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    return `/workspaces/${this.workspaceId}${normalizedPath}`
  }

  async executeGet<T>(url: string, options: HttpRequestOptions = {}): Promise<ApiResult<T>> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.get<T>(this.buildUrl(url), this.buildHeaders(), options)
    )
  }

  async executePost<P, R>(url: string, data: P, options: HttpRequestOptions = {}): Promise<ApiResult<R>> {
    return this.executeWithAuthRefresh(() => {
      const json = JSON.stringify(data)
      return this.httpClient.post<R>(this.buildUrl(url), json, this.buildHeaders(), options)
    })
  }

  async executePostNoContent<P>(
    url: string,
    data: P,
    options: HttpRequestOptions = {}
  ): Promise<ApiResult<void>> {
    return this.executeWithAuthRefresh(() => {
      const json = JSON.stringify(data)
      return this.httpClient.postNoContent(this.buildUrl(url), json, this.buildHeaders(), options)
    })
  }

  async executePostFormData<T>(
    url: string,
    formData: FormData,
    options: HttpRequestOptions = {}
  ): Promise<ApiResult<T>> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.postFormData<T>(this.buildUrl(url), formData, this.buildHeaders(), options)
    )
  }

  async executePut<P, R>(url: string, data: P, options: HttpRequestOptions = {}): Promise<ApiResult<R>> {
    return this.executeWithAuthRefresh(() => {
      const json = JSON.stringify(data)
      return this.httpClient.put<R>(this.buildUrl(url), json, this.buildHeaders(), options)
    })
  }

  async executePatch<P, R>(url: string, data: P, options: HttpRequestOptions = {}): Promise<ApiResult<R>> {
    return this.executeWithAuthRefresh(() => {
      const json = JSON.stringify(data)
      return this.httpClient.patch<R>(this.buildUrl(url), json, this.buildHeaders(), options)
    })
  }

  async executeDelete<T>(url: string, options: HttpRequestOptions = {}): Promise<ApiResult<T>> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.delete<T>(this.buildUrl(url), this.buildHeaders(), options)
    )
  }

  async executeDownloadBinary(url: string, options: HttpRequestOptions = {}): Promise<ApiResult<Uint8Array>> {
    return this.executeWithAuthRefresh(() =>
      this.httpClient.downloadBinary(this.buildUrl(url), this.buildHeaders(), options)
    )
  }

  /**
   * Execute a request with automatic retry on 401 after token refresh.
   * Returns ApiResult instead of throwing exceptions.
   */
  private async executeWithAuthRefresh<T>(
    request: () => Promise<T>,
    skipAuthRefresh = false
  ): Promise<ApiResult<T>> {
    try {
      const value = await request()
      return ApiResult.ok(value)
    } catch (error) {
      const httpError = error as HttpError
      // Attempt token refresh on 401
      if (httpError.status === 401 && !skipAuthRefresh) {
        const refreshed = await this.attemptTokenRefresh()
        if (refreshed) {
          // Retry the request with refreshed token (buildHeaders will get new token)
          try {
            const value = await request()
            return ApiResult.ok(value)
          } catch (retryError) {
            return this.httpErrorToApiResult(retryError as HttpError)
          }
        }
      }
      return this.httpErrorToApiResult(httpError)
    }
  }

  /**
   * Convert an HttpError to an ApiResult failure.
   */
  private httpErrorToApiResult<T>(httpError: HttpError): ApiResult<T> {
    return ApiResult.fail({
      status: httpError.status ?? 0,
      code: httpError.code,
      message: httpError.message,
    })
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
