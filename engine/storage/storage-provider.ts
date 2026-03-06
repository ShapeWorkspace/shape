export interface StorageProvider {
  get: (namespace: string, key: string) => Promise<string | undefined>
  set: (namespace: string, key: string, value: string) => Promise<void>
  remove: (namespace: string, key: string) => Promise<void>
  clear: (namespace: string) => Promise<void>
  getKeys: (namespace: string) => Promise<string[]>
}
