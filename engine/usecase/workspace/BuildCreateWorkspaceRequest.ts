import { CreateWorkspaceRequest } from "../../models/workspace-account-requests"
import { InitialWorkspaceKeyParams } from "../../models/workspace-key"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Builds the create-workspace request payload with a client-generated workspace ID and initial key params.
 */
export class BuildCreateWorkspaceRequest implements SyncUseCaseInterface<CreateWorkspaceRequest> {
  public execute(workspaceId: string, name: string, initialKeyParams: InitialWorkspaceKeyParams) {
    return Result.ok({
      id: workspaceId,
      name,
      initial_key: {
        id: initialKeyParams.id,
        share: {
          id: initialKeyParams.share.id,
          sender_box_public_key: initialKeyParams.share.sender_box_public_key,
          sender_sign_public_key: initialKeyParams.share.sender_sign_public_key,
          nonce: initialKeyParams.share.nonce,
          ciphertext: initialKeyParams.share.ciphertext,
          share_signature: initialKeyParams.share.share_signature,
        },
      },
    })
  }
}
