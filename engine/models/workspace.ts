import { ServerDate } from "./server-date"
import {
  WorkspaceSubscription,
  WorkspaceSubscriptionServerDto,
  WorkspaceSubscriptionClientDto,
} from "./workspace-subscription"

export const WORKSPACE_KEY_BYTES = 32 // 32 bytes for XChaCha20-Poly1305 symmetric key
export const CRYPTO_BOX_NONCE_BYTES = 24 // 24 bytes for crypto_box nonce (XSalsa20-Poly1305)
export const INVITE_BUNDLE_VERSION_FALLBACK = 1
export const LOCAL_ANONYMOUS_WORKSPACE_USER_ID = "local-anonymous-workspace-user"

export interface WorkspaceServerDto {
  uuid: string
  name: string
  subdomain: string
  user_id?: string
  onboarding_completed: boolean
  acquisition_campaign?: string | null
  // The current workspace key ID for E2EE, set during workspace creation and updated on key rotation.
  current_workspace_key_id: string
  created_at: string
  updated_at: string
  subscription?: WorkspaceSubscriptionServerDto | null
}

export interface WorkspaceClientDto {
  uuid: string
  name: string
  subdomain: string
  userId: string
  onboardingCompleted: boolean
  acquisitionCampaign?: string | null
  // Local-only flag to distinguish server-registered workspaces from anonymous local ones.
  // Defaults to true for server-backed workspaces.
  isRegisteredWithServer?: boolean
  // The current workspace key ID for E2EE, set during workspace creation and updated on key rotation.
  currentWorkspaceKeyId: string
  createdAt: string
  updatedAt: string
  subscription?: WorkspaceSubscriptionClientDto | null
}

export class Workspace {
  readonly uuid: string
  readonly name: string
  readonly subdomain: string
  readonly userId: string
  readonly onboardingCompleted: boolean
  readonly acquisitionCampaign?: string | null
  readonly isRegisteredWithServer: boolean
  // The current workspace key ID for E2EE, set during workspace creation and updated on key rotation.
  // Clients should use this key ID for encrypting new entities.
  readonly currentWorkspaceKeyId: string
  readonly createdAt: ServerDate
  readonly updatedAt: ServerDate
  readonly subscription?: WorkspaceSubscription

  constructor(params: WorkspaceClientDto) {
    this.uuid = params.uuid
    this.name = params.name
    this.subdomain = params.subdomain
    this.userId = params.userId
    this.onboardingCompleted = params.onboardingCompleted
    this.acquisitionCampaign = params.acquisitionCampaign ?? null
    this.isRegisteredWithServer = params.isRegisteredWithServer ?? true
    this.currentWorkspaceKeyId = params.currentWorkspaceKeyId
    this.createdAt = new ServerDate(params.createdAt)
    this.updatedAt = new ServerDate(params.updatedAt)
    this.subscription = params.subscription ? new WorkspaceSubscription(params.subscription) : undefined

    Object.freeze(this)
  }

  private toDto(): WorkspaceClientDto {
    return {
      uuid: this.uuid,
      name: this.name,
      subdomain: this.subdomain,
      userId: this.userId,
      onboardingCompleted: this.onboardingCompleted,
      acquisitionCampaign: this.acquisitionCampaign ?? null,
      isRegisteredWithServer: this.isRegisteredWithServer,
      currentWorkspaceKeyId: this.currentWorkspaceKeyId,
      createdAt: this.createdAt.toString(),
      updatedAt: this.updatedAt.toString(),
      subscription: this.subscription?.toClientDto() ?? null,
    }
  }

  public toClientDto(): WorkspaceClientDto {
    return this.toDto()
  }

  /**
   * Create a new Workspace instance with an updated userId. Maintains immutability semantics.
   */
  withUserId(userId: string): Workspace {
    return new Workspace({
      ...this.toDto(),
      userId,
    })
  }

  /**
   * Create a new Workspace instance with an updated subscription. Maintains immutability semantics.
   */
  withSubscription(subscription?: WorkspaceSubscription): Workspace {
    return new Workspace({
      ...this.toDto(),
      subscription: subscription?.toClientDto() ?? null,
    })
  }

  /**
   * Create a new Workspace instance with an updated name. Maintains immutability semantics.
   */
  withName(name: string, updatedAt: string): Workspace {
    return new Workspace({
      ...this.toDto(),
      name,
      updatedAt,
    })
  }

  /**
   * Create a new Workspace instance with onboarding marked as completed. Maintains immutability semantics.
   */
  withOnboardingCompleted(): Workspace {
    return new Workspace({
      ...this.toDto(),
      onboardingCompleted: true,
    })
  }

  static fromServerDto(dto: WorkspaceServerDto): Workspace {
    return new Workspace({
      uuid: dto.uuid,
      name: dto.name,
      subdomain: dto.subdomain ?? "",
      userId: dto.user_id ?? "",
      onboardingCompleted: dto.onboarding_completed,
      acquisitionCampaign: dto.acquisition_campaign ?? null,
      isRegisteredWithServer: true,
      currentWorkspaceKeyId: dto.current_workspace_key_id,
      createdAt: dto.created_at,
      updatedAt: dto.updated_at,
      subscription: dto.subscription
        ? WorkspaceSubscription.fromServerDto(dto.subscription).toClientDto()
        : null,
    })
  }
}
