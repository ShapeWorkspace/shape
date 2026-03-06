import { Base64String, HexString } from "../../crypto/types"
import { Crypto } from "../../crypto/crypto"
import { KeyBundle } from "../../models/auth-types"
import { BuildUserKeyBundleAssociatedData } from "../user/BuildUserKeyBundleAssociatedData"

/**
 * Decrypts a user's encrypted key bundle into plaintext.
 *
 * The bundle contains identity key seeds and metadata needed for later key regeneration.
 */
export class DecryptKeyBundleToPlaintextBundle {
  constructor(
    private readonly crypto: Crypto,
    private readonly buildUserKeyBundleAssociatedData: BuildUserKeyBundleAssociatedData
  ) {}

  public execute(
    emailAddress: string,
    passwordKeyEncryptionKey: HexString,
    cryptoFields: {
      crypto_bundle_id: string
      enc_key_bundle_nonce: HexString
      enc_key_bundle: Base64String
    }
  ): KeyBundle | null {
    // Associated data must match the values used during encryption.
    const associatedData = this.buildUserKeyBundleAssociatedData.execute(
      emailAddress,
      cryptoFields.crypto_bundle_id
    )

    // AEAD decryption returns null on authentication failure.
    const decryptedJson = this.crypto.xchacha20Decrypt(
      cryptoFields.enc_key_bundle,
      cryptoFields.enc_key_bundle_nonce,
      passwordKeyEncryptionKey,
      associatedData
    )

    if (decryptedJson === null) {
      return null
    }

    return JSON.parse(decryptedJson) as KeyBundle
  }
}
