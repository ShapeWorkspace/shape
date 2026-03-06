import type { Meta, StoryObj } from "@storybook/react"
import Button from "../Button"

const buttonStoryMetaConfiguration: Meta<typeof Button> = {
  title: "Theme/Button",
  component: Button,
  args: {
    children: "Default button",
    kind: "outline",
    variant: "weak",
    size: "regular",
    disabled: false,
    onClick: () => {},
  },
}

export default buttonStoryMetaConfiguration

type ButtonStory = StoryObj<typeof buttonStoryMetaConfiguration>

export const Playground: ButtonStory = {}
