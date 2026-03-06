import { useCallback, useMemo, useState } from "react"
import { Calendar, Trash2, Tag as TagIcon, Palette } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import {
  Sidecar,
  SidecarSection,
  SidecarMenu,
  SidecarRow,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { useDeleteProjectTag } from "../store/queries/use-project-tags"
import { useProjectTasks } from "../store/queries/use-project-tasks"
import type { DecryptedProjectTask, DecryptedProjectTag } from "../../engine/models/entity"

/**
 * Props for TagSidecar component.
 */
interface TagSidecarProps {
  // The project this tag belongs to
  projectId: string
  // The tag to display
  tag: DecryptedProjectTag
}

/**
 * TagSidecar displays contextual information and actions for a project tag.
 * Shown when clicking on a tag in the project view.
 *
 * Sections:
 * - Details: color preview, creation date
 * - Actions: Delete tag
 */
export function TagSidecar({ projectId, tag }: TagSidecarProps) {
  const { popSidecar } = useSidecar()
  const { mutate: deleteTag } = useDeleteProjectTag()
  const { data: tasks = [] } = useProjectTasks(projectId)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Count how many tasks use this tag
  const taskCount = useMemo(() => {
    return tasks.filter((t: DecryptedProjectTask) => t.metaFields.project_tag_id === tag.id).length
  }, [tasks, tag.id])

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Show delete confirmation sub-rows.
  const handleDeleteTagClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleCancelDeleteTag = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  // Handle delete tag action.
  const handleConfirmDeleteTag = useCallback(() => {
    if (isDeleting) return

    setIsDeleting(true)
    deleteTag(
      { projectId, tagId: tag.id },
      {
        onSuccess: () => {
          // Navigate back after successful deletion
          popSidecar()
        },
        onError: () => {
          setIsDeleting(false)
          setShowDeleteConfirm(false)
        },
      }
    )
  }, [deleteTag, projectId, tag.id, popSidecar, isDeleting])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        handleDeleteTagClick()
      } else if (index === 1 && showDeleteConfirm) {
        handleConfirmDeleteTag()
      } else if (index === 2 && showDeleteConfirm) {
        handleCancelDeleteTag()
      }
    },
    [handleDeleteTagClick, handleConfirmDeleteTag, handleCancelDeleteTag, showDeleteConfirm]
  )

  return (
    <Sidecar itemCount={1 + (showDeleteConfirm ? 2 : 0)} onSelect={handleSelect}>
      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<Palette size={12} />} label="Color" value={tag.content.color} />
          <SidecarMetaItem
            icon={<TagIcon size={12} />}
            label="Tasks"
            value={taskCount === 1 ? "1 task" : `${taskCount} tasks`}
          />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Created" value={formatDate(tag.createdAt)} />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Trash2 size={14} />}
            title={isDeleting ? "Deleting..." : "Delete tag"}
            onClick={handleDeleteTagClick}
            isDestructive
            testId="tag-delete"
          />
          {showDeleteConfirm && (
            <>
              <SidecarRow
                index={1}
                title={isDeleting ? "Deleting..." : "Confirm"}
                onClick={handleConfirmDeleteTag}
                disabled={isDeleting}
                isDestructive
                isSubRow
                testId="tag-delete-confirm"
              />
              <SidecarRow
                index={2}
                title="Cancel"
                onClick={handleCancelDeleteTag}
                disabled={isDeleting}
                isSubRow
                testId="tag-delete-cancel"
              />
            </>
          )}
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
