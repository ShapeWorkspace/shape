import { Crypto } from "../../crypto/crypto"
import { WORKSPACE_KEY_BYTES } from "../../models/workspace"
import { CreateWorkspaceKeyResponse, DecryptedWorkspaceKey } from "../../models/workspace-key"
import { AccountStore } from "../../store/account-store"
import { KeyStore } from "../../store/key-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { CreateKeyShareForUser } from "../invites/CreateKeyShareForUser"
import { MakeWorkspaceRequest } from "../network/MakeWorkspaceRequest"

export class CreateWorkspaceKey implements UseCaseInterface<DecryptedWorkspaceKey> {
  constructor(
    private readonly crypto: Crypto,
    private readonly workspaceRequest: MakeWorkspaceRequest,
    private readonly createKeyShareForUser: CreateKeyShareForUser,
    private readonly accountStore: AccountStore,
    private readonly keyStore: KeyStore
  ) {}

  async execute(): Promise<Result<DecryptedWorkspaceKey>> {
    const keyId = this.crypto.generateUUID()
    const symmetricKey = this.crypto.generateRandomKey(WORKSPACE_KEY_BYTES)

    const networkResult = await this.workspaceRequest.executePost<{ id: string }, CreateWorkspaceKeyResponse>(
      `keys`,
      { id: keyId }
    )
    if (networkResult.isFailed()) {
      return Result.fail(`Failed to create workspace key: ${networkResult.getError()}`)
    }
    const networkKey = networkResult.getValue()

    const ownShareResult = await this.createKeyShareForUser.execute(
      keyId,
      this.accountStore.getSureIdentityKeys().userId,
      this.accountStore.getSureIdentityKeys().boxKeyPair.publicKey,
      symmetricKey
    )

    if (ownShareResult.isFailed()) {
      return Result.fail(`Failed to create self-share: ${ownShareResult.getError()}`)
    }

    const decryptedKey: DecryptedWorkspaceKey = {
      id: networkKey.id,
      workspaceId: networkKey.workspace_id,
      generation: networkKey.generation,
      key: symmetricKey,
    }

    await this.keyStore.saveKey(decryptedKey)

    return Result.ok(decryptedKey)
  }
}
