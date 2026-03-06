export class WorkspaceInfoStore {
  constructor(
    public readonly isRemote: boolean,
    public readonly workspaceId: string,
    public readonly userId: string
  ) {}

  public isOnline(): boolean {
    if (typeof navigator === "undefined") {
      return true
    }
    return navigator.onLine !== false
  }
}
