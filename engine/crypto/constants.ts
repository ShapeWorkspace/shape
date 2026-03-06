export const ENTITY_KEY_BYTES = 32
export const XCHACHA20_NONCE_BYTES = 24

// Protocol version 1 KDF parameters as defined in the Book of Encryption.
// These parameters balance security with usability across different devices.
export const KDF_V1_PARAMS = {
  version: 1,
  opsLimit: 3, // Number of Argon2id iterations
  memLimit: 67108864, // 64 MiB memory usage
  outputBytes: 32, // 32-byte master key output
} as const

// Context strings for HKDF subkey derivation.
// These are 8-byte strings as required by libsodium's crypto_kdf.
export const KDF_CONTEXT = "password" as const
// Subkey IDs for deriving different keys from the master key.
export const SUBKEY_ID_PW_KEK = 1 // Password Key Encryption Key (for encrypting the bundle)

export const SUBKEY_ID_SERVER_PASSWORD = 2 // Server password (sent to server for auth)

// Cryptographic constants for key generation
export const KDF_SALT_BYTES = 16 // 16 bytes for Argon2id salt

export const KEYPAIR_SEED_BYTES = 32 // 32 bytes for X25519/Ed25519 seed

// Cryptographic constants for invite operations
export const INVITE_SECRET_BYTES = 32 // 32 bytes for XChaCha20-Poly1305 key

// Protocol version for invite bundles
export const INVITE_BUNDLE_VERSION = 1

export const SodiumConstant = {
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_STATEBYTES: 52,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES: 17,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES: 24,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES: 32,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_MESSAGEBYTES_MAX: 0x3fffffff80,
  crypto_box_SEEDBYTES: 32,
  crypto_sign_SEEDBYTES: 32,
  crypto_generichash_KEYBYTES: 32,
}
