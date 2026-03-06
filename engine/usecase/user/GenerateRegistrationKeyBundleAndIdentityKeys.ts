import { Crypto } from "../../crypto/crypto"
import {
  KEYPAIR_SEED_BYTES,
  KDF_CONTEXT,
  KDF_SALT_BYTES,
  KDF_V1_PARAMS,
  SUBKEY_ID_PW_KEK,
  SUBKEY_ID_SERVER_PASSWORD,
  XCHACHA20_NONCE_BYTES,
} from "../../crypto/constants"
import {
  RegistrationDerivationResult,
  UserCryptoFields,
  KeyBundle,
  IdentityKeys,
} from "../../models/auth-types"
import { BuildUserKeyBundleAssociatedData } from "./BuildUserKeyBundleAssociatedData"

/**
 * Generates all cryptographic material needed for user registration.
 *
 * This is the single source of truth for the client-side registration flow:
 * - Generates salts, nonces, and seeds
 * - Derives password-based keys via Argon2id + KDF
 * - Generates identity keypairs from deterministic seeds
 * - Encrypts the key bundle with associated data
 */
export class GenerateRegistrationKeyBundleAndIdentityKeys {
  constructor(
    private readonly crypto: Crypto,
    private readonly buildUserKeyBundleAssociatedData: BuildUserKeyBundleAssociatedData
  ) {}

  public async execute(
    userId: string,
    emailAddress: string,
    password: string
  ): Promise<RegistrationDerivationResult> {
    // Bundle ID binds the encrypted bundle to a unique server record.
    const bundleId = this.crypto.generateUUID()

    // Salt and nonce are freshly generated for each registration.
    const passwordSalt = this.crypto.generateRandomKey(KDF_SALT_BYTES)
    const bundleEncryptionNonce = this.crypto.generateRandomKey(XCHACHA20_NONCE_BYTES)

    // Seeds deterministically generate identity keypairs.
    const boxKeyPairSeed = this.crypto.generateRandomKey(KEYPAIR_SEED_BYTES)
    const signKeyPairSeed = this.crypto.generateRandomKey(KEYPAIR_SEED_BYTES)

    // Derive the master key from the raw password using Argon2id.
    const masterKey = this.crypto.argon2(
      password,
      passwordSalt,
      KDF_V1_PARAMS.opsLimit,
      KDF_V1_PARAMS.memLimit,
      KDF_V1_PARAMS.outputBytes
    )

    // Derive separate subkeys for encryption and server authentication.
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

    // Generate identity keypairs from the deterministic seeds.
    const boxKeyPair = this.crypto.sodiumCryptoBoxSeedKeypair(boxKeyPairSeed)
    const signKeyPair = this.crypto.sodiumCryptoSignSeedKeypair(signKeyPairSeed)

    // Assemble the plaintext key bundle for storage on the server (encrypted).
    const keyBundle: KeyBundle = {
      v: KDF_V1_PARAMS.version,
      userId,
      bundleId,
      createdAt: new Date().toISOString(),
      boxSeed: boxKeyPairSeed,
      signSeed: signKeyPairSeed,
    }

    // Associated data binds the ciphertext to the user's normalized email and bundle ID.
    const associatedData = this.buildUserKeyBundleAssociatedData.execute(emailAddress, bundleId)

    // Encrypt the bundle with XChaCha20-Poly1305.
    const encryptedBundle = this.crypto.xchacha20Encrypt(
      JSON.stringify(keyBundle),
      bundleEncryptionNonce,
      passwordKeyEncryptionKey,
      associatedData
    )

    // Crypto fields are stored server-side to recover identity keys after login.
    const cryptoFields: UserCryptoFields = {
      crypto_bundle_id: bundleId,
      protocol_version: KDF_V1_PARAMS.version,
      pw_salt: passwordSalt,
      enc_key_bundle_nonce: bundleEncryptionNonce,
      enc_key_bundle: encryptedBundle,
      box_public_key: boxKeyPair.publicKey,
      sign_public_key: signKeyPair.publicKey,
    }

    // Identity keys are stored client-side for E2EE operations.
    const identityKeys: IdentityKeys = {
      userId,
      boxKeyPair,
      signKeyPair,
    }

    return {
      serverPassword,
      cryptoFields,
      identityKeys,
      keyBundle,
    }
  }
}
