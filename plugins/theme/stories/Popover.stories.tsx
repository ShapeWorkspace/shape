import type { Meta, StoryObj } from "@storybook/react"
import Popover from "../Popover"
import Button from "../Button"

const popoverStoryMetaConfiguration: Meta<typeof Popover> = {
  title: "Theme/Popover",
  component: Popover,
  args: {
    trigger: <Button>Open Popover</Button>,
    children: (
      <div style={{ padding: "12px 16px" }}>
        <p>Popover content goes here</p>
      </div>
    ),
    width: 220,
  },
}

export default popoverStoryMetaConfiguration

type PopoverStory = StoryObj<typeof popoverStoryMetaConfiguration>

export const Playground: PopoverStory = {}

export const WithMenuItems: PopoverStory = {
  render: () => (
    <div style={{ padding: "100px" }}>
      <Popover trigger={<Button>Options</Button>} width={200}>
        <div style={{ padding: "8px 0" }}>
          <button
            style={{
              display: "block",
              width: "100%",
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
          <button
            style={{
              display: "block",
              width: "100%",
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Duplicate
          </button>
          <button
            style={{
              display: "block",
              width: "100%",
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              color: "#d26a49",
            }}
          >
            Delete
          </button>
        </div>
      </Popover>
    </div>
  ),
}

export const CustomWidth: PopoverStory = {
  render: () => (
    <div style={{ padding: "100px" }}>
      <Popover trigger={<Button>Wide Popover</Button>} width={400}>
        <div style={{ padding: "16px" }}>
          <h3 style={{ margin: "0 0 8px" }}>Custom Width</h3>
          <p style={{ margin: 0, color: "#666" }}>
            This popover has a custom width of 400px to accommodate more content.
          </p>
        </div>
      </Popover>
    </div>
  ),
}

export const PositionedAtBottom: PopoverStory = {
  render: () => (
    <div style={{ paddingTop: "20px" }}>
      <Popover trigger={<Button>Near Top Edge</Button>} width={220}>
        <div style={{ padding: "12px 16px" }}>
          <p style={{ margin: 0 }}>
            This popover will appear below the trigger since there is not enough space above.
          </p>
        </div>
      </Popover>
    </div>
  ),
}
