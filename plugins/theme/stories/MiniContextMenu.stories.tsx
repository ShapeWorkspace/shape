import type { Meta, StoryObj } from "@storybook/react"
import MiniContextMenu from "../MiniContextMenu"
import { Copy, MoreHorizontal, Quote, Trash2 } from "lucide-react"

const miniContextMenuStoryMetaConfiguration: Meta<typeof MiniContextMenu> = {
  title: "Theme/MiniContextMenu",
  component: MiniContextMenu,
  args: {
    isVisible: true,
    items: [
      {
        icon: <Copy size={16} />,
        onClick: () => {},
        ariaLabel: "Copy",
        tooltip: "Copy",
      },
      {
        icon: <Quote size={16} />,
        onClick: () => {},
        ariaLabel: "Quote",
        tooltip: "Reply with quote",
      },
      {
        icon: <MoreHorizontal size={16} />,
        onClick: () => {},
        ariaLabel: "More options",
        tooltip: "More options",
      },
    ],
  },
}

export default miniContextMenuStoryMetaConfiguration

type MiniContextMenuStory = StoryObj<typeof miniContextMenuStoryMetaConfiguration>

export const Playground: MiniContextMenuStory = {}

export const Hidden: MiniContextMenuStory = {
  args: {
    isVisible: false,
  },
}

export const WithManyItems: MiniContextMenuStory = {
  args: {
    items: [
      {
        icon: <Copy size={16} />,
        onClick: () => {},
        ariaLabel: "Copy",
        tooltip: "Copy",
      },
      {
        icon: <Quote size={16} />,
        onClick: () => {},
        ariaLabel: "Quote",
        tooltip: "Reply with quote",
      },
      {
        icon: <Trash2 size={16} />,
        onClick: () => {},
        ariaLabel: "Delete",
        tooltip: "Delete",
      },
      {
        icon: <MoreHorizontal size={16} />,
        onClick: () => {},
        ariaLabel: "More options",
        tooltip: "More options",
      },
    ],
  },
}

export const WithoutTooltips: MiniContextMenuStory = {
  args: {
    items: [
      {
        icon: <Copy size={16} />,
        onClick: () => {},
        ariaLabel: "Copy",
      },
      {
        icon: <Quote size={16} />,
        onClick: () => {},
        ariaLabel: "Quote",
      },
      {
        icon: <MoreHorizontal size={16} />,
        onClick: () => {},
        ariaLabel: "More options",
      },
    ],
  },
}
