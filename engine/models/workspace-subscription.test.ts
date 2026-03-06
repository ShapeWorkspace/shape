import { describe, expect, it } from "vitest"
import { WorkspaceSubscription } from "./workspace-subscription"

const baseDto = {
  workspace_id: "workspace",
  status: "active",
  seats_purchased: 5,
  seats_used: 3,
  seats_available: 2,
  trial_ends_at: null,
  current_period_end: null,
  cancel_at_period_end: false,
  is_trial_active: false,
  is_read_only: false,
}

describe("WorkspaceSubscription", () => {
  it("reports seat shortage when purchased seats are exhausted", () => {
    const subscription = WorkspaceSubscription.fromServerDto({
      ...baseDto,
      seats_purchased: 2,
      seats_used: 4,
      seats_available: 0,
    })
    expect(subscription.hasSeatShortage).toBe(true)
  })

  it("ignores seat shortage during active trial", () => {
    const subscription = WorkspaceSubscription.fromServerDto({
      ...baseDto,
      seats_purchased: 0,
      seats_used: 10,
      seats_available: 0,
      is_trial_active: true,
    })
    expect(subscription.hasSeatShortage).toBe(false)
  })
})
