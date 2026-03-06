import { useMemo, useCallback } from "react"
import type { ReactionListItem } from "../../store/queries/use-reactions"
import { Tooltip, TooltipContent, TooltipTrigger } from "../tiptap-ui-primitive/tooltip"
import * as reactionStyles from "../../styles/reactions.css"

interface ReactionPillsProps {
  reactions: ReactionListItem[]
  currentUserId: string | null
  resolveDisplayName: (userId: string) => string
  onToggleReaction: (emoji: string) => void
  testIdPrefix?: string
}

interface ReactionGroup {
  emoji: string
  count: number
  firstCreatedAt: number
  reactions: ReactionListItem[]
}

function buildTooltipLabel(reactorNames: string[]): string {
  if (reactorNames.length === 0) {
    return ""
  }
  if (reactorNames.length <= 3) {
    return reactorNames.join(", ")
  }
  const visible = reactorNames.slice(0, 3)
  const remaining = reactorNames.length - visible.length
  return `${visible.join(", ")}, and ${remaining} others`
}

export function ReactionPills({
  reactions,
  currentUserId,
  resolveDisplayName,
  onToggleReaction,
  testIdPrefix = "reaction",
}: ReactionPillsProps) {
  const groupedReactions = useMemo<ReactionGroup[]>(() => {
    const groups = new Map<string, ReactionGroup>()
    for (const reaction of reactions) {
      const emoji = reaction.content.emoji
      const existing = groups.get(emoji)
      if (!existing) {
        groups.set(emoji, {
          emoji,
          count: 1,
          firstCreatedAt: reaction.createdAt.getTime(),
          reactions: [reaction],
        })
        continue
      }
      existing.count += 1
      existing.reactions.push(reaction)
      if (reaction.createdAt.getTime() < existing.firstCreatedAt) {
        existing.firstCreatedAt = reaction.createdAt.getTime()
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.firstCreatedAt - b.firstCreatedAt)
  }, [reactions])

  const buildTooltipForGroup = useCallback(
    (group: ReactionGroup): string => {
      const sortedReactions = [...group.reactions].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )
      const seenUserIds = new Set<string>()
      const names: string[] = []
      for (const reaction of sortedReactions) {
        if (seenUserIds.has(reaction.creatorId)) {
          continue
        }
        seenUserIds.add(reaction.creatorId)
        if (currentUserId && reaction.creatorId === currentUserId) {
          names.push("You")
        } else {
          names.push(resolveDisplayName(reaction.creatorId))
        }
      }
      return buildTooltipLabel(names)
    },
    [currentUserId, resolveDisplayName]
  )

  if (groupedReactions.length === 0) {
    return null
  }

  return (
    <div className={reactionStyles.reactionPills}>
      {groupedReactions.map((group, index) => {
        const hasCurrentUserReaction =
          !!currentUserId && group.reactions.some(reaction => reaction.creatorId === currentUserId)
        const tooltipLabel = buildTooltipForGroup(group)
        const pillButton = (
          <button
            key={`${group.emoji}-${index}`}
            type="button"
            className={reactionStyles.reactionPill}
            data-active={hasCurrentUserReaction}
            aria-pressed={hasCurrentUserReaction}
            onClick={event => {
              event.stopPropagation()
              onToggleReaction(group.emoji)
            }}
            data-testid={`${testIdPrefix}-reaction-pill-${index}`}
          >
            <span className={reactionStyles.reactionEmoji}>{group.emoji}</span>
            <span className={reactionStyles.reactionCount}>{group.count}</span>
          </button>
        )

        if (!tooltipLabel) {
          return pillButton
        }

        return (
          <Tooltip key={`${group.emoji}-${index}`} delay={150}>
            <TooltipTrigger asChild>{pillButton}</TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
