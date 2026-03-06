import { ClientEntity, UserProfileContent } from "../../models/entity"
import { WorkspaceMember, WorkspaceMemberProfile } from "../../models/workspace-member"
import { CacheStores } from "../../store/cache-stores"
import { Result } from "../../utils/Result"
import { CreateEntityV2, QueryEntitiesAndCache, UpdateEntity } from "../entities/entities"

export type UserProfileEntity = ClientEntity<UserProfileContent>

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  return trimmed
}

export function buildAvatarDataUrl(profile: WorkspaceMemberProfile | undefined): string | undefined {
  if (!profile?.avatar || !profile.avatarType) {
    return undefined
  }
  return `data:${profile.avatarType};base64,${profile.avatar}`
}

function isUserProfileEntity(entity: ClientEntity): entity is UserProfileEntity {
  return entity.entityType === "user-profile"
}

function pickMostRecentUserProfile(entities: UserProfileEntity[]): UserProfileEntity | undefined {
  if (entities.length === 0) {
    return undefined
  }

  let mostRecent = entities[0]
  for (let i = 1; i < entities.length; i += 1) {
    const entity = entities[i]
    if (entity.updatedAt.getTime() > mostRecent.updatedAt.getTime()) {
      mostRecent = entity
    }
  }

  return mostRecent
}

export class GetCachedUserProfileEntities {
  constructor(private readonly cacheStores: CacheStores) {}

  public execute(): UserProfileEntity[] {
    const entities = this.cacheStores.entityStore.getAllByEntityType("user-profile")
    const userProfileEntities: UserProfileEntity[] = []
    for (const entity of entities) {
      if (isUserProfileEntity(entity)) {
        userProfileEntities.push(entity)
      }
    }
    return userProfileEntities
  }
}

export class GetCachedUserProfileEntityByUserId {
  constructor(private readonly getCachedUserProfileEntities: GetCachedUserProfileEntities) {}

  public execute(userId: string): UserProfileEntity | undefined {
    const matchingEntities = this.getCachedUserProfileEntities
      .execute()
      .filter(entity => entity.creatorId === userId)
    return pickMostRecentUserProfile(matchingEntities)
  }
}

export class FetchUserProfileEntityByUserId {
  constructor(private readonly queryEntitiesAndCache: QueryEntitiesAndCache) {}

  public async execute(userId: string): Promise<Result<UserProfileEntity | undefined>> {
    const queryResult = await this.queryEntitiesAndCache.execute({
      type: "group",
      operator: "and",
      children: [
        {
          type: "predicate",
          field: "entity_type",
          operator: "eq",
          value: "user-profile",
        },
        {
          type: "predicate",
          field: "creator_id",
          operator: "eq",
          value: userId,
        },
      ],
    })

    if (queryResult.isFailed()) {
      return Result.fail(queryResult.getError())
    }

    const userProfileEntities: UserProfileEntity[] = []
    for (const entity of queryResult.getValue()) {
      if (isUserProfileEntity(entity) && entity.creatorId === userId) {
        userProfileEntities.push(entity)
      }
    }

    return Result.ok(pickMostRecentUserProfile(userProfileEntities))
  }
}

export class BuildWorkspaceMemberProfile {
  public execute(content: UserProfileContent): WorkspaceMemberProfile | undefined {
    const normalizedName = normalizeOptionalString(content.name)
    const normalizedBio = normalizeOptionalString(content.bio)
    const normalizedAvatar = normalizeOptionalString(content.avatar)
    const normalizedAvatarType = normalizeOptionalString(content.avatarType)

    if (!normalizedName && !normalizedBio && !normalizedAvatar && !normalizedAvatarType) {
      return undefined
    }

    return {
      name: normalizedName,
      bio: normalizedBio,
      avatar: normalizedAvatar,
      avatarType: normalizedAvatar ? normalizedAvatarType : undefined,
    }
  }
}

export class EnrichWorkspaceMemberWithUserProfile {
  constructor(
    private readonly getCachedUserProfileEntityByUserId: GetCachedUserProfileEntityByUserId,
    private readonly buildWorkspaceMemberProfile: BuildWorkspaceMemberProfile
  ) {}

  public execute(member: WorkspaceMember): WorkspaceMember {
    const userProfileEntity = this.getCachedUserProfileEntityByUserId.execute(member.userId)
    const profile = userProfileEntity
      ? this.buildWorkspaceMemberProfile.execute(userProfileEntity.content)
      : undefined
    const profileName = normalizeOptionalString(profile?.name)

    return {
      ...member,
      displayName: profileName ?? member.displayName,
      profile,
      avatarDataUrl: buildAvatarDataUrl(profile),
      profileNeedsSetup: profileName === undefined,
    }
  }
}

export class UpsertCurrentUserProfile {
  constructor(
    private readonly createEntity: CreateEntityV2,
    private readonly updateEntity: UpdateEntity,
    private readonly getCachedUserProfileEntityByUserId: GetCachedUserProfileEntityByUserId,
    private readonly fetchUserProfileEntityByUserId: FetchUserProfileEntityByUserId
  ) {}

  public async execute(dto: {
    currentUserId: string
    name: string
    bio?: string
    avatar?: string
    avatarType?: string
  }): Promise<Result<void>> {
    const normalizedName = normalizeOptionalString(dto.name)
    if (!normalizedName) {
      return Result.fail("Name is required")
    }

    const normalizedBio = normalizeOptionalString(dto.bio)
    const normalizedAvatar = normalizeOptionalString(dto.avatar)
    const normalizedAvatarType = normalizeOptionalString(dto.avatarType)
    const content: UserProfileContent = {
      name: normalizedName,
      bio: normalizedBio,
      avatar: normalizedAvatar,
      avatarType: normalizedAvatar ? normalizedAvatarType : undefined,
    }

    let userProfileEntity = this.getCachedUserProfileEntityByUserId.execute(dto.currentUserId)
    if (!userProfileEntity) {
      const fetchResult = await this.fetchUserProfileEntityByUserId.execute(dto.currentUserId)
      if (fetchResult.isFailed()) {
        return Result.fail(fetchResult.getError())
      }
      userProfileEntity = fetchResult.getValue()
    }

    if (!userProfileEntity) {
      const createResult = await this.createEntity.execute({
        entityType: "user-profile",
        content,
      })
      if (createResult.isFailed()) {
        return Result.fail(createResult.getError())
      }
      return Result.ok(undefined)
    }

    const updateResult = await this.updateEntity.execute({
      id: userProfileEntity.id,
      content,
    })
    if (updateResult.isFailed()) {
      return Result.fail(updateResult.getError())
    }

    return Result.ok(undefined)
  }
}
