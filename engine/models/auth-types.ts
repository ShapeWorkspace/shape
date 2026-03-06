import { PkcKeyPair, HexString, Base64String } from "../crypto/types"
import { ServerCryptoFieldsDto, ServerUserServerDto } from "./server-user"

/**
 * Identity key pair containing both encryption (box) and signing keypairs.
 * These are the user's long-term cryptographic identity.
 */
export interface IdentityKeys {
  userId: string
  boxKeyPair: PkcKeyPair // X25519 keypair for encryption (crypto_box)
  signKeyPair: PkcKeyPair // Ed25519 keypair for signatures
}
/**
 * The plaintext key bundle structure stored encrypted on the server.
 * Contains the seeds needed to regenerate identity keypairs.
 */

export interface KeyBundle {
  v: number // Protocol version
  userId: string // User's UUID
  bundleId: string // Unique bundle identifier
  createdAt: string // ISO 8601 timestamp
  boxSeed: HexString // 32 bytes hex - seed for box keypair
  signSeed: HexString // 32 bytes hex - seed for sign keypair
}
/**
 * Crypto fields sent during registration and returned during login.
 * These are stored on the server and used to recover identity keys.
 */

export interface UserCryptoFields {
  crypto_bundle_id: string
  protocol_version: number
  pw_salt: HexString // 16 bytes hex
  enc_key_bundle_nonce: HexString // 24 bytes hex
  enc_key_bundle: Base64String // Encrypted JSON bundle
  box_public_key: HexString // 32 bytes hex
  sign_public_key: HexString // 32 bytes hex
}
/**
 * Response from the login-challenge endpoint.
 * Contains KDF parameters needed to derive keys.
 */

export interface LoginChallengeResponse {
  pw_salt: HexString // 16 bytes hex
  kdf_version: number // Protocol version for KDF params
}
/**
 * Result of the registration key generation process.
 * Contains everything needed to complete registration.
 */

export interface RegistrationDerivationResult {
  serverPassword: HexString // Derived key to send to server
  cryptoFields: UserCryptoFields // Crypto fields to store on server
  identityKeys: IdentityKeys // User's identity keys (store locally)
  keyBundle: KeyBundle // Plaintext key bundle (store securely for password resets)
}
/**
 * Result of the login key derivation process.
 * Contains the server_password for authentication.
 */

export interface LoginDerivedKeys {
  serverPassword: HexString // Derived key to send to server
  pwKek: HexString // Key for decrypting the bundle after login
}
/**
 * Result of deriving a new password payload for an existing account.
 * This is used for password changes / resets where identity keys remain the same.
 */

export interface PasswordUpdateDerivationResult {
  serverPassword: HexString // New derived server_password to send to server
  cryptoFields: UserCryptoFields // Re-encrypted key bundle fields to persist on server
  updatedKeyBundle: KeyBundle // Updated plaintext bundle with fresh bundleId/createdAt
}

/**
 * Basic auth response (for /me endpoint, etc.)
 */
export interface AuthResponse {
  message: string
  user: ServerUserServerDto
}

/**
 * Auth response with crypto fields for login.
 */
export interface AuthResponseWithCrypto extends AuthResponse {
  crypto_fields?: ServerCryptoFieldsDto
  // App token for Tauri desktop/mobile apps using token-based auth instead of cookies.
  // Returned when server detects X-Client-Type: tauri header.
  app_token?: string
  // Refresh token for Tauri desktop/mobile apps used to mint new app tokens.
  refresh_token?: string
}
