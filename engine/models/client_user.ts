import { ServerDate } from "./server-date"
import { ServerUserServerDto } from "./server-user"

export interface ClientUserClientDto {
  uuid: string
  email: string
  createdAt: string
  updatedAt: string
}

export class ClientUser {
  uuid: string
  email: string
  createdAt: ServerDate
  updatedAt: ServerDate

  constructor(params: ClientUserClientDto) {
    this.uuid = params.uuid
    this.email = params.email
    this.createdAt = new ServerDate(params.createdAt)
    this.updatedAt = new ServerDate(params.updatedAt)

    Object.freeze(this)
  }

  static fromServerDto(dto: ServerUserServerDto): ClientUser {
    return ClientUser.fromServerUser(dto)
  }

  /**
   * Determine whether a user should appear as a direct-message target. All users qualify.
   */
  canDirectMessage(): boolean {
    return true
  }

  toDto(): ClientUserClientDto {
    return {
      uuid: this.uuid,
      email: this.email,
      createdAt: this.createdAt.original,
      updatedAt: this.updatedAt.original,
    }
  }

  toServerDto(): ServerUserServerDto {
    return {
      uuid: this.uuid,
      email: this.email,
      created_at: this.createdAt.original,
      updated_at: this.updatedAt.original,
    }
  }

  static fromServerUser(serverUser: ServerUserServerDto): ClientUser {
    return new ClientUser({
      uuid: serverUser.uuid,
      email: serverUser.email,
      createdAt: serverUser.created_at,
      updatedAt: serverUser.updated_at,
    })
  }

  static UnknownUser(): ClientUser {
    return new ClientUser({
      uuid: "unknown",
      email: "unknown",
      createdAt: "",
      updatedAt: "",
    })
  }

  /**
   * Build a placeholder user that mirrors the frozen UnknownUser template but
   * assigns a caller-provided UUID and optionally an email. Useful when we need
   * a stable identity for participants that have not been hydrated from the server yet.
   */
  static UnknownUserWithUuid(uuid: string, email?: string): ClientUser {
    const placeholderDto = ClientUser.UnknownUser().toDto()

    return new ClientUser({
      ...placeholderDto,
      uuid,
      email: email ?? placeholderDto.email,
    })
  }
}
