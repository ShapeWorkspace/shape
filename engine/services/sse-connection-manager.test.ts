import { describe, it, expect, vi, beforeEach } from "vitest"
import { SSEConnectionManager } from "./sse-connection-manager"
import type { CreateSSEConnection, SSEConnection } from "../usecase/network/CreateSSEConnection"
import type { AccountStore } from "../store/account-store"
import { SSEEventType, type TypedSSEEventUnion } from "./sse-types"
import { WorkspaceMemberRole } from "../models/workspace-member"
import { EventBus } from "../processes/event-bus"
import { Result } from "../utils/Result"

describe("SSEConnectionManager", () => {
  const workspaceId = "ws-1"

  let createSSEConnectionUseCase: CreateSSEConnection
  let accountStore: AccountStore
  let connection: SSEConnection
  let onMessage: ((event: TypedSSEEventUnion) => void) | undefined
  let onError: ((error: Error) => void) | undefined
  let eventBus: EventBus

  beforeEach(() => {
    onMessage = undefined
    onError = undefined

    connection = { close: vi.fn(), getReadyState: vi.fn(() => 0) }
    eventBus = new EventBus()

    createSSEConnectionUseCase = {
      execute: vi.fn(
        async (
          _url: string,
          msg: (event: TypedSSEEventUnion) => void,
          err?: (error: Error) => void
        ) => {
          onMessage = msg
          onError = err
          return Result.ok(connection)
        }
      ),
    } as unknown as CreateSSEConnection

    accountStore = {
      setSSEClientId: vi.fn(),
      clearSSEClientId: vi.fn(),
      getSSEClientId: vi.fn(() => undefined),
    } as unknown as AccountStore
  })

  const waitForAsyncConnect = async (): Promise<void> => {
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })
  }

  it("connects on first subscribe and sets SSE client id on CONNECTED event", async () => {
    const mgr = new SSEConnectionManager(createSSEConnectionUseCase, workspaceId, accountStore, eventBus)

    const handler = vi.fn()
    mgr.initialize()
    mgr.subscribe({ eventTypes: [SSEEventType.CONNECTED], handler })

    await waitForAsyncConnect()
    expect(createSSEConnectionUseCase.execute).toHaveBeenCalledTimes(1)

    onMessage?.({
      type: SSEEventType.CONNECTED,
      data: { message: "Connected", clientId: "client-123" },
    })

    expect(accountStore.setSSEClientId).toHaveBeenCalledWith("client-123")
    expect(handler).toHaveBeenCalledTimes(1)
    expect(mgr.getIsConnected()).toBe(true)
    expect(mgr.getClientId()).toBe("client-123")
  })

  it("fans out events only to matching subscribers", async () => {
    const mgr = new SSEConnectionManager(createSSEConnectionUseCase, workspaceId, accountStore, eventBus)

    const connectedHandler = vi.fn()
    const memberHandler = vi.fn()

    mgr.initialize()
    mgr.subscribe({ eventTypes: [SSEEventType.CONNECTED], handler: connectedHandler })
    mgr.subscribe({ eventTypes: [SSEEventType.WORKSPACE_MEMBER_ADDED], handler: memberHandler })

    await waitForAsyncConnect()
    onMessage?.({ type: SSEEventType.CONNECTED, data: { message: "Connected" } })
    expect(connectedHandler).toHaveBeenCalledTimes(1)
    expect(memberHandler).toHaveBeenCalledTimes(0)

    onMessage?.({
      type: SSEEventType.WORKSPACE_MEMBER_ADDED,
      data: {
        workspace_id: "ws-1",
        user_id: "u-1",
        role: WorkspaceMemberRole.Member,
        member_id: "member-1",
      },
    })
    expect(memberHandler).toHaveBeenCalledTimes(1)
    expect(connectedHandler).toHaveBeenCalledTimes(1)
  })

  it("disconnects when the last subscriber unsubscribes", async () => {
    const mgr = new SSEConnectionManager(createSSEConnectionUseCase, workspaceId, accountStore, eventBus)

    mgr.initialize()
    const unsubscribe = mgr.subscribe({ eventTypes: [SSEEventType.CONNECTED], handler: vi.fn() })
    await waitForAsyncConnect()
    expect(createSSEConnectionUseCase.execute).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(connection.close).toHaveBeenCalledTimes(1)
    expect(accountStore.clearSSEClientId).toHaveBeenCalledTimes(1)
  })

  it("notifies CONNECTION_ERROR on error callbacks", async () => {
    const mgr = new SSEConnectionManager(createSSEConnectionUseCase, workspaceId, accountStore, eventBus)

    const handler = vi.fn()
    mgr.initialize()
    mgr.subscribe({ eventTypes: [SSEEventType.CONNECTION_ERROR], handler })

    await waitForAsyncConnect()
    onError?.(new Error("boom"))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]?.type).toBe(SSEEventType.CONNECTION_ERROR)
  })
})
