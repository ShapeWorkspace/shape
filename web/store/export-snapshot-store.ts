import { create } from "zustand"

type ExportSnapshotEntityType = "note" | "paper" | "task"

interface ExportSnapshotState {
  /**
   * Latest plaintext snapshot for an entity, keyed by `${entityType}:${entityId}`.
   * We keep plaintext here so export sidecars can avoid stale block reads.
   */
  plaintextSnapshotsByEntityKey: Record<string, string | undefined>
  /**
   * Latest title snapshot for an entity, keyed by `${entityType}:${entityId}`.
   * This tracks local edits before they are persisted.
   */
  titleSnapshotsByEntityKey: Record<string, string | undefined>
  /**
   * Register or update the latest plaintext snapshot for an entity.
   */
  setPlaintextSnapshotForEntity: (entityType: ExportSnapshotEntityType, entityId: string, plaintext: string) => void
  /**
   * Register or update the latest title snapshot for an entity.
   */
  setTitleSnapshotForEntity: (entityType: ExportSnapshotEntityType, entityId: string, title: string) => void
  /**
   * Clear the stored snapshot for an entity when its editor unmounts.
   */
  clearPlaintextSnapshotForEntity: (entityType: ExportSnapshotEntityType, entityId: string) => void
  /**
   * Clear the stored title snapshot for an entity when its editor unmounts.
   */
  clearTitleSnapshotForEntity: (entityType: ExportSnapshotEntityType, entityId: string) => void
}

function buildExportSnapshotEntityKey(entityType: ExportSnapshotEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export const useExportSnapshotStore = create<ExportSnapshotState>(set => ({
  plaintextSnapshotsByEntityKey: {},
  titleSnapshotsByEntityKey: {},
  setPlaintextSnapshotForEntity: (entityType, entityId, plaintext) =>
    set(state => {
      const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
      return {
        plaintextSnapshotsByEntityKey: {
          ...state.plaintextSnapshotsByEntityKey,
          [entityKey]: plaintext,
        },
      }
    }),
  setTitleSnapshotForEntity: (entityType, entityId, title) =>
    set(state => {
      const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
      return {
        titleSnapshotsByEntityKey: {
          ...state.titleSnapshotsByEntityKey,
          [entityKey]: title,
        },
      }
    }),
  clearPlaintextSnapshotForEntity: (entityType, entityId) =>
    set(state => {
      const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
      if (!(entityKey in state.plaintextSnapshotsByEntityKey)) {
        return state
      }

      const { [entityKey]: _unused, ...nextSnapshots } = state.plaintextSnapshotsByEntityKey
      return { plaintextSnapshotsByEntityKey: nextSnapshots }
    }),
  clearTitleSnapshotForEntity: (entityType, entityId) =>
    set(state => {
      const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
      if (!(entityKey in state.titleSnapshotsByEntityKey)) {
        return state
      }

      const { [entityKey]: _unused, ...nextSnapshots } = state.titleSnapshotsByEntityKey
      return { titleSnapshotsByEntityKey: nextSnapshots }
    }),
}))

export function useExportPlaintextSnapshot(entityType: ExportSnapshotEntityType, entityId: string) {
  const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
  return useExportSnapshotStore(state => state.plaintextSnapshotsByEntityKey[entityKey])
}

export function useExportTitleSnapshot(entityType: ExportSnapshotEntityType, entityId: string) {
  const entityKey = buildExportSnapshotEntityKey(entityType, entityId)
  return useExportSnapshotStore(state => state.titleSnapshotsByEntityKey[entityKey])
}
