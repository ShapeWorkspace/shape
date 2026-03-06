import type { Meta, StoryObj } from "@storybook/react"
import KeyboardShortcut from "../KeyboardShortcut"

const keyboardShortcutStoryMetaConfiguration: Meta<typeof KeyboardShortcut> = {
  title: "Theme/KeyboardShortcut",
  component: KeyboardShortcut,
  args: {
    keys: ["Mod", "Enter"],
    separator: "+",
  },
}

export default keyboardShortcutStoryMetaConfiguration

type KeyboardShortcutStory = StoryObj<typeof keyboardShortcutStoryMetaConfiguration>

export const Playground: KeyboardShortcutStory = {}

export const MacPlatform: KeyboardShortcutStory = {
  args: {
    keys: ["Mod", "Enter"],
    platform: "mac",
  },
}

export const WindowsPlatform: KeyboardShortcutStory = {
  args: {
    keys: ["Mod", "Enter"],
    platform: "windows",
  },
}

export const CommonShortcuts: KeyboardShortcutStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px" }}>
      <div>
        <strong>Copy:</strong> <KeyboardShortcut keys={["Mod", "C"]} platform="mac" />
      </div>
      <div>
        <strong>Paste:</strong> <KeyboardShortcut keys={["Mod", "V"]} platform="mac" />
      </div>
      <div>
        <strong>Save:</strong> <KeyboardShortcut keys={["Mod", "S"]} platform="mac" />
      </div>
      <div>
        <strong>Undo:</strong> <KeyboardShortcut keys={["Mod", "Z"]} platform="mac" />
      </div>
      <div>
        <strong>Redo:</strong> <KeyboardShortcut keys={["Shift", "Mod", "Z"]} platform="mac" />
      </div>
      <div>
        <strong>Find:</strong> <KeyboardShortcut keys={["Mod", "F"]} platform="mac" />
      </div>
    </div>
  ),
}

export const CustomSeparator: KeyboardShortcutStory = {
  args: {
    keys: ["Mod", "Shift", "K"],
    separator: " ",
  },
}

export const CustomAriaLabel: KeyboardShortcutStory = {
  args: {
    keys: ["Mod", "K"],
    ariaLabel: "Command palette shortcut",
  },
}
