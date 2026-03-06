/**
 * ReplyComposer provides a compact rich text editor for composing forum replies.
 *
 * Features:
 * - TipTapEditor with compact styling (no toolbar by default)
 * - Inline send button at bottom-right of editor
 * - File attachment support with pre-generated reply ID
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
 * Props for the ReplyComposer component.
 */
export interface ReplyComposerProps {
  /** Whether a send operation is currently in progress */
  isPending?: boolean
  /** Callback when user submits a reply - receives replyId and HTML content */
  onSend: (replyId: string, content: string) => void
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
 * ReplyComposer renders a compact TipTapEditor for composing forum replies.
 *
 * Usage:
 * ```tsx
 * <ReplyComposer
 *   isPending={sendReplyMutation.isPending}
 *   onSend={(replyId, content) => sendReplyMutation.mutate({
 *     id: replyId,
 *     channelId,
 *     discussionId,
 *     body: content,
 *   })}
 * />
 * ```
 */
export function ReplyComposer({
  isPending = false,
  onSend,
  mentionSuggestionContext,
}: ReplyComposerProps) {
  // Pre-generate reply ID for file attachment binding
  // Using a function to regenerate ID after each send
  const [replyId, setReplyId] = useState(() => crypto.randomUUID())
  const [content, setContent] = useState("")
  const editorRef = useRef<Editor | null>(null)

  // Handle send
  const handleSend = useCallback(() => {
    if (!hasContent(content) || isPending) return

    onSend(replyId, content)

    // Clear editor and generate new reply ID for next reply
    setContent("")
    editorRef.current?.commands.clearContent()
    setReplyId(crypto.randomUUID())
  }, [content, isPending, onSend, replyId])

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
    <div className={forumStyles.replyComposerWrapper}>
      <TipTapEditor
        content={content}
        onChange={setContent}
        placeholder="Write a reply..."
        showToolbar={false}
        disabled={isPending}
        fileAttachment={{
          entityId: replyId,
          entityType: "forum_reply",
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
        testId="forum-compose-reply-editor"
      />
    </div>
  )
}
