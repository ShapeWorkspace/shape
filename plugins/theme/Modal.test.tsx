import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import Modal from "./Modal"

describe("Modal heading test id", () => {
  it("derives heading test id from title by default", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Discussion Settings">
        <div>content</div>
      </Modal>
    )

    expect(screen.getByTestId("discussion-settings-heading")).toBeInTheDocument()
  })

  it("respects explicit heading test id override", () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Discussion Settings"
        headingTestId="discussion-settings-heading"
      >
        <div>content</div>
      </Modal>
    )

    expect(screen.getByTestId("discussion-settings-heading")).toBeInTheDocument()
  })
})
