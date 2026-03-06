export abstract class Store {
  private data = new Map<symbol, unknown>()

  get<T>(key: symbol): T | undefined {
    return this.data.get(key) as T | undefined
  }

  set<T>(key: symbol, value: T): void {
    this.data.set(key, value)
  }

  delete(key: symbol): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}
