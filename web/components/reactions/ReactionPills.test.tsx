import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { ReactionListItem } from "../../store/queries/use-reactions"
import { ReactionPills } from "./ReactionPills"

vi.mock("../tiptap-ui-primitive/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}))

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

describe("ReactionPills", () => {
  it("groups by emoji, preserves first-used ordering, and marks the current user reaction as active", () => {
    // Arrange: first emoji appears earlier, and the current user reacted to it.
    const reactions: ReactionListItem[] = [
      buildReactionFixture({
        id: "reaction-1",
        userId: "user-alice",
        emoji: "🎉",
        createdAt: new Date(1000),
      }),
      buildReactionFixture({
        id: "reaction-2",
        userId: "user-bob",
        emoji: "👍",
        createdAt: new Date(2000),
      }),
      buildReactionFixture({
        id: "reaction-3",
        userId: "user-charlie",
        emoji: "🎉",
        createdAt: new Date(3000),
      }),
    ]

    render(
      <ReactionPills
        reactions={reactions}
        currentUserId="user-alice"
        resolveDisplayName={userId => userId}
        onToggleReaction={() => {}}
      />
    )

    // Assert: first-used ordering keeps 🎉 before 👍 and counts are grouped.
    const pillButtons = screen.getAllByRole("button")
    expect(pillButtons).toHaveLength(2)

    expect(pillButtons[0]).toHaveTextContent("🎉")
    expect(pillButtons[0]).toHaveTextContent("2")
    expect(pillButtons[0]).toHaveAttribute("data-active", "true")

    expect(pillButtons[1]).toHaveTextContent("👍")
    expect(pillButtons[1]).toHaveTextContent("1")
    expect(pillButtons[1]).toHaveAttribute("data-active", "false")
  })

  it("treats skin tone variants as distinct emojis", () => {
    // Arrange: same base emoji with a skin tone modifier should stay separate.
    const reactions: ReactionListItem[] = [
      buildReactionFixture({
        id: "reaction-1",
        userId: "user-alice",
        emoji: "👍",
        createdAt: new Date(1000),
      }),
      buildReactionFixture({
        id: "reaction-2",
        userId: "user-bob",
        emoji: "👍🏽",
        createdAt: new Date(2000),
      }),
    ]

    render(
      <ReactionPills
        reactions={reactions}
        currentUserId={null}
        resolveDisplayName={userId => userId}
        onToggleReaction={() => {}}
      />
    )

    // Assert: two separate pills are rendered for each variant.
    const pillButtons = screen.getAllByRole("button")
    expect(pillButtons).toHaveLength(2)
    expect(pillButtons[0]).toHaveTextContent("👍")
    expect(pillButtons[1]).toHaveTextContent("👍🏽")
  })

  it("renders every unique emoji pill without overflow caps", () => {
    // Arrange: create a spread of unique emojis to ensure all are visible.
    const reactions: ReactionListItem[] = [
      buildReactionFixture({ id: "reaction-1", userId: "u1", emoji: "😀", createdAt: new Date(1000) }),
      buildReactionFixture({ id: "reaction-2", userId: "u2", emoji: "🎉", createdAt: new Date(1100) }),
      buildReactionFixture({ id: "reaction-3", userId: "u3", emoji: "🔥", createdAt: new Date(1200) }),
      buildReactionFixture({ id: "reaction-4", userId: "u4", emoji: "💡", createdAt: new Date(1300) }),
      buildReactionFixture({ id: "reaction-5", userId: "u5", emoji: "✅", createdAt: new Date(1400) }),
      buildReactionFixture({ id: "reaction-6", userId: "u6", emoji: "🚀", createdAt: new Date(1500) }),
    ]

    render(
      <ReactionPills
        reactions={reactions}
        currentUserId={null}
        resolveDisplayName={userId => userId}
        onToggleReaction={() => {}}
      />
    )

    // Assert: no overflow; every unique emoji appears as its own pill.
    const pillButtons = screen.getAllByRole("button")
    expect(pillButtons).toHaveLength(6)
  })

  it("builds tooltip labels in first-reaction order with 'You' and truncation", () => {
    const reactions: ReactionListItem[] = [
      buildReactionFixture({
        id: "reaction-1",
        userId: "user-alice",
        emoji: "😀",
        createdAt: new Date(1000),
      }),
      buildReactionFixture({
        id: "reaction-2",
        userId: "user-bob",
        emoji: "😀",
        createdAt: new Date(2000),
      }),
      buildReactionFixture({
        id: "reaction-3",
        userId: "user-charlie",
        emoji: "😀",
        createdAt: new Date(3000),
      }),
      buildReactionFixture({
        id: "reaction-4",
        userId: "user-danielle",
        emoji: "😀",
        createdAt: new Date(4000),
      }),
      buildReactionFixture({
        id: "reaction-5",
        userId: "user-ed",
        emoji: "😀",
        createdAt: new Date(5000),
      }),
    ]

    render(
      <ReactionPills
        reactions={reactions}
        currentUserId="user-bob"
        resolveDisplayName={userId => userId}
        onToggleReaction={() => {}}
      />
    )
    const tooltipLabel = screen.getByRole("tooltip")
    expect(tooltipLabel).toHaveTextContent("user-alice, You, user-charlie, and 2 others")
  })
})
