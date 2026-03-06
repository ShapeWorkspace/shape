import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { ReactionPicker } from "./ReactionPicker"

let isMobile = false

vi.mock("../../hooks/use-is-breakpoint", () => ({
  useIsBreakpoint: () => isMobile,
}))

vi.mock("../tiptap-ui-primitive/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@emoji-mart/data", () => ({
  default: {},
}))

vi.mock("@emoji-mart/react", () => ({
  default: ({ onEmojiSelect }: { onEmojiSelect: (selection: { native: string }) => void }) => (
    <button
      type="button"
      data-testid="emoji-mart-picker"
      onClick={() => onEmojiSelect({ native: "🌟" })}
    >
      Emoji picker
    </button>
  ),
}))

describe("ReactionPicker", () => {
  beforeEach(() => {
    isMobile = false
  })

  it("renders quick picks and invokes the handler on desktop", () => {
    const onEmojiSelect = vi.fn()

    render(<ReactionPicker onEmojiSelect={onEmojiSelect} testId="reaction-add" />)

    const quickPick = screen.getByTestId("reaction-add-quick-0")
    fireEvent.click(quickPick)

    expect(onEmojiSelect).toHaveBeenCalledWith("👍")
  })

  it("opens the mobile picker overlay and closes after selection", async () => {
    isMobile = true
    const onEmojiSelect = vi.fn()

    render(<ReactionPicker onEmojiSelect={onEmojiSelect} testId="reaction-add" />)

    const addButton = screen.getByTestId("reaction-add")
    fireEvent.click(addButton)

    expect(screen.getByRole("dialog")).toBeInTheDocument()

    const quickPick = screen.getByTestId("reaction-add-quick-0")
    fireEvent.click(quickPick)

    expect(onEmojiSelect).toHaveBeenCalledWith("👍")

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })
})
