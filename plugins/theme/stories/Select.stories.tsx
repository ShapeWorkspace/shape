import type { Meta, StoryObj } from "@storybook/react"
import Select from "../Select"

const selectStoryMetaConfiguration: Meta<typeof Select> = {
  title: "Theme/Select",
  component: Select,
  args: {
    name: "select",
    defaultValue: "option1",
    disabled: false,
  },
}

export default selectStoryMetaConfiguration

type SelectStory = StoryObj<typeof selectStoryMetaConfiguration>

const selectOptions = [
  { value: "option1", label: "Option 1" },
  { value: "option2", label: "Option 2" },
  { value: "option3", label: "Option 3" },
  { value: "option4", label: "Option 4" },
]

export const Playground: SelectStory = {
  render: storyArgs => (
    <Select {...storyArgs}>
      {selectOptions.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  ),
}
