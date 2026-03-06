/**
 * Unit tests for DecryptKeyBundleToPlaintextBundle.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { Crypto } from "../../crypto/crypto"
import { LoginChallengeResponse } from "../../models/auth-types"
import { BuildUserKeyBundleAssociatedData } from "../user/BuildUserKeyBundleAssociatedData"
import { DecryptKeyBundleToPlaintextBundle } from "./DecryptKeyBundleToPlaintextBundle"
import { DeriveLoginKeysFromPasswordAndChallenge } from "../user/DeriveLoginKeysFromPasswordAndChallenge"
import { GenerateRegistrationKeyBundleAndIdentityKeys } from "../user/GenerateRegistrationKeyBundleAndIdentityKeys"

describe("DecryptKeyBundleToPlaintextBundle", () => {
  let crypto: Crypto
  let generateRegistrationKeyBundleAndIdentityKeys: GenerateRegistrationKeyBundleAndIdentityKeys
  let deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge
  let decryptKeyBundleToPlaintextBundle: DecryptKeyBundleToPlaintextBundle

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
    deriveLoginKeysFromPasswordAndChallenge = new DeriveLoginKeysFromPasswordAndChallenge(crypto)
    decryptKeyBundleToPlaintextBundle = new DecryptKeyBundleToPlaintextBundle(
      crypto,
      buildUserKeyBundleAssociatedData
    )
  })

  it("successfully decrypts a valid bundle", async () => {
    const testUserId = "decrypt-test-user"
    const testEmail = "decrypt@example.com"
    const testPassword = "decryptPassword123!"

    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      testUserId,
      testEmail,
      testPassword
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute(testPassword, challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute(testEmail, loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).not.toBeNull()
  })

  it("returns null for wrong password", async () => {
    const testUserId = "decrypt-test-user"
    const testEmail = "decrypt@example.com"
    const testPassword = "decryptPassword123!"

    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      testUserId,
      testEmail,
      testPassword
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("wrongPassword123!", challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute(testEmail, loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).toBeNull()
  })

  it("returns null for wrong email (associated data mismatch)", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "decrypt@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("wrong@example.com", loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).toBeNull()
  })

  it("returns null for wrong bundle ID (associated data mismatch)", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "decrypt@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("decrypt@example.com", loginKeys.pwKek, {
      crypto_bundle_id: "wrong-bundle-id",
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).toBeNull()
  })

  it("returns null for tampered ciphertext", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "decrypt@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const tamperedCiphertext = regResult.cryptoFields.enc_key_bundle.slice(0, -4) + "XXXX"

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("decrypt@example.com", loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: tamperedCiphertext,
    })

    expect(decryptedBundle).toBeNull()
  })

  it("returns null for wrong nonce", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "decrypt@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const wrongNonce = "1".repeat(48)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("decrypt@example.com", loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: wrongNonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).toBeNull()
  })

  it("normalizes email case for decryption", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "user@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("USER@EXAMPLE.COM", loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).not.toBeNull()
  })

  it("normalizes email whitespace for decryption", async () => {
    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "decrypt-test-user",
      "user@example.com",
      "decryptPassword123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("decryptPassword123!", challenge)

    const decryptedBundle = decryptKeyBundleToPlaintextBundle.execute("  user@example.com  ", loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decryptedBundle).not.toBeNull()
  })

  it("full registration → login → decrypt cycle works correctly", async () => {
    const userId = "roundtrip-user"
    const email = "roundtrip@example.com"
    const password = "roundtripPassword123!"

    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(userId, email, password)

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }

    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute(password, challenge)

    expect(loginKeys.serverPassword).toBe(regResult.serverPassword)

    const recoveredBundle = decryptKeyBundleToPlaintextBundle.execute(email, loginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(recoveredBundle).not.toBeNull()
    expect(recoveredBundle!.userId).toBe(userId)
  })

  it("different users get different keys even with same password", async () => {
    const password = "sharedPassword123!"

    const user1Result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "user-1",
      "user1@example.com",
      password
    )

    const user2Result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "user-2",
      "user2@example.com",
      password
    )

    expect(user1Result.serverPassword).not.toBe(user2Result.serverPassword)
    expect(user1Result.identityKeys.boxKeyPair.publicKey).not.toBe(user2Result.identityKeys.boxKeyPair.publicKey)
    expect(user1Result.identityKeys.signKeyPair.publicKey).not.toBe(user2Result.identityKeys.signKeyPair.publicKey)
  })

  it("password change: old bundle cannot be decrypted with new password", async () => {
    const userId = "password-change-user"
    const email = "pwchange@example.com"
    const oldPassword = "oldPassword123!"
    const newPassword = "newPassword456!"

    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(userId, email, oldPassword)

    const challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const newLoginKeys = deriveLoginKeysFromPasswordAndChallenge.execute(newPassword, challenge)

    const decrypted = decryptKeyBundleToPlaintextBundle.execute(email, newLoginKeys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(decrypted).toBeNull()
  })

  it("simulates multiple login attempts from different devices", async () => {
    const userId = "multi-device-user"
    const email = "multidevice@example.com"
    const password = "multiDevicePassword123!"

    const regResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(userId, email, password)

    const device2Challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const device2Keys = deriveLoginKeysFromPasswordAndChallenge.execute(password, device2Challenge)
    const device2Recovered = decryptKeyBundleToPlaintextBundle.execute(email, device2Keys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    const device3Challenge: LoginChallengeResponse = {
      pw_salt: regResult.cryptoFields.pw_salt,
      kdf_version: regResult.cryptoFields.protocol_version,
    }
    const device3Keys = deriveLoginKeysFromPasswordAndChallenge.execute(password, device3Challenge)
    const device3Recovered = decryptKeyBundleToPlaintextBundle.execute(email, device3Keys.pwKek, {
      crypto_bundle_id: regResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: regResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: regResult.cryptoFields.enc_key_bundle,
    })

    expect(device2Recovered).not.toBeNull()
    expect(device3Recovered).not.toBeNull()
  })

  it("AEAD prevents ciphertext from being used with wrong context", async () => {
    const user1Result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "user-1",
      "user1@example.com",
      "password123!"
    )

    const user2Result = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "user-2",
      "user2@example.com",
      "password123!"
    )

    const challenge: LoginChallengeResponse = {
      pw_salt: user1Result.cryptoFields.pw_salt,
      kdf_version: 1,
    }
    const loginKeys = deriveLoginKeysFromPasswordAndChallenge.execute("password123!", challenge)

    const transplantedDecrypt = decryptKeyBundleToPlaintextBundle.execute("user1@example.com", loginKeys.pwKek, {
      crypto_bundle_id: user2Result.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: user2Result.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: user2Result.cryptoFields.enc_key_bundle,
    })

    expect(transplantedDecrypt).toBeNull()
  })
})
