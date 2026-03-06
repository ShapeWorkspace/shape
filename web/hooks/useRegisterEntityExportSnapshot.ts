/**
 * Keeps the export snapshot store in sync with the live Yjs document.
 */

import { useEffect } from "react"
import type * as Y from "yjs"
import { extractPlaintextFromYDoc } from "../utils/yjs-utils"
import { useExportSnapshotStore } from "../store/export-snapshot-store"

type ExportSnapshotEntityType = "note" | "paper" | "task"

interface UseRegisterEntityExportSnapshotOptions {
  entityType: ExportSnapshotEntityType
  entityId: string
  ydoc: Y.Doc
  title?: string
}

export function useRegisterEntityExportSnapshot({
  entityType,
  entityId,
  ydoc,
  title,
}: UseRegisterEntityExportSnapshotOptions) {
  const setPlaintextSnapshotForEntity = useExportSnapshotStore(
    state => state.setPlaintextSnapshotForEntity
  )
  const setTitleSnapshotForEntity = useExportSnapshotStore(state => state.setTitleSnapshotForEntity)
  const clearPlaintextSnapshotForEntity = useExportSnapshotStore(
    state => state.clearPlaintextSnapshotForEntity
  )
  const clearTitleSnapshotForEntity = useExportSnapshotStore(state => state.clearTitleSnapshotForEntity)

  useEffect(() => {
    const updateSnapshotFromYDoc = () => {
      const plaintext = extractPlaintextFromYDoc(ydoc)
      setPlaintextSnapshotForEntity(entityType, entityId, plaintext)
    }

    updateSnapshotFromYDoc()

    const handleYDocUpdate = () => {
      updateSnapshotFromYDoc()
    }

    ydoc.on("update", handleYDocUpdate)

    return () => {
      ydoc.off("update", handleYDocUpdate)
      clearPlaintextSnapshotForEntity(entityType, entityId)
    }
  }, [ydoc, entityType, entityId, setPlaintextSnapshotForEntity, clearPlaintextSnapshotForEntity])

  useEffect(() => {
    if (title === undefined) {
      return
    }

    setTitleSnapshotForEntity(entityType, entityId, title)

    return () => {
      clearTitleSnapshotForEntity(entityType, entityId)
    }
  }, [title, entityType, entityId, setTitleSnapshotForEntity, clearTitleSnapshotForEntity])
}
