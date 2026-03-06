import { ServerDate } from "./server-date"

export interface ServerUserServerDto {
  uuid: string
  email: string
  created_at: string
  updated_at: string
  // Crypto public keys (returned in user object for workspace key sharing)
  box_public_key?: string
  sign_public_key?: string
}

/**
 * Crypto fields returned from the login endpoint.
 * These are needed to decrypt the user's identity keys.
 */
export interface ServerCryptoFieldsDto {
  crypto_bundle_id: string
  pw_salt: string // 16 bytes hex
  protocol_version: number
  enc_key_bundle_nonce: string // 24 bytes hex
  enc_key_bundle: string // base64 encrypted JSON
}

export interface ServerUserClientDto {
  uuid: string
  email: string
  createdAt: string
  updatedAt: string
}

export class ServerUser {
  uuid: string
  email: string
  createdAt: ServerDate
  updatedAt: ServerDate

  constructor(params: ServerUserClientDto) {
    this.uuid = params.uuid
    this.email = params.email
    this.createdAt = new ServerDate(params.createdAt)
    this.updatedAt = new ServerDate(params.updatedAt)
  }

  static fromServerDto(dto: ServerUserServerDto): ServerUser {
    return new ServerUser({
      uuid: dto.uuid,
      email: dto.email,
      createdAt: dto.created_at,
      updatedAt: dto.updated_at,
    })
  }
}
