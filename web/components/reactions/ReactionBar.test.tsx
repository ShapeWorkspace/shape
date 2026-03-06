import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ReactionBar } from "./ReactionBar"
import type { ReactionListItem } from "../../store/queries/use-reactions"
import { Result } from "../../../engine/utils/Result"

type WorkspaceMemberListItem = {
  userId: string
  displayName?: string
  user?: { email?: string }
}

const mockedState = vi.hoisted(() => ({
  isOnline: true,
  isWorkspaceRegisteredWithServer: true,
  currentUserId: "user-current",
  reactions: [] as ReactionListItem[],
  parentEntity: { id: "entity-1", entityType: "direct-message" },
  workspaceMembers: [] as WorkspaceMemberListItem[],
  pickerEmojiSelection: "👍",
  pillsEmojiSelection: "🔥",
}))

const createEntityExecuteMock = vi.hoisted(() => vi.fn<Promise<Result<ReactionListItem>>, [unknown]>())
const deleteEntityExecuteMock = vi.hoisted(() => vi.fn<Promise<Result<void>>, [string]>())
const queryEntityByIdExecuteMock = vi.hoisted(() => vi.fn<Promise<Result<unknown>>, [string]>())
const upsertStatusMock = vi.hoisted(() =>
  vi.fn<void, [{ id: string; message: string; variant: string; isDismissible: boolean }]>()
)
const removeStatusMock = vi.hoisted(() => vi.fn<void, [string]>())

vi.mock("../../store/engine-store", () => ({
  useEngineStore: () => ({
    application: {
      isWorkspaceRemote: () => mockedState.isWorkspaceRegisteredWithServer,
      getCreateEntity: () => ({
        execute: createEntityExecuteMock,
      }),
      getDeleteEntity: () => ({
        execute: deleteEntityExecuteMock,
      }),
      getQueryEntityById: () => ({
        execute: queryEntityByIdExecuteMock,
      }),
      getCacheStores: () => ({
        entityStore: {
          get: () => mockedState.parentEntity,
        },
      }),
    },
  }),
}))

vi.mock("../../store/workspace-store", () => ({
  useWorkspaceStore: () => ({
    currentWorkspace: {
      isRegisteredWithServer: mockedState.isWorkspaceRegisteredWithServer,
    },
  }),
}))

vi.mock("../../store/auth-store", () => ({
  useAuthStore: () => ({
    currentUser: mockedState.currentUserId ? { uuid: mockedState.currentUserId } : null,
  }),
}))

vi.mock("../../store/status-store", () => ({
  useStatusStore: () => ({
    upsertStatus: upsertStatusMock,
    removeStatus: removeStatusMock,
  }),
}))

vi.mock("../../hooks/use-reachability", () => ({
  useReachability: () => ({
    isOnline: mockedState.isOnline,
  }),
}))

vi.mock("../../store/queries/use-workspace-members", () => ({
  useWorkspaceMembers: () => ({
    data: mockedState.workspaceMembers,
  }),
}))

vi.mock("../../store/queries/use-reactions", () => ({
  useReactions: () => ({
    data: mockedState.reactions,
  }),
}))

vi.mock("./ReactionPicker", () => ({
  ReactionPicker: ({ onEmojiSelect }: { onEmojiSelect: (emoji: string) => void }) => (
    <button
      type="button"
      data-testid="reaction-picker"
      onClick={() => onEmojiSelect(mockedState.pickerEmojiSelection)}
    >
      Picker
    </button>
  ),
}))

vi.mock("./ReactionPills", () => ({
  ReactionPills: ({ onToggleReaction }: { onToggleReaction: (emoji: string) => void }) => (
    <button
      type="button"
      data-testid="reaction-pills-toggle"
      onClick={() => onToggleReaction(mockedState.pillsEmojiSelection)}
    >
      Pills
    </button>
  ),
}))

function buildWorkspaceMemberFixture(userId: string, name: string): WorkspaceMemberListItem {
  return {
    userId,
    displayName: name,
    user: {
      email: `${name.toLowerCase()}@example.com`,
    },
  }
}

function buildReactionFixture({
  id,
  userId,
  emoji,
  createdAt,
}: {
  id: string
  userId: string
  emoji: string
  createdAt: Date
}): ReactionListItem {
  return {
    id,
    creatorId: userId,
    content: { emoji },
    createdAt,
  }
}

describe("ReactionBar", () => {
  beforeEach(() => {
    mockedState.isOnline = true
    mockedState.isWorkspaceRegisteredWithServer = true
    mockedState.currentUserId = "user-current"
    mockedState.reactions = []
    mockedState.workspaceMembers = [buildWorkspaceMemberFixture("user-current", "Current User")]
    mockedState.pickerEmojiSelection = "👍"
    mockedState.pillsEmojiSelection = "🔥"

    createEntityExecuteMock.mockResolvedValue(
      Result.ok(
        buildReactionFixture({
          id: "reaction-created",
          userId: "user-current",
          emoji: "👍",
          createdAt: new Date(),
        })
      )
    )
    deleteEntityExecuteMock.mockResolvedValue(Result.ok(undefined))
    queryEntityByIdExecuteMock.mockResolvedValue(Result.ok(mockedState.parentEntity))
    upsertStatusMock.mockClear()
    removeStatusMock.mockClear()
    createEntityExecuteMock.mockClear()
    deleteEntityExecuteMock.mockClear()
    queryEntityByIdExecuteMock.mockClear()
  })

  it("blocks reactions while offline and posts the global status message", () => {
    mockedState.isOnline = false

    render(
      <ReactionBar
        entityId="entity-1"
        entityType="direct-message"
        testIdPrefix="reaction"
      />
    )

    fireEvent.click(screen.getByTestId("reaction-picker"))

    expect(createEntityExecuteMock).not.toHaveBeenCalled()
    expect(upsertStatusMock).toHaveBeenCalledWith({
      id: "reaction-status-direct-message-entity-1-offline",
      message: "CAN'T CREATE REACTIONS WHILE OFFLINE.",
      variant: "warning",
      isDismissible: true,
    })
  })

  it("blocks reactions when the workspace is not registered", () => {
    mockedState.isWorkspaceRegisteredWithServer = false

    render(
      <ReactionBar
        entityId="entity-1"
        entityType="direct-message"
        testIdPrefix="reaction"
      />
    )

    fireEvent.click(screen.getByTestId("reaction-picker"))

    expect(createEntityExecuteMock).not.toHaveBeenCalled()
    expect(upsertStatusMock).toHaveBeenCalledWith({
      id: "reaction-status-direct-message-entity-1-error",
      message: "You need to be signed in to add a reaction.",
      variant: "warning",
      isDismissible: true,
    })
  })

  it("deletes all matching reactions for the current user when toggled", async () => {
    mockedState.reactions = [
      buildReactionFixture({
        id: "reaction-a",
        userId: "user-current",
        emoji: "🔥",
        createdAt: new Date(1000),
      }),
      buildReactionFixture({
        id: "reaction-b",
        userId: "user-current",
        emoji: "🔥",
        createdAt: new Date(2000),
      }),
    ]

    render(
      <ReactionBar
        entityId="entity-1"
        entityType="direct-message"
        testIdPrefix="reaction"
      />
    )

    fireEvent.click(screen.getByTestId("reaction-pills-toggle"))

    await waitFor(() => {
      expect(deleteEntityExecuteMock).toHaveBeenCalledTimes(2)
    })
    expect(deleteEntityExecuteMock).toHaveBeenCalledWith("reaction-a")
    expect(deleteEntityExecuteMock).toHaveBeenCalledWith("reaction-b")
    expect(createEntityExecuteMock).not.toHaveBeenCalled()
  })

  it("creates a new reaction when no matching reaction exists", async () => {
    mockedState.reactions = [
      buildReactionFixture({
        id: "reaction-a",
        userId: "user-other",
        emoji: "🔥",
        createdAt: new Date(1000),
      }),
    ]

    render(
      <ReactionBar
        entityId="entity-1"
        entityType="direct-message"
        testIdPrefix="reaction"
      />
    )

    fireEvent.click(screen.getByTestId("reaction-picker"))

    await waitFor(() => {
      expect(createEntityExecuteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "reaction",
          content: { emoji: "👍" },
        })
      )
    })
    expect(deleteEntityExecuteMock).not.toHaveBeenCalled()
  })
})
