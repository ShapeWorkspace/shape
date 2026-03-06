import sodium from "libsodium-wrappers-sumo"
import type { StateAddress } from "libsodium-wrappers-sumo"
import * as Utils from "./utils"
import {
  Utf8String,
  Base64URLSafeString,
  Base64String,
  HexString,
  StreamEncryptor,
  SodiumTag,
  StreamDecryptor,
  StreamDecryptorResult,
  PkcKeyPair,
} from "./types"
import { SodiumConstant } from "./constants"

export class Crypto {
  private ready: Promise<void> | null
  // No longer storing internal state map; state objects pass directly across WASM

  constructor() {
    /** Functions using Libsodium must await this
     * promise before performing any library functions */
    this.ready = sodium.ready
  }

  async initialize(): Promise<void> {
    await this.ready
  }

  deinit(): void {
    this.ready = null
  }

  private assertHexBytes(value: string, bytes: number, label: string): void {
    const expectedHexChars = bytes * 2

    if (value.length !== expectedHexChars) {
      throw new Error(`${label} must be ${bytes} bytes (${expectedHexChars} hex chars)`)
    }

    if (!/^[0-9a-fA-F]+$/.test(value)) {
      throw new Error(`${label} must be a hex string`)
    }
  }

  public generateUUID(): string {
    return Utils.generateUUID()
  }

  public timingSafeEqual(a: string, b: string): boolean {
    return Utils.timingSafeEqual(a, b)
  }

  public base64Encode(text: Utf8String): string {
    return Utils.base64Encode(text)
  }

  public base64URLEncode(text: Utf8String): Base64URLSafeString {
    return Utils.base64URLEncode(text)
  }

  public base64Decode(base64String: Base64String): string {
    return Utils.base64Decode(base64String)
  }

  public generateRandomKey(bytes: number): HexString {
    return sodium.randombytes_buf(bytes, "hex")
  }

  /**
   * Alias for generateRandomKey for readability in tests.
   */
  public generateRandomHex(bytes: number): HexString {
    return this.generateRandomKey(bytes)
  }

  // public arrayBufferToHexString(arrayBuffer: Uint8Array): HexString {
  //   return Utils.arrayBufferToHexString(arrayBuffer)
  // }

  public argon2(
    password: Utf8String,
    salt: HexString,
    iterations: number,
    bytes: number,
    length: number
  ): HexString {
    this.assertHexBytes(salt, 16, "Salt")
    const result = sodium.crypto_pwhash(
      length,
      password,
      Utils.hexStringToArrayBuffer(salt),
      iterations,
      bytes,
      sodium.crypto_pwhash_ALG_DEFAULT,
      "hex"
    )
    return result
  }

  public xchacha20Encrypt(
    plaintext: Utf8String,
    nonce: HexString,
    key: HexString,
    assocData?: Utf8String
  ): Base64String {
    this.assertHexBytes(nonce, 24, "Nonce")
    this.assertHexBytes(key, 32, "Key")
    const arrayBuffer = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      assocData || null,
      null,
      Utils.hexStringToArrayBuffer(nonce),
      Utils.hexStringToArrayBuffer(key)
    )
    return Utils.arrayBufferToBase64(arrayBuffer)
  }

  public xchacha20Decrypt(
    ciphertext: Base64String,
    nonce: HexString,
    key: HexString,
    assocData?: Utf8String | Uint8Array
  ): Utf8String | null {
    this.assertHexBytes(nonce, 24, "Nonce")
    this.assertHexBytes(key, 32, "Key")
    try {
      const result = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        Utils.base64ToArrayBuffer(ciphertext),
        assocData || null,
        Utils.hexStringToArrayBuffer(nonce),
        Utils.hexStringToArrayBuffer(key),
        "text"
      )
      // Important: empty string "" is a valid plaintext result.
      // Only return null if result is actually undefined, null, or false.
      if (typeof result === "string") {
        return result
      }
      return null
    } catch {
      return null
    }
  }

  public xchacha20StreamInitEncryptor(key: HexString): StreamEncryptor {
    this.assertHexBytes(key, SodiumConstant.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES, "Key")
    const res = sodium.crypto_secretstream_xchacha20poly1305_init_push(Utils.hexStringToArrayBuffer(key))
    return {
      state: res.state,
      header: Utils.arrayBufferToBase64(res.header),
    }
  }

  public xchacha20StreamEncryptorPush(
    encryptor: StreamEncryptor,
    plainBuffer: Uint8Array,
    assocData: Utf8String,
    tag: SodiumTag = SodiumTag.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_PUSH
  ): Uint8Array {
    // Note: libsodium-wrappers secretstream functions expect AD as string or Uint8Array
    // Pass the string directly - libsodium-wrappers will handle conversion
    const encryptedBuffer = sodium.crypto_secretstream_xchacha20poly1305_push(
      encryptor.state as StateAddress,
      plainBuffer,
      assocData,
      tag
    )
    return encryptedBuffer
  }

  public xchacha20StreamInitDecryptor(header: Base64String, key: HexString): StreamDecryptor {
    const rawHeader = Utils.base64ToArrayBuffer(header)

    if (rawHeader.length !== SodiumConstant.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES) {
      throw new Error(
        `Header must be ${SodiumConstant.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES} bytes long`
      )
    }

    this.assertHexBytes(key, SodiumConstant.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES, "Key")
    const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
      rawHeader,
      Utils.hexStringToArrayBuffer(key)
    )

    return { state }
  }

  public xchacha20StreamDecryptorPush(
    decryptor: StreamDecryptor,
    encryptedBuffer: Uint8Array,
    assocData: Utf8String
  ): StreamDecryptorResult | false {
    if (encryptedBuffer.length < SodiumConstant.CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES) {
      throw new Error("Invalid ciphertext size")
    }
    // Note: libsodium-wrappers secretstream functions expect AD as string or Uint8Array
    // Pass the string directly - libsodium-wrappers will handle conversion
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(
      decryptor.state as sodium.StateAddress,
      encryptedBuffer,
      assocData
    )

    if ((result as unknown) === false) {
      return false
    }

    return result
  }

  /**
   * https://doc.libsodium.org/public-key_cryptography/authenticated_encryption
   */
  public sodiumCryptoBoxEasyEncrypt(
    message: Utf8String,
    nonce: HexString,
    recipientPublicKey: HexString,
    senderSecretKey: HexString
  ): Base64String {
    this.assertHexBytes(nonce, 24, "Nonce")
    this.assertHexBytes(recipientPublicKey, 32, "Recipient public key")
    this.assertHexBytes(senderSecretKey, 32, "Sender secret key")
    const result = sodium.crypto_box_easy(
      message,
      Utils.hexStringToArrayBuffer(nonce),
      Utils.hexStringToArrayBuffer(recipientPublicKey),
      Utils.hexStringToArrayBuffer(senderSecretKey)
    )

    return Utils.arrayBufferToBase64(result)
  }

  public sodiumCryptoBoxEasyDecrypt(
    ciphertext: Base64String,
    nonce: HexString,
    senderPublicKey: HexString,
    recipientSecretKey: HexString
  ): Utf8String {
    this.assertHexBytes(nonce, 24, "Nonce")
    this.assertHexBytes(senderPublicKey, 32, "Sender public key")
    this.assertHexBytes(recipientSecretKey, 32, "Recipient secret key")
    const result = sodium.crypto_box_open_easy(
      Utils.base64ToArrayBuffer(ciphertext),
      Utils.hexStringToArrayBuffer(nonce),
      Utils.hexStringToArrayBuffer(senderPublicKey),
      Utils.hexStringToArrayBuffer(recipientSecretKey),
      "text"
    )

    return result
  }

  sodiumCryptoBoxKeypair(): PkcKeyPair {
    const result = sodium.crypto_box_keypair()
    return {
      publicKey: Utils.arrayBufferToHexString(result.publicKey),
      privateKey: Utils.arrayBufferToHexString(result.privateKey),
    }
  }

  sodiumCryptoSignKeypair(): PkcKeyPair {
    const result = sodium.crypto_sign_keypair()
    return {
      publicKey: Utils.arrayBufferToHexString(result.publicKey),
      privateKey: Utils.arrayBufferToHexString(result.privateKey),
    }
  }

  sodiumCryptoBoxSeedKeypair(seed: HexString): PkcKeyPair {
    const result = sodium.crypto_box_seed_keypair(Utils.hexStringToArrayBuffer(seed))

    const publicKey = Utils.arrayBufferToHexString(result.publicKey)
    const privateKey = Utils.arrayBufferToHexString(result.privateKey)

    return { publicKey, privateKey }
  }

  sodiumCryptoSignSeedKeypair(seed: HexString): PkcKeyPair {
    const result = sodium.crypto_sign_seed_keypair(Utils.hexStringToArrayBuffer(seed))

    const publicKey = Utils.arrayBufferToHexString(result.publicKey)
    const privateKey = Utils.arrayBufferToHexString(result.privateKey)

    return { publicKey, privateKey }
  }

  sodiumCryptoSign(message: Utf8String, secretKey: HexString): Base64String {
    this.assertHexBytes(secretKey, 64, "Secret key")
    const result = sodium.crypto_sign_detached(message, Utils.hexStringToArrayBuffer(secretKey))

    return Utils.arrayBufferToBase64(result)
  }

  sodiumCryptoSignVerify(message: Utf8String, signature: Base64String, publicKey: HexString): boolean {
    this.assertHexBytes(publicKey, 32, "Public key")
    return sodium.crypto_sign_verify_detached(
      Utils.base64ToArrayBuffer(signature),
      message,
      Utils.hexStringToArrayBuffer(publicKey)
    )
  }

  /**
   * Alias for sodiumCryptoSignVerify for readability.
   */
  verifySignature(message: Utf8String, signature: Base64String, publicKey: HexString): boolean {
    return this.sodiumCryptoSignVerify(message, signature, publicKey)
  }

  sodiumCryptoKdfDeriveFromKey(
    key: HexString,
    subkeyNumber: number,
    subkeyLength: number,
    context: string
  ): HexString {
    if (context.length !== 8) {
      throw new Error("Context must be 8 bytes")
    }

    this.assertHexBytes(key, 32, "Key")
    const result = sodium.crypto_kdf_derive_from_key(
      subkeyLength,
      subkeyNumber,
      context,
      Utils.hexStringToArrayBuffer(key)
    )

    return Utils.arrayBufferToHexString(result)
  }

  sodiumCryptoGenericHash(message: string, key?: HexString): HexString {
    const result = sodium.crypto_generichash(
      sodium.crypto_generichash_BYTES,
      message,
      key ? Utils.hexStringToArrayBuffer(key) : null
    )

    return Utils.arrayBufferToHexString(result)
  }
}
