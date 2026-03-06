import { useCallback, useMemo } from "react"
import { Copy, Download } from "lucide-react"
import type { ServerBlock } from "../../engine/models/entity"
import { useNoteBlocks } from "../store/queries/use-notes"
import { usePaperBlocks } from "../store/queries/use-papers"
import { useTaskBlocks } from "../store/queries/use-project-tasks"
import { useEntityBlocksPlaintext } from "../hooks/useEntityBlocksPlaintext"
import { useMarkdownExportActions } from "../hooks/useMarkdownExportActions"
import { buildMarkdownDocument } from "../utils/markdown-export"
import { useExportPlaintextSnapshot, useExportTitleSnapshot } from "../store/export-snapshot-store"
import { Sidecar, SidecarSection, SidecarMenu, SidecarRow } from "./SidecarUI"
import * as styles from "../styles/sidecar.css"

interface MarkdownExportSidecarBaseProps {
  title: string | null | undefined
  blocks: ServerBlock[] | undefined
  isBlocksLoading: boolean
  blocksError: Error | null
  livePlaintext: string | undefined
  liveTitle: string | undefined
}

/**
 * Base export sidecar that handles Markdown rendering and actions.
 */
function MarkdownExportSidecarBase({
  title,
  blocks,
  isBlocksLoading,
  blocksError,
  livePlaintext,
  liveTitle,
}: MarkdownExportSidecarBaseProps) {
  const { plaintext, isLoading, errorMessage } = useEntityBlocksPlaintext({
    blocks,
    isBlocksLoading,
    blocksError,
  })

  const shouldUseLivePlaintext = livePlaintext !== undefined
  const plaintextForExport = shouldUseLivePlaintext ? livePlaintext : plaintext

  const titleForExport = liveTitle !== undefined ? liveTitle : title

  const markdownDocument = useMemo(() => {
    return buildMarkdownDocument({ title: titleForExport, body: plaintextForExport })
  }, [plaintextForExport, titleForExport])

  const {
    copyMarkdownToClipboard,
    saveMarkdownToFile,
    isCopyFeedbackVisible,
    isSaveFeedbackVisible,
  } = useMarkdownExportActions({
    markdown: markdownDocument,
    title: titleForExport,
  })

  const isActionDisabled = shouldUseLivePlaintext ? false : isLoading || Boolean(errorMessage)
  const actionMeta = shouldUseLivePlaintext
    ? undefined
    : isLoading
      ? "Loading..."
      : errorMessage
        ? "Unavailable"
        : undefined

  const handleSelect = useCallback(
    (index: number) => {
      if (isActionDisabled) {
        return
      }

      if (index === 0) {
        copyMarkdownToClipboard()
      } else if (index === 1) {
        saveMarkdownToFile()
      }
    },
    [copyMarkdownToClipboard, saveMarkdownToFile, isActionDisabled]
  )

  return (
    <Sidecar itemCount={2} onSelect={handleSelect}>
      {!shouldUseLivePlaintext && (isLoading || errorMessage) && (
        <SidecarSection title="Status">
          <div className={styles.sidecarEmpty}>{errorMessage ?? "Loading content..."}</div>
        </SidecarSection>
      )}

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Copy size={14} />}
            title={isCopyFeedbackVisible ? "Copied" : "Copy as markdown"}
            meta={actionMeta}
            disabled={isActionDisabled}
            onClick={copyMarkdownToClipboard}
            testId="export-copy-markdown"
          />
          <SidecarRow
            index={1}
            icon={<Download size={14} />}
            title={isSaveFeedbackVisible ? "Saved" : "Save as markdown"}
            meta={actionMeta}
            disabled={isActionDisabled}
            onClick={saveMarkdownToFile}
            testId="export-save-markdown"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

interface NoteMarkdownExportSidecarProps {
  noteId: string
  noteTitle: string | null | undefined
}

/**
 * Export sidecar for Notes.
 */
export function NoteMarkdownExportSidecar({ noteId, noteTitle }: NoteMarkdownExportSidecarProps) {
  const livePlaintext = useExportPlaintextSnapshot("note", noteId)
  const liveTitle = useExportTitleSnapshot("note", noteId)
  const { data: blocks, isLoading, error } = useNoteBlocks(noteId)

  return (
    <MarkdownExportSidecarBase
      title={noteTitle}
      blocks={blocks}
      isBlocksLoading={isLoading}
      blocksError={error ?? null}
      livePlaintext={livePlaintext}
      liveTitle={liveTitle}
    />
  )
}

interface PaperMarkdownExportSidecarProps {
  paperId: string
  paperTitle: string | null | undefined
}

/**
 * Export sidecar for Papers.
 */
export function PaperMarkdownExportSidecar({ paperId, paperTitle }: PaperMarkdownExportSidecarProps) {
  const livePlaintext = useExportPlaintextSnapshot("paper", paperId)
  const liveTitle = useExportTitleSnapshot("paper", paperId)
  const { data: blocks, isLoading, error } = usePaperBlocks(paperId)

  return (
    <MarkdownExportSidecarBase
      title={paperTitle}
      blocks={blocks}
      isBlocksLoading={isLoading}
      blocksError={error ?? null}
      livePlaintext={livePlaintext}
      liveTitle={liveTitle}
    />
  )
}

interface TaskMarkdownExportSidecarProps {
  projectId: string
  taskId: string
  taskTitle: string | null | undefined
}

/**
 * Export sidecar for Tasks.
 */
export function TaskMarkdownExportSidecar({
  projectId,
  taskId,
  taskTitle,
}: TaskMarkdownExportSidecarProps) {
  const livePlaintext = useExportPlaintextSnapshot("task", taskId)
  const liveTitle = useExportTitleSnapshot("task", taskId)
  const { data: blocks, isLoading, error } = useTaskBlocks(projectId, taskId)

  return (
    <MarkdownExportSidecarBase
      title={taskTitle}
      blocks={blocks}
      isBlocksLoading={isLoading}
      blocksError={error ?? null}
      livePlaintext={livePlaintext}
      liveTitle={liveTitle}
    />
  )
}
