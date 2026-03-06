import { GlobalClient } from "../../engine/global/global-client"
import { logger } from "../../engine/utils/logger"
import { IndexedDBOfflineDatabase } from "../offline"
import { resolveApiUrlFromEnvironment } from "./api-url"
import { WebStorageProvider } from "./web-storage-provider"

// Compute once so the GlobalClient and UI defaults stay in sync.
const API_URL = resolveApiUrlFromEnvironment()

export const initializeGlobalClient = async () => {
  logger.info("Initializing global client with API URL.", API_URL)

  const storage = new WebStorageProvider()
  const offlineDatabase = new IndexedDBOfflineDatabase()
  const client = new GlobalClient(storage, API_URL, offlineDatabase, "global")

  await client.initialize()

  logger.info("Global client initialized.")

  return { client, storage }
}
