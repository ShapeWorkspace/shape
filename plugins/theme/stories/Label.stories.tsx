import type { Meta, StoryObj } from "@storybook/react"
import { Drama } from "lucide-react"
import { Label } from "../Label"

const labelStoryMetaConfiguration: Meta<typeof Label> = {
  title: "Theme/Label",
  component: Label,
  args: {
    signal: "success",
    text: "Pangram",
    supportingText: "The quick brown fox jumps over the lazy dog.",
    icon: <Drama size={16} aria-hidden="true" />,
  },
}

export default labelStoryMetaConfiguration

type LabelStory = StoryObj<typeof labelStoryMetaConfiguration>

export const Playground: LabelStory = {}
