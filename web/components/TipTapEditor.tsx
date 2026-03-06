/**
 * TipTapEditor is a generic rich text editor component built on TipTap.
 *
 * Features:
 * - Rich text formatting (bold, italic, strike, code, highlight)
 * - Headings (H1, H2, H3)
 * - Lists (bullet, ordered)
 * - Blockquotes and horizontal rules
 * - Optional Yjs collaboration support
 * - Optional formatting toolbar
 * - Configurable placeholder
 * - Optional file attachment support (drag-and-drop, paste)
 *
 * This component is designed to be reusable across different contexts
 * (papers, notes, comments, etc.) with different feature sets enabled.
 */

import { useEffect, useRef, useMemo, useCallback, useState } from "react"
import type { ChangeEvent } from "react"
import type { Extensions, JSONContent } from "@tiptap/core"
import { useEditor, EditorContent, Editor, EditorContext } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import FileHandler from "@tiptap/extension-file-handler"
import * as Y from "yjs"
import { Send, Loader2, MessageCircle, Bold, Italic, Strikethrough, Code, Highlighter } from "lucide-react"
import * as styles from "../styles/tiptap-editor.css"
import { EditorToolbar } from "./EditorToolbar"
import { AttachmentNode } from "./tiptap-extensions/AttachmentNode"
import { EntityLinkNode } from "./tiptap-extensions/EntityLinkNode"
import { EntityLinkMonitor, type LinkChangeEvent } from "./tiptap-extensions/EntityLinkMonitorPlugin"
import {
  MentionedUserIdMonitor,
  type MentionedUserIdChangeEvent,
} from "./tiptap-extensions/MentionMonitorPlugin"
import { MentionSuggestionExtension } from "./tiptap-extensions/MentionSuggestion"
import { PaperCommentMark } from "./tiptap-extensions/PaperCommentMark"
import { useUploadFileWithEntityBinding } from "../store/queries/use-files"
import { useStatusStore } from "../store/status-store"
import { useReachability } from "../hooks/use-reachability"
import { Image } from "./tiptap-node/image-node/image-node-extension"
import { ImageNodeFloating } from "./tiptap-node/image-node/image-node-floating"
import { isNodeTypeSelected } from "../lib/tiptap-utils"
import { useEngineStore } from "../store/engine-store"
import {
  useMentionSuggestionItems,
  type MentionSuggestionContext,
  type MentionSuggestionItem,
} from "../store/queries/use-mention-suggestions"

// Import image node styles
import "./tiptap-node/image-node/image-node.scss"
import "./tiptap-node/image-node/image-node-view.scss"

// Import bubble menu styles for floating toolbar
import "../styles/_bubble-menu.scss"

/**
 * Configuration for Yjs collaboration.
 * When provided, the editor syncs content via Yjs document.
 */
export interface CollaborationConfig {
  /** The Yjs document to sync with */
  ydoc: Y.Doc
  /** Field name in Y.Doc to use for content (default: 'content') */
  field?: string
}

/**
 * Configuration for file attachment support.
 * When provided, enables drag-and-drop and paste file attachments.
 */
export interface FileAttachmentConfig {
  /** Entity ID to bind uploaded files to (e.g., paper ID) */
  entityId: string
  /** Entity type for the binding (e.g., 'paper') */
  entityType: string
}

/**
 * Configuration for an inline send button overlaid inside the editor.
 * Used for chat/comment composers where the send button appears at bottom-right.
 */
export interface SendButtonConfig {
  /** Callback when the send button is clicked */
  onClick: () => void
  /** Whether the send action is disabled (e.g., empty content) */
  disabled?: boolean
  /** Whether a send operation is in progress (shows spinner) */
  isPending?: boolean
}

/**
 * Configuration for the selection bubble menu (floating toolbar on text selection).
 */
export interface SelectionBubbleMenuConfig {
  /** Callback when the add comment button is clicked */
  onCreateComment?: () => void
  /** Whether the add comment button should be disabled */
  isCreateCommentDisabled?: boolean
  /** Optional test ID for the comment button */
  commentButtonTestId?: string
}

/**
 * Configuration for paper comment mark behavior.
 */
export interface CommentMarkConfig {
  /** Callback when a highlighted comment in the editor is clicked */
  onCommentClick?: (commentIds: string[]) => void
}

/**
 * Props for the TipTapEditor component.
 */
export interface TipTapEditorProps {
  /** Auto-focus editor on mount */
  autoFocus?: boolean
  /** Additional CSS class for the editor shell */
  className?: string
  /** Initial content (HTML string or TipTap JSON, ignored when using collaboration) */
  content?: string | JSONContent
  /** Disable editing */
  disabled?: boolean
  /** Placeholder text shown when editor is empty */
  placeholder?: string
  /** Yjs collaboration configuration (optional) */
  collaboration?: CollaborationConfig
  /** Show the formatting toolbar (default: true) */
  showToolbar?: boolean
  /** File attachment configuration (optional) */
  fileAttachment?: FileAttachmentConfig
  /** Inline send button configuration (optional, renders button inside editor at bottom-right) */
  sendButton?: SendButtonConfig
  /** Callback when content changes (returns HTML string) */
  onChange?: (content: string) => void
  /** Callback when content changes (returns TipTap JSON) */
  onChangeJson?: (content: JSONContent) => void
  /** Callback when editor focus changes */
  onFocusChange?: (focused: boolean) => void
  /** Callback when editor is ready */
  onEditorReady?: (editor: Editor) => void
  /** Callback for keyboard events (return true to prevent default) */
  onKeyDown?: (event: KeyboardEvent) => boolean
  /** Callback when entity links change (for papers/Yjs collaboration) */
  onLinkChange?: (event: LinkChangeEvent) => void
  /** Callback when mentioned user IDs change (for mention notifications) */
  onMentionedUserIdsChange?: (event: MentionedUserIdChangeEvent) => void
  /** Mention suggestions context for @ autocomplete */
  mentionSuggestionContext?: MentionSuggestionContext
  /** Selection bubble menu configuration for text selection */
  selectionBubbleMenu?: SelectionBubbleMenuConfig
  /** Paper comment mark behavior configuration */
  commentMarkConfig?: CommentMarkConfig
  /** CSS class for the ProseMirror editor content area */
  contentClassName?: string
  /** Test ID for the editor container */
  testId?: string
}

/**
 * TipTapEditor provides a configurable rich text editing experience.
 *
 * Usage:
 * ```tsx
 * // Simple editor without collaboration
 * <TipTapEditor
 *   placeholder="Start writing..."
 *   onChange={(content) => console.log(content)}
 * />
 *
 * // Collaborative editor with Yjs
 * <TipTapEditor
 *   collaboration={{ ydoc: myYDoc }}
 *   placeholder="Collaborate in real-time..."
 * />
 * ```
 */
export function TipTapEditor({
  autoFocus = false,
  className,
  content = "",
  disabled = false,
  placeholder = "Start writing...",
  collaboration,
  showToolbar = true,
  fileAttachment,
  sendButton,
  onChange,
  onChangeJson,
  onFocusChange,
  onEditorReady,
  onKeyDown,
  onLinkChange,
  onMentionedUserIdsChange,
  mentionSuggestionContext,
  selectionBubbleMenu,
  commentMarkConfig,
  contentClassName,
  testId = "tiptap-editor",
}: TipTapEditorProps) {
  const [isFocused, setIsFocused] = useState(false)
  const { application } = useEngineStore()
  const mentionSuggestionQuery = useMentionSuggestionItems(mentionSuggestionContext)
  const mentionSuggestionItemsRef = useRef<MentionSuggestionItem[]>([])
  const mentionSuggestionLoadingRef = useRef(false)
  const activeWorkspaceId = application?.workspaceId

  // Ref to the editor shell container, used to check if blur is going to a child element (e.g., toolbar)
  const editorShellRef = useRef<HTMLDivElement>(null)

  // File upload mutation (only used when fileAttachment is configured)
  const uploadFileMutation = useUploadFileWithEntityBinding()
  const { upsertStatus, removeStatus } = useStatusStore()
  const { isOnline } = useReachability()

  // Keep callback refs stable to avoid recreating the editor
  const onChangeRef = useRef(onChange)
  const onChangeJsonRef = useRef(onChangeJson)
  const onFocusChangeRef = useRef(onFocusChange)
  const onEditorReadyRef = useRef(onEditorReady)
  const onKeyDownRef = useRef(onKeyDown)
  const onLinkChangeRef = useRef(onLinkChange)
  const onMentionedUserIdsChangeRef = useRef(onMentionedUserIdsChange)
  const fileAttachmentConfig = application?.isWorkspaceRemote() ? fileAttachment : null
  const fileAttachmentRef = useRef(fileAttachmentConfig)
  const isOnlineRef = useRef(isOnline)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onChangeJsonRef.current = onChangeJson
  }, [onChangeJson])

  useEffect(() => {
    onFocusChangeRef.current = onFocusChange
  }, [onFocusChange])

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady
  }, [onEditorReady])

  useEffect(() => {
    onKeyDownRef.current = onKeyDown
  }, [onKeyDown])

  useEffect(() => {
    onLinkChangeRef.current = onLinkChange
  }, [onLinkChange])

  useEffect(() => {
    onMentionedUserIdsChangeRef.current = onMentionedUserIdsChange
  }, [onMentionedUserIdsChange])

  useEffect(() => {
    mentionSuggestionItemsRef.current = mentionSuggestionQuery.items
    mentionSuggestionLoadingRef.current = mentionSuggestionQuery.isLoading
  }, [mentionSuggestionQuery.items, mentionSuggestionQuery.isLoading])

  useEffect(() => {
    fileAttachmentRef.current = fileAttachmentConfig
  }, [fileAttachmentConfig])

  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  /**
   * Generates a unique temporary ID for tracking file uploads.
   */
  const generateTempId = useCallback(() => {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  /**
   * Process multiple files: validate, upload in parallel, insert sequentially.
   * Images are inserted as image nodes, other files as attachment nodes.
   * This follows the pattern from the legacy implementation.
   */
  const processFiles = useCallback(
    async (currentEditor: Editor, files: File[]) => {
      const config = fileAttachmentRef.current
      if (!config) return

      if (files.length === 0) return

      // Reject file uploads when offline - user needs network to upload files
      if (!isOnlineRef.current) {
        const statusId = "offline-upload-rejected"
        upsertStatus({
          id: statusId,
          message: "Can't upload files while offline.",
          variant: "warning",
          isDismissible: true,
        })
        // Auto-dismiss after 4 seconds
        setTimeout(() => removeStatus(statusId), 4000)
        return
      }

      // Separate images from other files
      // Large files are handled via chunked upload in the FileService
      const imageFiles = files.filter(f => f.type.startsWith("image/"))
      const otherFiles = files.filter(f => !f.type.startsWith("image/"))

      // Create temp IDs for non-image files and insert placeholder attachment nodes
      const otherFileWithTempIds = otherFiles.map(file => ({
        file,
        tempId: generateTempId(),
      }))

      // Insert placeholder attachment nodes for non-image files
      for (const { file, tempId } of otherFileWithTempIds) {
        currentEditor
          .chain()
          .focus()
          .insertContent([
            {
              type: "attachment",
              attrs: {
                fileId: null,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                status: "uploading",
                src: "",
                tempId,
              },
            },
            { type: "paragraph" },
          ])
          .run()
      }

      // Upload all files in parallel
      const allUploadPromises = [
        // Upload images - only store fileId, each client will load image independently
        ...imageFiles.map(async file => {
          try {
            const result = await uploadFileMutation.mutateAsync({
              file,
              entityId: config.entityId,
              entityType: config.entityType,
            })
            return { file, fileId: result.id, isImage: true, success: true }
          } catch (error) {
            console.error(`Failed to upload image ${file.name}:`, error)
            return { file, fileId: null, isImage: true, success: false }
          }
        }),
        // Upload non-image files
        ...otherFileWithTempIds.map(async ({ file, tempId }) => {
          try {
            const result = await uploadFileMutation.mutateAsync({
              file,
              entityId: config.entityId,
              entityType: config.entityType,
            })
            return { tempId, fileId: result.id, isImage: false, success: true }
          } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error)
            return { tempId, fileId: null, isImage: false, success: false }
          }
        }),
      ]

      const uploadResults = await Promise.all(allUploadPromises)

      // Process results
      for (const result of uploadResults) {
        if (result.isImage && "fileId" in result) {
          // Insert image node with ONLY fileId - no blob URL in src
          // Each client will load the image independently using fileId
          // This prevents blob URLs from being synced to other clients (they're session-specific)
          if (result.success && result.fileId) {
            currentEditor
              .chain()
              .focus()
              .insertContent([{ type: "image", attrs: { fileId: result.fileId } }, { type: "paragraph" }])
              .run()
          }
        } else if ("tempId" in result) {
          // Update attachment nodes with results (just fileId and status)
          currentEditor.commands.updateAttachmentByTempId(result.tempId, {
            fileId: result.fileId,
            status: result.success ? "complete" : "error",
          })
        }
      }
    },
    [generateTempId, uploadFileMutation, upsertStatus, removeStatus]
  )

  // Build extensions array based on configuration.
  const extensions = useMemo(() => {
    const exts: Extensions = [
      StarterKit.configure({
        // Disable undo/redo when using Yjs collaboration (Yjs handles history)
        ...(collaboration ? { undoRedo: false } : {}),
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: styles.editorEmpty,
      }),
      Highlight.configure({
        multicolor: false,
      }),
      // Paper comment mark (optional, used in paper editor only)
      ...(commentMarkConfig
        ? [
            PaperCommentMark.configure({
              onCommentClick: commentMarkConfig.onCommentClick,
            }),
          ]
        : []),
      // Image node with enhanced features (alignment, resize, captions)
      // No allowBase64 - images must be uploaded to server and use presigned URLs
      Image,
      // Entity link node - renders internal links as chips
      // Always enabled since entity links can appear in any editor context
      EntityLinkNode,
    ]

    // Add Yjs collaboration extension if configured
    if (collaboration) {
      exts.push(
        Collaboration.configure({
          document: collaboration.ydoc,
          field: collaboration.field ?? "content",
        })
      )
      // Add EntityLinkMonitor to track link changes for syncing
      // Only relevant for collaborative editors (papers)
      exts.push(
        EntityLinkMonitor.configure({
          onLinkChange: event => onLinkChangeRef.current?.(event),
        })
      )
    }

    if (onMentionedUserIdsChangeRef.current) {
      exts.push(
        MentionedUserIdMonitor.configure({
          onMentionedUserIdsChange: event => onMentionedUserIdsChangeRef.current?.(event),
        })
      )
    }

    if (mentionSuggestionContext && activeWorkspaceId) {
      exts.push(
        MentionSuggestionExtension.configure({
          workspaceId: activeWorkspaceId,
          getSuggestionItems: query =>
            filterMentionSuggestionItems(mentionSuggestionItemsRef.current, query),
          getIsLoading: () => mentionSuggestionLoadingRef.current,
        })
      )
    }

    // Add file attachment support if configured
    if (fileAttachmentConfig) {
      exts.push(AttachmentNode)
      exts.push(
        FileHandler.configure({
          onDrop: (currentEditor, files) => {
            void processFiles(currentEditor, files)
          },
          onPaste: (currentEditor, files) => {
            void processFiles(currentEditor, files)
          },
        })
      )
    }

    return exts
  }, [
    collaboration,
    placeholder,
    fileAttachmentConfig,
    processFiles,
    mentionSuggestionContext,
    activeWorkspaceId,
    commentMarkConfig,
  ])

  // Create the TipTap editor instance
  const editor = useEditor(
    {
      extensions,
      // Only set initial content when NOT using collaboration
      // (Yjs provides content from the document)
      content: collaboration ? undefined : content,
      editable: !disabled,
      autofocus: autoFocus,
      editorProps: {
        attributes: {
          // Include 'tiptap' class for TipTap UI styles (image node, etc.) to work
          class: `tiptap ${contentClassName ?? styles.editorContent}`,
          "data-testid": `${testId}-content`,
        },
        // Handle custom keyboard events
        handleKeyDown: (_view, event) => {
          if (onKeyDownRef.current?.(event)) {
            return true
          }
          return false
        },
      },
      onCreate: ({ editor: createdEditor }) => {
        onEditorReadyRef.current?.(createdEditor)
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onChangeRef.current?.(updatedEditor.getHTML())
        onChangeJsonRef.current?.(updatedEditor.getJSON())
      },
      onFocus: () => {
        setIsFocused(true)
        onFocusChangeRef.current?.(true)
      },
      onBlur: () => {
        // Delay the blur check to allow the browser to update document.activeElement.
        // This lets us detect if focus moved to a child element (e.g., toolbar button)
        // within the editor shell, in which case we should NOT report a blur.
        setTimeout(() => {
          const activeElement = document.activeElement
          const shellElement = editorShellRef.current

          // If focus moved to another element inside the editor shell (e.g., toolbar),
          // don't report blur - the user is still interacting with the editor.
          if (shellElement && activeElement && shellElement.contains(activeElement)) {
            return
          }

          setIsFocused(false)
          onFocusChangeRef.current?.(false)
        }, 0)
      },
    },
    // Re-create editor when ydoc changes (for collaboration)
    [collaboration?.ydoc]
  )

  useEffect(() => {
    if (!editor || collaboration || content === undefined) {
      return
    }

    // Sync external content updates (e.g., async load) into the editor.
    // This keeps edit views consistent when content arrives after mount.
    const editorContent = typeof content === "string" ? editor.getHTML() : editor.getJSON()
    const incomingContent = typeof content === "string" ? content : JSON.stringify(content)
    const currentContent = typeof editorContent === "string" ? editorContent : JSON.stringify(editorContent)

    if (incomingContent === currentContent) {
      return
    }

    editor.commands.setContent(content)
  }, [editor, collaboration, content])

  // Sync disabled prop with editor's editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled)
    }
  }, [editor, disabled])

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  // Build the editor shell class
  const editorShellClass = useMemo(() => {
    const classes = [styles.editorShell]
    if (className) classes.push(className)
    if (isFocused) classes.push(styles.editorFocused)
    if (disabled) classes.push(styles.editorDisabled)
    return classes.join(" ")
  }, [className, isFocused, disabled])

  // Stop propagation of drag events when file attachment is enabled.
  // This prevents the global drop handler from showing its overlay
  // when dragging files over the editor (TipTap handles it instead).
  const handleDragEvent = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (fileAttachment) {
        e.stopPropagation()
      }
    },
    [fileAttachment]
  )

  const selectionBubbleMenuConfig = selectionBubbleMenu

  const handleAttachmentInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!editor) {
        return
      }
      const files = event.target.files ? Array.from(event.target.files) : []
      if (files.length === 0) {
        return
      }
      void processFiles(editor, files)
      // Reset so selecting the same file again still fires change.
      event.target.value = ""
    },
    [editor, processFiles]
  )

  return (
    <EditorContext.Provider value={{ editor }}>
      <div
        ref={editorShellRef}
        className={editorShellClass}
        data-testid={testId}
        onDragEnter={handleDragEvent}
        onDragOver={handleDragEvent}
        onDragLeave={handleDragEvent}
        onDrop={handleDragEvent}
      >
        {fileAttachmentConfig && (
          <input
            type="file"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className={styles.editorAttachmentInput}
            data-testid={`${testId}-file-input`}
            onChange={handleAttachmentInputChange}
          />
        )}

        {/* Optional formatting toolbar */}
        {showToolbar && <EditorToolbar editor={editor} />}

        {/* Editor content area with optional inline send button */}
        {/* Outer wrapper for positioning the send button overlay */}
        <div className={styles.editorContentOuterWrapper}>
          {/* Scrolling content area */}
          <div className={styles.editorContentWrapper}>
            <EditorContent editor={editor} />
          </div>

          {/* Inline send button - overlaid at bottom-right, outside scroll area */}
        {sendButton && (
          <div className={styles.inlineSendButtonContainer}>
              <button
                type="button"
                className={styles.inlineSendButton}
                onClick={sendButton.onClick}
                disabled={sendButton.disabled || sendButton.isPending}
                data-testid={`${testId}-send`}
              >
                {sendButton.isPending ? (
                  <Loader2 size={16} className={styles.inlineSendSpinner} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Selection bubble menu for text formatting and comments */}
        {editor && selectionBubbleMenuConfig && (
          <SelectionBubbleMenu editor={editor} config={selectionBubbleMenuConfig} />
        )}

        {/* Image floating toolbar - appears when an image is selected */}
        {editor && (
          <BubbleMenu
            editor={editor}
            options={{
              placement: "top",
              offset: 8,
            }}
            shouldShow={({ editor: currentEditor }) => isNodeTypeSelected(currentEditor, ["image"])}
            className="tiptap-bubble-menu"
          >
            <ImageNodeFloating editor={editor} />
          </BubbleMenu>
        )}
      </div>
    </EditorContext.Provider>
  )
}

/**
 * Filters mention suggestion items by the user-entered query.
 */
function filterMentionSuggestionItems(
  items: MentionSuggestionItem[],
  query: string
): MentionSuggestionItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return items
  }

  return items.filter(item => {
    const labelMatch = item.label.toLowerCase().includes(normalizedQuery)
    const emailMatch = item.email.toLowerCase().includes(normalizedQuery)
    return labelMatch || emailMatch
  })
}

/**
 * Hook to imperatively access the editor instance.
 * Useful when you need to call editor commands from outside the component.
 */
export function useTipTapEditorRef() {
  const editorRef = useRef<Editor | null>(null)

  const setEditor = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  return { editorRef, setEditor }
}

interface SelectionBubbleMenuProps {
  editor: Editor
  config: SelectionBubbleMenuConfig
}

function SelectionBubbleMenu({ editor, config }: SelectionBubbleMenuProps) {
  const handleBold = useCallback(() => {
    editor.chain().focus().toggleBold().run()
  }, [editor])

  const handleItalic = useCallback(() => {
    editor.chain().focus().toggleItalic().run()
  }, [editor])

  const handleStrike = useCallback(() => {
    editor.chain().focus().toggleStrike().run()
  }, [editor])

  const handleCode = useCallback(() => {
    editor.chain().focus().toggleCode().run()
  }, [editor])

  const handleHighlight = useCallback(() => {
    editor.chain().focus().toggleHighlight().run()
  }, [editor])

  const handleCreateComment = useCallback(() => {
    config.onCreateComment?.()
  }, [config])

  const shouldShowMenu = useCallback(() => {
    const { selection } = editor.state
    if (selection.empty) {
      return false
    }
    if (isNodeTypeSelected(editor, ["image"])) {
      return false
    }
    return true
  }, [editor])

  const showCommentButton = typeof config.onCreateComment === "function"
  const commentButtonTestId = config.commentButtonTestId ?? "paper-comment-bubble-button"
  const isCommentButtonDisabled = config.isCreateCommentDisabled ?? false

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
        offset: 8,
      }}
      updateDelay={150}
      shouldShow={shouldShowMenu}
      className="tiptap-bubble-menu"
    >
      {showCommentButton && (
        <button
          type="button"
          className={styles.editorToolbarButton}
          onClick={handleCreateComment}
          disabled={isCommentButtonDisabled}
          title="Add comment (⌘⌥C)"
          data-testid={commentButtonTestId}
        >
          <MessageCircle size={14} />
        </button>
      )}

      {showCommentButton && <div className={styles.editorToolbarDivider} />}

      <button
        type="button"
        className={`${styles.editorToolbarButton} ${editor.isActive("bold") ? styles.editorToolbarButtonActive : ""}`}
        onClick={handleBold}
        title="Bold"
        data-testid="bubble-bold"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        className={`${styles.editorToolbarButton} ${editor.isActive("italic") ? styles.editorToolbarButtonActive : ""}`}
        onClick={handleItalic}
        title="Italic"
        data-testid="bubble-italic"
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        className={`${styles.editorToolbarButton} ${editor.isActive("strike") ? styles.editorToolbarButtonActive : ""}`}
        onClick={handleStrike}
        title="Strikethrough"
        data-testid="bubble-strike"
      >
        <Strikethrough size={14} />
      </button>
      <button
        type="button"
        className={`${styles.editorToolbarButton} ${editor.isActive("code") ? styles.editorToolbarButtonActive : ""}`}
        onClick={handleCode}
        title="Code"
        data-testid="bubble-code"
      >
        <Code size={14} />
      </button>
      <button
        type="button"
        className={`${styles.editorToolbarButton} ${editor.isActive("highlight") ? styles.editorToolbarButtonActive : ""}`}
        onClick={handleHighlight}
        title="Highlight"
        data-testid="bubble-highlight"
      >
        <Highlighter size={14} />
      </button>
    </BubbleMenu>
  )
}
