import { EventBus } from "./event-bus"

export class VisibilityProcess {
  private hiddenAt: number | null = null
  private visibilityHandler: (() => void) | null = null

  constructor(private readonly eventBus: EventBus) {
    if (typeof document === "undefined") {
      return
    }

    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.hiddenAt = Date.now()
      } else if (document.visibilityState === "visible") {
        if (this.hiddenAt !== null) {
          const hiddenDuration = Date.now() - this.hiddenAt
          this.hiddenAt = null

          // Minimum time hidden before triggering sync on visibility change (5 minutes)
          const VISIBILITY_SYNC_THRESHOLD_MS = 5 * 60 * 1000
          if (hiddenDuration >= VISIBILITY_SYNC_THRESHOLD_MS) {
            this.eventBus.emit(this.eventBus.EVENTS.DOCUMENT_VISIBILITY_CHANGED, hiddenDuration)
          }
        }
      }
    }

    document.addEventListener("visibilitychange", this.visibilityHandler)
  }

  public destroy(): void {
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler)
      this.visibilityHandler = null
    }
  }
}
