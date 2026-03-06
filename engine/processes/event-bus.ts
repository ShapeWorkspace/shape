export class EventBus {
  private subscribers: Map<string, (data: any) => void> = new Map()

  public readonly EVENTS = {
    SCHEDULE_DRAFT_RETRY: "SCHEDULE_DRAFT_RETRY",
    CANCEL_DRAFT_RETRY: "CANCEL_DRAFT_RETRY",
    DOCUMENT_VISIBILITY_CHANGED: "DOCUMENT_VISIBILITY_CHANGED",
    SSE_RECONNECTED: "SSE_RECONNECTED",
    SYNC_STARTED: "SYNC_STARTED",
    SYNC_COMPLETED: "SYNC_COMPLETED",
  }

  subscribe(event: string, callback: (data: any) => void): () => void {
    this.subscribers.set(event, callback)
    return () => {
      this.subscribers.delete(event)
    }
  }

  emit(event: string, data: any): void {
    const callback = this.subscribers.get(event)
    if (callback) {
      callback(data)
    }
  }
}
