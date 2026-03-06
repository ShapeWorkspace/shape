import type { Meta, StoryObj } from "@storybook/react"
import ContextMenu from "../ContextMenu"
import RightClickContextMenu from "../RightClickContextMenu"
import { Copy, Edit, Trash2, Settings } from "lucide-react"
import Button from "../Button"

const contextMenuStoryMetaConfiguration: Meta<typeof ContextMenu> = {
  title: "Theme/ContextMenu",
  component: ContextMenu,
  args: {
    items: [
      { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
      { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
      { label: "Delete", icon: <Trash2 size={16} />, destructive: true, onClick: () => {} },
    ],
    ariaLabel: "Open menu",
    alwaysVisible: true,
  },
}

export default contextMenuStoryMetaConfiguration

type ContextMenuStory = StoryObj<typeof contextMenuStoryMetaConfiguration>

export const Playground: ContextMenuStory = {}

export const WithIcons: ContextMenuStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <ContextMenu
        alwaysVisible
        items={[
          { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
          { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
          { label: "Settings", icon: <Settings size={16} />, onClick: () => {} },
        ]}
      />
    </div>
  ),
}

export const Destructive: ContextMenuStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <ContextMenu
        alwaysVisible
        items={[
          { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
          { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
          { label: "Delete", icon: <Trash2 size={16} />, destructive: true, onClick: () => {} },
        ]}
      />
    </div>
  ),
}

export const Sections: ContextMenuStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <ContextMenu
        alwaysVisible
        items={[
          { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
          { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
          { label: "", isSeparator: true },
          { label: "Actions", isSectionHeader: true },
          { label: "Settings", icon: <Settings size={16} />, onClick: () => {} },
          { label: "", isSeparator: true },
          { label: "Danger Zone", isSectionHeader: true },
          { label: "Delete", icon: <Trash2 size={16} />, destructive: true, onClick: () => {} },
        ]}
      />
    </div>
  ),
}

export const RightClick: StoryObj<typeof RightClickContextMenu> = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <RightClickContextMenu
        items={[
          { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
          { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
          { label: "", isSeparator: true },
          { label: "Delete", icon: <Trash2 size={16} />, destructive: true, onClick: () => {} },
        ]}
      >
        <div
          style={{
            padding: "20px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            backgroundColor: "#f5f5f5",
            cursor: "context-menu",
          }}
        >
          Right-click me to open context menu
        </div>
      </RightClickContextMenu>
    </div>
  ),
}

export const CustomTrigger: ContextMenuStory = {
  render: () => (
    <div style={{ padding: "40px" }}>
      <ContextMenu
        alwaysVisible
        trigger={<Button>Custom Trigger</Button>}
        items={[
          { label: "Edit", icon: <Edit size={16} />, onClick: () => {} },
          { label: "Copy", icon: <Copy size={16} />, onClick: () => {} },
          { label: "Delete", icon: <Trash2 size={16} />, destructive: true, onClick: () => {} },
        ]}
      />
    </div>
  ),
}
