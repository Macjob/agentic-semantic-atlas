/**
 * Minimal local content-addressed store.
 *
 * Layout:
 *   .asa/
 *     objects/
 *       <cid>   (raw canonical DAG-CBOR bytes)
 *
 * No database, no IPFS — just files keyed by CID.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const CID_PATTERN = /^[a-z0-9]+$/

export class LocalStore {
  readonly root: string

  constructor(root = ".asa") {
    this.root = root
  }

  private objectPath(cid: string): string {
    // Base32 CIDs are [a-z0-9]; reject anything else (also blocks path traversal).
    if (!CID_PATTERN.test(cid)) {
      throw new Error(`invalid CID string: ${JSON.stringify(cid)}`)
    }
    return join(this.root, "objects", cid)
  }

  async put(cid: string, bytes: Uint8Array): Promise<void> {
    await mkdir(join(this.root, "objects"), { recursive: true })
    await writeFile(this.objectPath(cid), bytes)
  }

  /** Returns the stored bytes, or null when the object is not present. */
  async get(cid: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.objectPath(cid))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }
}
