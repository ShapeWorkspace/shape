/**
 * Unit tests for BuildUserKeyBundleAssociatedData.
 */

import { describe, it, expect } from "vitest"
import { BuildUserKeyBundleAssociatedData } from "./BuildUserKeyBundleAssociatedData"

describe("BuildUserKeyBundleAssociatedData", () => {
  it("formats associated data with normalized email", () => {
    const buildUserKeyBundleAssociatedData = new BuildUserKeyBundleAssociatedData()

    const result = buildUserKeyBundleAssociatedData.execute("  USER@Example.com ", "bundle-123")

    expect(result).toBe("shape:v1:user:user@example.com:-:-:keybundle:bundle-123")
  })
})
