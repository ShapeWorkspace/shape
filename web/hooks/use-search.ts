/**
 * useSearch Hook
 *
 * React hook for performing search queries with debouncing.
 * Integrates with the search index to execute searches.
 *
 * Search returns only entity IDs - this hook enriches them with data from the entity store.
 * After page reload, entities may not be in memory cache, so we fetch from the repository cache.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { isSearchableEntityType } from "../../engine/search/search-types"
import type {
  SearchableEntityType,
  SearchHit,
  SearchQueryOptions,
  SearchIndexInterface,
} from "../../engine/search/search-types"
import { useEngineStore, type EngineStore } from "../store/engine-store"
import { extractPlaintextFromTipTapJson } from "../lib/tiptap-json"
import { getPlainTextPreview, normalizeHtmlStringForPlaintextDisplay } from "../utils/text-utils"
import type { ClientEntity } from "../../engine/models/entity"
import { getEntityBody, getEntityName, getEntityTitle } from "../utils/entity-content"
import type { WorkspaceMember } from "../../engine/models/workspace-member"

// Default debounce delay in milliseconds (0 = instant search)
const DEFAULT_DEBOUNCE_MS = 0

/**
 * Enriched search result with entity data from the entity store.
 */
export interface EnrichedSearchResult {
  entityId: string
  entityType: SearchableEntityType
  title: string
  subtitle?: string
  score: number
  /** Parent ID for navigation (e.g., discussionId for forum-reply) */
  parentId?: string
  /** Project ID for task comment navigation */
  projectId?: string
  /** Task ID for task comment navigation */
  taskId?: string
  /** Paper ID for paper comment navigation */
  paperId?: string
  /** Comment thread ID for paper comment reply navigation */
  commentId?: string
}

/**
 * Options for the useSearch hook.
 */
export interface UseSearchOptions {
  /**
   * Filter by entity type(s). If undefined, search all types.
   */
  entityTypes?: SearchableEntityType[]
  /**
   * Debounce delay in milliseconds.
   */
  debounceMs?: number
  /**
   * Search index instance to use.
   */
  searchIndex?: SearchIndexInterface
}

/**
 * Return type for the useSearch hook.
 */
export interface UseSearchResult {
  /**
   * Whether search is available.
   */
  isAvailable: boolean
  /**
   * Current search query string.
   */
  query: string
  /**
   * Set the search query.
   */
  setQuery: (query: string) => void
  /**
   * Enriched search results from the most recent query.
   */
  results: EnrichedSearchResult[]
  /**
   * Whether a search is currently in progress.
   */
  isSearching: boolean
  /**
   * Clear the search query and results.
   */
  clearSearch: () => void
  /**
   * Whether the search is active (has a non-empty query).
   */
  isActive: boolean
}

/**
 * Entity display data for search results.
 */
interface EntityDisplayData {
  title: string
  subtitle?: string
  /** Parent ID for navigation (e.g., discussionId for forum-reply) */
  parentId?: string
  /** Project ID for task comment navigation */
  projectId?: string
  /** Task ID for task comment navigation */
  taskId?: string
  /** Paper ID for paper comment navigation */
  paperId?: string
  /** Comment thread ID for paper comment reply navigation */
  commentId?: string
}

interface LookupContext {
  resolveEntity: (entityId: string) => Promise<ClientEntity | undefined>
  resolveMemberEmail: (userId: string) => Promise<string | undefined>
}

function resolveDisplayText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : fallback
}

function buildHtmlPreview(body: string | null | undefined, fallback: string): string {
  const normalized = normalizeHtmlStringForPlaintextDisplay(body ?? "")
  return resolveDisplayText(normalized, fallback)
}

function matchWorkspaceMemberQuery(member: WorkspaceMember, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return false
  const searchableParts = [member.displayName, member.user?.email]
  return searchableParts.some(part => (part ?? "").toLowerCase().includes(normalizedQuery))
}

/**
 * Look up an entity by type and ID.
 *
 * First checks the in-memory entity cache (instant).
 * If not found, fetches from the repository cache (async).
 * This ensures search results display after page reload when memory caches are empty.
 */
async function lookupEntity(context: LookupContext, hit: SearchHit): Promise<EntityDisplayData | null> {
  const entityType = hit.entityType
  if (!isSearchableEntityType(entityType)) {
    return null
  }

  const entityId = hit.entityId
  switch (entityType) {
    case "note": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityTitle(entity) ?? getEntityName(entity), "Untitled")
      return { title }
    }

    case "project": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Project")
      return { title, subtitle: "Project" }
    }

    case "task": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityTitle(entity), "Task")
      const projectId =
        entity.parentType === "project" && entity.parentId ? entity.parentId : undefined
      const project = projectId ? await context.resolveEntity(projectId) : undefined
      const subtitle = resolveDisplayText(getEntityName(project), "Project")
      return { title, subtitle, projectId }
    }

    case "project-tag": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Tag")
      return { title, subtitle: "Tag" }
    }

    case "task-comment": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null

      const title = buildHtmlPreview(getEntityBody(entity), "Task Comment")

      const taskId = entity.parentId ?? undefined
      const taskEntity =
        taskId && entity.parentType === "task" ? await context.resolveEntity(taskId) : undefined
      const taskTitle = resolveDisplayText(getEntityTitle(taskEntity), "Task")

      const projectId =
        taskEntity?.parentType === "project" && taskEntity.parentId ? taskEntity.parentId : undefined
      const projectEntity = projectId ? await context.resolveEntity(projectId) : undefined
      const projectName = resolveDisplayText(getEntityName(projectEntity), "Project")

      return {
        title,
        subtitle: `${projectName} · ${taskTitle}`,
        projectId,
        taskId,
      }
    }

    case "group-chat": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Group")
      return { title, subtitle: "Group" }
    }

    case "group-message": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const messageText =
        "text" in entity.content && typeof entity.content.text === "string" ? entity.content.text : ""
      const preview = resolveDisplayText(getPlainTextPreview(messageText, 50), "Message")
      const groupId =
        entity.parentType === "group-chat" && entity.parentId ? entity.parentId : undefined
      const groupEntity = groupId ? await context.resolveEntity(groupId) : undefined
      const subtitle = resolveDisplayText(getEntityName(groupEntity), "Group")
      return { title: preview, subtitle }
    }

    case "direct-message": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const messageText =
        "text" in entity.content && typeof entity.content.text === "string" ? entity.content.text : ""
      const preview = resolveDisplayText(getPlainTextPreview(messageText, 50), "Message")
      return { title: preview, subtitle: "Direct Message" }
    }

    case "workspace-member": {
      const email = await context.resolveMemberEmail(entityId)
      if (!email) return null
      return { title: email, subtitle: "Contact" }
    }

    case "file": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "File")
      const mimeType =
        "mimeType" in entity.content && typeof entity.content.mimeType === "string"
          ? entity.content.mimeType
          : undefined
      const subtitle = resolveDisplayText(mimeType, "File")
      return { title, subtitle }
    }

    case "folder": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Folder")
      return { title, subtitle: "Folder" }
    }

    case "paper": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Paper")
      return { title, subtitle: "Paper" }
    }

    case "paper-comment": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(extractPlaintextFromTipTapJson(getEntityBody(entity)), "Paper Comment")

      const paperId =
        entity.parentType === "paper" && entity.parentId ? entity.parentId : undefined
      const paperEntity = paperId ? await context.resolveEntity(paperId) : undefined
      const paperName = resolveDisplayText(getEntityName(paperEntity), "Paper")

      return {
        title,
        subtitle: paperName,
        paperId,
        commentId: entity.id,
      }
    }

    case "paper-comment-reply": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(
        extractPlaintextFromTipTapJson(getEntityBody(entity)),
        "Comment Reply"
      )

      const commentId =
        entity.parentType === "paper-comment" && entity.parentId ? entity.parentId : undefined
      const commentEntity = commentId ? await context.resolveEntity(commentId) : undefined
      const paperId =
        commentEntity?.parentType === "paper" && commentEntity.parentId
          ? commentEntity.parentId
          : undefined
      const paperEntity = paperId ? await context.resolveEntity(paperId) : undefined
      const paperName = resolveDisplayText(getEntityName(paperEntity), "Paper")

      return {
        title,
        subtitle: paperName,
        paperId,
        commentId: commentId ?? entity.id,
      }
    }

    case "forum-channel": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityName(entity), "Forum Channel")
      return { title, subtitle: "Forum Channel" }
    }

    case "forum-discussion": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = resolveDisplayText(getEntityTitle(entity), "Discussion")
      const channelId =
        entity.parentType === "forum-channel" && entity.parentId ? entity.parentId : undefined
      const channelEntity = channelId ? await context.resolveEntity(channelId) : undefined
      const subtitle = resolveDisplayText(getEntityName(channelEntity), "Forum Channel")
      return { title, subtitle }
    }

    case "forum-reply": {
      const entity = await context.resolveEntity(entityId)
      if (!entity) return null
      const title = buildHtmlPreview(getEntityBody(entity), "Reply")

      const discussionId =
        entity.parentType === "forum-discussion" && entity.parentId ? entity.parentId : undefined
      const discussionEntity = discussionId ? await context.resolveEntity(discussionId) : undefined
      const subtitle = resolveDisplayText(getEntityTitle(discussionEntity), "Discussion")

      return { title, subtitle, parentId: discussionId }
    }
  }
}

/**
 * Hook for performing debounced search queries.
 *
 * @param options - Search options including filters and debounce settings
 * @returns Search state and control functions
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
  const { entityTypes, debounceMs = DEFAULT_DEBOUNCE_MS, searchIndex: searchIndexOverride } = options

  const application = useEngineStore((state: EngineStore) => state.application)
  const searchIndex = searchIndexOverride ?? application?.getSearchIndex() ?? null
  const normalizedEntityTypes = useMemo<SearchableEntityType[] | undefined>(() => {
    if (!entityTypes || entityTypes.length === 0) {
      return undefined
    }
    return [...entityTypes]
  }, [entityTypes?.join("|")])

  const [query, setQueryState] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [enrichedResults, setEnrichedResults] = useState<EnrichedSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Track latest query and request IDs to prevent stale async updates.
  const queryRef = useRef(query)
  const searchRequestIdRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)
  const indexChangeDebounceTimerRef = useRef<number | null>(null)
  // Track current enrichment operation to avoid stale updates
  const enrichmentIdRef = useRef(0)

  // Keep latest query available for observer callbacks.
  useEffect(() => {
    queryRef.current = query
  }, [query])

  const resolveEntity = useCallback(
    async (entityId: string): Promise<ClientEntity | undefined> => {
      if (!application) return undefined
      const result = await application.getGetOrFetchEntity().execute(entityId)
      if (result.isFailed()) {
        return undefined
      }
      return result.getValue()
    },
    [application]
  )

  const resolveMemberEmail = useCallback(
    async (userId: string): Promise<string | undefined> => {
      if (!application) return undefined
      const memberRepository = application.getRepositoryStore().memberRepository
      const member =
        (await memberRepository.getMemberByUserId(userId)) ?? (await memberRepository.getMemberById(userId))
      const email = member?.user?.email?.trim()
      return email && email.length > 0 ? email : undefined
    },
    [application]
  )

  const lookupContext = useMemo<LookupContext>(
    () => ({
      resolveEntity,
      resolveMemberEmail,
    }),
    [resolveEntity, resolveMemberEmail]
  )

  const resetSearchState = useCallback(() => {
    setHits(currentHits => (currentHits.length === 0 ? currentHits : []))
    setEnrichedResults(currentResults => (currentResults.length === 0 ? currentResults : []))
    setIsSearching(currentIsSearching => (currentIsSearching ? false : currentIsSearching))
  }, [])

  // Perform the search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      const normalizedQuery = searchQuery.trim()
      if (!normalizedQuery || !searchIndex) {
        resetSearchState()
        return
      }

      const requestId = ++searchRequestIdRef.current
      setIsSearching(true)
      try {
        // Entity type filtering happens in the worker
        const searchOptions: SearchQueryOptions = {}
        if (normalizedEntityTypes && normalizedEntityTypes.length > 0) {
          searchOptions.entityTypes = normalizedEntityTypes
        }

        const searchHits = await searchIndex.search(normalizedQuery, searchOptions)
        const shouldIncludeWorkspaceMembers =
          !normalizedEntityTypes ||
          normalizedEntityTypes.length === 0 ||
          normalizedEntityTypes.includes("workspace-member")

        let workspaceMemberHits: SearchHit[] = []
        if (shouldIncludeWorkspaceMembers && application) {
          const manager = application.getWorkspaceMemberManager()
          const existingWorkspaceMemberIds = new Set(
            searchHits
              .filter(hit => hit.entityType === "workspace-member")
              .map(hit => hit.entityId)
          )

          let workspaceMembers = manager.getWorkspaceMembers()
          const hasLocalMemberMatch = workspaceMembers.some(member =>
            matchWorkspaceMemberQuery(member, normalizedQuery)
          )
          if (application.isWorkspaceRemote() && !hasLocalMemberMatch) {
            try {
              workspaceMembers = await manager.fetchWorkspaceMembers()
            } catch {
              // Keep local cached members when refresh fails.
            }
          }

          workspaceMemberHits = workspaceMembers
            .filter(member => !existingWorkspaceMemberIds.has(member.userId))
            .filter(member => matchWorkspaceMemberQuery(member, normalizedQuery))
            .map((member, index) => ({
              entityId: member.userId,
              entityType: "workspace-member",
              score: 50 - index,
            }))
        }
        if (requestId !== searchRequestIdRef.current) {
          return
        }
        setHits([...searchHits, ...workspaceMemberHits])
      } catch (error) {
        console.error("Search failed:", error)
        if (requestId === searchRequestIdRef.current) {
          resetSearchState()
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false)
        }
      }
    },
    [application, normalizedEntityTypes, resetSearchState, searchIndex]
  )

  // Async enrichment: fetch entity data from memory cache or offline cache
  useEffect(() => {
    if (!application || hits.length === 0) {
      setEnrichedResults(currentResults => (currentResults.length === 0 ? currentResults : []))
      return
    }
    const currentEnrichmentId = ++enrichmentIdRef.current

    // Enrich all hits concurrently
    const enrichHits = async () => {
      const results: EnrichedSearchResult[] = []

      // Fetch all entity data in parallel for performance
      const entityDataPromises = hits.map(hit =>
        lookupEntity(lookupContext, hit)
          .then(data => ({ hit, data }))
          .catch(() => ({ hit, data: null }))
      )

      const entityResults = await Promise.all(entityDataPromises)

      // Bail out if a newer enrichment started
      if (enrichmentIdRef.current !== currentEnrichmentId) {
        return
      }

      for (const { hit, data } of entityResults) {
        // Skip entities that couldn't be resolved
        if (!data) {
          continue
        }

        results.push({
          entityId: hit.entityId,
          entityType: hit.entityType,
          title: data.title,
          subtitle: data.subtitle,
          score: hit.score,
          parentId: data.parentId,
          projectId: data.projectId,
          taskId: data.taskId,
          paperId: data.paperId,
          commentId: data.commentId,
        })
      }

      setEnrichedResults(results)
    }

    void enrichHits()
  }, [hits, application, lookupContext])

  // Debounced query setter
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery)
    },
    []
  )

  // Clear search
  const clearSearch = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
    }
    setQueryState("")
    resetSearchState()
  }, [resetSearchState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      if (indexChangeDebounceTimerRef.current !== null) {
        window.clearTimeout(indexChangeDebounceTimerRef.current)
      }
    }
  }, [])

  // Execute search when query/search-index/filter state changes.
  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (!query.trim()) {
      resetSearchState()
      return
    }

    if (!searchIndex) {
      setIsSearching(currentIsSearching => (currentIsSearching ? false : currentIsSearching))
      return
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void performSearch(query)
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [debounceMs, performSearch, query, resetSearchState, searchIndex])

  // Re-run active search when the local index notifies content changes.
  useEffect(() => {
    if (!searchIndex) {
      return
    }

    const handleIndexChange = () => {
      if (!queryRef.current.trim()) {
        return
      }
      if (indexChangeDebounceTimerRef.current !== null) {
        window.clearTimeout(indexChangeDebounceTimerRef.current)
      }
      indexChangeDebounceTimerRef.current = window.setTimeout(() => {
        void performSearch(queryRef.current)
      }, 150)
    }

    searchIndex.addIndexObserver(handleIndexChange)

    return () => {
      searchIndex.removeIndexObserver(handleIndexChange)
      if (indexChangeDebounceTimerRef.current !== null) {
        window.clearTimeout(indexChangeDebounceTimerRef.current)
        indexChangeDebounceTimerRef.current = null
      }
    }
  }, [performSearch, searchIndex])

  return {
    isAvailable: !!searchIndex,
    query,
    setQuery,
    results: enrichedResults,
    isSearching,
    clearSearch,
    isActive: query.trim().length > 0,
  }
}

/**
 * Hook to get the SearchIndex from the current Application.
 * Returns null if no Application is initialized or no SearchIndex is available.
 */
export function useSearchIndex() {
  const application = useEngineStore((state: EngineStore) => state.application)
  return useMemo(() => application?.getSearchIndex() ?? null, [application])
}

/**
 * Convenience hook that combines useSearchIndex with useSearch.
 * Automatically gets the SearchIndex from the engine store.
 */
export function useAppSearch(options: Omit<UseSearchOptions, "searchIndex"> = {}) {
  const searchIndex = useSearchIndex()
  return useSearch({
    ...options,
    searchIndex: searchIndex ?? undefined,
  })
}
