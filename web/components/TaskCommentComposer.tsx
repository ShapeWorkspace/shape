/**
 * TaskCommentComposer provides a compact rich text editor for composing task comments.
 *
 * Features:
 * - TipTapEditor with compact styling (no toolbar by default)
 * - Inline send button at bottom-right of editor
 * - File attachment support with pre-generated comment ID
 * - Cmd/Ctrl+Enter keyboard shortcut to send
 * - Clears editor after successful send
 */

import { useState, useCallback, useRef } from "react"
import { Editor } from "@tiptap/react"
import { TipTapEditor } from "./TipTapEditor"
import * as forumStyles from "../styles/forum.css"
import * as tiptapStyles from "../styles/tiptap-editor.css"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"

/**
 * Props for the TaskCommentComposer component.
 */
export interface TaskCommentComposerProps {
  /** Whether a send operation is currently in progress */
  isPending?: boolean
  /** Callback when user submits a comment - receives commentId and HTML content */
  onSend: (commentId: string, content: string) => void
  /** Mention suggestions context for @ autocomplete */
  mentionSuggestionContext?: MentionSuggestionContext
}

/**
 * Checks if HTML content has meaningful text or media (not just empty paragraphs).
 * Attachment and image nodes are considered meaningful content.
 */
function hasContent(html: string): boolean {
  if (!html || !html.trim()) return false
  // Check for common empty states
  if (html === "<p></p>") return false
  if (html === "<p><br></p>") return false
  // Check for attachment or image nodes (these are valid content even without text)
  if (html.includes("data-attachment") || html.includes("<img")) return true
  // Strip HTML tags and check for actual text
  const textOnly = html.replace(/<[^>]*>/g, "").trim()
  return textOnly.length > 0
}

/**
 * TaskCommentComposer renders a compact TipTapEditor for composing task comments.
 *
 * Usage:
 * ```tsx
 * <TaskCommentComposer
 *   isPending={createCommentMutation.isPending}
 *   onSend={(commentId, content) => createCommentMutation.mutate({
 *     id: commentId,
 *     projectId,
 *     taskId,
 *     body: content,
 *   })}
 * />
 * ```
 */
export function TaskCommentComposer({
  isPending = false,
  onSend,
  mentionSuggestionContext,
}: TaskCommentComposerProps) {
  // Pre-generate comment ID for file attachment binding
  // Using a function to regenerate ID after each send
  const [commentId, setCommentId] = useState(() => crypto.randomUUID())
  const [content, setContent] = useState("")
  const editorRef = useRef<Editor | null>(null)

  // Handle send
  const handleSend = useCallback(() => {
    if (!hasContent(content) || isPending) return

    onSend(commentId, content)

    // Clear editor and generate new comment ID for next comment
    setContent("")
    editorRef.current?.commands.clearContent()
    setCommentId(crypto.randomUUID())
  }, [content, isPending, onSend, commentId])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to send
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
        return true
      }
      return false
    },
    [handleSend]
  )

  // Store editor reference when ready
  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const isSendDisabled = !hasContent(content) || isPending

  return (
    <div className={forumStyles.replyComposerWrapper} data-testid="task-comment-composer">
      <TipTapEditor
        content={content}
        onChange={setContent}
        placeholder="Add a comment..."
        showToolbar={false}
        disabled={isPending}
        fileAttachment={{
          entityId: commentId,
          entityType: "task_comment",
        }}
        sendButton={{
          onClick: handleSend,
          disabled: isSendDisabled,
          isPending,
        }}
        onEditorReady={handleEditorReady}
        onKeyDown={handleKeyDown}
        className={forumStyles.replyComposerEditor}
        contentClassName={tiptapStyles.compactEditorContent}
        mentionSuggestionContext={mentionSuggestionContext}
        testId="task-comment-composer-editor"
      />
    </div>
  )
}
