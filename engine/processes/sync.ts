import { EventBus } from "./event-bus"
import { Sync } from "../usecase/entities/entities"

export class SyncProcess {
  constructor(
    private readonly eventBus: EventBus,
    private readonly sync: Sync
  ) {
    this.eventBus.subscribe(this.eventBus.EVENTS.SSE_RECONNECTED, () => {
      void this.sync.execute()
    })
  }
}
