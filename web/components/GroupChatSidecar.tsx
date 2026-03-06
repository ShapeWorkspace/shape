import { useCallback } from "react"
import { useSidecar } from "../contexts/SidecarContext"
import {
  Sidecar,
  SidecarSection,
  SidecarMetaList,
  SidecarMetaItem,
  SidecarMenu,
  SidecarRow,
} from "./SidecarUI"
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { useGroupChatACLMemberCount } from "../store/queries/use-group-chat-acl"
import { useQuery } from "@tanstack/react-query"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { WorkspaceMember } from "../../engine/models/workspace-member"
import { MessageSquare, Users, Calendar } from "lucide-react"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"

/**
 * Props for GroupChatSidecar component.
 */
interface GroupChatSidecarProps {
  groupChatId: string
  groupName: string
  creatorId: string
}

/**
 * GroupChatSidecar displays group chat metadata and provides access
 * to member management via the ManageMembersSidecarMenu.
 */
export function GroupChatSidecar({ groupChatId, groupName, creatorId }: GroupChatSidecarProps) {
  const { pushSidecar } = useSidecar()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()

  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Fetch member count
  const { data: memberCount = 0 } = useGroupChatACLMemberCount(groupChatId)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle(
    "group-chat",
    groupChatId
  )

  // Get count of entity links for keyboard navigation
  // Uses 'group' (client type) - server maps to 'group_chat' for aggregation
  const linksItemCount = useLinksSidecarItemCount(groupChatId, "group")

  // Fetch creator info
  const { data: creatorMember } = useQuery({
    queryKey: ["workspace-member", application?.workspaceId, creatorId],
    queryFn: async (): Promise<WorkspaceMember | null> => {
      if (!application) return null
      try {
        const memberResult = await application.getGetWorkspaceMember().execute({
          workspaceId: application.workspaceId,
          userId: creatorId,
        })
        if (memberResult.isFailed()) {
          throw new Error(memberResult.getError())
        }
        return memberResult.getValue()
      } catch {
        return null
      }
    },
    enabled: !!application && !!creatorId,
    staleTime: 60_000,
  })

  const creatorName = creatorMember?.displayName || creatorMember?.user?.email || "Unknown"

  // Handle opening member management
  const handleManageMembers = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="group_chat"
        resourceId={groupChatId}
        creatorId={creatorId}
        creatorName={creatorName}
      />,
      "Manage Members"
    )
  }, [pushSidecar, groupChatId, creatorId, creatorName, isMemberManagementDisabled])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        handleManageMembers()
        return
      }
      if (index === 1) {
        if (!isMemberManagementDisabled) {
          toggleSubscription()
        }
      }
    },
    [handleManageMembers, toggleSubscription, isMemberManagementDisabled]
  )

  // Total item count: 2 actions + links
  const totalItemCount = 2 + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Group info section */}
      <SidecarSection title="Group Info">
        <SidecarMetaList>
          <SidecarMetaItem icon={<MessageSquare size={12} />} label="Name" value={groupName} />
          <SidecarMetaItem
            icon={<Users size={12} />}
            label="Members"
            value={`${memberCount} ${memberCount === 1 ? "member" : "members"}`}
          />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Created by" value={creatorName} />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Users size={14} />}
            title="Manage members"
            onClick={handleManageMembers}
            disabled={isMemberManagementDisabled}
            testId="group-chat-manage-members"
          />
          <NotificationSubscriptionSidecarRow
            index={1}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="group-chat-subscription-toggle"
          />
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={groupChatId} entityType="group" startIndex={2} />
    </Sidecar>
  )
}
