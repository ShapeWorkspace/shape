import { Base64String, HexString } from "../crypto/types"
import { EntityType, WrappingKeyType } from "../utils/encryption-types"

// =============================================================
// Core
// =============================================================

export type ServerEntity<M extends EntityMetaFields = EntityMetaFields> = {
  id: string
  workspace_id: string

  /** Controller by server; client cannot influence */
  entity_type: EntityType

  /** Which entity to inherit ACL from. Subjective-per entity i.e a paper-comment inherits ACL from a paper. Controller by server */
  acl_from_id?: string
  acl_from_type?: EntityType

  /** Controlled by server; client cannot influence */
  parent_id?: string | null
  parent_type?: EntityType | null

  /** Controlled by server; client cannot influence */
  creator_id: string
  last_updated_by_id: string

  /** The workspace key at the root of the encryption chain. */
  chain_root_key_id: string
  /** The key that directly wraps the entity key. */
  wrapping_key_id: string
  /** Indicates how the entity key is wrapped: "workspace" for root-level, "folder" for nested entities. */
  wrapping_key_type: WrappingKeyType

  entity_key_nonce: string
  wrapped_entity_key: string
  content_nonce: string
  content_ciphertext: string
  content_hash: string

  meta_fields: M
  mentioned_user_ids: string[]

  created_at: string
  updated_at: string
}

export type ClientEntity<
  C extends EntityContent = EntityContent,
  M extends EntityMetaFields = EntityMetaFields,
> = {
  id: string
  workspaceId: string
  entityType: EntityType

  parentId?: string
  parentType?: EntityType

  creatorId: string
  lastUpdatedById: string

  chainRootKeyId: string
  wrappingKeyId: string
  wrappingKeyType: WrappingKeyType
  entityKey: string

  content: C

  metaFields: M
  mentionedUserIds: string[]

  /** Hash of the encrypted content, used for conflict detection on updates. */
  contentHash: string

  createdAt: Date
  updatedAt: Date
}

// =============================================================
// Drafts
// =============================================================

export interface Draft {
  id: string
  workspaceId: string
  entity: ServerEntity
  formedOnHash?: HexString
  deleteEntity: boolean
  lastAttemptedSave?: string
  saveAttempts: number
  saveError?: string
}

export interface BlockDraft {
  id: string
  workspaceId: string
  entityId: string
  entityType: EntityType
  entityField: string
  encryptedData: string
  dataVersion: string
  createdAt: string
  updatedAt: string
}

// =============================================================
// Meta fields
// Server JSON storage
// =============================================================

export type PaperMetaFields = {
  folder_id?: string
}

export type FolderMetaFields = Record<string, never>

export type GroupMessageMetaFields = {
  quoted_message_id?: string
}

export type ForumDiscussionReplyMetaFields = {
  quoting_reply_id?: string
}

export type ForumDiscussionMetaFields = {
  archived: boolean
  pinned?: boolean
  num_replies?: number
  last_reply_at?: string
}

export type ForumChannelMetaFields = {
  archived: boolean
}

export type FileMetaFields = {
  stream_header: string
  size: number
  chunk_count: number
  upload_status: "pending" | "complete"
  stream_finalized: boolean
}

export type DirectMessageMetaFields = {
  recipient_id: string
  quoted_message_id?: string
}

export type PaperCommentMetaFields = {
  resolved?: boolean
}
export type PaperCommentReplyMetaFields = Record<string, never>
export type ProjectMetaFields = Record<string, never>
export type ProjectTagMetaFields = Record<string, never>
export type TaskCommentMetaFields = Record<string, never>
export type MemoMetaFields = Record<string, never>
export type ReactionMetaFields = Record<string, never>
export type UserProfileMetaFields = Record<string, never>

export type ProjectTaskMetaFields = {
  assignee_id?: string
  due_date?: string
  project_tag_id?: string
  active?: boolean
}

export type EntityMetaFields =
  | FileMetaFields
  | PaperMetaFields
  | MemoMetaFields
  | DirectMessageMetaFields
  | ProjectMetaFields
  | ProjectTaskMetaFields
  | ProjectTagMetaFields
  | TaskCommentMetaFields
  | PaperCommentMetaFields
  | PaperCommentReplyMetaFields
  | GroupMessageMetaFields
  | ForumDiscussionReplyMetaFields
  | ForumDiscussionMetaFields
  | ForumChannelMetaFields
  | ReactionMetaFields
  | UserProfileMetaFields

// =============================================================
// Contents
// =============================================================

export interface DirectMessageContent {
  text: string
}

export interface PaperContent {
  name: string
  text?: string
}

export interface MemoContent {
  title: string
  text?: string
}

export interface FileContent {
  name: string
  mimeType: string
}

export interface FolderContent {
  name: string
}

export interface ForumChannelContent {
  name: string
  description?: string
}

export interface ForumDiscussionReplyContent {
  body?: string
}

export interface ForumDiscussionContent {
  title: string
  body?: string
}

export interface GroupChatContent {
  name: string
}

export interface GroupMessageContent {
  text: string
}

export interface PaperCommentReplyContent {
  body?: string
}

export interface PaperCommentContent {
  body?: string
}

export interface ProjectTagContent {
  name: string
  color: string
}

export interface ProjectTaskContent {
  title: string
  status: "backlog" | "in_progress" | "done"
}

export interface ProjectContent {
  name: string
}

export interface ReactionContent {
  emoji: string
}

export interface TaskCommentContent {
  body?: string
}

export type UserProfileContent = {
  name: string
  bio?: string
  avatar?: string
  avatarType?: string
}

export type EntityContent =
  | PaperContent
  | MemoContent
  | FileContent
  | FolderContent
  | ForumChannelContent
  | ForumDiscussionContent
  | ForumDiscussionReplyContent
  | PaperCommentContent
  | PaperCommentReplyContent
  | ProjectTagContent
  | ProjectTaskContent
  | ProjectContent
  | DirectMessageContent
  | GroupChatContent
  | GroupMessageContent
  | ReactionContent
  | TaskCommentContent
  | UserProfileContent

// =============================================================
// Generics
// =============================================================

type KeysOfUnion<T> = T extends T ? keyof T : never
export type EntityContentKeys = KeysOfUnion<EntityContent>
export const CONTENT_FIELDS = ["title", "name", "body", "text"] as const satisfies readonly EntityContentKeys[]

export type DecryptedPaper = ClientEntity<PaperContent, PaperMetaFields>
export type DecryptedNote = ClientEntity<MemoContent, MemoMetaFields>
export type DecryptedFile = ClientEntity<FileContent, FileMetaFields>
export type DecryptedFolder = ClientEntity<FolderContent, FolderMetaFields>
export type DecryptedReaction = ClientEntity<ReactionContent, ReactionMetaFields>
export type DecryptedTaskComment = ClientEntity<TaskCommentContent, TaskCommentMetaFields>
export type DecryptedProjectTask = ClientEntity<ProjectTaskContent, ProjectTaskMetaFields>
export type DecryptedProject = ClientEntity<ProjectContent, ProjectMetaFields>
export type DecryptedProjectTag = ClientEntity<ProjectTagContent, ProjectTagMetaFields>
export type DecryptedDirectMessage = ClientEntity<DirectMessageContent, DirectMessageMetaFields>
export type DecryptedGroupChat = ClientEntity<GroupChatContent>
export type DecryptedGroupMessage = ClientEntity<GroupMessageContent, GroupMessageMetaFields>
export type DecryptedForumChannel = ClientEntity<ForumChannelContent, ForumChannelMetaFields>
export type DecryptedForumDiscussion = ClientEntity<ForumDiscussionContent, ForumDiscussionMetaFields>
export type DecryptedPaperComment = ClientEntity<PaperCommentContent, PaperCommentMetaFields>
export type DecryptedPaperCommentReply = ClientEntity<PaperCommentReplyContent, PaperCommentReplyMetaFields>
export type DecryptedForumDiscussionReply = ClientEntity<
  ForumDiscussionReplyContent,
  ForumDiscussionReplyMetaFields
>
export type DecryptedUserProfile = ClientEntity<UserProfileContent, UserProfileMetaFields>
export type TaskStatus = ProjectTaskContent["status"]

export type EncryptedFile = ServerEntity<FileMetaFields>

// =============================================================
// Blocks
// =============================================================

type Base64EncodedBlocksProtobuf = Base64String

export interface ServerBlock {
  id: string
  entity_id: string
  entity_type: EntityType
  entity_field: string
  author_id: string
  encrypted_data: Base64EncodedBlocksProtobuf
  data_version: string
  created_at: string
}

export function isServerBlock(entity: ServerEntity | ServerBlock): entity is ServerBlock {
  return "encrypted_data" in entity && "entity_field" in entity
}

// =============================================================
// Requests
// =============================================================

export interface CreateBlockRequest {
  encrypted_data: Base64EncodedBlocksProtobuf
}

export type ParentReference = {
  id: string
  type: EntityType
}

export type ParentUpdateIntent =
  | { mode: "keep" }
  | { mode: "clear" }
  | { mode: "set"; parent: ParentReference }

export const KEEP_PARENT_UPDATE: ParentUpdateIntent = { mode: "keep" }

export type CreateEntityRequest<M extends EntityMetaFields = EntityMetaFields> = Omit<
  ServerEntity<M>,
  "workspace_id" | "creator_id" | "mentioned_user_ids" | "last_updated_by_id" | "created_at" | "updated_at"
>

export type UpdateEntityRequest = Omit<
  ServerEntity,
  | "workspace_id"
  | "creator_id"
  | "mentioned_user_ids"
  | "last_updated_by_id"
  | "created_at"
  | "updated_at"
  | "id"
  | "meta_fields"
  | "entity_type"
> & {
  expected_hash: string
}

export function resolveParentUpdateIntent(parentUpdate?: ParentUpdateIntent): ParentUpdateIntent {
  return parentUpdate ?? KEEP_PARENT_UPDATE
}

export function getParentReferenceFromUpdateIntent(
  parentUpdate?: ParentUpdateIntent
): ParentReference | null | undefined {
  const resolved = resolveParentUpdateIntent(parentUpdate)
  switch (resolved.mode) {
    case "keep":
      return undefined
    case "clear":
      return null
    case "set":
      return resolved.parent
  }
}

export function applyParentUpdateToEntityPayload(
  payload: { parent_id?: string | null; parent_type?: EntityType | null },
  parentUpdate?: ParentUpdateIntent
): void {
  const resolved = resolveParentUpdateIntent(parentUpdate)
  switch (resolved.mode) {
    case "keep":
      delete payload.parent_id
      delete payload.parent_type
      return
    case "clear":
      payload.parent_id = null
      payload.parent_type = null
      return
    case "set":
      payload.parent_id = resolved.parent.id
      payload.parent_type = resolved.parent.type
      return
  }
}

// =============================================================
// Utilities
// =============================================================

export function serverEntityToClientEntity<C extends EntityContent, M extends EntityMetaFields>(dto: {
  serverEntity: ServerEntity<M>
  entityKey: string
  content: C
}): ClientEntity<C, M> {
  return {
    id: dto.serverEntity.id,
    workspaceId: dto.serverEntity.workspace_id,
    entityType: dto.serverEntity.entity_type,
    parentId: dto.serverEntity.parent_id ?? undefined,
    parentType: dto.serverEntity.parent_type ?? undefined,
    entityKey: dto.entityKey,
    content: dto.content,
    metaFields: dto.serverEntity.meta_fields,
    mentionedUserIds: dto.serverEntity.mentioned_user_ids,
    contentHash: dto.serverEntity.content_hash,
    createdAt: new Date(dto.serverEntity.created_at),
    updatedAt: new Date(dto.serverEntity.updated_at),
    chainRootKeyId: dto.serverEntity.chain_root_key_id,
    wrappingKeyId: dto.serverEntity.wrapping_key_id,
    wrappingKeyType: dto.serverEntity.wrapping_key_type,
    creatorId: dto.serverEntity.creator_id,
    lastUpdatedById: dto.serverEntity.last_updated_by_id,
  }
}
