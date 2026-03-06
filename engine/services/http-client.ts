/**
 * Error type that includes HTTP status and optional error code.
 * Used for billing-related errors and other structured error responses.
 */
export type HttpError = Error & { code?: string; status?: number }

/**
 * Options for HTTP requests.
 */
export interface HttpRequestOptions {
  signal?: AbortSignal
}

/**
 * HttpClient is a pure, stateless HTTP client.
 *
 * It has no knowledge of users, tokens, or authentication - it simply makes
 * HTTP requests with whatever headers are passed to it. This makes it suitable
 * for both authenticated and unauthenticated requests.
 *
 * For authenticated requests, use ExecuteAuthenticatedRequest which wraps
 * this client and automatically adds auth headers.
 */
export class HttpClient {
  // When non-zero, waits for the configured interval before issuing each HTTP request.
  // Helps integration tests simulate slow or offline conditions.
  private simulatedNetworkDelayMilliseconds = 0

  constructor(private readonly baseUrl: string) {}

  public getBaseUrl(): string {
    return this.baseUrl
  }

  public setSimulatedNetworkDelayMilliseconds(delayMilliseconds: number): void {
    this.simulatedNetworkDelayMilliseconds = Math.max(0, delayMilliseconds)
  }

  public clearSimulatedNetworkDelay(): void {
    this.simulatedNetworkDelayMilliseconds = 0
  }

  private async applySimulatedNetworkDelayIfConfigured(): Promise<void> {
    if (this.simulatedNetworkDelayMilliseconds <= 0) {
      return
    }

    await new Promise<void>(resolve => {
      setTimeout(resolve, this.simulatedNetworkDelayMilliseconds)
    })
  }

  /**
   * Parse error response and throw a structured HttpError.
   */
  private async handleError(response: Response): Promise<never> {
    const contentType = response.headers.get("content-type") || ""
    let message = `HTTP ${response.status}: ${response.statusText}`
    let code: string | undefined

    if (contentType.includes("application/json")) {
      try {
        const payload = (await response.json()) as { error?: string; message?: string; code?: string }
        message = payload.error ?? payload.message ?? message
        code = payload.code
      } catch {
        // Swallow parse errors
      }
    } else {
      try {
        const text = await response.text()
        if (text) {
          message = text
        }
      } catch {
        // Swallow read errors
      }
    }

    // Dispatch billing-related errors as window events for the UI to handle
    if (code === "workspace_read_only" || code === "seat_limit_reached") {
      window.dispatchEvent(
        new CustomEvent("workspace-billing-error", {
          detail: {
            code,
            message,
            status: response.status,
          },
        })
      )
    }

    const error = new Error(message) as HttpError
    error.code = code
    error.status = response.status
    throw error
  }

  public async get<T>(
    url: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "GET",
      headers,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    return response.json() as Promise<T>
  }

  public async post<T>(
    url: string,
    data: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "POST",
      headers,
      body: data,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    return response.json() as Promise<T>
  }

  /**
   * POST request that expects no content in response (204 No Content).
   */
  public async postNoContent(
    url: string,
    data: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<void> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "POST",
      headers,
      body: data,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }
  }

  public async postFormData<T>(
    url: string,
    formData: FormData,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    // Remove Content-Type to let browser set it with boundary
    const headersWithoutContentType = { ...headers }
    delete headersWithoutContentType["Content-Type"]

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: headersWithoutContentType,
      body: formData,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    return response.json() as Promise<T>
  }

  public async put<T>(
    url: string,
    data: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "PUT",
      headers,
      body: data,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    const contentType = response.headers.get("content-type") || ""
    if (response.status === 204 || !contentType.includes("application/json")) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  public async patch<T>(
    url: string,
    data: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "PATCH",
      headers,
      body: data,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    return response.json() as Promise<T>
  }

  public async delete<T>(
    url: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()

    const response = await fetch(fullUrl, {
      method: "DELETE",
      headers,
      credentials: "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    if (response.status === 204 || !response.headers.get("content-type")?.includes("application/json")) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  public async downloadBinary(
    url: string,
    headers: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<Uint8Array> {
    // For external URLs, use them directly; for internal URLs, prepend baseUrl
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`

    // For external URLs, don't send our headers/cookies
    const isExternal = fullUrl.startsWith("http") && !fullUrl.startsWith(this.baseUrl)

    await this.applySimulatedNetworkDelayIfConfigured()

    const headersWithoutContentType = { ...headers }
    delete headersWithoutContentType["Content-Type"]

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: isExternal ? {} : headersWithoutContentType,
      credentials: isExternal ? "omit" : "include",
      signal: options.signal,
    })

    if (!response.ok) {
      await this.handleError(response)
    }

    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  /**
   * Raw fetch wrapper for cases that need Response directly (like auth refresh with retry).
   * This is intentionally limited to avoid bypassing the structured methods above.
   */
  public async rawFetch(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`
    await this.applySimulatedNetworkDelayIfConfigured()
    return fetch(fullUrl, init)
  }
}
