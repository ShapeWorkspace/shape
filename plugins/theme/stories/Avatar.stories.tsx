import type { Meta, StoryObj } from "@storybook/react"
import Avatar from "../Avatar"

const avatarStoryMetaConfiguration: Meta<typeof Avatar> = {
  title: "Theme/Avatar",
  component: Avatar,
  args: {
    name: "John Doe",
    size: "md",
  },
}

export default avatarStoryMetaConfiguration

type AvatarStory = StoryObj<typeof avatarStoryMetaConfiguration>

export const Playground: AvatarStory = {}

export const Sizes: AvatarStory = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px" }}>
      <Avatar name="Alice" size="xs" />
      <Avatar name="Bob" size="sm" />
      <Avatar name="Charlie" size="md" />
      <Avatar name="Diana" size="lg" />
      <Avatar name="Eve" size="xl" />
    </div>
  ),
}

export const WithPhotos: AvatarStory = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px" }}>
      <Avatar name="Sarah" url="https://i.pravatar.cc/150?img=1" size="sm" />
      <Avatar name="Michael" url="https://i.pravatar.cc/150?img=2" size="md" />
      <Avatar name="Rachel" url="https://i.pravatar.cc/150?img=3" size="lg" />
      <Avatar name="Kevin" url="https://i.pravatar.cc/150?img=4" size="xl" />
    </div>
  ),
}

export const WithoutPhotos: AvatarStory = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px" }}>
      <Avatar name="Slate" size="md" />
      <Avatar name="Violet" size="md" />
      <Avatar name="Berry" size="md" />
      <Avatar name="Rose" size="md" />
      <Avatar name="Coral" size="md" />
      <Avatar name="Amber" size="md" />
      <Avatar name="Sand" size="md" />
      <Avatar name="Sage" size="md" />
      <Avatar name="Teal" size="md" />
      <Avatar name="Ocean" size="md" />
    </div>
  ),
}

export const ColorVariations: AvatarStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Avatar name="Alice" size="md" />
        <Avatar name="Bob" size="md" />
        <Avatar name="Charlie" size="md" />
        <Avatar name="Diana" size="md" />
        <Avatar name="Eve" size="md" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Avatar name="Frank" size="md" />
        <Avatar name="Grace" size="md" />
        <Avatar name="Henry" size="md" />
        <Avatar name="Iris" size="md" />
        <Avatar name="Jack" size="md" />
      </div>
    </div>
  ),
}
