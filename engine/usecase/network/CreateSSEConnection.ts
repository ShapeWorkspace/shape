import { HttpClient } from "../../services/http-client"
import { TypedSSEEventUnion } from "../../services/sse-types"
import { AccountStore } from "../../store/account-store"
import { Logger } from "../../utils/logger"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { ExecuteAuthenticatedRequest } from "./ExecuteAuthenticatedRequest"

/**
 * SSE Connection interface for managing EventSource connections.
 */
export interface SSEConnection {
  close(): void
  getReadyState(): number
}

/**
 * Creates a Server-Sent Events connection.
 * For Tauri apps, this first exchanges the app token for a short-lived SSE token.
 *
 * The userId is baked into the SSE URL and is guaranteed to be correct because
 * it comes from the AccountStore's immutable userId field.
 */
export class CreateSSEConnection implements UseCaseInterface<SSEConnection> {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly accountStore: AccountStore,
    private readonly executeAuthenticatedRequest: ExecuteAuthenticatedRequest,
    private readonly logger: Logger
  ) {}

  public async execute(
    url: string,
    onMessage: (event: TypedSSEEventUnion) => void,
    onError?: (error: Error) => void
  ): Promise<Result<SSEConnection>> {
    this.logger.debug("Creating SSE connection to", url)

    const baseUrl = this.httpClient.getBaseUrl()
    const fullUrl = `${baseUrl}${url}`

    // Build SSE URL with userId - this is immutable and guaranteed correct
    let sseUrl = fullUrl
    const separator = sseUrl.includes("?") ? "&" : "?"
    sseUrl = `${sseUrl}${separator}activeUserId=${encodeURIComponent(this.accountStore.getUserId())}`

    // For Tauri apps, exchange the app token for a short-lived SSE token.
    // This avoids putting the long-lived app token in URLs where it could be logged.
    let useCredentials = true
    const appAuthToken = this.accountStore.getAppToken()
    if (appAuthToken) {
      const sseToken = await this.fetchSSEToken()
      if (sseToken) {
        const tokenSeparator = sseUrl.includes("?") ? "&" : "?"
        sseUrl = `${sseUrl}${tokenSeparator}sseToken=${encodeURIComponent(sseToken)}`
        useCredentials = false // No cookies needed with token auth
      } else {
        // Fallback: if SSE token fetch fails, we can't connect
        this.logger.error("Failed to get SSE token, cannot establish SSE connection")
        if (onError) {
          onError(new Error("Failed to get SSE token"))
        }
        // Return a dummy connection that's already closed
        return Result.ok({
          close: () => {},
          getReadyState: () => EventSource.CLOSED,
        })
      }
    }

    const eventSource = new EventSource(sseUrl, {
      withCredentials: useCredentials,
    })

    // Handle incoming messages
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const parsedData = JSON.parse(event.data)
        const sseEvent: TypedSSEEventUnion = parsedData as TypedSSEEventUnion
        onMessage(sseEvent)
      } catch (error) {
        this.logger.error("Failed to parse SSE message:", error)
        if (onError) {
          onError(new Error("Failed to parse SSE message"))
        }
      }
    }

    // Handle errors
    eventSource.onerror = (event: Event) => {
      this.logger.error("SSE connection error:", event)
      if (onError) {
        onError(new Error("SSE connection error"))
      }
    }

    // Handle connection open
    eventSource.onopen = () => {
      this.logger.debug("SSE connection established")
    }

    // Return connection controller
    return Result.ok({
      close: () => {
        eventSource.close()
      },
      getReadyState: () => eventSource.readyState,
    })
  }

  /**
   * Fetches a short-lived, single-use SSE token from the server.
   * This token is used instead of the long-lived app token in SSE URLs
   * to avoid exposing the app token in server logs.
   */
  private async fetchSSEToken(): Promise<string | null> {
    if (!this.accountStore.getAppToken()) {
      return null
    }

    try {
      const response = await this.executeAuthenticatedRequest.executePost<{ token: string }>(
        "/sse/token",
        "{}"
      )
      return response.token
    } catch (error) {
      this.logger.error("Failed to fetch SSE token:", error)
      return null
    }
  }
}
