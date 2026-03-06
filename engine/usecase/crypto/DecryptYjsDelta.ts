import { Crypto } from "../../crypto/crypto"
import { HexString } from "../../crypto/types"
import * as Utils from "../../crypto/utils"
import { EncryptedYjsDelta } from "../../protobufs/entityblock"

export interface DecryptDeltaParams {
  delta: EncryptedYjsDelta
  entityKey: HexString
}

export class DecryptYjsDelta {
  constructor(private readonly crypto: Crypto) {}

  execute(params: DecryptDeltaParams): Uint8Array | null {
    const { delta, entityKey } = params

    const nonceHex = Utils.arrayBufferToHexString(delta.nonce)
    const ciphertextBase64 = Utils.arrayBufferToBase64(delta.ciphertext)

    const updateBase64 = this.crypto.xchacha20Decrypt(ciphertextBase64, nonceHex, entityKey)
    if (updateBase64 === null) {
      return null
    }

    return Utils.base64ToArrayBuffer(updateBase64)
  }
}
