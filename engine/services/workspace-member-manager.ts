import { WorkspaceEmailInvite } from "../models/workspace-email-invite"
import {
  WorkspaceMember,
  WorkspaceMemberFromServerDto,
  WorkspaceMemberRole,
} from "../models/workspace-member"
import { MemberRepository } from "../repositories"
import { WorkspaceStore } from "../store/workspace-store"
import { AddMemberToWorkspace } from "../usecase/members/AddMemberToWorkspace"
import { FetchWorkspaceMembers } from "../usecase/members/FetchWorkspaceMembers"
import { RemoveMemberFromWorkspace } from "../usecase/members/RemoveMemberFromWorkspace"
import { UpdateWorkspaceMemberRole } from "../usecase/members/UpdateWorkspaceMemberRole"
import { GetWorkspacePendingInvites } from "../usecase/invites/GetWorkspacePendingInvites"
import { RevokeWorkspacePendingInvite } from "../usecase/invites/RevokeWorkspacePendingInvite"
import { EnrichWorkspaceMemberWithUserProfile } from "../usecase/user-profiles/user-profiles"
import { logger } from "../utils/logger"
import { SSEConnectionManager } from "./sse-connection-manager"
import {
  SSEEventType,
  WorkspaceMemberEventData,
  type SSEEventSubscription,
  type TypedSSEEventUnion,
} from "./sse-types"

type MembersChangedCallback = (changedUserIds: string[]) => void

function profilesEqual(
  a: WorkspaceMember["profile"] | undefined,
  b: WorkspaceMember["profile"] | undefined
): boolean {
  return (
    a?.name === b?.name &&
    a?.bio === b?.bio &&
    a?.avatar === b?.avatar &&
    a?.avatarType === b?.avatarType
  )
}

function membersAreEqual(a: WorkspaceMember, b: WorkspaceMember): boolean {
  return (
    a.id === b.id &&
    a.workspaceId === b.workspaceId &&
    a.userId === b.userId &&
    a.role === b.role &&
    a.user?.email === b.user?.email &&
    a.displayName === b.displayName &&
    a.avatarDataUrl === b.avatarDataUrl &&
    a.profileNeedsSetup === b.profileNeedsSetup &&
    profilesEqual(a.profile, b.profile)
  )
}

export class WorkspaceMemberManager {
  private readonly workspaceMembers: Map<string, WorkspaceMember> = new Map()
  private pendingInvites: WorkspaceEmailInvite[] = []
  private observers: Set<MembersChangedCallback> = new Set()
  private unsubscribeFromWorkspace?: () => void
  private unsubscribeFromSse?: () => void
  private isDestroyed = false
  private workspaceInvitesFetchSequence = 0

  constructor(
    private readonly workspaceStore: WorkspaceStore,
    private readonly currentWorkspaceAccountId: string,
    private readonly fetchWorkspaceMembersUseCase: FetchWorkspaceMembers,
    private readonly getWorkspacePendingInvites: GetWorkspacePendingInvites,
    private readonly addMemberToWorkspace: AddMemberToWorkspace,
    private readonly removeMemberFromWorkspace: RemoveMemberFromWorkspace,
    private readonly updateWorkspaceMemberRole: UpdateWorkspaceMemberRole,
    private readonly revokeWorkspacePendingInvite: RevokeWorkspacePendingInvite,
    private readonly sseConnectionManager: SSEConnectionManager,
    private readonly memberRepository: MemberRepository,
    private readonly enrichWorkspaceMemberWithUserProfile: EnrichWorkspaceMemberWithUserProfile
  ) {}

  public async initialize(): Promise<void> {
    this.isDestroyed = false
    this.unsubscribeFromWorkspace = this.workspaceStore.onCurrentWorkspaceChange(workspace => {
      if (!workspace) {
        this.workspaceMembers.clear()
        this.pendingInvites = []
        this.notifyObservers([])
        return
      }

      void this.fetchWorkspaceMembers()
    })

    this.subscribeToSSE()
  }

  public destroy(): void {
    this.isDestroyed = true
    this.unsubscribeFromWorkspace?.()
    this.unsubscribeFromWorkspace = undefined
    this.unsubscribeFromSse?.()
    this.unsubscribeFromSse = undefined
    this.observers.clear()
    this.workspaceMembers.clear()
    this.pendingInvites = []
  }

  public registerObserver(callback: MembersChangedCallback): () => void {
    this.observers.add(callback)
    return () => this.observers.delete(callback)
  }

  private notifyObservers(changedUserIds: string[]): void {
    for (const observer of this.observers) {
      try {
        observer(changedUserIds)
      } catch (err) {
        logger.error("WorkspaceMemberManager observer failed", err)
      }
    }
  }

  public getWorkspaceMembers(): WorkspaceMember[] {
    return Array.from(this.workspaceMembers.values())
  }

  public async getMemberFromCache(userId: string): Promise<WorkspaceMember | undefined> {
    const cached = this.workspaceMembers.get(userId)
    if (cached) {
      return cached
    }

    const repositoryMember = await this.memberRepository.getMemberByUserId(userId)
    if (!repositoryMember) {
      return undefined
    }

    const enrichedMember = this.enrichWorkspaceMemberWithUserProfile.execute(repositoryMember)
    this.workspaceMembers.set(userId, enrichedMember)
    return enrichedMember
  }

  public getPendingInvites(): WorkspaceEmailInvite[] {
    return [...this.pendingInvites].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  public async fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      return []
    }

    const cachedMembers = await this.memberRepository.getMembers()
    if (cachedMembers.length > 0) {
      const hydratedCachedMembers = cachedMembers.map(member =>
        this.enrichWorkspaceMemberWithUserProfile.execute(member)
      )
      this.replaceWorkspaceMembers(hydratedCachedMembers)
      this.notifyObservers(hydratedCachedMembers.map(member => member.userId))
    }

    const result = await this.fetchWorkspaceMembersUseCase.execute({
      workspaceId: workspace.uuid,
    })

    if (result.isFailed()) {
      if (cachedMembers.length > 0) {
        return Array.from(this.workspaceMembers.values())
      }
      throw new Error(result.getError())
    }

    const members = result
      .getValue()
      .map(member => this.enrichWorkspaceMemberWithUserProfile.execute(member))
    this.replaceWorkspaceMembers(members)
    await this.memberRepository.saveMembers(members)
    this.notifyObservers(members.map(member => member.userId))
    return members
  }

  public async fetchPendingInvites(): Promise<WorkspaceEmailInvite[]> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      this.pendingInvites = []
      return []
    }
    const requestId = ++this.workspaceInvitesFetchSequence
    const workspaceId = workspace.uuid

    const isRequestActive = (): boolean =>
      !this.isDestroyed &&
      this.workspaceStore.getCurrentWorkspace()?.uuid === workspaceId &&
      requestId === this.workspaceInvitesFetchSequence

    try {
      if (!isRequestActive()) {
        return []
      }
      const invitesResult = await this.getWorkspacePendingInvites.execute({
        workspaceId: workspace.uuid,
      })
      if (invitesResult.isFailed()) {
        throw new Error(invitesResult.getError())
      }
      const invites = invitesResult.getValue()
      if (!isRequestActive()) {
        return []
      }
      this.pendingInvites = invites
      return invites
    } catch (err) {
      const is403Forbidden = err instanceof Error && err.message.includes("403")
      const isAdminOnlyError = err instanceof Error && err.message.includes("Only workspace admins")
      if (is403Forbidden || isAdminOnlyError) {
        this.pendingInvites = []
        return []
      }
      logger.error("Failed to fetch pending invites", err)
      throw err
    }
  }

  public async addMember(email: string, role: WorkspaceMemberRole): Promise<WorkspaceMember> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      throw new Error("No current workspace selected")
    }

    if (!this.currentWorkspaceAccountId) {
      throw new Error("Must be logged in to invite members")
    }

    const responseResult = await this.addMemberToWorkspace.execute({
      workspaceId: workspace.uuid,
      email,
      role,
    })
    if (responseResult.isFailed()) {
      throw new Error(responseResult.getError())
    }

    const response = responseResult.getValue()
    if (response.status !== "member_created") {
      throw new Error("Failed to add member")
    }

    const member = this.enrichWorkspaceMemberWithUserProfile.execute(
      WorkspaceMemberFromServerDto(response.member)
    )
    this.workspaceMembers.set(member.userId, member)
    await this.memberRepository.saveMember(member)
    this.notifyObservers([member.userId])
    return member
  }

  public async removeMember(userId: string): Promise<void> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      throw new Error("No current workspace selected")
    }

    const removeResult = await this.removeMemberFromWorkspace.execute({
      workspaceId: workspace.uuid,
      userId,
    })
    if (removeResult.isFailed()) {
      throw new Error(removeResult.getError())
    }
    this.workspaceMembers.delete(userId)
    await this.memberRepository.deleteMemberByUserId(userId)
    this.notifyObservers([userId])
  }

  public async updateMemberRole(userId: string, role: WorkspaceMemberRole): Promise<WorkspaceMember> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      throw new Error("No current workspace selected")
    }

    const updateResult = await this.updateWorkspaceMemberRole.execute({
      workspaceId: workspace.uuid,
      userId,
      role,
    })
    if (updateResult.isFailed()) {
      throw new Error(updateResult.getError())
    }

    const member = this.enrichWorkspaceMemberWithUserProfile.execute(updateResult.getValue())
    this.workspaceMembers.set(member.userId, member)
    await this.memberRepository.saveMember(member)
    this.notifyObservers([member.userId])

    return member
  }

  public async revokePendingInvite(inviteId: string): Promise<void> {
    const workspace = this.workspaceStore.getCurrentWorkspace()
    if (!workspace) {
      throw new Error("No current workspace selected")
    }

    const revokeResult = await this.revokeWorkspacePendingInvite.execute({
      workspaceId: workspace.uuid,
      inviteId,
    })
    if (revokeResult.isFailed()) {
      throw new Error(revokeResult.getError())
    }
    this.pendingInvites = this.pendingInvites.filter(invite => invite.id !== inviteId)
  }

  private subscribeToSSE(): void {
    const subscription: SSEEventSubscription = {
      eventTypes: [
        SSEEventType.WORKSPACE_MEMBER_ADDED,
        SSEEventType.WORKSPACE_MEMBER_REMOVED,
        SSEEventType.WORKSPACE_MEMBER_UPDATED,
      ],
      handler: (event: TypedSSEEventUnion) => {
        const workspace = this.workspaceStore.getCurrentWorkspace()
        if (!workspace) {
          return
        }

        if (event.type === SSEEventType.WORKSPACE_MEMBER_ADDED) {
          const data = event.data as WorkspaceMemberEventData
          if (data.workspace_id !== workspace.uuid) {
            return
          }
          void this.handleWorkspaceMemberUpsertFromEvent(data)
          return
        }

        if (event.type === SSEEventType.WORKSPACE_MEMBER_UPDATED) {
          const data = event.data as WorkspaceMemberEventData
          if (data.workspace_id !== workspace.uuid) {
            return
          }
          void this.handleWorkspaceMemberUpsertFromEvent(data)
          return
        }

        if (event.type === SSEEventType.WORKSPACE_MEMBER_REMOVED) {
          const data = event.data as WorkspaceMemberEventData
          if (data.workspace_id !== workspace.uuid) {
            return
          }
          void this.handleWorkspaceMemberRemovedFromEvent(data)
        }
      },
    }

    this.unsubscribeFromSse = this.sseConnectionManager.subscribe(subscription)
  }

  private async handleWorkspaceMemberUpsertFromEvent(data: WorkspaceMemberEventData): Promise<void> {
    try {
      const existingMember =
        this.workspaceMembers.get(data.user_id) ?? (await this.memberRepository.getMemberByUserId(data.user_id))

      const memberFromEvent = WorkspaceMemberFromServerDto({
        id: data.member_id,
        workspace_id: data.workspace_id,
        user_id: data.user_id,
        role: data.role,
      })

      const enrichedMember = this.enrichWorkspaceMemberWithUserProfile.execute({
        ...memberFromEvent,
        user: memberFromEvent.user ?? existingMember?.user,
      })

      this.workspaceMembers.set(enrichedMember.userId, enrichedMember)
      await this.memberRepository.saveMember(enrichedMember)
      this.notifyObservers([enrichedMember.userId])
    } catch (error) {
      logger.warn("WorkspaceMemberManager: failed to apply member SSE update", error)
    }
  }

  private async handleWorkspaceMemberRemovedFromEvent(data: WorkspaceMemberEventData): Promise<void> {
    this.workspaceMembers.delete(data.user_id)
    await this.memberRepository.deleteMemberByUserId(data.user_id)
    this.notifyObservers([data.user_id])
  }

  private replaceWorkspaceMembers(members: WorkspaceMember[]): void {
    this.workspaceMembers.clear()
    for (const member of members) {
      this.workspaceMembers.set(member.userId, member)
    }
  }

  private applyUserProfilesFromCache(): string[] {
    const changedUserIds: string[] = []
    for (const [userId, member] of this.workspaceMembers.entries()) {
      const enrichedMember = this.enrichWorkspaceMemberWithUserProfile.execute(member)
      if (!membersAreEqual(member, enrichedMember)) {
        changedUserIds.push(userId)
        this.workspaceMembers.set(userId, enrichedMember)
      }
    }
    return changedUserIds
  }

  public handleUserProfileEntitiesChanged(): void {
    if (this.workspaceMembers.size === 0) {
      return
    }

    const changedUserIds = this.applyUserProfilesFromCache()
    if (changedUserIds.length === 0) {
      return
    }

    void this.memberRepository.saveMembers(this.getWorkspaceMembers())
    this.notifyObservers(changedUserIds)
  }
}
