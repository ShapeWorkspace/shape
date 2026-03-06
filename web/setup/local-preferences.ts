import { GlobalStorage, GlobalStorageKeys } from "../../engine/storage/global-storage"
import { LayoutMode } from "../contexts/SidecarContext"

/**
 * LocalPreferencesService provides typed access to user preferences
 * that are persisted locally using DeviceStorage.
 *
 * These preferences are global (not workspace-scoped) and persist
 * across sessions.
 */
export class LocalPreferencesService {
  constructor(private readonly globalStorage: GlobalStorage) {}

  /**
   * Get the user's preferred layout mode.
   * Returns 'compact' if not set or invalid.
   */
  async getLayoutMode(): Promise<LayoutMode> {
    try {
      const value = await this.globalStorage.get(GlobalStorageKeys.LayoutMode)
      if (value === "full" || value === "compact") {
        return value
      }
    } catch (error) {
      console.warn("Failed to get layout mode preference:", error)
    }
    return "compact"
  }

  /**
   * Set the user's preferred layout mode.
   */
  async setLayoutMode(mode: LayoutMode): Promise<void> {
    try {
      await this.globalStorage.set(GlobalStorageKeys.LayoutMode, mode)
    } catch (error) {
      console.warn("Failed to save layout mode preference:", error)
    }
  }
}
