/**
 * PaperCommentDetailSidecar renders a single comment thread with replies.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import type { KeyboardEvent } from "react"
import type { ReactNode } from "react"
import type { JSONContent } from "@tiptap/core"
import {
  CheckCircle2,
  CornerDownRight,
  SlidersHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import type { DecryptedPaperComment, DecryptedPaperCommentReply } from "../../engine/models/entity"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { RelativeTimestamp } from "./RelativeTimestamp"
import { TipTapRenderer } from "./TipTapRenderer"
import { PaperCommentComposer } from "./PaperCommentComposer"
import { PaperCommentReplyComposer } from "./PaperCommentReplyComposer"
import { normalizeTipTapJsonContent, renderTipTapJsonToHtml } from "../lib/tiptap-json"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import { SidecarMenu, SidecarRow, SidecarSection } from "./SidecarUI"
import { WorkspaceMemberAvatar } from "./WorkspaceMemberAvatar"
import * as commentStyles from "../styles/paper-comments.css"

interface PaperCommentDetailSidecarProps {
  paperId: string
  comment: DecryptedPaperComment | null
  replies: DecryptedPaperCommentReply[]
  isNewThread: boolean
  anchorPreview: string | null
  canWrite: boolean
  currentUserId: string | null
  paperCreatorId: string
  activeReplyId: string | null
  mentionSuggestionContext?: MentionSuggestionContext
  onCreateComment: (commentId: string, content: JSONContent) => void
  onUpdateComment: (comment: DecryptedPaperComment, content: JSONContent) => void
  onDeleteComment: (comment: DecryptedPaperComment) => void
  onToggleResolved: (comment: DecryptedPaperComment, resolved: boolean) => void
  onSelectReply: (replyId: string) => void
  onCreateReply: (comment: DecryptedPaperComment, replyId: string, content: JSONContent) => void
  onCancelNewComment?: () => void
  isCommentMutationPending?: boolean
}

interface SidecarActionRow {
  title: string
  icon?: ReactNode
  onClick: () => void
  disabled: boolean
  testId: string
  isDestructive?: boolean
  isSubRow?: boolean
  meta?: string
}

function useAuthorProfileDetails(authorId: string | null) {
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()

  return useMemo(() => {
    if (!authorId) {
      return {
        displayName: "Unknown",
        avatarLabel: "Unknown",
        avatarDataUrl: null,
        userId: "unknown",
      }
    }

    const member = workspaceMemberManager
      ?.getWorkspaceMembers()
      .find(entry => entry.userId === authorId)

    const memberDisplayName = member?.displayName || member?.user?.email || "Unknown"
    const displayName =
      currentUser && currentUser.uuid === authorId ? "You" : memberDisplayName

    return {
      displayName,
      avatarLabel: memberDisplayName || displayName,
      avatarDataUrl: member?.avatarDataUrl ?? null,
      userId: authorId,
    }
  }, [authorId, currentUser, workspaceMemberManager])
}

function PaperCommentReplyItem({
  reply,
  isSelected,
  onSelectReply,
}: {
  reply: DecryptedPaperCommentReply
  isSelected: boolean
  onSelectReply: () => void
}) {
  const replyAuthorProfile = useAuthorProfileDetails(reply.creatorId)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        onSelectReply()
      }
    },
    [onSelectReply]
  )

  return (
    <div
      className={commentStyles.replyItem}
      data-selected={isSelected}
      data-testid="paper-comment-reply-item"
      data-reply-id={reply.id}
      role="button"
      tabIndex={0}
      onClick={onSelectReply}
      onKeyDown={handleKeyDown}
    >
      <div className={commentStyles.replyHeaderRow}>
        <WorkspaceMemberAvatar
          userId={replyAuthorProfile.userId}
          displayName={replyAuthorProfile.avatarLabel}
          avatarDataUrl={replyAuthorProfile.avatarDataUrl}
          size={20}
          fontSize={10}
        />
        <div className={commentStyles.replyHeaderMeta}>
          <div className={commentStyles.replyAuthorName}>{replyAuthorProfile.displayName}</div>
          <div className={commentStyles.replyTimestamp}>
            <RelativeTimestamp timestamp={reply.createdAt.getTime()} />
          </div>
        </div>
      </div>

      <div className={commentStyles.replyBodyRenderer} data-testid="paper-comment-reply-body">
        <TipTapRenderer content={renderTipTapJsonToHtml(reply.content.body)} compact />
      </div>
    </div>
  )
}

export function PaperCommentReplyDetailSidecar({
  comment,
  reply,
  currentUserId,
  paperCreatorId,
  mentionSuggestionContext,
  onUpdateReply,
  onDeleteReply,
  isCommentMutationPending = false,
}: {
  comment: DecryptedPaperComment
  reply: DecryptedPaperCommentReply | null
  currentUserId: string | null
  paperCreatorId: string
  mentionSuggestionContext?: MentionSuggestionContext
  onUpdateReply: (comment: DecryptedPaperComment, reply: DecryptedPaperCommentReply, content: JSONContent) => void
  onDeleteReply: (comment: DecryptedPaperComment, reply: DecryptedPaperCommentReply) => void
  isCommentMutationPending?: boolean
}) {
  const [isEditingReply, setIsEditingReply] = useState(false)
  const replySubmitActionRef = useRef<(() => void) | null>(null)
  const [isReplySubmitDisabled, setIsReplySubmitDisabled] = useState(true)
  const [isDeleteReplyConfirming, setIsDeleteReplyConfirming] = useState(false)

  const replyAuthorProfile = useAuthorProfileDetails(reply?.creatorId ?? null)

  const canEditReply = useMemo(() => {
    if (!reply || !currentUserId) {
      return false
    }
    return reply.creatorId === currentUserId || paperCreatorId === currentUserId
  }, [reply, currentUserId, paperCreatorId])

  const handleReplySubmitReady = useCallback((submit: () => void, disabled: boolean) => {
    replySubmitActionRef.current = submit
    setIsReplySubmitDisabled(disabled)
  }, [])

  const handleSubmitUpdatedReply = useCallback(
    (replyId: string, content: JSONContent) => {
      if (!reply || reply.id !== replyId) {
        return
      }
      onUpdateReply(comment, reply, content)
      setIsEditingReply(false)
    },
    [comment, onUpdateReply, reply]
  )

  const handleDeleteReplyClick = useCallback(() => {
    setIsDeleteReplyConfirming(true)
  }, [])

  const handleConfirmDeleteReply = useCallback(() => {
    if (!reply) {
      return
    }
    setIsDeleteReplyConfirming(false)
    onDeleteReply(comment, reply)
  }, [comment, onDeleteReply, reply])

  const handleCancelDeleteReply = useCallback(() => {
    setIsDeleteReplyConfirming(false)
  }, [])

  useEffect(() => {
    setIsDeleteReplyConfirming(false)
  }, [reply?.id])

  if (!reply) {
    return (
      <div className={commentStyles.commentDetailContainer} data-testid="paper-comment-reply-loading">
        <div className={commentStyles.commentsSidecarTitle}>Loading reply…</div>
      </div>
    )
  }

  const replyActionRows: SidecarActionRow[] = isEditingReply
    ? [
        {
          title: "Save reply",
          icon: <CheckCircle2 size={14} />,
          onClick: () => replySubmitActionRef.current?.(),
          disabled: isReplySubmitDisabled,
          testId: "paper-comment-reply-save-row",
        },
        {
          title: "Cancel",
          icon: <X size={14} />,
          onClick: () => setIsEditingReply(false),
          disabled: false,
          testId: "paper-comment-reply-cancel-row",
        },
      ]
    : [
        ...(canEditReply
          ? [
              {
                title: "Edit reply",
                icon: <Pencil size={14} />,
                onClick: () => setIsEditingReply(true),
                disabled: false,
                testId: "paper-comment-reply-edit",
              },
              {
                title: "Delete reply",
                icon: <Trash2 size={14} />,
                onClick: handleDeleteReplyClick,
                disabled: false,
                isDestructive: true,
                testId: "paper-comment-reply-delete",
              },
              ...(isDeleteReplyConfirming
                ? [
                    {
                      title: "Confirm",
                      onClick: handleConfirmDeleteReply,
                      disabled: false,
                      isDestructive: true,
                      isSubRow: true,
                      testId: "paper-comment-reply-delete-confirm",
                    },
                    {
                      title: "Cancel",
                      onClick: handleCancelDeleteReply,
                      disabled: false,
                      isSubRow: true,
                      testId: "paper-comment-reply-delete-cancel",
                    },
                  ]
                : []),
            ]
          : []),
      ]

  return (
    <div className={commentStyles.commentDetailContainer} data-testid="paper-comment-reply-detail-sidecar">
      <div className={commentStyles.commentDetailThread}>
        <div className={commentStyles.replyHeaderRow}>
          <WorkspaceMemberAvatar
            userId={replyAuthorProfile.userId}
            displayName={replyAuthorProfile.avatarLabel}
            avatarDataUrl={replyAuthorProfile.avatarDataUrl}
            size={20}
            fontSize={10}
          />
          <div className={commentStyles.replyHeaderMeta}>
            <div className={commentStyles.replyAuthorName}>{replyAuthorProfile.displayName}</div>
            <div className={commentStyles.replyTimestamp}>
              <RelativeTimestamp timestamp={reply.createdAt.getTime()} />
            </div>
          </div>
        </div>

        {isEditingReply ? (
          <PaperCommentReplyComposer
            fixedCommentId={reply.id}
            initialContent={normalizeTipTapJsonContent(reply.content.body)}
            onSubmit={handleSubmitUpdatedReply}
            mentionSuggestionContext={mentionSuggestionContext}
            onSubmitActionReady={handleReplySubmitReady}
            isPending={isCommentMutationPending}
            submitRowTestId="paper-comment-reply-save-row"
          />
        ) : (
          <div className={commentStyles.replyBodyRenderer} data-testid="paper-comment-reply-body">
            <TipTapRenderer content={renderTipTapJsonToHtml(reply.content.body)} />
          </div>
        )}
      </div>

      {replyActionRows.length > 0 && (
        <SidecarSection title="Actions">
          <SidecarMenu>
            {replyActionRows.map((row, index) => (
              <SidecarRow
                key={row.title}
                index={index}
                icon={row.icon}
                title={row.title}
                meta={row.meta}
                onClick={row.onClick}
                disabled={row.disabled}
                isDestructive={row.isDestructive}
                isSubRow={row.isSubRow}
                testId={row.testId}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      )}
    </div>
  )
}

export function PaperCommentDetailSidecar({
  paperId,
  comment,
  replies,
  isNewThread,
  anchorPreview,
  canWrite,
  currentUserId,
  paperCreatorId,
  activeReplyId,
  mentionSuggestionContext,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onToggleResolved,
  onSelectReply,
  onCreateReply,
  onCancelNewComment,
  isCommentMutationPending = false,
}: PaperCommentDetailSidecarProps) {
  const [isEditingComment, setIsEditingComment] = useState(false)
  const [areCommentActionsExpanded, setAreCommentActionsExpanded] = useState(false)
  const commentSubmitActionRef = useRef<(() => void) | null>(null)
  const [isCommentSubmitDisabled, setIsCommentSubmitDisabled] = useState(true)
  const replySubmitActionRef = useRef<(() => void) | null>(null)
  const [isReplySubmitDisabled, setIsReplySubmitDisabled] = useState(true)
  const [isReplyComposerVisible, setIsReplyComposerVisible] = useState(false)
  const [replyComposerKey, setReplyComposerKey] = useState(0)
  const [isDeleteCommentConfirming, setIsDeleteCommentConfirming] = useState(false)

  const commentAuthorProfile = useAuthorProfileDetails(comment?.creatorId ?? null)

  const canEditComment = useMemo(() => {
    if (!comment || !currentUserId) {
      return false
    }
    return comment.creatorId === currentUserId || paperCreatorId === currentUserId
  }, [comment, currentUserId, paperCreatorId])

  const canResolveComment = useMemo(() => {
    return Boolean(comment && canWrite)
  }, [comment, canWrite])

  const canReplyToComment = useMemo(() => {
    if (!comment) {
      return false
    }
    if (!canWrite) {
      return false
    }
    return !(comment.metaFields.resolved ?? false)
  }, [comment, canWrite])

  const handleSubmitNewComment = useCallback(
    (commentId: string, content: JSONContent) => {
      onCreateComment(commentId, content)
    },
    [onCreateComment]
  )

  const handleCommentSubmitReady = useCallback((submit: () => void, disabled: boolean) => {
    commentSubmitActionRef.current = submit
    setIsCommentSubmitDisabled(disabled)
  }, [])

  const handleReplySubmitReady = useCallback((submit: () => void, disabled: boolean) => {
    replySubmitActionRef.current = submit
    setIsReplySubmitDisabled(disabled)
  }, [])

  const handleSubmitUpdatedComment = useCallback(
    (commentId: string, content: JSONContent) => {
      if (!comment || comment.id !== commentId) {
        return
      }
      onUpdateComment(comment, content)
      setIsEditingComment(false)
    },
    [comment, onUpdateComment]
  )

  const handleToggleResolved = useCallback(() => {
    if (!comment) {
      return
    }
    onToggleResolved(comment, !(comment.metaFields.resolved ?? false))
  }, [comment, onToggleResolved])

  const handleDeleteCommentClick = useCallback(() => {
    setIsDeleteCommentConfirming(true)
  }, [])

  const handleConfirmDeleteComment = useCallback(() => {
    if (!comment) {
      return
    }
    setIsDeleteCommentConfirming(false)
    onDeleteComment(comment)
  }, [comment, onDeleteComment])

  const handleCancelDeleteComment = useCallback(() => {
    setIsDeleteCommentConfirming(false)
  }, [])

  useEffect(() => {
    setAreCommentActionsExpanded(false)
    setIsReplyComposerVisible(false)
    setReplyComposerKey(key => key + 1)
    setIsDeleteCommentConfirming(false)
  }, [comment?.id])

  useEffect(() => {
    if (areCommentActionsExpanded || !isDeleteCommentConfirming) {
      return
    }
    setIsDeleteCommentConfirming(false)
  }, [areCommentActionsExpanded, isDeleteCommentConfirming])

  if (!comment && isNewThread) {
    const newCommentActionRows = [
      {
        title: "Comment",
        icon: <CornerDownRight size={14} />,
        onClick: () => commentSubmitActionRef.current?.(),
        disabled: isCommentSubmitDisabled,
        testId: "paper-comment-submit-row",
      },
      ...(onCancelNewComment
        ? [
            {
              title: "Cancel",
              icon: <X size={14} />,
              onClick: onCancelNewComment,
              disabled: false,
              testId: "paper-comment-cancel-row",
            },
          ]
        : []),
    ]

    return (
      <div className={commentStyles.commentDetailContainer} data-testid="paper-comment-detail-sidecar">
        <div className={commentStyles.commentsSidecarTitle}>New Comment</div>
        {anchorPreview && (
          <div className={commentStyles.commentAnchorPreview} data-testid="paper-comment-new-anchor-preview">
            “{anchorPreview}”
          </div>
        )}
        <PaperCommentComposer
          onSubmit={handleSubmitNewComment}
          mentionSuggestionContext={mentionSuggestionContext}
          editorTestId="paper-comment-new-composer-editor"
          isPending={isCommentMutationPending}
          onSubmitActionReady={handleCommentSubmitReady}
          submitRowTestId="paper-comment-submit-row"
        />
        <SidecarSection title="Actions">
          <SidecarMenu>
            {newCommentActionRows.map((row, index) => (
              <SidecarRow
                key={row.title}
                index={index}
                icon={row.icon}
                title={row.title}
                onClick={row.onClick}
                disabled={row.disabled}
                testId={row.testId}
              />
            ))}
          </SidecarMenu>
        </SidecarSection>
      </div>
    )
  }

  if (!comment) {
    return (
      <div className={commentStyles.commentDetailContainer} data-testid="paper-comment-detail-loading">
        <div className={commentStyles.commentsSidecarTitle}>Loading comment…</div>
      </div>
    )
  }

  const commentActionRows: SidecarActionRow[] = [
    ...(canResolveComment
      ? [
          {
            title: (comment.metaFields.resolved ?? false) ? "Unresolve" : "Resolve",
            icon: (comment.metaFields.resolved ?? false) ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />,
            onClick: handleToggleResolved,
            disabled: false,
            testId: "paper-comment-resolve-toggle",
          },
        ]
      : []),
    ...(isEditingComment
      ? [
          {
            title: "Save",
            icon: <CheckCircle2 size={14} />,
            onClick: () => commentSubmitActionRef.current?.(),
            disabled: isCommentSubmitDisabled,
            testId: "paper-comment-save-row",
          },
          {
            title: "Cancel",
            icon: <X size={14} />,
            onClick: () => setIsEditingComment(false),
            disabled: false,
            testId: "paper-comment-cancel-row",
          },
        ]
      : canEditComment
        ? [
            {
              title: "Edit",
              icon: <Pencil size={14} />,
              onClick: () => setIsEditingComment(true),
              disabled: false,
              testId: "paper-comment-edit",
            },
          ]
        : []),
    ...(canEditComment
      ? [
          {
            title: "Delete",
            icon: <Trash2 size={14} />,
            onClick: handleDeleteCommentClick,
            disabled: false,
            isDestructive: true,
            testId: "paper-comment-delete",
          },
          ...(isDeleteCommentConfirming
            ? [
                {
                  title: "Confirm",
                  onClick: handleConfirmDeleteComment,
                  disabled: false,
                  isDestructive: true,
                  isSubRow: true,
                  testId: "paper-comment-delete-confirm",
                },
                {
                  title: "Cancel",
                  onClick: handleCancelDeleteComment,
                  disabled: false,
                  isSubRow: true,
                  testId: "paper-comment-delete-cancel",
                },
              ]
            : []),
        ]
      : []),
  ]

  const actionToggleRow = {
    title: areCommentActionsExpanded ? "Hide actions" : "Manage comment",
    onClick: () => setAreCommentActionsExpanded(current => !current),
    testId: "paper-comment-actions-toggle",
  }

  const replyActionRows: SidecarActionRow[] = canReplyToComment
    ? [
        ...(isReplyComposerVisible
          ? [
              {
                title: "Reply",
                icon: <CornerDownRight size={14} />,
                onClick: () => replySubmitActionRef.current?.(),
                disabled: isReplySubmitDisabled,
                testId: "paper-comment-reply-submit-row",
              },
              {
                title: "Cancel",
                icon: <X size={14} />,
                onClick: () => {
                  setIsReplyComposerVisible(false)
                  setReplyComposerKey(key => key + 1)
                },
                disabled: false,
                testId: "paper-comment-reply-cancel-row",
              },
            ]
          : [
              {
                title: "Reply",
                icon: <CornerDownRight size={14} />,
                onClick: () => setIsReplyComposerVisible(true),
                disabled: false,
                testId: "paper-comment-reply-open-row",
              },
            ]),
      ]
    : []

  return (
    <div className={commentStyles.commentDetailContainer} data-testid="paper-comment-detail-sidecar">
      <div className={commentStyles.commentDetailThread} data-testid="paper-comment-thread">
        <div className={commentStyles.commentHeaderRow}>
          <WorkspaceMemberAvatar
            userId={commentAuthorProfile.userId}
            displayName={commentAuthorProfile.avatarLabel}
            avatarDataUrl={commentAuthorProfile.avatarDataUrl}
            size={24}
            fontSize={11}
          />
          <div className={commentStyles.commentHeaderMeta}>
            <div className={commentStyles.commentAuthorName}>{commentAuthorProfile.displayName}</div>
            <div className={commentStyles.commentTimestamp}>
              <RelativeTimestamp timestamp={comment.createdAt.getTime()} />
            </div>
          </div>
          <div className={commentStyles.commentHeaderSpacer} />
          {(comment.metaFields.resolved ?? false) && <div className={commentStyles.resolvedBadge}>Resolved</div>}
        </div>

        {anchorPreview && (
          <div className={commentStyles.commentAnchorPreview} data-testid="paper-comment-thread-anchor-preview">
            “{anchorPreview}”
          </div>
        )}

        {isEditingComment ? (
          <PaperCommentComposer
            fixedCommentId={comment.id}
            initialContent={normalizeTipTapJsonContent(comment.content.body)}
            onSubmit={handleSubmitUpdatedComment}
            mentionSuggestionContext={mentionSuggestionContext}
            editorTestId="paper-comment-edit-composer-editor"
            isPending={isCommentMutationPending}
            onSubmitActionReady={handleCommentSubmitReady}
            submitRowTestId="paper-comment-save-row"
          />
        ) : (
          <div className={commentStyles.commentBodyRenderer} data-testid="paper-comment-thread-body">
            <TipTapRenderer content={renderTipTapJsonToHtml(comment.content.body)} />
          </div>
        )}
      </div>

      {commentActionRows.length > 0 && (
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<SlidersHorizontal size={14} />}
            title={actionToggleRow.title}
            onClick={actionToggleRow.onClick}
            testId={actionToggleRow.testId}
          />
          {areCommentActionsExpanded &&
            commentActionRows.map((row, index) => (
              <SidecarRow
                key={row.title}
                index={index + 1}
                icon={row.icon}
                title={row.title}
                meta={row.meta}
                onClick={row.onClick}
                disabled={row.disabled}
                isDestructive={row.isDestructive}
                isSubRow={row.isSubRow}
                testId={row.testId}
              />
            ))}
        </SidecarMenu>
      )}

      <div className={commentStyles.replySection}>
        <div className={commentStyles.replyList} data-testid="paper-comment-replies">
          {replies.map(reply => (
            <PaperCommentReplyItem
              key={reply.id}
              reply={reply}
              isSelected={reply.id === activeReplyId}
              onSelectReply={() => onSelectReply(reply.id)}
            />
          ))}
        </div>

        {canReplyToComment && isReplyComposerVisible ? (
          <PaperCommentReplyComposer
            key={replyComposerKey}
            onSubmit={(replyId, content) => onCreateReply(comment, replyId, content)}
            mentionSuggestionContext={mentionSuggestionContext}
            onSubmitActionReady={handleReplySubmitReady}
            submitRowTestId="paper-comment-reply-submit-row"
          />
        ) : null}

        {!canReplyToComment && (
          <div className={commentStyles.commentsEmpty} data-testid="paper-comment-reply-disabled">
            {(comment.metaFields.resolved ?? false) ? "Replies are disabled on resolved threads." : "Replying is disabled."}
          </div>
        )}

        {replyActionRows.length > 0 && (
          <SidecarMenu>
            {replyActionRows.map((row, index) => (
              <SidecarRow
                key={row.title}
                index={index}
                icon={row.icon}
                title={row.title}
                onClick={row.onClick}
                disabled={row.disabled}
                testId={row.testId}
              />
            ))}
          </SidecarMenu>
        )}
      </div>

      <div data-testid="paper-comment-detail-footer" data-paper-id={paperId} />
    </div>
  )
}
