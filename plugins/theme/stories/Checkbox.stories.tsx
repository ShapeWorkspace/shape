import type { Meta, StoryObj } from "@storybook/react"
import Checkbox from "../Checkbox"

const checkboxStoryMetaConfiguration: Meta<typeof Checkbox> = {
  title: "Theme/Checkbox",
  component: Checkbox,
  args: {
    checked: false,
    disabled: false,
    size: "md",
    label: "Checkbox label",
  },
}

export default checkboxStoryMetaConfiguration

type CheckboxStory = StoryObj<typeof checkboxStoryMetaConfiguration>

export const Playground: CheckboxStory = {}

export const Sizes: CheckboxStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <Checkbox size="sm" label="Small checkbox" />
      <Checkbox size="md" label="Medium checkbox" />
      <Checkbox size="lg" label="Large checkbox" />
    </div>
  ),
}

export const States: CheckboxStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <Checkbox label="Unchecked" />
      <Checkbox checked label="Checked" />
      <Checkbox disabled label="Disabled unchecked" />
      <Checkbox checked disabled label="Disabled checked" />
    </div>
  ),
}
