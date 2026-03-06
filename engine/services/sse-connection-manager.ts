import { logger } from "../utils/logger"
import { buildSseWorkspacePath } from "../utils/workspace-routes"
import { SSEEventType, type SSEEventSubscription, type TypedSSEEventUnion } from "./sse-types"
import { CreateSSEConnection, SSEConnection } from "../usecase/network/CreateSSEConnection"
import { AccountStore } from "../store/account-store"
import { EventBus } from "../processes/event-bus"

/**
 * Centralized SSE connection manager:
 * - maintains a single workspace-scoped EventSource connection
 * - fans out events to subscribers
 * - handles basic reconnect backoff
 */
export class SSEConnectionManager {
  private connection: SSEConnection | null = null
  private subscribers: Set<SSEEventSubscription> = new Set()
  private isConnected = false
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private clientId: string | null = null
  // SSE is only enabled after Application.initialize() for server-registered workspaces with an active account.
  private isEnabled = false
  // Prevents duplicate connection attempts when initialize() and subscribe() race.
  private isConnecting = false

  private readonly baseReconnectDelayMs = 1000
  private readonly maxReconnectDelayMs = 30000

  constructor(
    private readonly createSSEConnection: CreateSSEConnection,
    private readonly workspaceId: string,
    private readonly accountStore: AccountStore,
    private readonly eventBus: EventBus
  ) {}

  public initialize(): void {
    this.isEnabled = true
    if (this.subscribers.size > 0) {
      // Fire-and-forget async connection - errors are handled in connect()
      void this.connect()
    }
  }

  public destroy(): void {
    this.isEnabled = false
    this.clearReconnectTimer()
    this.disconnect()
    this.subscribers.clear()
  }

  public subscribe(subscription: SSEEventSubscription): () => void {
    this.subscribers.add(subscription)

    if (this.isEnabled && !this.connection) {
      // Fire-and-forget async connection - errors are handled in connect()
      void this.connect()
    }

    return () => {
      this.subscribers.delete(subscription)
      if (this.subscribers.size === 0) {
        this.disconnect()
      }
    }
  }

  public getClientId(): string | null {
    return this.clientId
  }

  public getIsConnected(): boolean {
    return this.isConnected
  }

  private async connect(): Promise<void> {
    if (!this.isEnabled || this.connection || this.isConnecting) {
      return
    }

    this.isConnecting = true
    const url = buildSseWorkspacePath(this.workspaceId, "/notifications/events")
    try {
      // createSSEConnection is async because it may need to fetch an SSE token first

      const result = await this.createSSEConnection.execute(
        url,
        event => this.handleEvent(event),
        err => this.handleError(err)
      )
      if (result.isFailed()) {
        this.handleError(new Error(result.getError()))
      } else {
        this.connection = result.getValue()
        logger.debug("SSE: connected", { url })
      }
    } catch (err) {
      this.handleError(err as Error)
    } finally {
      this.isConnecting = false
    }
  }

  private disconnect(): void {
    this.isConnected = false
    this.isConnecting = false
    this.clientId = null
    this.accountStore.clearSSEClientId()
    try {
      this.connection?.close()
    } catch (err) {
      logger.warn("SSE: failed to close connection", err)
    } finally {
      this.connection = null
    }
  }

  private handleEvent(event: TypedSSEEventUnion): void {
    if (!event?.type) {
      return
    }

    if (event.type === SSEEventType.CONNECTED) {
      const receivedClientId = event.data?.clientId
      if (receivedClientId) {
        this.clientId = receivedClientId
        this.accountStore.setSSEClientId(receivedClientId)
      }

      // Track if this is a reconnection (had previous connection attempts)
      // reconnectAttempts > 0 means we disconnected and are reconnecting
      const isReconnection = this.reconnectAttempts > 0

      this.isConnected = true
      this.reconnectAttempts = 0
      this.clearReconnectTimer()

      // Augment the event with reconnected flag for subscribers
      if (isReconnection) {
        this.eventBus.emit(this.eventBus.EVENTS.SSE_RECONNECTED, undefined)

        const augmentedEvent = {
          ...event,
          data: {
            ...event.data,
            reconnected: true,
          },
        }
        this.notifySubscribers(augmentedEvent as TypedSSEEventUnion)
        return
      }
    }

    this.notifySubscribers(event)
  }

  private handleError(error: Error): void {
    logger.warn("SSE: connection error", error)

    // Tear down the connection so reconnect recreates a fresh EventSource.
    this.disconnect()

    // Notify subscribers about connection error.
    this.notifySubscribers({
      type: SSEEventType.CONNECTION_ERROR,
      data: { message: error.message || "SSE connection error" },
    })

    if (!this.isEnabled || this.subscribers.size === 0) {
      return
    }

    this.scheduleReconnect()
  }

  private notifySubscribers(event: TypedSSEEventUnion): void {
    for (const subscriber of this.subscribers) {
      if (!subscriber.eventTypes.includes(event.type)) {
        continue
      }

      try {
        subscriber.handler(event)
      } catch (err) {
        logger.error("SSE subscriber handler error", err)
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.isEnabled) {
      return
    }
    this.clearReconnectTimer()
    const attempt = Math.min(this.reconnectAttempts, 10)
    const delay = Math.min(this.baseReconnectDelayMs * Math.pow(2, attempt), this.maxReconnectDelayMs)
    this.reconnectAttempts += 1

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      if (this.subscribers.size === 0) {
        return
      }
      // Fire-and-forget async connection - errors are handled in connect()
      void this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimeout) {
      return
    }
    clearTimeout(this.reconnectTimeout)
    this.reconnectTimeout = null
  }
}
