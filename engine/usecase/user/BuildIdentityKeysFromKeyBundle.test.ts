/**
 * Unit tests for BuildIdentityKeysFromKeyBundle.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { Crypto } from "../../crypto/crypto"
import { KeyBundle } from "../../models/auth-types"
import { BuildIdentityKeysFromKeyBundle } from "./BuildIdentityKeysFromKeyBundle"

describe("BuildIdentityKeysFromKeyBundle", () => {
  let crypto: Crypto
  let buildIdentityKeysFromKeyBundle: BuildIdentityKeysFromKeyBundle

  beforeAll(async () => {
    crypto = new Crypto()
    await crypto.initialize()
  })

  beforeEach(() => {
    buildIdentityKeysFromKeyBundle = new BuildIdentityKeysFromKeyBundle(crypto)
  })

  it("builds deterministic keypairs from bundle seeds", () => {
    const bundle: KeyBundle = {
      v: 1,
      userId: "user-1",
      bundleId: "bundle-1",
      createdAt: new Date().toISOString(),
      boxSeed: crypto.generateRandomKey(32),
      signSeed: crypto.generateRandomKey(32),
    }

    const firstKeys = buildIdentityKeysFromKeyBundle.execute(bundle)
    const secondKeys = buildIdentityKeysFromKeyBundle.execute(bundle)

    expect(firstKeys.userId).toBe(bundle.userId)
    expect(firstKeys.boxKeyPair.publicKey).toBe(secondKeys.boxKeyPair.publicKey)
    expect(firstKeys.boxKeyPair.privateKey).toBe(secondKeys.boxKeyPair.privateKey)
    expect(firstKeys.signKeyPair.publicKey).toBe(secondKeys.signKeyPair.publicKey)
    expect(firstKeys.signKeyPair.privateKey).toBe(secondKeys.signKeyPair.privateKey)
  })
})
