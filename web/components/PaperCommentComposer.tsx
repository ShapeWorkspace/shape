/**
 * PaperCommentComposer provides a compact rich text editor for composing paper comments.
 *
 * Features:
 * - TipTapEditor in JSON mode (no attachments)
 * - Cmd/Ctrl+Enter sends
 * - Submit exposed for sidecar row actions
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"
import { TipTapEditor } from "./TipTapEditor"
import {
  hasTipTapJsonContent,
  normalizeTipTapJsonContent,
} from "../lib/tiptap-json"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import * as commentStyles from "../styles/paper-comments.css"
import * as tiptapStyles from "../styles/tiptap-editor.css"

const EMPTY_TIPTAP_DOCUMENT: JSONContent = {
  type: "doc",
  content: [],
}

export interface PaperCommentComposerProps {
  /** Whether a send operation is currently in progress */
  isPending?: boolean
  /** Pre-filled content (used for edits) */
  initialContent?: JSONContent | null
  /** Optional fixed ID (used for edits so the ID is stable) */
  fixedCommentId?: string
  /** Callback when user submits a comment */
  onSubmit: (commentId: string, content: JSONContent) => void
  /** Placeholder text */
  placeholder?: string
  /** Expose submit action and disabled state for sidecar rows */
  onSubmitActionReady?: (submit: () => void, disabled: boolean) => void
  /** Optional test ID of the submit row to focus when tabbing out */
  submitRowTestId?: string
  /** Mention suggestions context for @ autocomplete */
  mentionSuggestionContext?: MentionSuggestionContext
  /** Test ID for the editor */
  editorTestId?: string
}

export function PaperCommentComposer({
  isPending = false,
  initialContent = null,
  fixedCommentId,
  onSubmit,
  placeholder = "Add a comment...",
  onSubmitActionReady,
  submitRowTestId,
  mentionSuggestionContext,
  editorTestId = "paper-comment-composer-editor",
}: PaperCommentComposerProps) {
  const normalizedInitialContent =
    normalizeTipTapJsonContent(initialContent) ?? EMPTY_TIPTAP_DOCUMENT
  const [commentId, setCommentId] = useState(() => fixedCommentId ?? crypto.randomUUID())
  const [content, setContent] = useState<JSONContent>(normalizedInitialContent)
  const editorRef = useRef<Editor | null>(null)

  const initialContentSignature = useMemo(
    () => JSON.stringify(normalizedInitialContent),
    [normalizedInitialContent]
  )

  useEffect(() => {
    if (fixedCommentId) {
      setCommentId(fixedCommentId)
    }
  }, [fixedCommentId])

  useEffect(() => {
    setContent(normalizedInitialContent)
    if (editorRef.current) {
      editorRef.current.commands.setContent(normalizedInitialContent)
    }
  }, [initialContentSignature, normalizedInitialContent])

  const handleSubmit = useCallback(() => {
    if (isPending) {
      return
    }
    if (!hasTipTapJsonContent(content)) {
      return
    }

    onSubmit(commentId, content)

    if (!fixedCommentId) {
      const nextId = crypto.randomUUID()
      setCommentId(nextId)
      setContent(EMPTY_TIPTAP_DOCUMENT)
      editorRef.current?.commands.clearContent()
    }
  }, [commentId, content, fixedCommentId, isPending, onSubmit])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Tab" && !event.shiftKey && submitRowTestId) {
        const submitRow = document.querySelector<HTMLElement>(`[data-testid="${submitRowTestId}"]`)
        if (submitRow) {
          event.preventDefault()
          submitRow.focus()
          return true
        }
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        handleSubmit()
        return true
      }
      return false
    },
    [handleSubmit, submitRowTestId]
  )

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const isSubmitDisabled = !hasTipTapJsonContent(content) || isPending

  useEffect(() => {
    onSubmitActionReady?.(handleSubmit, isSubmitDisabled)
  }, [handleSubmit, isSubmitDisabled, onSubmitActionReady])

  return (
    <div className={commentStyles.composerWrapper} data-testid="paper-comment-composer">
      <TipTapEditor
        content={content}
        onChangeJson={setContent}
        placeholder={placeholder}
        showToolbar={false}
        disabled={isPending}
        onEditorReady={handleEditorReady}
        onKeyDown={handleKeyDown}
        contentClassName={tiptapStyles.compactEditorContent}
        mentionSuggestionContext={mentionSuggestionContext}
        testId={editorTestId}
      />
    </div>
  )
}
