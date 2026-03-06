/**
 * Hook for copying and saving Markdown export content.
 * Centralizes clipboard + download behavior for sidecars.
 */

import { useCallback, useEffect, useState } from "react"
import { buildMarkdownFilename } from "../utils/markdown-export"

interface UseMarkdownExportActionsOptions {
  markdown: string
  title: string | null | undefined
}

interface UseMarkdownExportActionsResult {
  copyMarkdownToClipboard: () => void
  saveMarkdownToFile: () => void
  isCopyFeedbackVisible: boolean
  isSaveFeedbackVisible: boolean
}

/**
 * Provides clipboard copy and immediate file save actions for Markdown.
 */
export function useMarkdownExportActions({
  markdown,
  title,
}: UseMarkdownExportActionsOptions): UseMarkdownExportActionsResult {
  const [isCopyFeedbackVisible, setIsCopyFeedbackVisible] = useState(false)
  const [isSaveFeedbackVisible, setIsSaveFeedbackVisible] = useState(false)

  useEffect(() => {
    if (!isCopyFeedbackVisible) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsCopyFeedbackVisible(false)
    }, 2000)

    return () => window.clearTimeout(timeoutId)
  }, [isCopyFeedbackVisible])

  useEffect(() => {
    if (!isSaveFeedbackVisible) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setIsSaveFeedbackVisible(false)
    }, 2000)

    return () => window.clearTimeout(timeoutId)
  }, [isSaveFeedbackVisible])

  const copyMarkdownToClipboard = useCallback(() => {
    if (!markdown) {
      return
    }

    navigator.clipboard.writeText(markdown).catch(() => {})
    setIsCopyFeedbackVisible(true)
  }, [markdown])

  const saveMarkdownToFile = useCallback(() => {
    if (!markdown) {
      return
    }

    const filename = buildMarkdownFilename(title)
    const markdownBlob = new Blob([markdown], { type: "text/markdown" })
    const objectUrl = URL.createObjectURL(markdownBlob)

    const link = document.createElement("a")
    link.href = objectUrl
    link.download = filename
    link.click()

    URL.revokeObjectURL(objectUrl)
    setIsSaveFeedbackVisible(true)
  }, [markdown, title])

  return {
    copyMarkdownToClipboard,
    saveMarkdownToFile,
    isCopyFeedbackVisible,
    isSaveFeedbackVisible,
  }
}
