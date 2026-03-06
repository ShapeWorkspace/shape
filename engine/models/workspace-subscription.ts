import { ServerDate } from "./server-date"

export interface WorkspaceSubscriptionServerDto {
  workspace_id: string
  status: string
  seats_purchased: number
  seats_used: number
  seats_available: number
  trial_ends_at?: string | null
  current_period_end?: string | null
  cancel_at_period_end: boolean
  is_trial_active: boolean
  is_read_only: boolean
  has_stripe_customer?: boolean
  has_subscription?: boolean
  billing_provider?: string
  campaign?: string | null
}

export interface WorkspaceSubscriptionClientDto {
  workspaceId: string
  status: string
  seatsPurchased: number
  seatsUsed: number
  seatsAvailable: number
  trialEndsAt?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd: boolean
  isTrialActive: boolean
  isReadOnly: boolean
  hasStripeCustomer: boolean
  hasSubscription: boolean
  billingProvider?: string
  campaign?: string | null
}

export class WorkspaceSubscription {
  readonly workspaceId: string
  readonly status: string
  readonly seatsPurchased: number
  readonly seatsUsed: number
  readonly seatsAvailable: number
  readonly trialEndsAt?: ServerDate
  readonly currentPeriodEnd?: ServerDate
  readonly cancelAtPeriodEnd: boolean
  readonly isTrialActive: boolean
  readonly isReadOnly: boolean
  readonly hasStripeCustomer: boolean
  readonly hasSubscription: boolean
  readonly billingProvider?: string
  readonly campaign?: string | null

  constructor(params: WorkspaceSubscriptionClientDto) {
    this.workspaceId = params.workspaceId
    this.status = params.status
    this.seatsPurchased = params.seatsPurchased
    this.seatsUsed = params.seatsUsed
    this.seatsAvailable = params.seatsAvailable
    this.cancelAtPeriodEnd = params.cancelAtPeriodEnd
    this.isTrialActive = params.isTrialActive
    this.isReadOnly = params.isReadOnly
    this.hasStripeCustomer = params.hasStripeCustomer
    this.hasSubscription = params.hasSubscription
    this.billingProvider = params.billingProvider
    this.campaign = params.campaign ?? null

    this.trialEndsAt = params.trialEndsAt ? new ServerDate(params.trialEndsAt) : undefined
    this.currentPeriodEnd = params.currentPeriodEnd ? new ServerDate(params.currentPeriodEnd) : undefined

    Object.freeze(this)
  }

  private toDto(): WorkspaceSubscriptionClientDto {
    return {
      workspaceId: this.workspaceId,
      status: this.status,
      seatsPurchased: this.seatsPurchased,
      seatsUsed: this.seatsUsed,
      seatsAvailable: this.seatsAvailable,
      trialEndsAt: this.trialEndsAt?.toString() ?? null,
      currentPeriodEnd: this.currentPeriodEnd?.toString() ?? null,
      cancelAtPeriodEnd: this.cancelAtPeriodEnd,
      isTrialActive: this.isTrialActive,
      isReadOnly: this.isReadOnly,
      hasStripeCustomer: this.hasStripeCustomer,
      hasSubscription: this.hasSubscription,
      billingProvider: this.billingProvider,
      campaign: this.campaign ?? null,
    }
  }

  public toClientDto(): WorkspaceSubscriptionClientDto {
    return this.toDto()
  }

  get hasSeatShortage(): boolean {
    if (this.isTrialActive) {
      return false
    }

    if (this.seatsPurchased <= 0) {
      return true
    }

    return this.seatsUsed > this.seatsPurchased
  }

  static fromServerDto(dto: WorkspaceSubscriptionServerDto): WorkspaceSubscription {
    return new WorkspaceSubscription({
      workspaceId: dto.workspace_id,
      status: dto.status,
      seatsPurchased: dto.seats_purchased,
      seatsUsed: dto.seats_used,
      seatsAvailable: dto.seats_available,
      trialEndsAt: dto.trial_ends_at ?? null,
      currentPeriodEnd: dto.current_period_end ?? null,
      cancelAtPeriodEnd: dto.cancel_at_period_end,
      isTrialActive: dto.is_trial_active,
      isReadOnly: dto.is_read_only,
      hasStripeCustomer: dto.has_stripe_customer ?? false,
      hasSubscription: dto.has_subscription ?? true,
      billingProvider: dto.billing_provider,
      campaign: dto.campaign ?? null,
    })
  }
}
