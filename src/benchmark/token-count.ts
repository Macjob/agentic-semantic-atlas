/**
 * Token counting abstraction backed by js-tiktoken.
 *
 * Supported encodings include cl100k_base (GPT-3.5/GPT-4 family) and
 * o200k_base (GPT-4o and later). Counts are deterministic per encoding.
 */

import { getEncoding, type TiktokenEncoding } from "js-tiktoken"
import type { ConceptCore } from "../concept/types.js"

export interface Tokenizer {
  readonly name: string
  count(text: string): number
}

/** The text fed to the model when it receives the full expanded concept. */
export function verboseJsonText(core: ConceptCore): string {
  return JSON.stringify({ concept: core })
}

/** Wire text when the concept is referenced by its CID string. */
export function cidRefText(cid: string): string {
  return JSON.stringify({ concept: cid })
}

/** Wire text when the concept is referenced by a session alias. */
export function aliasRefText(alias: number): string {
  return JSON.stringify({ concept: alias })
}

/**
 * The "session dictionary preamble" text the model would receive once,
 * before alias invocations become meaningful, e.g.:
 *
 *   ASA session dictionary:
 *   1 = Produce a concise summary while preserving material uncertainty.
 *
 * NOTE: definition-only entries are LOSSY — constraints are omitted.
 */
export function dictionaryPreambleText(entries: Array<{ alias: number; definition: string }>): string {
  const lines = ["ASA session dictionary:"]
  for (const { alias, definition } of entries) {
    lines.push(`${alias} = ${definition}`)
  }
  return lines.join("\n")
}

/**
 * Lossless variant: each entry carries the full normalized concept as
 * JSON, so the model receives exactly the same semantics as expansion.
 */
export function losslessDictionaryPreambleText(
  entries: Array<{ alias: number; core: ConceptCore }>
): string {
  const lines = ["ASA session dictionary:"]
  for (const { alias, core } of entries) {
    lines.push(`${alias} = ${JSON.stringify(core)}`)
  }
  return lines.join("\n")
}

/** Create a tokenizer for a named BPE encoding (e.g. cl100k_base). */
export function createTokenizer(encoding: string): Tokenizer {
  let name = encoding
  let encoder
  try {
    // Unknown names throw here; the cast only satisfies the union type.
    encoder = getEncoding(encoding as TiktokenEncoding)
  } catch {
    name = "cl100k_base (fallback)"
    encoder = getEncoding("cl100k_base")
  }
  return {
    name,
    count: (text: string) => encoder.encode(text).length
  }
}
