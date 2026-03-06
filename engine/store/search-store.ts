export class SearchStore {
  private readonly searchIndexObservers: Set<() => void> = new Set()

  addSearchIndexObserver(observer: () => void): void {
    this.searchIndexObservers.add(observer)
  }

  removeSearchIndexObserver(observer: () => void): void {
    this.searchIndexObservers.delete(observer)
  }

  notifySearchIndexChanged(): void {
    for (const observer of this.searchIndexObservers) {
      observer()
    }
  }
}
