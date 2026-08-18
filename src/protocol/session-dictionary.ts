/**
 * Session-local alias table. Aliases are compact integers starting at 1.
 *
 * IMPORTANT: aliases are session-scoped compression, never canonical
 * semantic identity. They are not persisted as global identifiers.
 */

export interface AliasBinding {
  alias: number
  cid: string
}

export class SessionDictionary {
  private readonly cidByAlias = new Map<number, string>()
  private readonly aliasByCid = new Map<string, number>()
  private nextAlias = 1

  /** Record an agreed binding (both directions). */
  bind(alias: number, cid: string): void {
    if (!Number.isInteger(alias) || alias < 1) {
      throw new Error(`alias must be a positive integer, got ${alias}`)
    }
    this.cidByAlias.set(alias, cid)
    this.aliasByCid.set(cid, alias)
    if (alias >= this.nextAlias) {
      this.nextAlias = alias + 1
    }
  }

  /** Return the existing alias for `cid`, or allocate the next free one. */
  allocate(cid: string): number {
    const existing = this.aliasByCid.get(cid)
    if (existing !== undefined) {
      return existing
    }
    const alias = this.nextAlias
    this.nextAlias += 1
    this.bind(alias, cid)
    return alias
  }

  resolveAlias(alias: number): string | undefined {
    return this.cidByAlias.get(alias)
  }

  resolveCid(cid: string): number | undefined {
    return this.aliasByCid.get(cid)
  }

  entries(): AliasBinding[] {
    return [...this.cidByAlias.entries()]
      .map(([alias, cid]) => ({ alias, cid }))
      .sort((a, b) => a.alias - b.alias)
  }

  get size(): number {
    return this.cidByAlias.size
  }
}
