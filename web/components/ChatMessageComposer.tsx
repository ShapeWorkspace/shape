/**
 * ChatMessageComposer provides a TipTap-based rich text editor for chat messages.
 *
 * This component is shared between Group Chats and Direct Messages, providing:
 * - TipTap editor with compact styling (no toolbar)
 * - Encrypted file attachment support via drag-and-drop or paste
 * - Inline send button at bottom-right of editor
 * - Cmd/Ctrl+Enter keyboard shortcut to send
 * - Quoted message preview above editor
 * - Pre-generated message ID for file binding (regenerated after each send)
 */

import { useState, useCallback, useRef } from "react"
import { Reply, X } from "lucide-react"
import { Editor } from "@tiptap/react"
import { TipTapEditor } from "./TipTapEditor"
import { getPlainTextPreview } from "../utils/text-utils"
import * as chatStyles from "../styles/chat.css"
import * as tiptapStyles from "../styles/tiptap-editor.css"
import { extractMentionedUserIdsFromHtml } from "../lib/extract-entity-links"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"

/**
 * Represents a quoted message for display in the composer.
 */
export interface QuotedMessage {
  id: string
  text: string
}

/**
 * Props for the ChatMessageComposer component.
 */
export interface ChatMessageComposerProps {
  /** Entity type for file attachment binding (e.g., 'group_message', 'direct_message') */
  entityType: string
  /** Placeholder text for the editor */
  placeholder?: string
  /** Whether a send operation is in progress */
  isPending?: boolean
  /** Callback when user sends a message - receives messageId, HTML content, and mentions */
  onSend: (messageId: string, content: string, mentionedUserIds: string[]) => void
  /** Currently quoted message to reply to (optional) */
  quotedMessage?: QuotedMessage | null
  /** Callback to clear the quoted message */
  onClearQuote?: () => void
  /** Mention suggestions context for @ autocomplete */
  mentionSuggestionContext?: MentionSuggestionContext
  /** Test ID prefix for the component */
  testId?: string
}

/**
 * Checks if HTML content has meaningful text (not just empty paragraphs).
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
 * ChatMessageComposer renders a compact TipTap editor for composing chat messages.
 *
 * Usage:
 * ```tsx
 * <ChatMessageComposer
 *   entityType="group_message"
 *   isPending={sendMutation.isPending}
 *   onSend={(messageId, content) => sendMutation.mutate({
 *     id: messageId,
 *     content,
 *   })}
 *   quotedMessage={quotedMessage}
 *   onClearQuote={() => setQuotedMessage(null)}
 * />
 * ```
 */
export function ChatMessageComposer({
  entityType,
  placeholder = "Type a message...",
  isPending = false,
  onSend,
  quotedMessage = null,
  onClearQuote,
  mentionSuggestionContext,
  testId = "chat-composer",
}: ChatMessageComposerProps) {
  // Pre-generate message ID for file attachment binding.
  // Using a function to regenerate ID after each send.
  const [messageId, setMessageId] = useState(() => crypto.randomUUID())
  const [content, setContent] = useState("")
  const editorRef = useRef<Editor | null>(null)

  // Handle send action
  const handleSend = useCallback(() => {
    if (!hasContent(content) || isPending) return

    const mentionedUserIds = extractMentionedUserIdsFromHtml(content)
    onSend(messageId, content, mentionedUserIds)

    // Clear editor and generate new message ID for next message
    setContent("")
    editorRef.current?.commands.clearContent()
    setMessageId(crypto.randomUUID())
  }, [content, isPending, onSend, messageId])

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
    <div className={chatStyles.chatComposerContainer} data-testid={testId}>
      {/* Quoted message preview (strip HTML for plain text display) */}
      {quotedMessage && (
        <div className={chatStyles.chatQuotedComposer} data-testid={`${testId}-quoted-preview`}>
          <Reply size={14} />
          <span className={chatStyles.chatComposerQuotedText}>{getPlainTextPreview(quotedMessage.text, 100)}</span>
          <button
            className={chatStyles.chatQuoteClear}
            onClick={onClearQuote}
            title="Clear quote"
            data-testid={`${testId}-clear-quote`}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* TipTap editor with inline send button */}
      <TipTapEditor
        content={content}
        onChange={setContent}
        placeholder={placeholder}
        showToolbar={false}
        disabled={isPending}
        fileAttachment={{
          entityId: messageId,
          entityType,
        }}
        sendButton={{
          onClick: handleSend,
          disabled: isSendDisabled,
          isPending,
        }}
        onEditorReady={handleEditorReady}
        onKeyDown={handleKeyDown}
        className={chatStyles.chatComposerEditor}
        contentClassName={tiptapStyles.compactEditorContent}
        mentionSuggestionContext={mentionSuggestionContext}
        testId={`${testId}-editor`}
      />
    </div>
  )
}
