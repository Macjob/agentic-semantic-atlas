/**
 * ASA/0 negotiation orchestration.
 *
 * Alias flow (aliases are session-local, never global identity):
 *   1. A proposes a CID
 *   2. B resolves + verifies it locally, or replies unknown-concept
 *   3. A provides an inline fallback; B recomputes the CID and verifies
 *   4. The peer that now knows the concept allocates alias N and sends bind
 *   5. Both record N <-> CID in their session dictionaries
 */

import { decodeConcept } from "../concept/canonical.js"
import type { SimulatedAgent } from "../agent/simulated-agent.js"

export type NegotiationPath = "already-known" | "fallback-provided" | "failed"

export interface NegotiationResult {
  cid: string
  alias?: number
  path: NegotiationPath
  reason?: string
}

/** Minimal capability exchange. No auto-reply, so no loops. */
export async function exchangeCapabilities(a: SimulatedAgent, b: SimulatedAgent): Promise<void> {
  await a.send(b.name, { asa: "0", kind: "hello", capabilities: capabilitiesOf(a) })
  await b.send(a.name, { asa: "0", kind: "hello", capabilities: capabilitiesOf(b) })
}

/**
 * Negotiate a session alias for `cid` between A (who has the concept)
 * and B. The transport cascade completes within the awaits, so the
 * dictionaries are final when this returns.
 */
export async function negotiateConcept(
  a: SimulatedAgent,
  b: SimulatedAgent,
  cid: string
): Promise<NegotiationResult> {
  const bKnewBefore = await b.hasConcept(cid)
  await a.send(b.name, { asa: "0", kind: "propose", concepts: [cid] })

  const alias = a.dictionary.resolveCid(cid)
  if (alias !== undefined && b.dictionary.resolveCid(cid) !== undefined) {
    return { cid, alias, path: bKnewBefore ? "already-known" : "fallback-provided" }
  }
  const refusal = b.refusals.at(-1)
  return {
    cid,
    path: "failed",
    reason: refusal ? `${refusal.reason} (${refusal.from})` : "alias was not bound"
  }
}

/**
 * Send an application message referencing the concept: compact alias when
 * negotiated, otherwise the full CID with an inline fallback payload.
 */
export async function sendConceptMessage(
  a: SimulatedAgent,
  to: string,
  cid: string
): Promise<void> {
  const alias = a.dictionary.resolveCid(cid)
  if (alias !== undefined) {
    await a.send(to, { asa: "0", kind: "concept-ref", concept: alias })
    return
  }
  const bytes = await a.store.get(cid)
  if (bytes === null) {
    throw new Error(`${a.name} does not have ${cid}`)
  }
  const core = decodeConcept(bytes)
  const fallback: { definition: string; constraints?: Record<string, unknown>; relations?: typeof core.relations } = {
    definition: core.definition
  }
  if (core.constraints !== undefined) fallback.constraints = core.constraints
  if (core.relations !== undefined) fallback.relations = core.relations
  await a.send(to, { asa: "0", kind: "concept-ref", concept: cid, fallback })
}

// The prototype has a single fixed capability set; kept as a function so
// agents could diverge later without changing call sites.
function capabilitiesOf(_agent: SimulatedAgent) {
  return {
    versions: ["0"],
    codecs: ["dag-cbor"],
    hashes: ["sha2-256"],
    features: ["resolution", "session-aliases"]
  }
}
