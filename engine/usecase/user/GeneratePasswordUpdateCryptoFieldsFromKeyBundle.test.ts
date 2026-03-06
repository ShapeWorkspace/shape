/**
 * Unit tests for GeneratePasswordUpdateCryptoFieldsFromKeyBundle.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { Crypto } from "../../crypto/crypto"
import { LoginChallengeResponse } from "../../models/auth-types"
import { BuildIdentityKeysFromKeyBundle } from "./BuildIdentityKeysFromKeyBundle"
import { BuildUserKeyBundleAssociatedData } from "./BuildUserKeyBundleAssociatedData"
import { DecryptKeyBundleToPlaintextBundle } from "../invites/DecryptKeyBundleToPlaintextBundle"
import { DeriveLoginKeysFromPasswordAndChallenge } from "./DeriveLoginKeysFromPasswordAndChallenge"
import { GeneratePasswordUpdateCryptoFieldsFromKeyBundle } from "./GeneratePasswordUpdateCryptoFieldsFromKeyBundle"
import { GenerateRegistrationKeyBundleAndIdentityKeys } from "./GenerateRegistrationKeyBundleAndIdentityKeys"

describe("GeneratePasswordUpdateCryptoFieldsFromKeyBundle", () => {
  let crypto: Crypto
  let generateRegistrationKeyBundleAndIdentityKeys: GenerateRegistrationKeyBundleAndIdentityKeys
  let deriveLoginKeysFromPasswordAndChallenge: DeriveLoginKeysFromPasswordAndChallenge
  let decryptKeyBundleToPlaintextBundle: DecryptKeyBundleToPlaintextBundle
  let buildIdentityKeysFromKeyBundle: BuildIdentityKeysFromKeyBundle
  let generatePasswordUpdateCryptoFieldsFromKeyBundle: GeneratePasswordUpdateCryptoFieldsFromKeyBundle

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
    buildIdentityKeysFromKeyBundle = new BuildIdentityKeysFromKeyBundle(crypto)
    generatePasswordUpdateCryptoFieldsFromKeyBundle = new GeneratePasswordUpdateCryptoFieldsFromKeyBundle(
      crypto,
      buildUserKeyBundleAssociatedData
    )
  })

  it("re-wraps the bundle with a new password while preserving identity seeds", async () => {
    const email = "rewrap@example.com"
    const oldPassword = "oldPassword123!"
    const newPassword = "newPassword456!"

    const registrationResult = await generateRegistrationKeyBundleAndIdentityKeys.execute(
      "rewrap-user",
      email,
      oldPassword
    )

    const oldChallenge: LoginChallengeResponse = {
      pw_salt: registrationResult.cryptoFields.pw_salt,
      kdf_version: registrationResult.cryptoFields.protocol_version,
    }
    const oldLoginKeys = deriveLoginKeysFromPasswordAndChallenge.execute(oldPassword, oldChallenge)

    const oldBundle = decryptKeyBundleToPlaintextBundle.execute(email, oldLoginKeys.pwKek, {
      crypto_bundle_id: registrationResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: registrationResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: registrationResult.cryptoFields.enc_key_bundle,
    })

    expect(oldBundle).toBeTruthy()

    const updateResult = await generatePasswordUpdateCryptoFieldsFromKeyBundle.execute(
      email,
      newPassword,
      oldBundle!
    )

    expect(updateResult.cryptoFields.crypto_bundle_id).not.toBe(registrationResult.cryptoFields.crypto_bundle_id)
    expect(updateResult.cryptoFields.pw_salt).not.toBe(registrationResult.cryptoFields.pw_salt)
    expect(updateResult.cryptoFields.enc_key_bundle_nonce).not.toBe(
      registrationResult.cryptoFields.enc_key_bundle_nonce
    )

    expect(updateResult.updatedKeyBundle.userId).toBe(oldBundle!.userId)
    expect(updateResult.updatedKeyBundle.boxSeed).toBe(oldBundle!.boxSeed)
    expect(updateResult.updatedKeyBundle.signSeed).toBe(oldBundle!.signSeed)
    expect(updateResult.updatedKeyBundle.bundleId).toBe(updateResult.cryptoFields.crypto_bundle_id)

    const newChallenge: LoginChallengeResponse = {
      pw_salt: updateResult.cryptoFields.pw_salt,
      kdf_version: updateResult.cryptoFields.protocol_version,
    }
    const newLoginKeys = deriveLoginKeysFromPasswordAndChallenge.execute(newPassword, newChallenge)

    const newBundle = decryptKeyBundleToPlaintextBundle.execute(email, newLoginKeys.pwKek, {
      crypto_bundle_id: updateResult.cryptoFields.crypto_bundle_id,
      enc_key_bundle_nonce: updateResult.cryptoFields.enc_key_bundle_nonce,
      enc_key_bundle: updateResult.cryptoFields.enc_key_bundle,
    })

    expect(newBundle).toBeTruthy()
    expect(newBundle!.boxSeed).toBe(oldBundle!.boxSeed)
    expect(newBundle!.signSeed).toBe(oldBundle!.signSeed)

    const regeneratedIdentityKeys = buildIdentityKeysFromKeyBundle.execute(newBundle!)
    expect(regeneratedIdentityKeys.boxKeyPair.publicKey).toBe(registrationResult.identityKeys.boxKeyPair.publicKey)
    expect(regeneratedIdentityKeys.signKeyPair.publicKey).toBe(registrationResult.identityKeys.signKeyPair.publicKey)
  })
})
