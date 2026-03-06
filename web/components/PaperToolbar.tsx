/**
 * PaperToolbar provides rich text formatting controls for the TipTap editor.
 *
 * Displays formatting buttons in a horizontal bar at the top of the editor.
 * Buttons show active state when the corresponding format is applied to the
 * current selection.
 */

import React, { useCallback } from "react"
import { Editor } from "@tiptap/react"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Highlighter,
  Undo,
  Redo,
  RemoveFormatting,
} from "lucide-react"
import * as styles from "../styles/paper.css"

interface PaperToolbarProps {
  editor: Editor | null
}

/**
 * Individual toolbar button component that handles active state and click actions.
 */
interface ToolbarButtonProps {
  icon: React.ReactNode
  title: string
  isActive?: boolean
  isDisabled?: boolean
  onClick: () => void
}

function ToolbarButton({ icon, title, isActive, isDisabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.paperToolbarButton} ${isActive ? styles.paperToolbarButtonActive : ""}`}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      data-testid={`toolbar-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {icon}
    </button>
  )
}

/**
 * Visual separator between toolbar button groups.
 */
function ToolbarDivider() {
  return <div className={styles.paperToolbarDivider} />
}

export function PaperToolbar({ editor }: PaperToolbarProps) {
  // All hooks must be called unconditionally at the top of the component.
  // Conditional logic is handled inside callbacks using optional chaining.

  // Bold toggle
  const handleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run()
  }, [editor])

  // Italic toggle
  const handleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run()
  }, [editor])

  // Strikethrough toggle
  const handleStrike = useCallback(() => {
    editor?.chain().focus().toggleStrike().run()
  }, [editor])

  // Inline code toggle
  const handleCode = useCallback(() => {
    editor?.chain().focus().toggleCode().run()
  }, [editor])

  // Highlight toggle
  const handleHighlight = useCallback(() => {
    editor?.chain().focus().toggleHighlight().run()
  }, [editor])

  // Heading toggles - toggles between heading level and paragraph
  const handleHeading1 = useCallback(() => {
    editor?.chain().focus().toggleHeading({ level: 1 }).run()
  }, [editor])

  const handleHeading2 = useCallback(() => {
    editor?.chain().focus().toggleHeading({ level: 2 }).run()
  }, [editor])

  const handleHeading3 = useCallback(() => {
    editor?.chain().focus().toggleHeading({ level: 3 }).run()
  }, [editor])

  // List toggles
  const handleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run()
  }, [editor])

  const handleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run()
  }, [editor])

  // Blockquote toggle
  const handleBlockquote = useCallback(() => {
    editor?.chain().focus().toggleBlockquote().run()
  }, [editor])

  // Horizontal rule insertion
  const handleHorizontalRule = useCallback(() => {
    editor?.chain().focus().setHorizontalRule().run()
  }, [editor])

  // Clear formatting from selection
  const handleClearFormatting = useCallback(() => {
    editor?.chain().focus().unsetAllMarks().clearNodes().run()
  }, [editor])

  // Undo/Redo - note: when using Yjs collaboration, undo/redo may not work
  // as expected since Yjs handles its own history
  const handleUndo = useCallback(() => {
    editor?.chain().focus().undo().run()
  }, [editor])

  const handleRedo = useCallback(() => {
    editor?.chain().focus().redo().run()
  }, [editor])

  // Early return after all hooks have been called
  if (!editor) {
    return null
  }

  return (
    <div className={styles.paperToolbar} data-testid="paper-toolbar">
      {/* Text formatting */}
      <ToolbarButton
        icon={<Bold size={16} />}
        title="Bold"
        isActive={editor.isActive("bold")}
        onClick={handleBold}
      />
      <ToolbarButton
        icon={<Italic size={16} />}
        title="Italic"
        isActive={editor.isActive("italic")}
        onClick={handleItalic}
      />
      <ToolbarButton
        icon={<Strikethrough size={16} />}
        title="Strikethrough"
        isActive={editor.isActive("strike")}
        onClick={handleStrike}
      />
      <ToolbarButton
        icon={<Code size={16} />}
        title="Code"
        isActive={editor.isActive("code")}
        onClick={handleCode}
      />
      <ToolbarButton
        icon={<Highlighter size={16} />}
        title="Highlight"
        isActive={editor.isActive("highlight")}
        onClick={handleHighlight}
      />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        icon={<Heading1 size={16} />}
        title="Heading 1"
        isActive={editor.isActive("heading", { level: 1 })}
        onClick={handleHeading1}
      />
      <ToolbarButton
        icon={<Heading2 size={16} />}
        title="Heading 2"
        isActive={editor.isActive("heading", { level: 2 })}
        onClick={handleHeading2}
      />
      <ToolbarButton
        icon={<Heading3 size={16} />}
        title="Heading 3"
        isActive={editor.isActive("heading", { level: 3 })}
        onClick={handleHeading3}
      />

      <ToolbarDivider />

      {/* Lists and blocks */}
      <ToolbarButton
        icon={<List size={16} />}
        title="Bullet list"
        isActive={editor.isActive("bulletList")}
        onClick={handleBulletList}
      />
      <ToolbarButton
        icon={<ListOrdered size={16} />}
        title="Ordered list"
        isActive={editor.isActive("orderedList")}
        onClick={handleOrderedList}
      />
      <ToolbarButton
        icon={<Quote size={16} />}
        title="Blockquote"
        isActive={editor.isActive("blockquote")}
        onClick={handleBlockquote}
      />
      <ToolbarButton icon={<Minus size={16} />} title="Horizontal rule" onClick={handleHorizontalRule} />

      <ToolbarDivider />

      {/* Utility actions */}
      <ToolbarButton
        icon={<RemoveFormatting size={16} />}
        title="Clear formatting"
        onClick={handleClearFormatting}
      />
      <ToolbarButton
        icon={<Undo size={16} />}
        title="Undo"
        isDisabled={!editor.can().undo()}
        onClick={handleUndo}
      />
      <ToolbarButton
        icon={<Redo size={16} />}
        title="Redo"
        isDisabled={!editor.can().redo()}
        onClick={handleRedo}
      />
    </div>
  )
}
