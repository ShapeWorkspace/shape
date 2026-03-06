/**
 * React Query hooks for entity links.
 *
 * Entity links are a lightweight graph for backlinks and navigation.
 * Links are stored unencrypted for efficient server-side queries.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import {
  type EntityLink,
  type LinkedEntityInput,
  type LinkType,
} from "../../../engine/models/entity-link"
import type { EntityLinksResult } from "../../../engine/usecase/entity-links/GetEntityLinks"

/**
 * Query hook for fetching entity links (both outgoing links and backlinks).
 *
 * @param entityId - The entity ID to fetch links for
 * @param entityType - Optional entity type hint for the server
 */
export function useEntityLinks(entityId: string, entityType?: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.entityLinks.byEntity(workspaceId, entityId),
    queryFn: async (): Promise<EntityLinksResult> => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return { links: [], linkedBy: [] }
      }

      const result = await application.getGetEntityLinks().execute({ entityId, entityType })
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Only fetch when we have all required dependencies
    enabled: !!application && !!entityId && application?.isWorkspaceRemote(),
    // Entity links are relatively stable, don't refetch too aggressively
    staleTime: 30000, // 30 seconds
    // Don't pause when offline - service handles offline by returning cached data
    networkMode: "always",
  })
}

/**
 * Parameters for syncing entity links.
 */
interface SyncEntityLinksParams {
  /** The source entity ID */
  entityId: string
  /** The source entity type (paper, task, note, etc.) */
  sourceEntityType: string
  /** The complete list of entities the source links to */
  linkedEntities: LinkedEntityInput[]
}

/**
 * Mutation hook for syncing entity links.
 * Used by Papers (Yjs) and other entities that need to update their links.
 */
export function useSyncEntityLinks() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ entityId, sourceEntityType, linkedEntities }: SyncEntityLinksParams) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("Entity links are unavailable in local-only workspaces")
      }

      const result = await application.getSyncEntityLinks().execute({
        entityId,
        sourceEntityType,
        linkedEntities,
      })
      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { entityId, sourceEntityType }
    },
    onSuccess: ({ entityId }) => {
      // Invalidate entity links query to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.entityLinks.byEntity(workspaceId, entityId),
      })
    },
  })
}

/**
 * Helper to build LinkedEntityInput from extracted link information.
 */
export function buildLinkedEntityInput(
  targetEntityType: string,
  targetEntityId: string,
  linkType: LinkType = "explicit"
): LinkedEntityInput {
  return {
    target_entity_type: targetEntityType,
    target_entity_id: targetEntityId,
    link_type: linkType,
  }
}

/**
 * Re-export EntityLink type for convenience.
 */
export type { EntityLink, LinkedEntityInput, LinkType }
