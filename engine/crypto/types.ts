export type Base64String = string
export type Utf8String = string
export type Base64URLSafeString = string
export type HexString = string

export type PkcKeyPair = {
  privateKey: HexString
  publicKey: HexString
}

export type SodiumStateAddress = unknown

export enum SodiumTag {
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_PUSH = 0,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_PULL = 1,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_REKEY = 2,
  CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL = 3,
}

export type StreamDecryptor = {
  state: SodiumStateAddress
}

export type StreamDecryptorResult = {
  message: Uint8Array
  tag: SodiumTag
}

export type StreamEncryptor = {
  state: SodiumStateAddress
  header: Base64String
}
