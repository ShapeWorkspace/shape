import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { useWorkspaceMembers } from "./use-workspace-members"
import { queryKeys } from "./query-keys"

/**
 * Resource types supported by ACL-scoped mention suggestions.
 */
export type MentionableResourceType =
  | "project"
  | "paper"
  | "file"
  | "folder"
  | "group_chat"
  | "forum_channel"

/**
 * Context for resolving mention suggestions.
 * - "acl": uses server ACL scope by resource.
 * - "static": uses an explicit list of user IDs (e.g., DMs, notes).
 */
export type MentionSuggestionContext =
  | { contextType: "acl"; resourceType: MentionableResourceType; resourceId: string }
  | { contextType: "static"; userIds: string[] }

/**
 * Mention suggestion item used by the TipTap autocomplete UI.
 */
export interface MentionSuggestionItem {
  userId: string
  label: string
  email: string
  avatarDataUrl: string | null
}

/**
 * Returns mention suggestion items scoped to the provided context.
 */
export function useMentionSuggestionItems(context?: MentionSuggestionContext) {
  const { application } = useEngineStore()
  const { data: workspaceMembers = [] } = useWorkspaceMembers()
  const workspaceId = application?.workspaceId ?? ""

  const aclScopeQuery = useQuery({
    queryKey:
      context?.contextType === "acl" && application
        ? queryKeys.mentionSuggestions.byResource(
            workspaceId,
            context.resourceType,
            context.resourceId
          )
        : ["mentionSuggestions", "disabled"],
    queryFn: async (): Promise<string[]> => {
      if (!application || context?.contextType !== "acl") {
        return []
      }
      const idsResult = await application.getGetMentionableUserIds().execute({
        workspaceId,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
      })
      if (idsResult.isFailed()) {
        throw new Error(idsResult.getError())
      }
      return idsResult.getValue()
    },
    enabled: !!application && context?.contextType === "acl",
    staleTime: 0,
    networkMode: "always",
  })

  const mentionableUserIds = useMemo(() => {
    if (!context) {
      return []
    }
    if (context.contextType === "static") {
      return context.userIds
    }
    return aclScopeQuery.data ?? []
  }, [context, aclScopeQuery.data])

  const mentionSuggestionItems = useMemo(() => {
    if (mentionableUserIds.length === 0) {
      return []
    }

    const memberByUserId = new Map(
      workspaceMembers.map(member => [member.userId, member])
    )
    const seenUserIds = new Set<string>()
    const items: MentionSuggestionItem[] = []

    for (const userId of mentionableUserIds) {
      if (seenUserIds.has(userId)) {
        continue
      }
      seenUserIds.add(userId)
      const member = memberByUserId.get(userId)
      if (!member) {
        continue
      }
      const label = member.displayName || member.user?.email || "Unknown member"
      items.push({
        userId: member.userId,
        label,
        email: member.user?.email ?? "",
        avatarDataUrl: member.avatarDataUrl ?? null,
      })
    }

    items.sort((a, b) => a.label.localeCompare(b.label))

    return items
  }, [mentionableUserIds, workspaceMembers])

  return {
    items: mentionSuggestionItems,
    isLoading: aclScopeQuery.isLoading,
  }
}
