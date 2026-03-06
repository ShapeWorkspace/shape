import type { Meta, StoryObj } from "@storybook/react"
import { PillSegmentedControl } from "../PillSegmentedControl"

const pillOptions = [
  { value: "all", label: "All" },
  { value: "mentions", label: "Mentions", badge: true },
  { value: "assigned", label: "Assigned", count: 2 },
] as const

const pillSegmentedControlStoryMetaConfiguration: Meta<typeof PillSegmentedControl> = {
  title: "Theme/PillSegmentedControl",
  component: PillSegmentedControl,
  args: {
    options: pillOptions,
    value: pillOptions[0].value,
    disabled: false,
  },
}

export default pillSegmentedControlStoryMetaConfiguration

type PillSegmentedControlStory = StoryObj<typeof pillSegmentedControlStoryMetaConfiguration>

export const Playground: PillSegmentedControlStory = {}
