import { Crypto } from "../../crypto/crypto"
import { IdentityKeys, KeyBundle } from "../../models/auth-types"

/**
 * Regenerates identity keypairs from a plaintext key bundle.
 *
 * This is deterministic: the same seeds always produce the same keypairs.
 */
export class BuildIdentityKeysFromKeyBundle {
  constructor(private readonly crypto: Crypto) {}

  public execute(keyBundle: KeyBundle): IdentityKeys {
    const boxKeyPair = this.crypto.sodiumCryptoBoxSeedKeypair(keyBundle.boxSeed)
    const signKeyPair = this.crypto.sodiumCryptoSignSeedKeypair(keyBundle.signSeed)

    return {
      userId: keyBundle.userId,
      boxKeyPair,
      signKeyPair,
    }
  }
}
