import { describe, it, expect } from "vitest"
import { ClientUser } from "./client_user"

describe("ClientUser", () => {
  describe("UnknownUserWithUuid", () => {
    it("returns a placeholder user that preserves provided uuid", () => {
      const suppliedUuid = "reply-author"
      const placeholder = ClientUser.UnknownUserWithUuid(suppliedUuid)

      expect(placeholder.uuid).toBe(suppliedUuid)
      expect(ClientUser.UnknownUser().uuid).toBe("unknown")
    })
  })

  describe("canDirectMessage", () => {
    it("returns true for every user", () => {
      const user = new ClientUser({
        uuid: "user",
        email: "user@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      expect(user.canDirectMessage()).toBe(true)
    })
  })
})
