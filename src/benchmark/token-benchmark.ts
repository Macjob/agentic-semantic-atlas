/**
 * ASA/0 token benchmark.
 *
 * Measures four scenarios:
 *   A — Verbose JSON: model receives the full concept inline
 *   B — CID on wire, expanded before LLM: wire is compact, model sees full concept
 *   C — Alias on wire, expanded before LLM: wire is compact, model sees full concept
 *   D — Alias preserved in model context: model keeps dictionary, subsequent
 *       messages are just the alias reference
 *
 * Scenarios A–C have identical model-input tokens (the full expanded concept).
 * Scenario D is the experimental one where tokens may actually decrease.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { conceptCID } from "../concept/cid.js"
import { normalizeConcept } from "../concept/canonical.js"
import type { ConceptCore } from "../concept/types.js"
import { LocalStore } from "../store/local-store.js"
import { SimulatedAgent, SimulatedTransport } from "../agent/simulated-agent.js"
import { negotiateConcept } from "../protocol/negotiation.js"
import { type Tokenizer } from "./token-count.js"
import {
  verboseJsonText,
  aliasRefText,
  dictionaryPreambleText,
  losslessDictionaryPreambleText
} from "./token-count.js"

export const TOKEN_N_VALUES = [1, 2, 5, 10, 25, 50, 100, 500] as const

/** Envelope kinds counted as one-time alias-negotiation overhead. */
const NEGOTIATION_KINDS = ["propose", "unknown-concept", "provide", "bind", "refuse"] as const

export interface ConceptBenchmarkResult {
  conceptName: string
  cid: string
  wire: WireResult
  model: ModelResult
}

export interface WireResult {
  perMessage: { verbose: number; cid: number; alias: number }
  negotiationOverhead: number
  rows: Array<{
    n: number
    verbose: number
    cid: number
    alias: number
    aliasWithNegotiation: number
  }>
  breakEvenVsVerbose: number | null
  breakEvenVsCid: number | null
}

export interface ModelResult {
  expandedTokens: number
  /** Tokens for the definition-only (LOSSY) session dictionary preamble. */
  dictionarySetupTokens: number
  /** Tokens for the lossless (full-concept) session dictionary preamble. */
  losslessDictionarySetupTokens: number
  /** Tokens per alias invocation when dictionary is in context. */
  aliasInvocationTokens: number
  rows: Array<{
    n: number
    verboseTokens: number
    cidExpandTokens: number
    aliasExpandTokens: number
    /** Scenario D, definition-only dictionary: setup + N * invocation. */
    dictTokens: number
    /** Scenario D, lossless dictionary: setup + N * invocation. */
    dictLosslessTokens: number
  }>
  /** First N where dictTokens < verboseTokens (strict inequality). */
  tokenBreakEvenDictVsVerbose: number | null
  /** First N where dictLosslessTokens < verboseTokens (strict inequality). */
  tokenBreakEvenLosslessDictVsVerbose: number | null
  /** Equal to tokenBreakEven*VsVerbose by construction (same expanded baseline). */
  tokenBreakEvenDictVsCid: number | null
  tokenBreakEvenLosslessDictVsCid: number | null
}

export async function runTokenBenchmark(
  conceptName: string,
  core: ConceptCore,
  tokenizer: Tokenizer
): Promise<ConceptBenchmarkResult> {
  const { cid } = await conceptCID(core)

  // --- Wire-level ---
  const verboseMsg = JSON.stringify({ concept: normalizeConcept(core) })
  const cidMsg = JSON.stringify({ concept: cid })
  const aliasMsg = JSON.stringify({ concept: 1 })

  const perMessage = {
    verbose: Buffer.byteLength(verboseMsg, "utf8"),
    cid: Buffer.byteLength(cidMsg, "utf8"),
    alias: Buffer.byteLength(aliasMsg, "utf8")
  }

  const dir = await mkdtemp(join(tmpdir(), "asa0-tbench-"))
  try {
    const transport = new SimulatedTransport()
    const a = new SimulatedAgent("bench-a", new LocalStore(join(dir, "a")), transport)
    const b = new SimulatedAgent("bench-b", new LocalStore(join(dir, "b")), transport)
    await a.importConcept(core)
    const result = await negotiateConcept(a, b, cid)
    if (result.path === "failed") {
      throw new Error(`benchmark negotiation failed: ${result.reason}`)
    }
    const negotiationOverhead = transport.bytesFor(NEGOTIATION_KINDS)

    const wireRows = TOKEN_N_VALUES.map((n) => ({
      n,
      verbose: perMessage.verbose * n,
      cid: perMessage.cid * n,
      alias: perMessage.alias * n,
      aliasWithNegotiation: perMessage.alias * n + negotiationOverhead
    }))

    const wireBreakEvenAliasVsVerbose = strictBreakEven(
      perMessage.alias, negotiationOverhead, perMessage.verbose
    )
    const wireBreakEvenAliasVsCid = strictBreakEven(
      perMessage.alias, negotiationOverhead, perMessage.cid
    )

    const wire: WireResult = {
      perMessage,
      negotiationOverhead,
      rows: wireRows,
      breakEvenVsVerbose: wireBreakEvenAliasVsVerbose,
      breakEvenVsCid: wireBreakEvenAliasVsCid
    }

    // --- Model-level ---
    const normalized = normalizeConcept(core)
    const verboseText = verboseJsonText(normalized)
    const aliasText = aliasRefText(1)

    // Scenarios A, B, C: model receives the full expanded concept every time.
    // CID and alias are resolved to the same ConceptCore before reaching
    // the model, so all three scenarios share one expanded-token count.
    const expandedTokens = tokenizer.count(verboseText)

    // Scenario D: dictionary preamble is in context, subsequent messages are aliases.
    const preamble = dictionaryPreambleText([{ alias: 1, definition: normalized.definition }])
    const losslessPreamble = losslessDictionaryPreambleText([{ alias: 1, core: normalized }])
    const dictionarySetupTokens = tokenizer.count(preamble)
    const losslessDictionarySetupTokens = tokenizer.count(losslessPreamble)
    const aliasInvocationTokens = tokenizer.count(aliasText)

    const modelRows = TOKEN_N_VALUES.map((n) => ({
      n,
      verboseTokens: expandedTokens * n,
      cidExpandTokens: expandedTokens * n, // same as verbose — expanded before model
      aliasExpandTokens: expandedTokens * n, // same as verbose — expanded before model
      dictTokens: dictionarySetupTokens + aliasInvocationTokens * n,
      dictLosslessTokens: losslessDictionarySetupTokens + aliasInvocationTokens * n
    }))

    // Strict break-even for scenario D. The expanded baseline is identical
    // whether the concept arrived as verbose JSON or was resolved from a
    // CID, so the "vs CID" fields equal the "vs verbose" fields by
    // construction — they are kept for schema parity.
    const tokenBreakEvenDictVsVerbose = strictBreakEvenTokens(
      dictionarySetupTokens, aliasInvocationTokens, expandedTokens
    )
    const tokenBreakEvenLosslessDictVsVerbose = strictBreakEvenTokens(
      losslessDictionarySetupTokens, aliasInvocationTokens, expandedTokens
    )

    const model: ModelResult = {
      expandedTokens,
      dictionarySetupTokens,
      losslessDictionarySetupTokens,
      aliasInvocationTokens,
      rows: modelRows,
      tokenBreakEvenDictVsVerbose,
      tokenBreakEvenLosslessDictVsVerbose,
      tokenBreakEvenDictVsCid: tokenBreakEvenDictVsVerbose,
      tokenBreakEvenLosslessDictVsCid: tokenBreakEvenLosslessDictVsVerbose
    }

    return { conceptName, cid, wire, model }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Strict break-even for bytes: first N where
 *   overhead + aliasPerUse * N < baselinePerUse * N
 * Returns null if alias never wins (exact equality is NOT a win).
 */
export function strictBreakEven(
  aliasPerUse: number,
  overhead: number,
  baselinePerUse: number
): number | null {
  if (aliasPerUse >= baselinePerUse) return null // never saves per-use
  for (let n = 1; n <= 100_000; n++) {
    if (overhead + aliasPerUse * n < baselinePerUse * n) return n
  }
  return null
}

/**
 * Strict break-even for tokens: first N where
 *   setup + invocationPerUse * N < baselinePerUse * N
 */
export function strictBreakEvenTokens(
  setup: number,
  invocationPerUse: number,
  baselinePerUse: number
): number | null {
  if (invocationPerUse >= baselinePerUse) return null
  for (let n = 1; n <= 100_000; n++) {
    if (setup + invocationPerUse * n < baselinePerUse * n) return n
  }
  return null
}

export interface AggregateResult {
  conceptResults: ConceptBenchmarkResult[]
  wireBreakEvenVsVerbose: Stats
  wireBreakEvenVsCid: Stats
  tokenBreakEvenDictVsVerbose: Stats
  tokenBreakEvenLosslessDictVsVerbose: Stats
  tokenBreakEvenDictVsCid: Stats
  tokenBreakEvenLosslessDictVsCid: Stats
  savingsAtN10: {
    wireAliasVsVerbose: number
    wireAliasVsCid: number
    dictVsVerbose: number
    dictLosslessVsVerbose: number
  }
  savingsAtN100: {
    wireAliasVsVerbose: number
    wireAliasVsCid: number
    dictVsVerbose: number
    dictLosslessVsVerbose: number
  }
}

export interface Stats {
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
}

function statsOrNull(values: number[]): Stats {
  const finite = values.filter((v) => v !== null && Number.isFinite(v))
  if (finite.length === 0) return { mean: null, median: null, min: null, max: null }
  const sorted = [...finite].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
  return { mean: sum / sorted.length, median, min: sorted[0]!, max: sorted[sorted.length - 1]! }
}

export function computeAggregate(results: ConceptBenchmarkResult[]): AggregateResult {
  const wireBEvV = results.map((r) => r.wire.breakEvenVsVerbose)
  const wireBEvC = results.map((r) => r.wire.breakEvenVsCid)
  const tokBEvV = results.map((r) => r.model.tokenBreakEvenDictVsVerbose)
  const tokBELosslessV = results.map((r) => r.model.tokenBreakEvenLosslessDictVsVerbose)
  const tokBEvC = results.map((r) => r.model.tokenBreakEvenDictVsCid)
  const tokBELosslessC = results.map((r) => r.model.tokenBreakEvenLosslessDictVsCid)

  const savingsAt = (n: number) => {
    let wireAliasVsVerbose = 0
    let wireAliasVsCid = 0
    let dictVsVerbose = 0
    let dictLosslessVsVerbose = 0
    for (const r of results) {
      const row = r.wire.rows.find((rr) => rr.n === n)
      if (row) {
        wireAliasVsVerbose += row.verbose - row.aliasWithNegotiation
        wireAliasVsCid += row.cid - row.aliasWithNegotiation
      }
      const mRow = r.model.rows.find((rr) => rr.n === n)
      if (mRow) {
        dictVsVerbose += mRow.verboseTokens - mRow.dictTokens
        dictLosslessVsVerbose += mRow.verboseTokens - mRow.dictLosslessTokens
      }
    }
    return { wireAliasVsVerbose, wireAliasVsCid, dictVsVerbose, dictLosslessVsVerbose }
  }

  return {
    conceptResults: results,
    wireBreakEvenVsVerbose: statsOrNull(wireBEvV.filter((v): v is number => v !== null)),
    wireBreakEvenVsCid: statsOrNull(wireBEvC.filter((v): v is number => v !== null)),
    tokenBreakEvenDictVsVerbose: statsOrNull(tokBEvV.filter((v): v is number => v !== null)),
    tokenBreakEvenLosslessDictVsVerbose: statsOrNull(tokBELosslessV.filter((v): v is number => v !== null)),
    tokenBreakEvenDictVsCid: statsOrNull(tokBEvC.filter((v): v is number => v !== null)),
    tokenBreakEvenLosslessDictVsCid: statsOrNull(tokBELosslessC.filter((v): v is number => v !== null)),
    savingsAtN10: savingsAt(10),
    savingsAtN100: savingsAt(100)
  }
}

export function formatTokenBenchmark(
  result: ConceptBenchmarkResult,
  tokenizerName: string,
  asJson = false
): string {
  if (asJson) {
    return JSON.stringify(result, null, 2)
  }

  const lines: string[] = []
  lines.push(`Concept: ${result.conceptName}`)
  lines.push(`Tokenizer: ${tokenizerName}`)
  lines.push(`CID: ${result.cid}`)
  lines.push("")

  // WIRE LEVEL
  lines.push("WIRE LEVEL")
  lines.push(`Mode            Per-use     Setup`)
  lines.push(
    `Verbose JSON    ${result.wire.perMessage.verbose} B        0 B`
  )
  lines.push(
    `Full CID        ${result.wire.perMessage.cid} B        0 B`
  )
  lines.push(
    `ASA alias       ${result.wire.perMessage.alias} B      ${result.wire.negotiationOverhead} B`
  )
  lines.push("")
  lines.push("N       | Verbose     | Full CID   | Alias+neg  | Alias only")
  lines.push("--------+-------------+------------+------------+-----------")
  for (const row of result.wire.rows) {
    lines.push(
      String(row.n).padStart(7) +
        " | " +
        `${row.verbose}`.padStart(11) +
        " | " +
        `${row.cid}`.padStart(10) +
        " | " +
        `${row.aliasWithNegotiation}`.padStart(10) +
        " | " +
        `${row.alias}`.padStart(9)
    )
  }
  lines.push("")
  lines.push("Wire break-even (strict: alias+negotiation < baseline):")
  lines.push(
    `  vs verbose JSON: ${result.wire.breakEvenVsVerbose !== null ? `after ${result.wire.breakEvenVsVerbose} use(s)` : "never"}`
  )
  lines.push(
    `  vs full CID:    ${result.wire.breakEvenVsCid !== null ? `after ${result.wire.breakEvenVsCid} use(s)` : "never"}`
  )

  // MODEL LEVEL — EXPANDED
  lines.push("")
  lines.push("MODEL LEVEL — EXPANDED (scenarios A/B/C)")
  lines.push("  All three scenarios produce identical model input tokens after resolution.")
  lines.push(`  Expanded concept tokens: ${result.model.expandedTokens}`)
  lines.push("")

  // MODEL LEVEL — SESSION DICTIONARY (scenario D)
  lines.push("MODEL LEVEL — SESSION DICTIONARY (scenario D, experimental)")
  lines.push("  Two dictionary variants:")
  lines.push(`    definition-only (LOSSY: constraints omitted): setup ${result.model.dictionarySetupTokens} tokens`)
  lines.push(`    lossless (full concept as JSON):              setup ${result.model.losslessDictionarySetupTokens} tokens`)
  lines.push(`  Alias invocation: ${result.model.aliasInvocationTokens} tokens`)
  lines.push("")
  lines.push("N       | Verbose    | Dict(def)  | Dict(lossless)")
  lines.push("--------+------------+------------+---------------")
  for (const row of result.model.rows) {
    lines.push(
      String(row.n).padStart(7) +
        " | " +
        `${row.verboseTokens}`.padStart(10) +
        " | " +
        `${row.dictTokens}`.padStart(10) +
        " | " +
        `${row.dictLosslessTokens}`.padStart(13)
    )
  }
  lines.push("")
  lines.push("Token break-even (strict: dictionary < expanded):")
  lines.push(
    `  definition-only: ${result.model.tokenBreakEvenDictVsVerbose !== null ? `after ${result.model.tokenBreakEvenDictVsVerbose} use(s)` : "never"}`
  )
  lines.push(
    `  lossless:        ${result.model.tokenBreakEvenLosslessDictVsVerbose !== null ? `after ${result.model.tokenBreakEvenLosslessDictVsVerbose} use(s)` : "never"}`
  )
  lines.push("  (vs full CID equals vs verbose by construction: both expand to the")
  lines.push("   same model input before inference.)")

  return lines.join("\n")
}

export function formatAggregate(agg: AggregateResult, tokenizerName: string): string {
  const lines: string[] = []
  lines.push("")
  lines.push("=".repeat(72))
  lines.push("AGGREGATE SUMMARY")
  lines.push(`Tokenizer: ${tokenizerName}`)
  lines.push("=".repeat(72))
  lines.push("")

  const fmtStats = (label: string, s: Stats) => {
    lines.push(`  ${label}:`)
    if (s.mean === null) {
      lines.push("    never wins (no concept reaches break-even)")
    } else {
      lines.push(`    mean ${s.mean} | median ${s.median} | range [${s.min}, ${s.max}]`)
    }
  }

  lines.push("Wire break-even (alias+negotiation < baseline):")
  fmtStats("  vs verbose JSON", agg.wireBreakEvenVsVerbose)
  fmtStats("  vs full CID", agg.wireBreakEvenVsCid)

  lines.push("Token break-even (dictionary < expanded):")
  fmtStats("  definition-only vs verbose JSON", agg.tokenBreakEvenDictVsVerbose)
  fmtStats("  lossless vs verbose JSON", agg.tokenBreakEvenLosslessDictVsVerbose)
  fmtStats("  definition-only vs full CID", agg.tokenBreakEvenDictVsCid)
  fmtStats("  lossless vs full CID", agg.tokenBreakEvenLosslessDictVsCid)

  lines.push("")
  lines.push(`Cumulative savings at N=10:`)
  lines.push(`  Wire alias vs verbose JSON: ${agg.savingsAtN10.wireAliasVsVerbose} B`)
  lines.push(`  Wire alias vs full CID:    ${agg.savingsAtN10.wireAliasVsCid} B`)
  lines.push(`  Dictionary vs verbose:     ${agg.savingsAtN10.dictVsVerbose} tokens`)
  lines.push(`  Lossless dict vs verbose:  ${agg.savingsAtN10.dictLosslessVsVerbose} tokens`)

  lines.push("")
  lines.push(`Cumulative savings at N=100:`)
  lines.push(`  Wire alias vs verbose JSON: ${agg.savingsAtN100.wireAliasVsVerbose} B`)
  lines.push(`  Wire alias vs full CID:    ${agg.savingsAtN100.wireAliasVsCid} B`)
  lines.push(`  Dictionary vs verbose:     ${agg.savingsAtN100.dictVsVerbose} tokens`)
  lines.push(`  Lossless dict vs verbose:  ${agg.savingsAtN100.dictLosslessVsVerbose} tokens`)

  return lines.join("\n")
}
