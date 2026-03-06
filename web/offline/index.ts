/**
 * Offline caching module for Shape web client.
 *
 * Provides IndexedDB-based persistence for encrypted entities,
 * enabling instant display on app load with stale-while-revalidate semantics.
 */

export { IndexedDBOfflineDatabase } from "./IndexedDBOfflineCacheProvider"
