import type { Meta, StoryObj } from "@storybook/react"
import LoadingSpinner from "../LoadingSpinner"

const loadingSpinnerStoryMetaConfiguration: Meta<typeof LoadingSpinner> = {
  title: "Theme/LoadingSpinner",
  component: LoadingSpinner,
  args: {
    size: "medium",
  },
}

export default loadingSpinnerStoryMetaConfiguration

type LoadingSpinnerStory = StoryObj<typeof loadingSpinnerStoryMetaConfiguration>

export const Playground: LoadingSpinnerStory = {}

export const Sizes: LoadingSpinnerStory = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "20px" }}>
      <LoadingSpinner size="small" />
      <LoadingSpinner size="medium" />
      <LoadingSpinner size="large" />
    </div>
  ),
}

export const WithLabel: LoadingSpinnerStory = {
  render: () => (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "20px", alignItems: "center" }}
    >
      <LoadingSpinner size="small" label="Loading..." />
      <LoadingSpinner size="medium" label="Processing request" />
      <LoadingSpinner size="large" label="Fetching data" />
    </div>
  ),
}

export const Centered: LoadingSpinnerStory = {
  render: () => (
    <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <LoadingSpinner size="large" label="Loading content" />
    </div>
  ),
}
