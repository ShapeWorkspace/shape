export abstract class RunOnceInitializer {
  private hasExecuted = false

  public execute(): void {
    if (this.hasExecuted) {
      throw new Error(`${this.constructor.name} has already executed`)
    }
    this.hasExecuted = true
  }
}
