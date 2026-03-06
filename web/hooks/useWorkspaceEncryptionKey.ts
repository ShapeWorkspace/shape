/**
 * Hook to get the current workspace encryption key for block encryption/decryption.
 *
 * Used by useNoteYjs, usePaperYjs, and useTaskYjs to encrypt/decrypt
 * Yjs deltas before sending to or after receiving from the server.
 */

import { useCallback } from "react"
import { useEngineStore } from "../store/engine-store"

/**
 * Returns a callback that retrieves the current workspace encryption key.
 * Workspace keys are cached in KeyStore, so identity keys are not required here
 * (local-only workspaces do not persist identity keys in GlobalUserService).
 */
export function useWorkspaceEncryptionKey(): () => Promise<string | null> {
  const { application } = useEngineStore()

  const getWorkspaceKey = useCallback(async (): Promise<string | null> => {
    if (!application) {
      return null
    }

    const currentKey = application.getKeyStore().getCurrentKey()
    return currentKey?.key ?? null
  }, [application])

  return getWorkspaceKey
}
