import type { Meta, StoryObj } from "@storybook/react"
import { SegmentedControl } from "../SegmentedControl"

const segmentOptions = [
  { value: "inbox", label: "Inbox" },
  { value: "follow-ups", label: "Follow-ups", count: 4 },
  { value: "archived", label: "Archived" },
] as const

const segmentedControlStoryMetaConfiguration: Meta<typeof SegmentedControl> = {
  title: "Theme/SegmentedControl",
  component: SegmentedControl,
  args: {
    options: segmentOptions,
    value: segmentOptions[0].value,
    disabled: false,
  },
}

export default segmentedControlStoryMetaConfiguration

type SegmentedControlStory = StoryObj<typeof segmentedControlStoryMetaConfiguration>

export const Playground: SegmentedControlStory = {}
