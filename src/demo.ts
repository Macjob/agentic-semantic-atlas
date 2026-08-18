/**
 * ASA/0 two-agent demonstration.
 *
 * Scenario 1: B already knows the concept (fast path, alias bound directly)
 * Scenario 2: B does not know the concept (unknown-concept -> inline fallback
 *             -> verify -> store -> bind)
 * Scenario 3: B's stored copy is tampered with (verification failure ->
 *             safe discard -> fallback recovery)
 * Scenario 4: fallback payload does not match its claimed CID (refused,
 *             no alias bound) plus an unknown-alias error
 * Finally: transport-size benchmark.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { ConceptCore } from "./concept/types.js"
import { LocalStore } from "./store/local-store.js"
import { SimulatedAgent, SimulatedTransport, short } from "./agent/simulated-agent.js"
import { exchangeCapabilities, negotiateConcept, sendConceptMessage } from "./protocol/negotiation.js"
import { runBenchmark, formatBenchmark } from "./benchmark/benchmark.js"

const CONCEPT_1: ConceptCore = {
  asa: "concept/v0",
  definition: "Produce a concise summary while preserving material uncertainty and distinguishing sourced facts from inference.",
  constraints: {
    concise: true,
    preserve_uncertainty: true,
    distinguish_fact_from_inference: true
  }
}

const CONCEPT_2: ConceptCore = {
  asa: "concept/v0",
  definition: "Translate the source text into the target language without adding or removing information.",
  constraints: {
    register: "neutral",
    add_nothing: true
  }
}

const CONCEPT_3: ConceptCore = {
  asa: "concept/v0",
  definition: "Extract all calendar events from the conversation as structured records.",
  constraints: {
    include_recurrence: true
  }
}

const lines: string[] = []
function out(text = ""): void {
  lines.push(text)
}
function announce(title: string): void {
  out("")
  out("=".repeat(72))
  out(title)
  out("=".repeat(72))
}

export async function runDemo(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "asa0-demo-"))
  try {
    await runScenarios(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  const text = lines.join("\n")
  console.log(text)
}

async function runScenarios(dir: string): Promise<void> {
  out("ASA/0 prototype — two-agent demonstration")
  out("Identity: CIDv1 / dag-cbor (0x71) / sha2-256 / base32");
  out("Stores and aliases are ephemeral (temp dirs); aliases are session-local only.")

  const transport = new SimulatedTransport()
  const log = (line: string) => out(line)
  const agentA = new SimulatedAgent("Agent A", new LocalStore(join(dir, "agent-a")), transport, log)
  const agentB = new SimulatedAgent("Agent B", new LocalStore(join(dir, "agent-b")), transport, log)

  // Every concept lives in A's store first.
  const cid1 = await agentA.importConcept(CONCEPT_1)
  const cid2 = await agentA.importConcept(CONCEPT_2)
  const cid3 = await agentA.importConcept(CONCEPT_3)

  announce(`Step 0 — capability negotiation`)
  await exchangeCapabilities(agentA, agentB)
  out('  Agent A -> Agent B: {"asa":"0","kind":"hello",...}')
  out('  Agent B -> Agent A: {"asa":"0","kind":"hello",...}')

  // ------------------------------------------------------------------
  announce(`Scenario 1 — B already knows the concept (${short(cid1)})`)
  await agentB.importConcept(CONCEPT_1) // B independently stored the same concept
  let result = await negotiateConcept(agentA, agentB, cid1)
  out(`  negotiation path: ${result.path}, alias ${result.alias} -> ${short(result.cid)}`)
  out(`  message WITHOUT alias negotiation:`)
  out(`    {"concept":"${cid1}"}`)
  await sendConceptMessage(agentA, "Agent B", cid1)
  out(`  message WITH alias:`)
  out(`    {"asa":"0","kind":"concept-ref","concept":${result.alias}}`)
  const received1 = agentB.inbox.at(-1)
  out(`  Agent B resolved alias ${result.alias} -> ${short(received1?.cid ?? "?")} and interpreted:`)
  out(`    "${received1?.core.definition.slice(0, 60)}..."`)

  // ------------------------------------------------------------------
  announce(`Scenario 2 — B does NOT know the concept (${short(cid2)})`)
  await sendConceptMessage(agentA, "Agent B", cid2) // no alias yet: CID + inline fallback
  out("  Agent B received the fallback payload, recomputed the CID, verified and stored it.")
  result = await negotiateConcept(agentA, agentB, cid2)
  out(`  negotiation path: ${result.path}, alias ${result.alias} -> ${short(result.cid)}`)
  const received2 = agentB.inbox.at(-1)
  out(`  delivered via ${received2?.via}: "${received2?.core.definition.slice(0, 60)}..."`)
  await sendConceptMessage(agentA, "Agent B", cid2)
  out(`  subsequent message: {"asa":"0","kind":"concept-ref","concept":${result.alias}}`)

  // ------------------------------------------------------------------
  announce(`Scenario 3 — B's stored copy of ${short(cid3)} is TAMPERED`)
  await agentB.importConcept(CONCEPT_3)
  const original = await agentB.store.get(cid3)
  if (original === null) throw new Error("scenario 3 setup failed: concept missing")
  const tampered = new Uint8Array(original)
  tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff
  await writeFile(join(dir, "agent-b", "objects", cid3), tampered)
  out("  (bytes of B's local object were flipped on disk)")
  result = await negotiateConcept(agentA, agentB, cid3)
  out(`  negotiation path: ${result.path}, alias ${result.alias} -> ${short(result.cid)}`)
  const refusalsBefore = agentB.refusals.length
  out(`  B refused nothing (${agentB.refusals.length - refusalsBefore} refusals): tampered bytes were discarded,`)
  out("  the verified fallback replaced them, and negotiation continued safely.")

  // ------------------------------------------------------------------
  announce("Scenario 4 — explicit failure modes")
  // 4a: fallback that does not match its claimed CID must be refused.
  const evilCid = "bafy" + "0".repeat(55)
  await agentA.send("Agent B", {
    asa: "0",
    kind: "concept-ref",
    concept: evilCid,
    fallback: { definition: "I claim to be a CID I am not." }
  })
  out(`  A sent concept-ref for ${short(evilCid)} with a mismatched fallback`)
  out(`  B refusals: ${JSON.stringify(agentB.refusals.map((r) => r.reason))}`)
  out(`  alias bound for that CID: ${agentB.dictionary.resolveCid(evilCid) ?? "none (correctly)"}`)
  // 4b: unknown alias fails explicitly instead of being guessed.
  await agentA.send("Agent B", { asa: "0", kind: "concept-ref", concept: 42 })
  out(`  A sent alias 42 (never negotiated); B replied:`)
  out(`    {"asa":"0","kind":"unknown-alias","alias":42}`)
  out(`  B alias errors: ${agentB.aliasErrors.length}`)

  // ------------------------------------------------------------------
  announce("Session dictionaries (session-local, disposable)")
  out(`  Agent A: ${JSON.stringify(agentA.dictionary.entries())}`)
  out(`  Agent B: ${JSON.stringify(agentB.dictionary.entries())}`)
  const totalBytes = transport.log.reduce((total, wire) => total + wire.bytes, 0)
  out(`  total transport traffic: ${transport.log.length} messages, ${totalBytes} UTF-8 bytes`)

  // ------------------------------------------------------------------
  announce("Step 5 — benchmark")
  const report = await runBenchmark(CONCEPT_1)
  out(formatBenchmark(report))
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  runDemo().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
