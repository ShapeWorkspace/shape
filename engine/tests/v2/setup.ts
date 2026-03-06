/**
 * Integration test setup for the engine (v2).
 *
 * This file configures the Node.js test environment with all necessary polyfills
 * and hooks for testing the engine against a running server.
 *
 * Polyfills provided:
 * - WebCrypto API (for crypto operations)
 * - fetch with cookie jar support (for session persistence across requests)
 * - EventSource with cookie support (for SSE connections)
 *
 * Lifecycle hooks:
 * - beforeEach: Clears cookies, suppresses console noise
 * - afterEach: Clears storage
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Load environment variables from root and web .env.local files
// This must happen before any code that reads process.env
import { config } from "dotenv"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "../../..")

// Load in order: root .env.local, server/.env.local, then web/.env.local (first wins for each var)
// quiet: true silences dotenvx advertising/tips in stdout
config({ path: resolve(rootDir, ".env.local"), quiet: true })
config({ path: resolve(rootDir, "server/.env.local"), quiet: true })
config({ path: resolve(rootDir, "web/.env.local"), quiet: true })

// Set up WebCrypto API for Node.js environment
const { webcrypto } = await import("crypto")
if (!globalThis.crypto?.subtle) {
  // @ts-expect-error Close enough polyfill for Node.js
  globalThis.crypto = webcrypto
}

import { beforeEach, afterEach, vi } from "vitest"

// Use node-fetch with cookie jar support for session persistence
import nodeFetch from "node-fetch"
import fetchCookie from "fetch-cookie"
import { CookieJar } from "tough-cookie"
import { FormData as NodeFormData, Blob as NodeBlob, File as NodeFile } from "formdata-node"
import { logger, LogLevel } from "../../utils/logger"
import { StorageProvider } from "../../storage/storage-provider"

// Single shared cookie jar for all tests - maintains session state across requests
const jar = new CookieJar()

// Export the jar for tests that need direct cookie inspection
export { jar as cookieJar }

// Ensure API_URL is available for tests - requires VITE_API_URL or VITE_SERVER_PORT.
if (!process.env.API_URL) {
  if (process.env.VITE_API_URL) {
    process.env.API_URL = process.env.VITE_API_URL
  } else if (process.env.VITE_SERVER_PORT) {
    process.env.API_URL = `http://127.0.0.1:${process.env.VITE_SERVER_PORT}/api`
  } else {
    throw new Error("VITE_API_URL or VITE_SERVER_PORT environment variable is required for integration tests")
  }
}

// Align AbortController/AbortSignal with Node's globals so SSE fetches accept the signal.
Object.defineProperty(globalThis, "AbortController", {
  value: global.AbortController,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, "AbortSignal", {
  value: global.AbortSignal,
  configurable: true,
  writable: true,
})

// Preserve the native fetch for EventSource's streaming requirements.
const nativeFetch = globalThis.fetch
const nativeAbortController = globalThis.AbortController
const nativeAbortSignal = globalThis.AbortSignal

// Create fetch with cookie support (node-fetch).
// Cast through unknown because node-fetch's Response type differs slightly from native Response
// (e.g., missing `bytes()` method), but they're compatible enough for our usage.
const fetchWithCookies = fetchCookie(nodeFetch as unknown as typeof fetch, jar) as typeof fetch

// Set global fetch with cookie support (override jsdom's default fetch if present)
Object.defineProperty(globalThis, "fetch", {
  value: fetchWithCookies,
  configurable: true,
  writable: true,
})
globalThis.FormData = NodeFormData as unknown as typeof FormData
globalThis.Blob = NodeBlob as unknown as typeof Blob
globalThis.File = NodeFile as unknown as typeof File

// Ensure EventSource uses the native fetch with ReadableStream support.
// Temporarily clear AbortController so event-source-polyfill installs its shim,
// which avoids AbortSignal realm mismatches in the jsdom test environment.
Object.defineProperty(globalThis, "AbortController", {
  value: undefined,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, "AbortSignal", {
  value: undefined,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, "fetch", {
  value: nativeFetch,
  configurable: true,
  writable: true,
})
const { EventSourcePolyfill } = await import("event-source-polyfill")
Object.defineProperty(globalThis, "AbortController", {
  value: nativeAbortController,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, "AbortSignal", {
  value: nativeAbortSignal,
  configurable: true,
  writable: true,
})
Object.defineProperty(globalThis, "fetch", {
  value: fetchWithCookies,
  configurable: true,
  writable: true,
})

/**
 * Cookie-aware EventSource implementation for SSE connections.
 * Extracts cookies from the shared jar and includes them in the request headers.
 */
class CookieAwareEventSource extends EventSourcePolyfill {
  constructor(url: string | URL, eventSourceInitDict?: any) {
    // Get cookies from the jar and add them as headers
    const cookies = jar.getCookiesSync(typeof url === "string" ? url : url.toString())
    const cookieHeader = cookies.map(cookie => `${cookie.key}=${cookie.value}`).join("; ")

    super(url.toString(), {
      ...eventSourceInitDict,
      headers: {
        ...eventSourceInitDict?.headers,
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
    })
  }
}

globalThis.EventSource = CookieAwareEventSource as any

/**
 * In-memory storage provider for integration tests.
 * Simulates device storage without requiring IndexedDB or localStorage.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private storage: Map<string, Map<string, string>> = new Map()

  async get(workspaceId: string, key: string): Promise<string | undefined> {
    const workspace = this.storage.get(workspaceId)
    return workspace?.get(key)
  }

  async set(workspaceId: string, key: string, value: string): Promise<void> {
    if (!this.storage.has(workspaceId)) {
      this.storage.set(workspaceId, new Map())
    }
    this.storage.get(workspaceId)!.set(key, value)
  }

  async remove(workspaceId: string, key: string): Promise<void> {
    this.storage.get(workspaceId)?.delete(key)
  }

  async clear(workspaceId: string): Promise<void> {
    this.storage.delete(workspaceId)
  }

  async getKeys(workspaceId: string): Promise<string[]> {
    const workspace = this.storage.get(workspaceId)
    return workspace ? Array.from(workspace.keys()) : []
  }

  /**
   * Clears all storage - useful for test cleanup.
   */
  clearAll(): void {
    this.storage.clear()
  }
}

// Shared storage instance for test lifecycle management
let sharedStorage: InMemoryStorageProvider | null = null

/**
 * Returns a shared in-memory storage provider instance.
 * This allows multiple clients to share storage across a single test run.
 */
export function getSharedStorage(): InMemoryStorageProvider {
  if (!sharedStorage) {
    sharedStorage = new InMemoryStorageProvider()
  }
  return sharedStorage
}

// Set up console mocking and cleanup hooks
beforeEach(async () => {
  // Clear cookies before each test to ensure clean session state
  jar.removeAllCookiesSync()

  // Clear shared storage to avoid cross-test leakage
  sharedStorage?.clearAll()
  sharedStorage = null

  // Suppress logger output during tests (set to ERROR to reduce noise)
  logger.setLogLevel(LogLevel.ERROR)
})

afterEach(async () => {
  // Restore console methods and mocks
  vi.restoreAllMocks()

  // Clear storage after each test
  sharedStorage?.clearAll()
  sharedStorage = null
})
