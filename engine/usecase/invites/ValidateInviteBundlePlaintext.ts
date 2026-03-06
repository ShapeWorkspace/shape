import { isHexStringWithExpectedBytes, isNonEmptyString } from "../../crypto/utils"
import { InviteBundlePlaintext } from "../../models/invite-types"
import { WORKSPACE_KEY_BYTES } from "../../models/workspace"
import { Result } from "../../utils/Result"
import { SyncUseCaseInterface } from "../../utils/UseCase/SyncUseCaseInterface"

/**
 * Validate the shape and cryptographic expectations of an invite bundle.
 * We enforce strict matching to prevent key substitution or downgrade attacks.
 */
export class ValidateInviteBundlePlaintext implements SyncUseCaseInterface<InviteBundlePlaintext> {
  public execute(
    parsed: unknown,
    expectedWorkspaceId: string,
    expectedInviteId: string,
    expectedVersion: number
  ): Result<InviteBundlePlaintext> {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return Result.fail("Expected invite bundle version is invalid")
    }

    if (typeof parsed !== "object" || parsed === null) {
      return Result.fail("Invite bundle payload is not an object")
    }

    const bundleRecord = parsed as Record<string, unknown>

    const versionValue = bundleRecord.v
    if (!Number.isInteger(versionValue)) {
      return Result.fail("Invite bundle version is missing or invalid")
    }
    if (versionValue !== expectedVersion) {
      return Result.fail("Invite bundle version mismatch")
    }

    const workspaceIdValue = bundleRecord.workspaceId
    if (!isNonEmptyString(workspaceIdValue)) {
      return Result.fail("Invite bundle workspace id is missing or invalid")
    }
    if (workspaceIdValue !== expectedWorkspaceId) {
      return Result.fail("Invite bundle workspace id does not match invite metadata")
    }

    const inviteIdValue = bundleRecord.inviteId
    if (!isNonEmptyString(inviteIdValue)) {
      return Result.fail("Invite bundle invite id is missing or invalid")
    }
    if (inviteIdValue !== expectedInviteId) {
      return Result.fail("Invite bundle invite id does not match invite metadata")
    }

    const createdAtValue = bundleRecord.createdAt
    if (!isNonEmptyString(createdAtValue)) {
      return Result.fail("Invite bundle createdAt timestamp is missing or invalid")
    }

    const keysValue = bundleRecord.keys
    if (!Array.isArray(keysValue) || keysValue.length === 0) {
      return Result.fail("Invite bundle keys are missing or empty")
    }

    const uniqueWorkspaceKeyIds = new Set<string>()
    const bundleKeys: InviteBundlePlaintext["keys"] = []

    for (const keyEntry of keysValue) {
      if (typeof keyEntry !== "object" || keyEntry === null) {
        return Result.fail("Invite bundle key entry is invalid")
      }

      const keyRecord = keyEntry as Record<string, unknown>
      const workspaceKeyIdValue = keyRecord.workspaceKeyId
      if (!isNonEmptyString(workspaceKeyIdValue)) {
        return Result.fail("Invite bundle key workspaceKeyId is missing or invalid")
      }
      if (uniqueWorkspaceKeyIds.has(workspaceKeyIdValue)) {
        return Result.fail("Invite bundle contains duplicate workspace key ids")
      }

      const generationValue = keyRecord.generation
      if (typeof generationValue !== "number" || !Number.isInteger(generationValue) || generationValue < 1) {
        return Result.fail("Invite bundle key generation is missing or invalid")
      }
      const generation = generationValue

      const workspaceKeyValue = keyRecord.workspaceKey
      if (!isHexStringWithExpectedBytes(workspaceKeyValue, WORKSPACE_KEY_BYTES)) {
        return Result.fail("Invite bundle workspace key is missing or invalid")
      }

      uniqueWorkspaceKeyIds.add(workspaceKeyIdValue)
      bundleKeys.push({
        workspaceKeyId: workspaceKeyIdValue,
        generation,
        workspaceKey: workspaceKeyValue,
      })
    }

    return Result.ok({
      v: expectedVersion,
      workspaceId: workspaceIdValue,
      inviteId: inviteIdValue,
      createdAt: createdAtValue,
      keys: bundleKeys,
    })
  }
}
