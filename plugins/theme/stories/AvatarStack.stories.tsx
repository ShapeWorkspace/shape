import type { Meta, StoryObj } from "@storybook/react"
import AvatarStack from "../AvatarStack"

const avatarStackStoryMetaConfiguration: Meta<typeof AvatarStack> = {
  title: "Theme/AvatarStack",
  component: AvatarStack,
  args: {
    avatars: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }],
    max: 3,
    size: "md",
  },
}

export default avatarStackStoryMetaConfiguration

type AvatarStackStory = StoryObj<typeof avatarStackStoryMetaConfiguration>

export const Playground: AvatarStackStory = {}

export const TwoUsers: AvatarStackStory = {
  args: {
    avatars: [{ name: "Alice" }, { name: "Bob" }],
    max: 3,
    size: "md",
  },
}

export const ThreeUsers: AvatarStackStory = {
  args: {
    avatars: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }],
    max: 3,
    size: "md",
  },
}

export const FiveUsers: AvatarStackStory = {
  args: {
    avatars: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }, { name: "Diana" }, { name: "Eve" }],
    max: 3,
    size: "md",
  },
}

export const CustomMax: AvatarStackStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
      <div>
        <div style={{ marginBottom: "8px", fontSize: "14px", color: "#666" }}>max=4</div>
        <AvatarStack
          avatars={[
            { name: "Alice" },
            { name: "Bob" },
            { name: "Charlie" },
            { name: "Diana" },
            { name: "Eve" },
          ]}
          max={4}
          size="md"
        />
      </div>
      <div>
        <div style={{ marginBottom: "8px", fontSize: "14px", color: "#666" }}>max=5</div>
        <AvatarStack
          avatars={[
            { name: "Alice" },
            { name: "Bob" },
            { name: "Charlie" },
            { name: "Diana" },
            { name: "Eve" },
            { name: "Frank" },
          ]}
          max={5}
          size="md"
        />
      </div>
    </div>
  ),
}

export const Sizes: AvatarStackStory = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "20px",
        alignItems: "flex-start",
      }}
    >
      <AvatarStack
        avatars={[
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          { name: "Diana" },
          { name: "Eve" },
        ]}
        max={3}
        size="xs"
      />
      <AvatarStack
        avatars={[
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          { name: "Diana" },
          { name: "Eve" },
        ]}
        max={3}
        size="sm"
      />
      <AvatarStack
        avatars={[
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          { name: "Diana" },
          { name: "Eve" },
        ]}
        max={3}
        size="md"
      />
      <AvatarStack
        avatars={[
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          { name: "Diana" },
          { name: "Eve" },
        ]}
        max={3}
        size="lg"
      />
      <AvatarStack
        avatars={[
          { name: "Alice" },
          { name: "Bob" },
          { name: "Charlie" },
          { name: "Diana" },
          { name: "Eve" },
        ]}
        max={3}
        size="xl"
      />
    </div>
  ),
}

export const WithPhotos: AvatarStackStory = {
  args: {
    avatars: [
      { name: "Sarah", url: "https://i.pravatar.cc/150?img=1" },
      { name: "Michael", url: "https://i.pravatar.cc/150?img=2" },
      { name: "Rachel", url: "https://i.pravatar.cc/150?img=3" },
      { name: "Kevin", url: "https://i.pravatar.cc/150?img=4" },
      { name: "Emma", url: "https://i.pravatar.cc/150?img=5" },
    ],
    max: 3,
    size: "md",
  },
}
