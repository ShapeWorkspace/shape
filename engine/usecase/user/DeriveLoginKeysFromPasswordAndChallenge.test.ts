/**
 * Unit tests for DeriveLoginKeysFromPasswordAndChallenge.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { Crypto } from "../../crypto/crypto"
import { LoginChallengeResponse } from "../../models/auth-types"
import { DeriveLoginKeysFromPasswordAndChallenge } from "./DeriveLoginKeysFromPasswordAndChallenge"

describe("DeriveLoginKeysFromPasswordAndChallenge", () => {
  let crypto: Crypto
  let deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge

  beforeAll(async () => {
    crypto = new Crypto()
    await crypto.initialize()
  })

  beforeEach(() => {
    // Fresh instance per test keeps derived outputs isolated.
    deriveLoginKeysFromPasswordAndChallenge = new DeriveLoginKeysFromPasswordAndChallenge(crypto)
  })

  it("returns correct structure with all required fields", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "a".repeat(32), // 16 bytes as hex
      kdf_version: 1,
    }

    const result = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)

    expect(result).toHaveProperty("serverPassword")
    expect(result).toHaveProperty("pwKek")
  })

  it("generates hex strings of correct length", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "b".repeat(32),
      kdf_version: 1,
    }

    const result = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)

    // Both should be 32 bytes = 64 hex chars
    expect(result.serverPassword).toHaveLength(64)
    expect(result.serverPassword).toMatch(/^[0-9a-f]+$/i)
    expect(result.pwKek).toHaveLength(64)
    expect(result.pwKek).toMatch(/^[0-9a-f]+$/i)
  })

  it("is deterministic: same inputs produce same outputs", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "c".repeat(32),
      kdf_version: 1,
    }

    const result1 = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)
    const result2 = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)

    expect(result1.serverPassword).toBe(result2.serverPassword)
    expect(result1.pwKek).toBe(result2.pwKek)
  })

  it("different passwords produce different keys", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "d".repeat(32),
      kdf_version: 1,
    }

    const result1 = deriveLoginKeysFromPasswordAndChallenge.execute("password1", challenge)
    const result2 = deriveLoginKeysFromPasswordAndChallenge.execute("password2", challenge)

    expect(result1.serverPassword).not.toBe(result2.serverPassword)
    expect(result1.pwKek).not.toBe(result2.pwKek)
  })

  it("different salts produce different keys", () => {
    const challenge1: LoginChallengeResponse = {
      pw_salt: "e".repeat(32),
      kdf_version: 1,
    }
    const challenge2: LoginChallengeResponse = {
      pw_salt: "f".repeat(32),
      kdf_version: 1,
    }

    const result1 = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge1)
    const result2 = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge2)

    expect(result1.serverPassword).not.toBe(result2.serverPassword)
    expect(result1.pwKek).not.toBe(result2.pwKek)
  })

  it("server_password differs from pw_kek (different subkey IDs)", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "1".repeat(32),
      kdf_version: 1,
    }

    const result = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)

    expect(result.serverPassword).not.toBe(result.pwKek)
  })

  it("handles unknown KDF version by defaulting to version 1", () => {
    const challenge: LoginChallengeResponse = {
      pw_salt: "2".repeat(32),
      kdf_version: 999, // Unknown version
    }

    const result = deriveLoginKeysFromPasswordAndChallenge.execute("securePassword123!", challenge)

    expect(result.serverPassword).toHaveLength(64)
    expect(result.pwKek).toHaveLength(64)
  })
})
