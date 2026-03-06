import type { Meta, StoryObj } from "@storybook/react"
import Tooltip from "../Tooltip"
import Button from "../Button"

const tooltipStoryMetaConfiguration: Meta<typeof Tooltip> = {
  title: "Theme/Tooltip",
  component: Tooltip,
  args: {
    content: "This is a tooltip",
    placement: "right",
    delay: 0,
    multiline: false,
    children: <Button>Hover me</Button>,
  },
}

export default tooltipStoryMetaConfiguration

type TooltipStory = StoryObj<typeof tooltipStoryMetaConfiguration>

export const Playground: TooltipStory = {}

export const Placements: TooltipStory = {
  render: () => (
    <div style={{ display: "flex", gap: "20px", padding: "40px", flexWrap: "wrap" }}>
      <Tooltip content="Top placement" placement="top">
        <Button>Top</Button>
      </Tooltip>
      <Tooltip content="Right placement" placement="right">
        <Button>Right</Button>
      </Tooltip>
      <Tooltip content="Bottom placement" placement="bottom">
        <Button>Bottom</Button>
      </Tooltip>
      <Tooltip content="Left placement" placement="left">
        <Button>Left</Button>
      </Tooltip>
    </div>
  ),
}

export const WithDelay: TooltipStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <Tooltip content="This tooltip appears after 500ms" delay={500}>
        <Button>Hover with delay</Button>
      </Tooltip>
    </div>
  ),
}

export const Multiline: TooltipStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <Tooltip
        content="This is a longer tooltip that wraps across multiple lines when multiline is enabled"
        multiline
      >
        <Button>Multiline tooltip</Button>
      </Tooltip>
    </div>
  ),
}
