import { render } from "@react-email/render"
import { describe, expect, it } from "vitest"
import React from "react"
import WelcomeEmail from "./WelcomeEmail"

describe("WelcomeEmail", () => {
  it("matches the current homepage positioning", () => {
    const html = render(
      <WelcomeEmail userName="Test User" appName="Shape" appUrl="https://app.shape.test" colors={{}} />
    )

    expect(html).toContain("Meet Shape. A radically simple new way to work.")
    expect(html).toContain("Everyone wants to IPO.")
    expect(html).toContain("Shape exists to return essential technologies to their pure form.")
    expect(html).toContain("not revenue extraction, but fulfillment of purpose")
    expect(html).toContain("Start with a discussion that matters.")
    expect(html).not.toContain("most tools mistake motion for progress")
    expect(html).not.toContain("build from there")
  })
})
