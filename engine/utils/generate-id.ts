import { v4 as uuidv4 } from "uuid"

/**
 * Generates a UUID that works in both secure and insecure browser contexts.
 * Browsers only expose crypto.randomUUID in secure contexts (HTTPS or localhost).
 * When running on custom http://*.local dev domains we fall back to uuidv4.
 */
export const generateClientUUID = (): string => {
  try {
    if (typeof globalThis !== "undefined") {
      const cryptoObj = globalThis.crypto
      if (cryptoObj?.randomUUID) {
        return cryptoObj.randomUUID()
      }
    }
  } catch {
    // Ignore and fall back below.
  }

  return uuidv4()
}
