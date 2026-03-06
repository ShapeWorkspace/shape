import type { Meta, StoryObj } from "@storybook/react"
import { CalloutHUD } from "../CalloutHUD"
import { Info, AlertCircle, CheckCircle2 } from "lucide-react"

const calloutHUDStoryMetaConfiguration: Meta<typeof CalloutHUD> = {
  title: "Theme/CalloutHUD",
  component: CalloutHUD,
  args: {
    icon: <Info size={16} />,
    children: "This is a helpful callout message",
    closeable: false,
    tone: "normal",
  },
}

export default calloutHUDStoryMetaConfiguration

type CalloutHUDStory = StoryObj<typeof calloutHUDStoryMetaConfiguration>

export const Playground: CalloutHUDStory = {}

export const Tones: CalloutHUDStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <CalloutHUD icon={<Info size={16} />} tone="normal">
        Normal tone callout with subtle background
      </CalloutHUD>
      <CalloutHUD icon={<AlertCircle size={16} />} tone="contrast">
        Contrast tone callout with border and stronger background
      </CalloutHUD>
    </div>
  ),
}

export const Closeable: CalloutHUDStory = {
  render: () => (
    <div style={{ padding: "20px" }}>
      <CalloutHUD icon={<Info size={16} />} closeable>
        This callout can be dismissed by clicking the close button
      </CalloutHUD>
    </div>
  ),
}

export const Clickable: CalloutHUDStory = {
  render: () => (
    <div style={{ padding: "20px" }}>
      <CalloutHUD icon={<CheckCircle2 size={16} />} onClick={() => alert("Callout clicked!")}>
        Click anywhere on this callout to trigger an action
      </CalloutHUD>
    </div>
  ),
}

export const WithIconVariants: CalloutHUDStory = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
      <CalloutHUD icon={<Info size={16} />}>Information callout with info icon</CalloutHUD>
      <CalloutHUD icon={<AlertCircle size={16} />}>Warning callout with alert icon</CalloutHUD>
      <CalloutHUD icon={<CheckCircle2 size={16} />}>Success callout with check icon</CalloutHUD>
    </div>
  ),
}
