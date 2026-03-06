import type { Result } from "../Result"

export interface SyncUseCaseInterface<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(...args: any[]): Result<T>
}
