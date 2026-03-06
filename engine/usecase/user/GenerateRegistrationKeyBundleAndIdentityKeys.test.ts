/**
 * Unit tests for GenerateRegistrationKeyBundleAndIdentityKeys.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { Crypto } from "../../crypto/crypto"
import { BuildUserKeyBundleAssociatedData } from "./BuildUserKeyBundleAssociatedData"
import { GenerateRegistrationKeyBundleAndIdentityKeys } from "./GenerateRegistrationKeyBundleAndIdentityKeys"

describe("GenerateRegistrationKeyBundleAndIdentityKeys", () => {
  let crypto: Crypto
  let generateRegistrationKeyBundleAndIdentityKeys: GenerateRegistrationKeyBundleAndIdentityKeys

  beforeAll(async () => {
    crypto = new Crypto()
    await crypto.initialize()
  })

  beforeEach(() => {
    const buildUserKeyBundleAssociatedData = new BuildUserKeyBundleAssociatedData()

    generateRegistrationKeyBundleAndIdentityKeys = new GenerateRegistrationKeyBundleAndIdentityKeys(
      crypto,
      buildUserKeyBundleAssociatedData
    )
  })

  it("generates all required crypto fields with correct structure", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result).toHaveProperty("serverPassword")
    expect(result).toHaveProperty("cryptoFields")
    expect(result).toHaveProperty("identityKeys")
    expect(result).toHaveProperty("keyBundle")

    expect(result.cryptoFields).toHaveProperty("crypto_bundle_id")
    expect(result.cryptoFields).toHaveProperty("protocol_version")
    expect(result.cryptoFields).toHaveProperty("pw_salt")
    expect(result.cryptoFields).toHaveProperty("enc_key_bundle_nonce")
    expect(result.cryptoFields).toHaveProperty("enc_key_bundle")
    expect(result.cryptoFields).toHaveProperty("box_public_key")
    expect(result.cryptoFields).toHaveProperty("sign_public_key")

    expect(result.identityKeys).toHaveProperty("userId")
    expect(result.identityKeys).toHaveProperty("boxKeyPair")
    expect(result.identityKeys).toHaveProperty("signKeyPair")
    expect(result.identityKeys.boxKeyPair).toHaveProperty("publicKey")
    expect(result.identityKeys.boxKeyPair).toHaveProperty("privateKey")
    expect(result.identityKeys.signKeyPair).toHaveProperty("publicKey")
    expect(result.identityKeys.signKeyPair).toHaveProperty("privateKey")

    expect(result.keyBundle).toHaveProperty("v")
    expect(result.keyBundle).toHaveProperty("userId")
    expect(result.keyBundle).toHaveProperty("bundleId")
    expect(result.keyBundle).toHaveProperty("createdAt")
    expect(result.keyBundle).toHaveProperty("boxSeed")
    expect(result.keyBundle).toHaveProperty("signSeed")
  })

  it("generates hex strings of correct lengths", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.serverPassword).toMatch(/^[0-9a-f]+$/i)

    expect(result.cryptoFields.pw_salt).toHaveLength(32)
    expect(result.cryptoFields.pw_salt).toMatch(/^[0-9a-f]+$/i)

    expect(result.cryptoFields.enc_key_bundle_nonce).toHaveLength(48)
    expect(result.cryptoFields.enc_key_bundle_nonce).toMatch(/^[0-9a-f]+$/i)

    expect(result.cryptoFields.box_public_key).toHaveLength(64)
    expect(result.cryptoFields.box_public_key).toMatch(/^[0-9a-f]+$/i)

    expect(result.cryptoFields.sign_public_key).toHaveLength(64)
    expect(result.cryptoFields.sign_public_key).toMatch(/^[0-9a-f]+$/i)

    expect(result.identityKeys.boxKeyPair.publicKey).toHaveLength(64)
    expect(result.identityKeys.boxKeyPair.privateKey).toHaveLength(64)

    expect(result.identityKeys.signKeyPair.publicKey).toHaveLength(64)
    expect(result.identityKeys.signKeyPair.privateKey).toHaveLength(128)

    expect(result.cryptoFields.enc_key_bundle).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it("sets correct protocol version", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result.cryptoFields.protocol_version).toBe(1)
  })

  it("sets correct userId in identity keys", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result.identityKeys.userId).toBe("test-user-uuid-12345")
    expect(result.keyBundle.userId).toBe("test-user-uuid-12345")
  })

  it("generates unique bundle IDs on each call", async () => {
    const result1 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )
    const result2 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result1.cryptoFields.crypto_bundle_id).not.toBe(result2.cryptoFields.crypto_bundle_id)
    expect(result1.keyBundle.bundleId).not.toBe(result2.keyBundle.bundleId)
  })

  it("generates unique salts on each call", async () => {
    const result1 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )
    const result2 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result1.cryptoFields.pw_salt).not.toBe(result2.cryptoFields.pw_salt)
  })

  it("generates unique identity keys on each call", async () => {
    const result1 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )
    const result2 = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result1.identityKeys.boxKeyPair.publicKey).not.toBe(result2.identityKeys.boxKeyPair.publicKey)
    expect(result1.identityKeys.signKeyPair.publicKey).not.toBe(result2.identityKeys.signKeyPair.publicKey)
  })

  it("public keys in crypto fields match identity keys", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result.cryptoFields.box_public_key).toBe(result.identityKeys.boxKeyPair.publicKey)
    expect(result.cryptoFields.sign_public_key).toBe(result.identityKeys.signKeyPair.publicKey)
    expect(result.cryptoFields.crypto_bundle_id).toBe(result.keyBundle.bundleId)
  })

  it("server_password is different from raw password", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "securePassword123!"
    )

    expect(result.serverPassword).not.toBe("securePassword123!")
    expect(result.serverPassword).toHaveLength(64)
  })

  it("handles unicode passwords", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "пароль密码🔐"
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("handles very long passwords", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "test@example.com",
      "a".repeat(1000)
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("handles special characters in email", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "test-user-uuid-12345",
      "user+tag@sub.example.com",
      "securePassword123!"
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("raw password is not stored in any returned field", async () => {
    const password = "secretPassword123!"
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "security-user",
      "security@example.com",
      password
    )

    const jsonResult = JSON.stringify(result)
    expect(jsonResult).not.toContain(password)
  })

  it("handles empty string password", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "empty-pw-user",
      "emptypw@example.com",
      ""
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("handles whitespace-only password", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "whitespace-user",
      "whitespace@example.com",
      "   "
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("handles minimum length email", async () => {
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "min-email-user",
      "a@b.co",
      "password123!"
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })

  it("handles very long email", async () => {
    const longEmail = "a".repeat(100) + "@" + "b".repeat(100) + ".com"
    const result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "long-email-user",
      longEmail,
      "password123!"
    )

    expect(result.serverPassword).toHaveLength(64)
    expect(result.cryptoFields.enc_key_bundle).toBeTruthy()
  })
})
