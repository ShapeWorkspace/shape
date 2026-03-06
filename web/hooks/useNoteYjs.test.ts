/**
 * Tests for useNoteYjs hook.
 *
 * Covers:
 * - Debouncing of local Y.Doc updates (500ms)
 * - SSE event handling for remote updates
 * - Ignoring remote updates during application (no echo)
 */

import { renderHook, act } from "@testing-library/react"
import * as Y from "yjs"
import type { EntityBlockCreatedEventData } from "@shape/engine/services/sse-types"

// Mock dependencies before importing the hook
vi.mock("../store/engine-store", () => ({
  useEngineStore: vi.fn(),
}))
vi.mock("../store/queries/use-notes", () => ({
  useNoteBlocks: vi.fn(),
  useCreateNoteBlock: vi.fn(),
}))
vi.mock("@shape/engine/usecase/crypto/block-crypto-utils", () => ({
  decodeBlocksFromBase64: vi.fn(),
  encodeBlocksToBase64: vi.fn(() => "base64-encoded-blocks"),
}))

// Import after mocks are set up
import { useNoteYjs } from "./useNoteYjs"
import { useEngineStore } from "../store/engine-store"
import { useNoteBlocks, useCreateNoteBlock } from "../store/queries/use-notes"
import { decodeBlocksFromBase64 } from "@shape/engine/usecase/crypto/block-crypto-utils"

const mockUseEngineStore = vi.mocked(useEngineStore)
const mockUseNoteBlocks = vi.mocked(useNoteBlocks)
const mockUseCreateNoteBlock = vi.mocked(useCreateNoteBlock)
const mockDecodeBlocksFromBase64 = vi.mocked(decodeBlocksFromBase64)

describe("useNoteYjs", () => {
  // SSE subscription callback captured during test
  let sseCallback: ((data: EntityBlockCreatedEventData) => Promise<void>) | null = null
  let sseUnsubscribe: ReturnType<typeof vi.fn>

  // Mock services
  const mockEncryptDelta = {
    execute: vi.fn((params: { yjsUpdate: Uint8Array }) => params.yjsUpdate),
  }

  const mockDecryptDelta = {
    execute: vi.fn((params: { delta: Uint8Array }) => params.delta),
  }

  const mockIndexBlockEntity = {
    execute: vi.fn().mockResolvedValue({
      isFailed: () => false,
      getError: () => "",
    }),
  }

  const mockNoteService = {
    subscribeToBlockUpdates: vi.fn(
      (noteId: string, callback: (data: EntityBlockCreatedEventData) => Promise<void>) => {
        sseCallback = callback
        return sseUnsubscribe
      }
    ),
  }

  const mockWorkspaceKeyService = {
    getCurrentKey: vi.fn(() => ({
      isFailed: () => false,
      getValue: () => ({ key: "test-workspace-key" }),
    })),
  }

  const mockApplication = {
    workspaceId: "workspace-123",
    getEncryptDelta: () => mockEncryptDelta,
    getDecryptDelta: () => mockDecryptDelta,
    getIndexBlockEntity: () => mockIndexBlockEntity,
    getNoteService: () => mockNoteService,
    getWorkspaceKeyService: () => mockWorkspaceKeyService,
  }

  const mockGlobalClient = {
    getGlobalUserService: () => ({
      getIdentityKeysForUser: () => ({ encryptionKeyPair: {}, signingKeyPair: {} }),
      getUsers: () => [{ uuid: "user-123", email: "user@example.com" }],
    }),
  }

  const mockMutateAsync = vi.fn().mockResolvedValue({ id: "block-123" })

  const defaultProps = {
    noteId: "note-123",
    title: "Test Note",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sseCallback = null
    sseUnsubscribe = vi.fn()

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock returns
    mockUseEngineStore.mockReturnValue({
      globalClient: mockGlobalClient,
      application: mockApplication,
    } as ReturnType<typeof useEngineStore>)

    // Default: no blocks, not loading (already synced state)
    mockUseNoteBlocks.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useNoteBlocks>)

    mockUseCreateNoteBlock.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateNoteBlock>)

    // Setup encryption defaults
    mockEncryptDelta.execute.mockImplementation((params: { yjsUpdate: Uint8Array }) => params.yjsUpdate)
    mockDecryptDelta.execute.mockImplementation((params: { delta: Uint8Array }) => params.delta)
    mockDecodeBlocksFromBase64.mockReturnValue({ deltas: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("initialization", () => {
    it("creates a Y.Doc instance", () => {
      const { result } = renderHook(() => useNoteYjs(defaultProps))
      expect(result.current.ydoc).toBeInstanceOf(Y.Doc)
    })

    it("starts in loading state when blocks are loading", () => {
      mockUseNoteBlocks.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as ReturnType<typeof useNoteBlocks>)

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isSynced).toBe(false)
    })

    it("sets error state when blocks fail to load", () => {
      mockUseNoteBlocks.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Failed to load blocks"),
      } as unknown as ReturnType<typeof useNoteBlocks>)

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      expect(result.current.error).toBe("Failed to load blocks")
    })
  })

  describe("debouncing local updates", () => {
    it("does not save immediately when Y.Doc is updated", () => {
      const { result } = renderHook(() => useNoteYjs(defaultProps))

      // Make a local change to the Y.Doc
      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const paragraph = new Y.XmlElement("p")
        const text = new Y.XmlText()
        text.insert(0, "Hello")
        paragraph.insert(0, [text])
        content.insert(0, [paragraph])
      })

      // Save should not be called immediately
      expect(mockMutateAsync).not.toHaveBeenCalled()
      // isSavingBlocks is false during debounce period - only true during actual save
      expect(result.current.isSavingBlocks).toBe(false)
    })

    it("saves after 500ms debounce delay", async () => {
      const { result } = renderHook(() => useNoteYjs(defaultProps))

      // Make a local change
      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const paragraph = new Y.XmlElement("p")
        const text = new Y.XmlText()
        text.insert(0, "Hello")
        paragraph.insert(0, [text])
        content.insert(0, [paragraph])
      })

      // Advance time past debounce delay
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      expect(mockMutateAsync).toHaveBeenCalledWith({
        noteId: "note-123",
        encryptedData: "base64-encoded-blocks",
      })
    })

    it("batches multiple rapid updates into single save", async () => {
      const { result } = renderHook(() => useNoteYjs(defaultProps))

      // Make multiple changes rapidly
      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const p1 = new Y.XmlElement("p")
        const t1 = new Y.XmlText()
        t1.insert(0, "First")
        p1.insert(0, [t1])
        content.insert(0, [p1])
      })

      act(() => {
        vi.advanceTimersByTime(200)
      })

      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const p2 = new Y.XmlElement("p")
        const t2 = new Y.XmlText()
        t2.insert(0, "Second")
        p2.insert(0, [t2])
        content.insert(1, [p2])
      })

      // Still within debounce window - no save yet
      expect(mockMutateAsync).not.toHaveBeenCalled()

      // Advance past debounce delay from last update
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // All updates batched into single save call
      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    })

    it("resets debounce timer on each new update", async () => {
      const { result } = renderHook(() => useNoteYjs(defaultProps))

      // First update
      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const p1 = new Y.XmlElement("p")
        const t1 = new Y.XmlText()
        t1.insert(0, "First")
        p1.insert(0, [t1])
        content.insert(0, [p1])
      })

      // Advance 400ms (just under debounce)
      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(mockMutateAsync).not.toHaveBeenCalled()

      // Another update - should reset the timer
      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const p2 = new Y.XmlElement("p")
        const t2 = new Y.XmlText()
        t2.insert(0, "Second")
        p2.insert(0, [t2])
        content.insert(1, [p2])
      })

      // Advance another 400ms - still not enough from second update
      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(mockMutateAsync).not.toHaveBeenCalled()

      // Advance remaining 100ms to complete debounce from second update
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe("local-only workspaces", () => {
    it("saves blocks even when identity keys are unavailable", async () => {
      mockUseEngineStore.mockReturnValue({
        globalClient: {
          getGlobalUserService: () => ({
            getIdentityKeysForUser: () => null,
            getUsers: () => [],
          }),
        },
        application: mockApplication,
      } as ReturnType<typeof useEngineStore>)

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const paragraph = new Y.XmlElement("p")
        const text = new Y.XmlText()
        text.insert(0, "Offline note")
        paragraph.insert(0, [text])
        content.insert(0, [paragraph])
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe("workspace key handling", () => {
    it("skips saving when the workspace key is missing", async () => {
      mockWorkspaceKeyService.getCurrentKey.mockReturnValue({
        isFailed: () => false,
        getValue: () => null,
      })

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      act(() => {
        const content = result.current.ydoc.getXmlFragment("content")
        const paragraph = new Y.XmlElement("p")
        const text = new Y.XmlText()
        text.insert(0, "Missing key update")
        paragraph.insert(0, [text])
        content.insert(0, [paragraph])
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      expect(mockMutateAsync).not.toHaveBeenCalled()
    })

    it("reports an error when blocks load without a workspace key", async () => {
      mockWorkspaceKeyService.getCurrentKey.mockReturnValue({
        isFailed: () => false,
        getValue: () => null,
      })

      mockUseNoteBlocks.mockReturnValue({
        data: [
          {
            id: "block-1",
            entity_id: "note-123",
            entity_type: "note",
            entity_field: "content",
            author_id: "user-123",
            encrypted_data: "base64-blocks",
            data_version: "yjs-v1",
            created_at: new Date().toISOString(),
          },
        ],
        isLoading: false,
        error: null,
      } as ReturnType<typeof useNoteBlocks>)

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.error).toBe("Failed to get entity key")
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe("SSE event handling", () => {
    it("subscribes to SSE block updates on mount", () => {
      renderHook(() => useNoteYjs(defaultProps))

      expect(mockNoteService.subscribeToBlockUpdates).toHaveBeenCalledWith("note-123", expect.any(Function))
    })

    it("unsubscribes from SSE on unmount", () => {
      const { unmount } = renderHook(() => useNoteYjs(defaultProps))

      unmount()

      expect(sseUnsubscribe).toHaveBeenCalled()
    })

    it("applies remote updates from SSE to Y.Doc", async () => {
      // Setup decryption to return a valid Yjs update
      const remoteYDoc = new Y.Doc()
      const content = remoteYDoc.getXmlFragment("content")
      const paragraph = new Y.XmlElement("p")
      const text = new Y.XmlText()
      text.insert(0, "Remote update")
      paragraph.insert(0, [text])
      content.insert(0, [paragraph])
      const remoteUpdate = Y.encodeStateAsUpdate(remoteYDoc)

      mockDecodeBlocksFromBase64.mockReturnValue({
        deltas: [{ encrypted: true }],
      })
      mockDecryptDelta.execute.mockReturnValue(remoteUpdate)

      const { result } = renderHook(() => useNoteYjs(defaultProps))

      expect(sseCallback).not.toBeNull()

      // Simulate SSE event
      await act(async () => {
        await sseCallback!({
          entityId: "note-123",
          entityType: "note",
          blockId: "block-456",
          authorId: "other-user-456",
          encryptedData: "encrypted-data",
        })
      })

      // Verify the update was applied (check content exists)
      const localContent = result.current.ydoc.getXmlFragment("content")
      expect(localContent.length).toBeGreaterThan(0)
    })

    it("does not trigger save when applying remote SSE updates", async () => {
      // Setup decryption to return a valid Yjs update
      const remoteYDoc = new Y.Doc()
      const content = remoteYDoc.getXmlFragment("content")
      const paragraph = new Y.XmlElement("p")
      const text = new Y.XmlText()
      text.insert(0, "Remote update")
      paragraph.insert(0, [text])
      content.insert(0, [paragraph])
      const remoteUpdate = Y.encodeStateAsUpdate(remoteYDoc)

      mockDecodeBlocksFromBase64.mockReturnValue({
        deltas: [{ encrypted: true }],
      })
      mockDecryptDelta.execute.mockReturnValue(remoteUpdate)

      renderHook(() => useNoteYjs(defaultProps))

      // Simulate SSE event
      await act(async () => {
        await sseCallback!({
          entityId: "note-123",
          entityType: "note",
          blockId: "block-456",
          authorId: "other-user-456",
          encryptedData: "encrypted-data",
        })
      })

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // Save should NOT have been called - remote updates shouldn't trigger saves
      expect(mockMutateAsync).not.toHaveBeenCalled()
    })
  })
})
