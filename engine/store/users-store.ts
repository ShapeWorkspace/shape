import { GlobalStorage, GlobalStorageKeys } from "../storage/global-storage"
import { ClientUser, ClientUserClientDto } from "../models/client_user"
import { Logger } from "../utils/logger"
import { Store } from "./store"

export const USERS_STORE = {
  Users: Symbol("Users"),
}

export class UsersStore extends Store {
  constructor(
    private readonly globalStorage: GlobalStorage,
    private readonly logger: Logger
  ) {
    super()
  }

  async initialize(): Promise<void> {
    await this.hydrateUsers()
  }

  async setUsers(users: ClientUser[]): Promise<void> {
    this.set(USERS_STORE.Users, users)

    await this.persistUsers()
  }

  private async persistUsers(): Promise<void> {
    try {
      const usersJson = JSON.stringify(this.getUsers())
      await this.globalStorage.set(GlobalStorageKeys.Users, usersJson)
    } catch (error) {
      this.logger.error("Failed to save users to storage:", error)
    }
  }

  async upsertUser(user: ClientUser): Promise<void> {
    const existingIndex = this.getUsers().findIndex(existing => existing.uuid === user.uuid)
    if (existingIndex >= 0) {
      const nextUsers = [...this.getUsers()]
      nextUsers[existingIndex] = user
      this.set(USERS_STORE.Users, nextUsers)
    } else {
      this.set(USERS_STORE.Users, [...this.getUsers(), user])
    }

    await this.persistUsers()
  }

  async removeUser(userId: string): Promise<void> {
    const users = this.getUsers().filter(user => user.uuid !== userId)
    this.set(USERS_STORE.Users, users)
    await this.persistUsers()
  }

  async clearUsers(): Promise<void> {
    this.set(USERS_STORE.Users, [])
    await this.persistUsers()
  }

  getUsers(): ClientUser[] {
    return this.get<ClientUser[]>(USERS_STORE.Users) ?? []
  }

  getUserByUuid(userId: string): ClientUser | undefined {
    return this.getUsers().find(user => user.uuid === userId)
  }

  hasUsers(): boolean {
    return this.getUsers().length > 0
  }

  async hydrateUsers(): Promise<void> {
    try {
      const usersJson = await this.globalStorage.get(GlobalStorageKeys.Users)
      if (usersJson) {
        const usersData = JSON.parse(usersJson)
        this.set(
          USERS_STORE.Users,
          usersData.map((userData: ClientUserClientDto) => new ClientUser(userData))
        )
      }
    } catch (error) {
      this.logger.error("Failed to load users from storage:", error)
    }
  }
}
