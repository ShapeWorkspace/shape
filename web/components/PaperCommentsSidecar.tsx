/**
 * PaperCommentsSidecar renders the list view for paper comment threads.
 */

import { useMemo, useState, useCallback } from "react"
import { Check, MoreHorizontal } from "lucide-react"
import { useSidecarNavigation, Sidecar, SidecarRow, SidecarMenu, SidecarSection } from "./SidecarUI"
import type { DecryptedPaperComment } from "../../engine/models/entity"
import { usePaperCommentReplyCount } from "../store/queries/use-paper-comments"
import { RelativeTimestamp } from "./RelativeTimestamp"
import { TipTapRenderer } from "./TipTapRenderer"
import { renderTipTapJsonToHtml } from "../lib/tiptap-json"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { WorkspaceMemberAvatar } from "./WorkspaceMemberAvatar"
import * as commentStyles from "../styles/paper-comments.css"

interface PaperCommentsSidecarProps {
  paperId: string
  comments: DecryptedPaperComment[]
  activeCommentId: string | null
  anchorPreviewByCommentId: Map<string, string>
  anchorPositionByCommentId: Map<string, number>
  onSelectComment: (commentId: string) => void
}

type CommentSortMode = "document" | "recency"

function getCommentPreviewText(comment: DecryptedPaperComment, anchorPreviewByCommentId: Map<string, string>): string | null {
  const preview = anchorPreviewByCommentId.get(comment.id)
  if (preview && preview.trim().length > 0) {
    return preview
  }
  return null
}

function sortCommentsByDocumentPosition(
  comments: DecryptedPaperComment[],
  anchorPositionByCommentId: Map<string, number>
): DecryptedPaperComment[] {
  const anchored: DecryptedPaperComment[] = []
  const orphaned: DecryptedPaperComment[] = []

  for (const comment of comments) {
    if (anchorPositionByCommentId.has(comment.id)) {
      anchored.push(comment)
    } else {
      orphaned.push(comment)
    }
  }

  anchored.sort((left, right) => {
    const leftPosition = anchorPositionByCommentId.get(left.id) ?? 0
    const rightPosition = anchorPositionByCommentId.get(right.id) ?? 0
    return leftPosition - rightPosition
  })

  orphaned.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())

  return [...anchored, ...orphaned]
}

function sortCommentsByRecency(
  comments: DecryptedPaperComment[],
  anchorPositionByCommentId: Map<string, number>
): DecryptedPaperComment[] {
  const anchored: DecryptedPaperComment[] = []
  const orphaned: DecryptedPaperComment[] = []

  for (const comment of comments) {
    if (anchorPositionByCommentId.has(comment.id)) {
      anchored.push(comment)
    } else {
      orphaned.push(comment)
    }
  }

  anchored.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  orphaned.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())

  return [...anchored, ...orphaned]
}

function PaperCommentListItem({
  comment,
  index,
  isActive,
  anchorPreview,
  onSelect,
}: {
  comment: DecryptedPaperComment
  index: number
  isActive: boolean
  anchorPreview: string | null
  onSelect: () => void
}) {
  const navigationContext = useSidecarNavigation()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const isSelected = navigationContext?.isFocused && navigationContext.selectedIndex === index

  const replyCount = usePaperCommentReplyCount(comment.id)

  const handleMouseEnter = () => {
    navigationContext?.setSelectedIndex(index)
  }

  const replyCountLabel = replyCount === 1 ? "1 reply" : `${replyCount} replies`
  const renderedBodyHtml = renderTipTapJsonToHtml(comment.content.body)

  const authorProfile = useMemo(() => {
    if (!comment.creatorId || !workspaceMemberManager) {
      return null
    }
    const member = workspaceMemberManager
      .getWorkspaceMembers()
      .find(entry => entry.userId === comment.creatorId)
    if (!member) {
      return null
    }
    return {
      displayName: member.displayName,
      avatarDataUrl: member.avatarDataUrl,
    }
  }, [comment.creatorId, workspaceMemberManager])

  const authorName = useMemo(() => {
    if (!comment.creatorId) {
      return "Unknown"
    }
    if (currentUser && currentUser.uuid === comment.creatorId) {
      return "You"
    }
    return authorProfile?.displayName ?? "Unknown"
  }, [comment.creatorId, currentUser, authorProfile])

  const authorAvatarLabel = authorProfile?.displayName ?? authorName
  const authorAvatarDataUrl = authorProfile?.avatarDataUrl ?? null

  return (
    <div
      className={commentStyles.commentListItem}
      data-active={isActive}
      data-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      data-testid="paper-comment-list-item"
      data-comment-id={comment.id}
    >
      <div className={commentStyles.commentHeaderRow}>
        <WorkspaceMemberAvatar
          userId={comment.creatorId ?? "unknown"}
          displayName={authorAvatarLabel}
          avatarDataUrl={authorAvatarDataUrl}
          size={24}
          fontSize={11}
        />
        <div className={commentStyles.commentHeaderMeta}>
          <div className={commentStyles.commentAuthorName}>{authorName}</div>
          <div className={commentStyles.commentTimestamp}>
            <RelativeTimestamp timestamp={comment.createdAt.getTime()} />
          </div>
        </div>
      </div>

      {anchorPreview && (
        <div className={commentStyles.commentAnchorPreview} data-testid="paper-comment-anchor-preview">
          “{anchorPreview}”
        </div>
      )}

      <div className={commentStyles.commentBodyPreview} data-testid="paper-comment-body-preview">
        <TipTapRenderer content={renderedBodyHtml} compact />
      </div>

      <div className={commentStyles.commentReplyCount}>{replyCountLabel}</div>
    </div>
  )
}

export function PaperCommentsSidecar({
  paperId,
  comments,
  activeCommentId,
  anchorPreviewByCommentId,
  anchorPositionByCommentId,
  onSelectComment,
}: PaperCommentsSidecarProps) {
  const [sortMode, setSortMode] = useState<CommentSortMode>("document")
  const [showResolvedComments, setShowResolvedComments] = useState(false)
  const [areOptionsExpanded, setAreOptionsExpanded] = useState(false)

  const { openComments, resolvedComments } = useMemo(() => {
    const open: DecryptedPaperComment[] = []
    const resolved: DecryptedPaperComment[] = []

    for (const comment of comments) {
      if (comment.metaFields.resolved ?? false) {
        resolved.push(comment)
      } else {
        open.push(comment)
      }
    }

    return { openComments: open, resolvedComments: resolved }
  }, [comments])

  const orderedOpenComments = useMemo(() => {
    if (sortMode === "recency") {
      return sortCommentsByRecency(openComments, anchorPositionByCommentId)
    }
    return sortCommentsByDocumentPosition(openComments, anchorPositionByCommentId)
  }, [openComments, sortMode, anchorPositionByCommentId])

  const orderedResolvedComments = useMemo(() => {
    return sortCommentsByDocumentPosition(resolvedComments, anchorPositionByCommentId)
  }, [resolvedComments, anchorPositionByCommentId])

  const visibleResolvedComments = useMemo(() => {
    if (!showResolvedComments) {
      return []
    }
    return orderedResolvedComments
  }, [orderedResolvedComments, showResolvedComments])

  const selectableComments = useMemo(
    () => [...orderedOpenComments, ...visibleResolvedComments],
    [orderedOpenComments, visibleResolvedComments]
  )

  const optionsRowCount = areOptionsExpanded ? 3 : 0
  const totalSelectableItems = optionsRowCount + selectableComments.length

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (areOptionsExpanded) {
        if (index === 0) {
          setSortMode("document")
          return
        }
        if (index === 1) {
          setSortMode("recency")
          return
        }
        if (index === 2) {
          setShowResolvedComments(value => !value)
          return
        }
      }

      const commentIndex = index - optionsRowCount
      const comment = selectableComments[commentIndex]
      if (!comment) {
        return
      }
      onSelectComment(comment.id)
    },
    [selectableComments, onSelectComment, areOptionsExpanded, optionsRowCount]
  )

  return (
    <Sidecar
      itemCount={totalSelectableItems}
      onSelect={totalSelectableItems > 0 ? handleSelectByIndex : undefined}
    >
      <div className={commentStyles.commentsSidecarHeader} data-testid="paper-comments-sidecar-header">
        <div className={commentStyles.commentsSidecarTitle}>Comments</div>
        <button
          type="button"
          className={commentStyles.commentsOptionsButton}
          onClick={() => setAreOptionsExpanded(value => !value)}
          aria-expanded={areOptionsExpanded}
          aria-label={areOptionsExpanded ? "Hide comment options" : "Show comment options"}
          data-testid="paper-comments-options-toggle"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {areOptionsExpanded && (
        <>
          <SidecarSection title="Sort">
            <SidecarMenu>
              <SidecarRow
                index={0}
                title="Appearing first"
                icon={sortMode === "document" ? <Check size={14} /> : undefined}
                onClick={() => setSortMode("document")}
                testId="paper-comments-sort-document"
              />
              <SidecarRow
                index={1}
                title="Most recent"
                icon={sortMode === "recency" ? <Check size={14} /> : undefined}
                onClick={() => setSortMode("recency")}
                testId="paper-comments-sort-recent"
              />
            </SidecarMenu>
          </SidecarSection>
          <SidecarSection title="Show">
            <SidecarMenu>
              <SidecarRow
                index={2}
                title={`Resolved comments (${resolvedComments.length})`}
                icon={showResolvedComments ? <Check size={14} /> : undefined}
                onClick={() => setShowResolvedComments(value => !value)}
                testId="paper-comments-show-resolved"
              />
            </SidecarMenu>
          </SidecarSection>
        </>
      )}

      {orderedOpenComments.length === 0 && (
        <div className={commentStyles.commentsEmpty} data-testid="paper-comments-empty">
          No comments yet.
        </div>
      )}

      <div className={commentStyles.commentsList} data-testid="paper-comments-list">
        {orderedOpenComments.map((comment, index) => (
          <PaperCommentListItem
            key={comment.id}
            comment={comment}
            index={optionsRowCount + index}
            isActive={comment.id === activeCommentId}
            anchorPreview={getCommentPreviewText(comment, anchorPreviewByCommentId)}
            onSelect={() => onSelectComment(comment.id)}
          />
        ))}
      </div>

      {showResolvedComments && resolvedComments.length > 0 && (
        <div className={commentStyles.commentsList} data-testid="paper-comments-resolved-list">
          {orderedResolvedComments.map((comment, index) => {
            const listIndex = optionsRowCount + orderedOpenComments.length + index
            return (
              <PaperCommentListItem
                key={comment.id}
                comment={comment}
                index={listIndex}
                isActive={comment.id === activeCommentId}
                anchorPreview={getCommentPreviewText(comment, anchorPreviewByCommentId)}
                onSelect={() => onSelectComment(comment.id)}
              />
            )
          })}
        </div>
      )}

      <div data-testid="paper-comments-sidecar-footer" data-paper-id={paperId} />
    </Sidecar>
  )
}
