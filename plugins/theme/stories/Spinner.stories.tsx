import type { Meta, StoryObj } from "@storybook/react"
import Spinner from "../Spinner"

const spinnerStoryMetaConfiguration: Meta<typeof Spinner> = {
  title: "Theme/Spinner",
  component: Spinner,
  args: {
    size: "md",
    inline: true,
  },
}

export default spinnerStoryMetaConfiguration

type SpinnerStory = StoryObj<typeof spinnerStoryMetaConfiguration>

export const Playground: SpinnerStory = {}

export const Sizes: SpinnerStory = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px" }}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
}

export const WithLabel: SpinnerStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <Spinner size="sm" label="Loading..." />
      <Spinner size="md" label="Processing request" />
      <Spinner size="lg" label="Fetching data" />
    </div>
  ),
}

export const InlineVsBlock: SpinnerStory = {
  render: () => (
    <div style={{ padding: "20px" }}>
      <p>
        Inline spinner: <Spinner size="sm" inline /> (renders as span)
      </p>
      <div style={{ marginTop: "16px" }}>
        Block spinner: <Spinner size="md" inline={false} /> (renders as div)
      </div>
    </div>
  ),
}
