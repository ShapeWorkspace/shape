import { IOfflineDatabase } from "./offline-database"
import { INDEX_NAMES, STORE_NAMES } from "./schema"
import { WorkspaceMember } from "../models/workspace-member"

export class MemberRepository {
  constructor(
    private database: IOfflineDatabase,
    private readonly workspaceId: string
  ) {}

  async getMembers(): Promise<WorkspaceMember[]> {
    return this.database.getAll<WorkspaceMember>(this.workspaceId, STORE_NAMES.MEMBER)
  }

  async getMemberById(memberId: string): Promise<WorkspaceMember | undefined> {
    return this.database.get<WorkspaceMember>(this.workspaceId, STORE_NAMES.MEMBER, memberId)
  }

  async getMemberByUserId(userId: string): Promise<WorkspaceMember | undefined> {
    const matches = await this.database.getByIndex<WorkspaceMember>(
      this.workspaceId,
      STORE_NAMES.MEMBER,
      INDEX_NAMES.USER_ID,
      userId
    )
    return matches[0] ?? undefined
  }

  async saveMembers(members: WorkspaceMember[]): Promise<void> {
    await this.database.clear(this.workspaceId, STORE_NAMES.MEMBER)
    return this.database.putMany(this.workspaceId, STORE_NAMES.MEMBER, members)
  }

  async saveMember(member: WorkspaceMember): Promise<void> {
    return this.database.put(this.workspaceId, STORE_NAMES.MEMBER, member)
  }

  async deleteMember(memberId: string): Promise<void> {
    return this.database.delete(this.workspaceId, STORE_NAMES.MEMBER, memberId)
  }

  async deleteMemberByUserId(userId: string): Promise<void> {
    const matches = await this.database.getByIndex<WorkspaceMember>(
      this.workspaceId,
      STORE_NAMES.MEMBER,
      INDEX_NAMES.USER_ID,
      userId
    )
    for (const member of matches) {
      await this.database.delete(this.workspaceId, STORE_NAMES.MEMBER, member.id)
    }
  }

  async clearMembers(workspaceId: string): Promise<void> {
    return this.database.clear(workspaceId, STORE_NAMES.MEMBER)
  }
}
