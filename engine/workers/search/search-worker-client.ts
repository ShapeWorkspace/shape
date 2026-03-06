/**
 * Search Worker Client
 *
 * Creates and manages the search index with:
 * - DecryptWorker (Comlink) for CPU-intensive decryption
 * - FlexSearchIndex for indexing and searching with IndexedDB persistence
 *
 * The decrypt worker runs in a separate thread to avoid blocking the UI
 * during crypto operations. FlexSearch runs in the main thread but
 * delegates heavy work to the event loop.
 */

import { wrap, Remote } from "comlink"
import type { SearchIndexInterface } from "../../../engine/search/search-types"
import type { DecryptionWorker } from "./decrypt.worker"
import { FlexSearchIndexV2 } from "./flexsearch-index-v2"
import { SearchStore } from "../../store/search-store"

// Singleton instances
let decryptWorker: Worker | null = null
let decryptWorkerProxy: Remote<DecryptionWorker> | null = null
let flexSearchIndex: FlexSearchIndexV2 | null = null

/**
 * Get or create the decrypt worker.
 */
async function getDecryptWorkerProxy(): Promise<Remote<DecryptionWorker>> {
  if (decryptWorkerProxy) {
    return decryptWorkerProxy
  }

  // Create the worker using Vite's worker import syntax
  decryptWorker = new Worker(new URL("./decrypt.worker.ts", import.meta.url), { type: "module" })

  decryptWorkerProxy = wrap<DecryptionWorker>(decryptWorker)

  // Initialize libsodium in the worker
  await decryptWorkerProxy.initialize()

  return decryptWorkerProxy
}

/**
 * Get or create the search index.
 * Returns the FlexSearchIndex which implements ISearchIndex.
 */
export async function getSearchWorker(workspaceId: string): Promise<SearchIndexInterface | null> {
  if (flexSearchIndex) {
    return flexSearchIndex
  }

  const proxy = await getDecryptWorkerProxy()

  const searchStore = new SearchStore()
  flexSearchIndex = new FlexSearchIndexV2(proxy, workspaceId, searchStore)

  return flexSearchIndex
}

/**
 * Terminate the search infrastructure and clean up resources.
 */
export function terminateSearchWorker(): void {
  // Clean up FlexSearchIndex
  if (flexSearchIndex) {
    flexSearchIndex.destroy()
    flexSearchIndex = null
  }

  // Terminate the decrypt worker
  if (decryptWorker) {
    decryptWorker.terminate()
    decryptWorker = null
  }
  decryptWorkerProxy = null
}

/**
 * Initialize search for a workspace.
 * Returns the search index, or null if unavailable.
 */
export async function initializeSearchForWorkspace(
  workspaceId: string
): Promise<SearchIndexInterface | null> {
  const searchIndex = await getSearchWorker(workspaceId)
  if (!searchIndex) return null
  await searchIndex.initialize()
  return searchIndex
}
