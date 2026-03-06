/**
 * Hook to get the entity-level encryption key for block encryption/decryption.
 *
 * Entity keys are per-entity symmetric keys stored in the in-memory EntityStore
 * cache after entity decryption. They are different from workspace keys — the
 * workspace key wraps (encrypts) entity keys, but blocks are encrypted directly
 * with the entity key.
 */

import { useCallback } from "react"
import { useEngineStore } from "../store/engine-store"

/**
 * Returns a callback that retrieves the entity key for a given entity ID
 * from the in-memory cache.
 */
export function useEntityKey(): (entityId: string) => string | null {
  const { application } = useEngineStore()

  return useCallback(
    (entityId: string): string | null => {
      if (!application) {
        return null
      }

      const cachedEntity = application.getCacheStores().entityStore.get(entityId)
      return cachedEntity?.entityKey ?? null
    },
    [application]
  )
}
