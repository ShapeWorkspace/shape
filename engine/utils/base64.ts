// Minimal, chunk-safe base64 helpers for large Uint8Array payloads.

const ifDefined =
  <T, R>(cb: (input: T) => R) =>
  <U extends T | undefined>(input: U): U extends T ? R : undefined =>
    (input !== undefined ? cb(input as T) : undefined) as U extends T ? R : undefined

const isString = (value: unknown): value is string => typeof value === "string"

export const arrayToBinaryString = (bytes: Uint8Array): string => {
  const result: string[] = []
  const blockSize = 1 << 14 // 16 KiB chunks to avoid call stack limits
  const length = bytes.length

  for (let offset = 0; offset < length; offset += blockSize) {
    result.push(
      // @ts-expect-error Uint8Array is callable-compatible with apply
      String.fromCharCode.apply(String, bytes.subarray(offset, Math.min(offset + blockSize, length)))
    )
  }

  return result.join("")
}

export const encodeBase64 = ifDefined((input: string) => btoa(input).trim())
export const decodeBase64 = ifDefined((input: string) => atob(input.trim()))

export const uint8ArrayToBase64String = (array: Uint8Array): string =>
  encodeBase64(arrayToBinaryString(array))!

export const uint8ArrayToString = arrayToBinaryString

export const binaryStringToArray = (str: string): Uint8Array => {
  if (!isString(str)) {
    throw new Error("binaryStringToArray: Data must be in the form of a string")
  }

  const result = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    result[i] = str.charCodeAt(i)
  }
  return result
}

export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = decodeBase64(base64) || ""
  return binaryStringToArray(binary)
}
