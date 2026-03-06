import { DraftBlockRepository, MemberRepository, WorkspaceKeyRepository } from "."
import { BlockRepository } from "./block-repository"
import { DraftRepository } from "./draft-repository"
import { EntityRepository } from "./entity-repository"

export class RepositoryStore {
  constructor(
    public readonly blockRepository: BlockRepository,
    public readonly draftRepository: DraftRepository,
    public readonly draftBlockRepository: DraftBlockRepository,
    public readonly entityRepository: EntityRepository,
    public readonly keyRepository: WorkspaceKeyRepository,
    public readonly memberRepository: MemberRepository
  ) {}
}
