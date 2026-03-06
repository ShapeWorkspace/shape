// ============================================================
// Simple Key-Value Cache for non-entity data
// ============================================================
/**
 * SimpleCache is a basic key-value store with change notifications.
 * Used for caches that don't fit the EntityStore pattern (e.g., key-value mappings).
 *
 * Note: Does NOT implement SearchableStore as it stores non-entity data
 * (keys, drafts, etc.) without a meaningful EntityType.
 */

export class SimpleCache<K, V> {
  private readonly cache: Map<K, V> = new Map();
  private changeCallbacks: (() => void)[] = [];

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
    this.notifyChange();
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.notifyChange();
    }
    return existed;
  }

  clear(): void {
    const hadEntries = this.cache.size > 0;
    this.cache.clear();
    if (hadEntries) {
      this.notifyChange();
    }
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  get size(): number {
    return this.cache.size;
  }

  subscribe(callback: () => void): () => void {
    this.changeCallbacks.push(callback);
    return () => {
      this.changeCallbacks = this.changeCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error("Error in simple cache change callback:", error);
      }
    }
  }
}
