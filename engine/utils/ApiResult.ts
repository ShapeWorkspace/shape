/**
 * Structured error returned by API requests.
 * Contains HTTP status, optional error code (for billing errors, etc.), and message.
 */
export type ApiError = {
  status: number
  code?: string
  message: string
}

/**
 * Result type for API requests that preserves HTTP error information.
 * Unlike Result<T>, ApiResult carries structured error data (status, code, message)
 * instead of just an error string.
 */
export class ApiResult<T> {
  constructor(
    private isSuccess: boolean,
    private error?: ApiError,
    private value?: T
  ) {
    Object.freeze(this)
  }

  isFailed(): boolean {
    return !this.isSuccess
  }

  getValue(): T {
    if (!this.isSuccess) {
      throw new Error(`Cannot get value of an unsuccessful result: ${this.error?.message}`)
    }

    return this.value as T
  }

  getError(): ApiError {
    if (this.isSuccess || this.error === undefined) {
      throw new Error("Cannot get an error of a successful result")
    }

    return this.error
  }

  getErrorMessage(): string {
    if (this.isSuccess || this.error === undefined) {
      throw new Error("Cannot get an error message of a successful result")
    }

    return this.error.message
  }

  /**
   * Check if the error has a specific HTTP status code.
   */
  hasStatus(status: number): boolean {
    return this.error?.status === status
  }

  /**
   * Check if the error has a specific error code (e.g., "workspace_read_only").
   */
  hasCode(code: string): boolean {
    return this.error?.code === code
  }

  static ok<U>(value?: U): ApiResult<U> {
    return new ApiResult<U>(true, undefined, value)
  }

  static fail<U>(error: ApiError): ApiResult<U> {
    if (!error) {
      throw new Error("Attempting to create a failed result without an error")
    }

    return new ApiResult<U>(false, error)
  }
}
