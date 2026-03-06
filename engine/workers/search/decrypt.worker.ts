import sodium from "libsodium-wrappers-sumo"
import { DecryptEntity } from "@shape/engine/usecase/crypto/DecryptEntity"
import { ClientEntity, ServerEntity } from "@shape/engine/models/entity"
import { WrappingKey } from "@shape/engine/utils/encryption-types"
import { expose } from "comlink"
import { Crypto } from "@shape/engine/crypto/crypto"

export class DecryptionWorker {
  private isReady = false

  constructor(private readonly decryptEntity: DecryptEntity) {}

  async initialize(): Promise<void> {
    if (!this.isReady) {
      await sodium.ready
      this.isReady = true
    }
  }

  async decryptBatch(
    entities: {
      entity: ServerEntity
      wrappingKey: WrappingKey
    }[]
  ): Promise<ClientEntity[]> {
    if (!this.isReady) {
      await this.initialize()
    }

    const results: ClientEntity[] = []

    for (const entity of entities) {
      const result = this.decryptEntity.execute({
        serverEntity: entity.entity,
        wrappingKey: entity.wrappingKey,
      })
      if (result.isFailed()) {
        continue
      }
      results.push(result.getValue())
    }

    return results
  }
}

const crypto = new Crypto()
const decryptEntity = new DecryptEntity(crypto)
expose(new DecryptionWorker(decryptEntity))
