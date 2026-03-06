import { Draft } from "../models/entity"
import { EventBus } from "./event-bus"
import { logger } from "../utils/logger"
import { SyncDraft, DRAFT_RETRY_DELAYS_MS } from "../usecase/entities/entities"

export class DraftSyncScheduler {
  private draftRetryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(
    private readonly eventBus: EventBus,
    private readonly syncDraft: SyncDraft
  ) {
    this.eventBus.subscribe(this.eventBus.EVENTS.SCHEDULE_DRAFT_RETRY, (draft: Draft) => {
      this.scheduleRetry(draft)
    })
    this.eventBus.subscribe(this.eventBus.EVENTS.CANCEL_DRAFT_RETRY, (entityId: string) => {
      this.clearRetryTimer(entityId)
    })
  }

  public clearRetryTimer(entityId: string): void {
    const timer = this.draftRetryTimers.get(entityId)
    if (timer) {
      clearTimeout(timer)
      this.draftRetryTimers.delete(entityId)
    }
  }

  public clearAllRetryTimers(): void {
    for (const timer of this.draftRetryTimers.values()) {
      clearTimeout(timer)
    }
    this.draftRetryTimers.clear()
  }

  public scheduleRetry(draft: Draft): void {
    const retryIndex = Math.max(0, draft.saveAttempts - 1)
    const delay = DRAFT_RETRY_DELAYS_MS[Math.min(retryIndex, DRAFT_RETRY_DELAYS_MS.length - 1)]

    this.clearRetryTimer(draft.id)

    const timer = setTimeout(() => {
      this.clearRetryTimer(draft.id)
      this.syncDraft.execute(draft.id).catch(error => {
        logger.warn("DraftService: scheduled retry failed", error)
      })
    }, delay)
    this.draftRetryTimers.set(draft.id, timer)
  }
}
