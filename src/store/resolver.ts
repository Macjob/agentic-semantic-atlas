/**
 * Resolver abstraction. IPFS/HTTP resolvers can be added later by
 * implementing this interface; the LocalResolver verifies integrity
 * by recomputing the CID of the stored bytes.
 */

import { verifyBytes } from "../concept/cid.js"
import type { LocalStore } from "./local-store.js"

export interface Resolver {
  resolve(cid: string): Promise<Uint8Array | null>
}

export class VerificationError extends Error {
  constructor(readonly cid: string) {
    super(`integrity verification failed for ${cid}: stored bytes do not produce the requested CID`)
    this.name = "VerificationError"
  }
}

/** Resolves from the local store and verifies bytes against the CID. */
export class LocalResolver implements Resolver {
  constructor(private readonly store: LocalStore) {}

  async resolve(cid: string): Promise<Uint8Array | null> {
    const bytes = await this.store.get(cid)
    if (bytes === null) {
      return null
    }
    if (!(await verifyBytes(bytes, cid))) {
      throw new VerificationError(cid)
    }
    return bytes
  }
}

/**
 * Tries resolvers in order (e.g. [local, future-http, future-ipfs]).
 * A verification failure always propagates: tampered content must not be
 * silently retried against another source.
 */
export class CompositeResolver implements Resolver {
  constructor(private readonly resolvers: readonly Resolver[]) {}

  async resolve(cid: string): Promise<Uint8Array | null> {
    let lastError: unknown = null
    for (const resolver of this.resolvers) {
      try {
        const bytes = await resolver.resolve(cid)
        if (bytes !== null) {
          return bytes
        }
      } catch (error) {
        if (error instanceof VerificationError) {
          throw error
        }
        lastError = error
      }
    }
    if (lastError !== null) {
      throw lastError
    }
    return null
  }
}
