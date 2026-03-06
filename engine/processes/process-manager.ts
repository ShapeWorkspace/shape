import { EventBus } from "./event-bus"
import { VisibilityProcess } from "./visibility"
import { UserProfileProcess } from "./user-profile-process"

export class ProcessManager {
  private readonly visibilityProcess: VisibilityProcess

  constructor(
    private readonly eventBus: EventBus,
    private readonly userProfileProcess: UserProfileProcess
  ) {
    this.visibilityProcess = new VisibilityProcess(this.eventBus)
  }

  public initialize(): void {
    this.userProfileProcess.initialize()
  }

  public destroy(): void {
    this.visibilityProcess.destroy()
    this.userProfileProcess.destroy()
  }
}
