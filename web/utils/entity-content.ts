import type { ClientEntity } from "../../engine/models/entity"

export function getEntityName(entity: ClientEntity | undefined): string | null {
  if (!entity) return null
  if ("name" in entity.content && typeof entity.content.name === "string") {
    return entity.content.name
  }
  return null
}

export function getEntityTitle(entity: ClientEntity | undefined): string | null {
  if (!entity) return null
  if ("title" in entity.content && typeof entity.content.title === "string") {
    return entity.content.title
  }
  return null
}

export function getEntityBody(entity: ClientEntity | undefined): string | null {
  if (!entity) return null
  if ("body" in entity.content && typeof entity.content.body === "string") {
    return entity.content.body
  }
  return null
}
