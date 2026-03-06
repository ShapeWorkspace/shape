/**
 * PaperCommentReplyComposer wraps PaperCommentComposer with reply defaults.
 */

import type { PaperCommentComposerProps } from "./PaperCommentComposer"
import { PaperCommentComposer } from "./PaperCommentComposer"

export type PaperCommentReplyComposerProps = Omit<
  PaperCommentComposerProps,
  "placeholder" | "editorTestId"
>

export function PaperCommentReplyComposer(props: PaperCommentReplyComposerProps) {
  return (
    <PaperCommentComposer
      {...props}
      placeholder="Write a reply..."
      editorTestId="paper-comment-reply-composer-editor"
    />
  )
}
