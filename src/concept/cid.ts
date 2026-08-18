/**
 * ASA/0 CID profile:
 *   - CIDv1
 *   - codec  : dag-cbor (0x71)
 *   - hash   : sha2-256 (0x12)
 *   - text   : base32 (default CIDv1 representation, "bafy..." prefix)
 *
 * CID = CIDv1(dag-cbor, multihash(sha2-256, canonicalDagCborBytes(concept)))
 */

import * as dagCbor from "@ipld/dag-cbor"
import { CID } from "multiformats"
import { sha256 } from "multiformats/hashes/sha2"
import type { ConceptCore } from "./types.js"
import { canonicalBytes } from "./canonical.js"

export const ASA_CODEC_NAME = "dag-cbor"
export const ASA_CODEC_CODE = dagCbor.code
export const ASA_HASH_NAME = "sha2-256"
export const ASA_HASH_CODE = sha256.code

export interface ConceptId {
  cid: string
  bytes: Uint8Array
}

/** Compute the content-addressed identifier of a concept. */
export async function conceptCID(core: ConceptCore): Promise<ConceptId> {
  const bytes = canonicalBytes(core)
  const digest = await sha256.digest(bytes)
  const cid = CID.create(1, dagCbor.code, digest)
  return { cid: cid.toString(), bytes }
}

function digestsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Verify that `bytes` actually produce `cidString` under the ASA/0 profile
 * (CIDv1 + dag-cbor + sha2-256). Returns false for malformed CIDs,
 * wrong codec/hash profile, or mismatched content.
 */
export async function verifyBytes(bytes: Uint8Array, cidString: string): Promise<boolean> {
  let cid: CID
  try {
    cid = CID.parse(cidString)
  } catch {
    return false
  }
  if (cid.version !== 1) return false
  if (cid.code !== dagCbor.code) return false
  if (cid.multihash.code !== sha256.code) return false
  const digest = await sha256.digest(bytes)
  return digestsEqual(digest.digest, cid.multihash.digest)
}
