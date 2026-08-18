/**
 * ASA/0 transport-size benchmark (UTF-8 bytes — NOT tokens).
 *
 * Compares the wire cost of repeating the same semantic operation:
 *   A. verbose JSON  — the full concept object inlined in every message
 *   B. full CID      — the concept referenced by its CID string
 *   C. ASA alias     — the concept referenced by a session alias integer,
 *                      plus the one-time negotiation overhead
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

export const BENCHMARK_N_VALUES = [1, 5, 10, 100] as const

/** Envelope kinds counted as one-time alias-negotiation overhead. */
const NEGOTIATION_KINDS = ["propose", "unknown-concept", "provide", "bind", "refuse"] as const

export interface BenchmarkRow {
  n: number
  verboseBytes: number
  cidBytes: number
  aliasBytes: number
  aliasBytesWithNegotiation: number
}

export interface BenchmarkReport {
  /** UTF-8 bytes of ONE message in each mode. */
  perMessage: { verbose: number; cid: number; alias: number }
  /** One-time alias negotiation cost (cold peer, fallback path included). */
  negotiationOverhead: number
  rows: BenchmarkRow[]
  breakEvenVsVerbose: number
  breakEvenVsCid: number
}

export async function runBenchmark(core: ConceptCore): Promise<BenchmarkReport> {
  const { cid } = await conceptCID(core)

  const verboseMessage = JSON.stringify({ concept: normalizeConcept(core) })
  const cidMessage = JSON.stringify({ concept: cid })
  const aliasMessage = JSON.stringify({ concept: 1 })

  const perMessage = {
    verbose: Buffer.byteLength(verboseMessage, "utf8"),
    cid: Buffer.byteLength(cidMessage, "utf8"),
    alias: Buffer.byteLength(aliasMessage, "utf8")
  }

  // Measure real negotiation traffic: cold agent B, unknown-concept + fallback.
  const dir = await mkdtemp(join(tmpdir(), "asa0-bench-"))
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

    const rows = BENCHMARK_N_VALUES.map((n) => ({
      n,
      verboseBytes: perMessage.verbose * n,
      cidBytes: perMessage.cid * n,
      aliasBytes: perMessage.alias * n,
      aliasBytesWithNegotiation: perMessage.alias * n + negotiationOverhead
    }))

    const breakEvenVsVerbose = breakEven(perMessage.alias, negotiationOverhead, perMessage.verbose)
    const breakEvenVsCid = breakEven(perMessage.alias, negotiationOverhead, perMessage.cid)

    return { perMessage, negotiationOverhead, rows, breakEvenVsVerbose, breakEvenVsCid }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function breakEven(aliasBytes: number, overhead: number, baselineBytes: number): number {
  const saving = baselineBytes - aliasBytes
  if (saving <= 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.max(1, Math.ceil(overhead / saving))
}

export function formatBenchmark(report: BenchmarkReport): string {
  const lines: string[] = []
  lines.push("Transport-size benchmark (UTF-8 bytes — NOT tokens):")
  lines.push("")
  lines.push(`Per message:        verbose JSON ${report.perMessage.verbose} B | full CID ${report.perMessage.cid} B | ASA alias ${report.perMessage.alias} B`)
  lines.push(`Negotiation cost:   ${report.negotiationOverhead} B one-time (propose + unknown-concept + provide + bind)`)
  lines.push("")
  lines.push("Messages | Verbose JSON | Full CID | ASA alias | ASA alias + negotiation")
  lines.push("---------+-------------+----------+-----------+------------------------")
  for (const row of report.rows) {
    lines.push(
      String(row.n).padStart(7) +
        " | " +
        `${row.verboseBytes}`.padStart(11) +
        " | " +
        `${row.cidBytes}`.padStart(8) +
        " | " +
        `${row.aliasBytes}`.padStart(9) +
        " | " +
        `${row.aliasBytesWithNegotiation}`.padStart(22)
    )
  }
  lines.push("")
  lines.push("Break-even (including one-time negotiation cost):")
  lines.push(
    `- ASA alias becomes smaller than verbose JSON after ${report.breakEvenVsVerbose} use(s).`
  )
  lines.push(
    `- ASA alias becomes smaller than a bare CID reference after ${report.breakEvenVsCid} use(s).`
  )
  return lines.join("\n")
}
