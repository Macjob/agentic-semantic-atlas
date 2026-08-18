/**
 * Simulated agent + in-memory transport for the ASA/0 demo.
 *
 * No real networking: transport delivers JSON envelopes synchronously
 * (awaiting each handler) and records every wire message so the demo and
 * benchmark can measure exact UTF-8 transport sizes.
 */

import { conceptCID, verifyBytes } from "../concept/cid.js"
import { decodeConcept } from "../concept/canonical.js"
import type { ConceptCore, FallbackCore } from "../concept/types.js"
import { LocalStore } from "../store/local-store.js"
import { LocalResolver, VerificationError, type Resolver } from "../store/resolver.js"
import { SessionDictionary } from "../protocol/session-dictionary.js"
import {
  encodeEnvelope,
  type CapabilityAdvert,
  type Envelope
} from "../protocol/messages.js"

export const ASA0_CAPABILITIES: CapabilityAdvert = {
  versions: ["0"],
  codecs: ["dag-cbor"],
  hashes: ["sha2-256"],
  features: ["resolution", "session-aliases"]
}

export interface WireMessage {
  from: string
  to: string
  envelope: Envelope
  payload: string
  bytes: number
}

export class SimulatedTransport {
  private readonly agents = new Map<string, SimulatedAgent>()
  readonly log: WireMessage[] = []

  register(agent: SimulatedAgent): void {
    this.agents.set(agent.name, agent)
  }

  bytesFor(kinds: readonly string[]): number {
    return this.log
      .filter((wire) => kinds.includes(wire.envelope.kind))
      .reduce((total, wire) => total + wire.bytes, 0)
  }

  async send(from: string, to: string, envelope: Envelope): Promise<void> {
    const payload = encodeEnvelope(envelope)
    const wire: WireMessage = {
      from,
      to,
      envelope,
      payload,
      bytes: Buffer.byteLength(payload, "utf8")
    }
    this.log.push(wire)
    const target = this.agents.get(to)
    if (!target) {
      throw new Error(`transport: unknown agent "${to}"`)
    }
    await target.receive(from, envelope)
  }
}

export interface ReceivedConcept {
  from: string
  cid: string
  core: ConceptCore
  via: "alias" | "cid" | "fallback"
}

export interface Refusal {
  from: string
  cid: string
  reason: string
}

export interface AliasError {
  from: string
  alias: number
}

export type LogFn = (line: string) => void

export class SimulatedAgent {
  readonly dictionary = new SessionDictionary()
  readonly resolver: Resolver
  readonly inbox: ReceivedConcept[] = []
  readonly refusals: Refusal[] = []
  readonly aliasErrors: AliasError[] = []
  readonly peerCapabilities = new Map<string, CapabilityAdvert>()
  private readonly log: LogFn

  constructor(
    readonly name: string,
    readonly store: LocalStore,
    private readonly transport: SimulatedTransport,
    log: LogFn = () => {}
  ) {
    this.resolver = new LocalResolver(store)
    this.log = log
    transport.register(this)
  }

  /** Compute the CID of a concept and store its canonical bytes locally. */
  async importConcept(core: ConceptCore): Promise<string> {
    const { cid, bytes } = await conceptCID(core)
    await this.store.put(cid, bytes)
    return cid
  }

  async hasConcept(cid: string): Promise<boolean> {
    try {
      return (await this.resolver.resolve(cid)) !== null
    } catch (error) {
      if (error instanceof VerificationError) {
        return false
      }
      throw error
    }
  }

  async send(to: string, envelope: Envelope): Promise<void> {
    await this.transport.send(this.name, to, envelope)
  }

  async receive(from: string, envelope: Envelope): Promise<void> {
    switch (envelope.kind) {
      case "hello":
        this.log(`  ${this.name}: sees hello from ${from} (versions=${envelope.capabilities.versions.join(",")})`)
        this.peerCapabilities.set(from, envelope.capabilities)
        return
      case "propose":
        await this.handlePropose(from, envelope.concepts)
        return
      case "unknown-concept":
        await this.handleUnknownConcept(from, envelope.cid)
        return
      case "provide":
        await this.handleProvide(from, envelope.cid, envelope.fallback)
        return
      case "bind":
        this.dictionary.bind(envelope.alias, envelope.cid)
        this.log(`  ${this.name}: bound alias ${envelope.alias} -> ${envelope.cid}`)
        return
      case "refuse":
        this.refusals.push({ from, cid: envelope.cid, reason: envelope.reason })
        this.log(`  ${this.name}: REFUSED ${envelope.cid} (${envelope.reason})`)
        return
      case "unknown-alias":
        this.aliasErrors.push({ from, alias: envelope.alias })
        this.log(`  ${this.name}: unknown alias ${envelope.alias} reported`)
        return
      case "concept-ref":
        await this.handleConceptRef(from, envelope.concept, envelope.fallback)
        return
    }
  }

  private async handlePropose(from: string, concepts: string[]): Promise<void> {
    for (const cid of concepts) {
      let bytes: Uint8Array | null = null
      let tampered = false
      try {
        bytes = await this.resolver.resolve(cid)
      } catch (error) {
        if (error instanceof VerificationError) {
          tampered = true
        } else {
          throw error
        }
      }
      if (bytes !== null) {
        this.log(`  ${this.name}: already knows ${short(cid)}, resolving locally`)
        await this.bindAndAnnounce(from, cid)
      } else {
        if (tampered) {
          this.log(`  ${this.name}: local copy of ${short(cid)} FAILED verification (tampered); discarding`)
        } else {
          this.log(`  ${this.name}: does not know ${short(cid)}`)
        }
        await this.send(from, { asa: "0", kind: "unknown-concept", cid })
      }
    }
  }

  private async handleUnknownConcept(from: string, cid: string): Promise<void> {
    const bytes = await this.store.get(cid)
    if (bytes === null) {
      await this.send(from, { asa: "0", kind: "refuse", cid, reason: "concept-not-available" })
      return
    }
    const core = decodeConcept(bytes)
    await this.send(from, { asa: "0", kind: "provide", cid, fallback: fallbackOf(core) })
  }

  private async handleProvide(from: string, cid: string, fallback: FallbackCore): Promise<void> {
    const rebuilt: ConceptCore = { asa: "concept/v0", ...fallback }
    const { cid: recomputed, bytes } = await conceptCID(rebuilt)
    if (recomputed !== cid) {
      this.log(`  ${this.name}: fallback for ${short(cid)} recomputes to ${short(recomputed)} -> MISMATCH`)
      await this.send(from, { asa: "0", kind: "refuse", cid, reason: "fallback-cid-mismatch" })
      return
    }
    await this.store.put(cid, bytes)
    this.log(`  ${this.name}: fallback verified, stored ${short(cid)}`)
    await this.bindAndAnnounce(from, cid)
  }

  private async handleConceptRef(
    from: string,
    concept: string | number,
    fallback: FallbackCore | undefined
  ): Promise<void> {
    if (typeof concept === "number") {
      const cid = this.dictionary.resolveAlias(concept)
      if (cid === undefined) {
        // Unknown alias fails explicitly; it must never be guessed.
        this.log(`  ${this.name}: alias ${concept} is UNKNOWN -> explicit error, no guessing`)
        await this.send(from, { asa: "0", kind: "unknown-alias", alias: concept })
        return
      }
      const core = await this.loadVerified(from, cid)
      if (core !== undefined) {
        this.inbox.push({ from, cid, core, via: "alias" })
      }
      return
    }

    const cid = concept
    let bytes: Uint8Array | null = null
    try {
      bytes = await this.resolver.resolve(cid)
    } catch (error) {
      if (!(error instanceof VerificationError)) {
        throw error
      }
      this.log(`  ${this.name}: stored copy of ${short(cid)} FAILED verification; ignoring it`)
    }
    if (bytes !== null) {
      this.inbox.push({ from, cid, core: decodeConcept(bytes), via: "cid" })
      return
    }
    if (fallback !== undefined) {
      // Late fallback: verify inline payload, store, and bind on the fly.
      const rebuilt: ConceptCore = { asa: "concept/v0", ...fallback }
      const { cid: recomputed, bytes: freshBytes } = await conceptCID(rebuilt)
      if (recomputed !== cid) {
        await this.send(from, { asa: "0", kind: "refuse", cid, reason: "fallback-cid-mismatch" })
        return
      }
      await this.store.put(cid, freshBytes)
      await this.bindAndAnnounce(from, cid)
      this.inbox.push({ from, cid, core: rebuilt, via: "fallback" })
      return
    }
    await this.send(from, { asa: "0", kind: "unknown-concept", cid })
  }

  private async loadVerified(from: string, cid: string): Promise<ConceptCore | undefined> {
    try {
      const bytes = await this.resolver.resolve(cid)
      if (bytes === null) {
        this.log(`  ${this.name}: alias pointed at ${short(cid)} but object is missing`)
        await this.send(from, { asa: "0", kind: "unknown-concept", cid })
        return undefined
      }
      return decodeConcept(bytes)
    } catch (error) {
      if (error instanceof VerificationError) {
        this.log(`  ${this.name}: alias pointed at ${short(cid)} but verification FAILED`)
        await this.send(from, { asa: "0", kind: "unknown-concept", cid })
        return undefined
      }
      throw error
    }
  }

  private async bindAndAnnounce(to: string, cid: string): Promise<void> {
    const alias = this.dictionary.allocate(cid)
    await this.send(to, { asa: "0", kind: "bind", alias, cid })
  }
}

function fallbackOf(core: ConceptCore): FallbackCore {
  const fallback: FallbackCore = { definition: core.definition }
  if (core.constraints !== undefined) fallback.constraints = core.constraints
  if (core.relations !== undefined) fallback.relations = core.relations
  return fallback
}

export function short(cid: string): string {
  return cid.length > 18 ? `${cid.slice(0, 12)}...${cid.slice(-4)}` : cid
}
