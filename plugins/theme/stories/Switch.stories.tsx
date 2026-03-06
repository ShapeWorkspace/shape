import type { Meta, StoryObj } from "@storybook/react"
import Switch from "../Switch"

const switchStoryMetaConfiguration: Meta<typeof Switch> = {
  title: "Theme/Switch",
  component: Switch,
  args: {
    checked: true,
    disabled: false,
    label: "Pangram",
    children: "The quick brown fox jumps over the lazy dog.",
    onChange: () => {},
  },
}

export default switchStoryMetaConfiguration

type SwitchStory = StoryObj<typeof switchStoryMetaConfiguration>

export const Playground: SwitchStory = {}
