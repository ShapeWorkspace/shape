import { Crypto } from "../../crypto/crypto"
import { HexString } from "../../crypto/types"
import * as Utils from "../../crypto/utils"
import { EncryptedYjsDelta } from "../../protobufs/entityblock"

const NONCE_SIZE = 24

export interface EncryptDeltaParams {
  yjsUpdate: Uint8Array
  entityKey: HexString
}

export class EncryptYjsDelta {
  constructor(private readonly crypto: Crypto) {}

  execute(params: EncryptDeltaParams): EncryptedYjsDelta {
    const { yjsUpdate, entityKey } = params

    const nonceHex = this.crypto.generateRandomKey(NONCE_SIZE)
    const nonce = Utils.hexStringToArrayBuffer(nonceHex)

    const updateBase64 = Utils.arrayBufferToBase64(yjsUpdate)

    const ciphertextBase64 = this.crypto.xchacha20Encrypt(updateBase64, nonceHex, entityKey)
    const ciphertext = Utils.base64ToArrayBuffer(ciphertextBase64)

    return { ciphertext, nonce }
  }
}
