import type { Result } from "../Result"

/**
 * Give it the services it needs in the constructor,
 * and the dynamic parameters it needs in the execute function
 *
 * Example:
 * export class SyncAccount implements UseCaseInterface {
 *  constructor(private accountService: AccountService){}
 *
 *  execute() {
 *   return this.accountService.syncAccount()
 *  }
 * }
 */
export interface UseCaseInterface<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(...args: any[]): Promise<Result<T>>
}
