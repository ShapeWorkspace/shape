import { Crypto } from "../../crypto/crypto"
import { KeyBundle, PasswordUpdateDerivationResult, UserCryptoFields } from "../../models/auth-types"
import {
  KDF_CONTEXT,
  KDF_SALT_BYTES,
  KDF_V1_PARAMS,
  SUBKEY_ID_PW_KEK,
  SUBKEY_ID_SERVER_PASSWORD,
  XCHACHA20_NONCE_BYTES,
} from "../../crypto/constants"
import { BuildUserKeyBundleAssociatedData } from "./BuildUserKeyBundleAssociatedData"

/**
 * Re-encrypts an existing plaintext key bundle with a new password.
 *
 * This is used for password changes and reset flows where identity keys remain stable
 * but the password-derived wrapper must rotate.
 */
export class GeneratePasswordUpdateCryptoFieldsFromKeyBundle {
  constructor(
    private readonly crypto: Crypto,
    private readonly buildUserKeyBundleAssociatedData: BuildUserKeyBundleAssociatedData
  ) {}

  public async execute(
    emailAddress: string,
    newPassword: string,
    existingKeyBundle: KeyBundle
  ): Promise<PasswordUpdateDerivationResult> {
    // Rotate bundle metadata so the server stores a new encrypted payload.
    const nextBundleId = this.crypto.generateUUID()
    const nextPasswordSalt = this.crypto.generateRandomKey(KDF_SALT_BYTES)
    const nextBundleNonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)

    // Derive the master key from the NEW password.
    const masterKey = this.crypto.argon2(
      newPassword,
      nextPasswordSalt,
      KDF_V1_PARAMS.opsLimit,
      KDF_V1_PARAMS.memLimit,
      KDF_V1_PARAMS.outputBytes
    )

    // Derive the key-encryption key and server password for the new wrapper.
    const passwordKeyEncryptionKey = this.crypto.sodiumCryptoKdfDeriveFromKey(
      masterKey,
      SUBKEY_ID_PW_KEK,
      32,
      KDF_CONTEXT
    )
    const serverPassword = this.crypto.sodiumCryptoKdfDeriveFromKey(
      masterKey,
      SUBKEY_ID_SERVER_PASSWORD,
      32,
      KDF_CONTEXT
    )

    const updatedKeyBundle: KeyBundle = {
      ...existingKeyBundle,
      v: KDF_V1_PARAMS.version,
      bundleId: nextBundleId,
      createdAt: new Date().toISOString(),
    }

    // Bind the new ciphertext to the normalized email and new bundle ID.
    const associatedData = this.buildUserKeyBundleAssociatedData.execute(emailAddress, nextBundleId)

    const encryptedBundle = this.crypto.xchacha20Encrypt(
      JSON.stringify(updatedKeyBundle),
      nextBundleNonce,
      passwordKeyEncryptionKey,
      associatedData
    )

    // Re-derive public keys from the preserved seeds to keep server-side metadata stable.
    const regeneratedBoxKeyPair = this.crypto.sodiumCryptoBoxSeedKeypair(updatedKeyBundle.boxSeed)
    const regeneratedSignKeyPair = this.crypto.sodiumCryptoSignSeedKeypair(updatedKeyBundle.signSeed)

    const cryptoFields: UserCryptoFields = {
      crypto_bundle_id: nextBundleId,
      protocol_version: KDF_V1_PARAMS.version,
      pw_salt: nextPasswordSalt,
      enc_key_bundle_nonce: nextBundleNonce,
      enc_key_bundle: encryptedBundle,
      box_public_key: regeneratedBoxKeyPair.publicKey,
      sign_public_key: regeneratedSignKeyPair.publicKey,
    }

    return {
      serverPassword,
      cryptoFields,
      updatedKeyBundle,
    }
  }
}
