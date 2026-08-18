/**
 * Canonical serialization for ASA/0: DAG-CBOR.
 *
 * DAG-CBOR is a deterministic IPLD codec: map keys are sorted by
 * (length, byte order), so two logically identical objects produce
 * identical bytes regardless of JavaScript insertion order.
 *
 * Canonicalization rules applied before encoding:
 *   - `constraints` / `relations` are omitted when absent or empty
 *   - entries with `undefined` values are dropped from `constraints`
 */

import * as dagCbor from "@ipld/dag-cbor"
import { assertConceptCore, type ConceptCore } from "./types.js"

export function normalizeConcept(core: ConceptCore): ConceptCore {
  const normalized: ConceptCore = {
    asa: core.asa,
    definition: core.definition
  }
  if (core.constraints !== undefined) {
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(core.constraints)) {
      if (value !== undefined) {
        cleaned[key] = value
      }
    }
    if (Object.keys(cleaned).length > 0) {
      normalized.constraints = cleaned
    }
  }
  if (core.relations !== undefined && core.relations.length > 0) {
    normalized.relations = core.relations
  }
  return normalized
}

/** Deterministic canonical bytes for a concept (the identity-bearing form). */
export function canonicalBytes(core: ConceptCore): Uint8Array {
  return dagCbor.encode(normalizeConcept(core))
}

/** Decode and validate canonical bytes back into a ConceptCore. */
export function decodeConcept(bytes: Uint8Array): ConceptCore {
  const value = dagCbor.decode(bytes)
  assertConceptCore(value)
  return value
}
