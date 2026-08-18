import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { conceptCID, verifyBytes } from "../src/concept/cid.js"
import { canonicalBytes, decodeConcept } from "../src/concept/canonical.js"
import { LocalStore } from "../src/store/local-store.js"
import { LocalResolver, VerificationError } from "../src/store/resolver.js"
import { SessionDictionary } from "../src/protocol/session-dictionary.js"
import {
  SimulatedAgent,
  SimulatedTransport,
  type ReceivedConcept
} from "../src/agent/simulated-agent.js"
import { exchangeCapabilities, negotiateConcept } from "../src/protocol/negotiation.js"
import type { ConceptCore } from "../src/concept/types.js"

const vectors: { vectors: Array<{ name: string; concept: ConceptCore; cid: string; canonicalBytesHex: string }> } =
  JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("vectors.json", import.meta.url),
      "utf8"
    )
  )

const V = vectors.vectors

// -------------------------------------------------------------------
// 1. Determinism — same concept always produces the same CID.
// -------------------------------------------------------------------
describe("Determinism", () => {
  it("repeated computation yields the same CID", async () => {
    const concept = V[0]!.concept
    const first = await conceptCID(concept)
    const second = await conceptCID(concept)
    assert.equal(first.cid, second.cid)
    assert.deepEqual(first.bytes, second.bytes)
  })

  it("matches golden test vectors", async () => {
    for (const vector of V) {
      const { cid, bytes } = await conceptCID(vector.concept)
      assert.equal(
        cid,
        vector.cid,
        `CID mismatch for ${vector.name}`
      )
      assert.equal(
        Buffer.from(bytes).toString("hex"),
        vector.canonicalBytesHex,
        `canonical bytes mismatch for ${vector.name}`
      )
    }
  })
})

// -------------------------------------------------------------------
// 2. Mutation — changing any identity-bearing field produces a
//    different CID.
// -------------------------------------------------------------------
describe("Mutation", () => {
  it("different definition yields different CID", async () => {
    const base: ConceptCore = {
      asa: "concept/v0",
      definition: "Alpha.",
      constraints: { x: 1 }
    }
    const modified: ConceptCore = { ...base, definition: "Beta." }
    const a = await conceptCID(base)
    const b = await conceptCID(modified)
    assert.notEqual(a.cid, b.cid)
  })

  it("added constraint yields different CID", async () => {
    const base: ConceptCore = {
      asa: "concept/v0",
      definition: "Same."
    }
    const modified: ConceptCore = {
      asa: "concept/v0",
      definition: "Same.",
      constraints: { extra: true }
    }
    assert.notEqual(
      (await conceptCID(base)).cid,
      (await conceptCID(modified)).cid
    )
  })

  it("changed constraint value yields different CID", async () => {
    const base: ConceptCore = {
      asa: "concept/v0",
      definition: "Test.",
      constraints: { flag: true }
    }
    const modified: ConceptCore = {
      asa: "concept/v0",
      definition: "Test.",
      constraints: { flag: false }
    }
    assert.notEqual(
      (await conceptCID(base)).cid,
      (await conceptCID(modified)).cid
    )
  })
})

// -------------------------------------------------------------------
// 3. Ordering — different JS object insertion order produces the
//    same CID if semantic content is identical.
// -------------------------------------------------------------------
describe("Ordering", () => {
  it("different constraint insertion order yields the same CID", async () => {
    const a: ConceptCore = {
      asa: "concept/v0",
      definition: "Order test.",
      constraints: { z: 1, a: 2, m: 3 }
    }
    const b: ConceptCore = {
      asa: "concept/v0",
      definition: "Order test.",
      constraints: { m: 3, z: 1, a: 2 }
    }
    assert.equal(
      (await conceptCID(a)).cid,
      (await conceptCID(b)).cid,
      "DAG-CBOR canonicalization must be independent of key insertion order"
    )
  })

  it("empty / missing constraints are equivalent", async () => {
    const a: ConceptCore = {
      asa: "concept/v0",
      definition: "Test."
    }
    const b: ConceptCore = {
      asa: "concept/v0",
      definition: "Test.",
      constraints: {}
    }
    assert.equal(
      (await conceptCID(a)).cid,
      (await conceptCID(b)).cid
    )
  })
})

// -------------------------------------------------------------------
// 4. Resolution — stored concept resolves correctly.
// -------------------------------------------------------------------
describe("Resolution", () => {
  let dir: string
  let store: LocalStore
  let resolver: LocalResolver

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asa0-test-"))
    store = new LocalStore(dir)
    resolver = new LocalResolver(store)
  })

  it("resolves a stored concept", async () => {
    const concept = V[0]!.concept
    const { cid, bytes } = await conceptCID(concept)
    await store.put(cid, bytes)
    const resolved = await resolver.resolve(cid)
    assert.notEqual(resolved, null)
    const decoded = decodeConcept(resolved!)
    assert.equal(decoded.definition, concept.definition)
  })

  it("returns null for unknown CID", async () => {
    const resolved = await resolver.resolve("bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    assert.equal(resolved, null)
  })
})

// -------------------------------------------------------------------
// 5. Integrity — tampered stored bytes fail verification.
// -------------------------------------------------------------------
describe("Integrity", () => {
  it("tampered bytes throw VerificationError", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asa0-integ-"))
    try {
      const store = new LocalStore(dir)
      const resolver = new LocalResolver(store)
      const concept = V[0]!.concept
      const { cid, bytes } = await conceptCID(concept)
      const tampered = new Uint8Array(bytes)
      tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff
      await store.put(cid, tampered)
      await assert.rejects(
        () => resolver.resolve(cid),
        (err: unknown) => err instanceof VerificationError
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("verifyBytes rejects mismatched CID", async () => {
    const concept = V[0]!.concept
    const { bytes } = await conceptCID(concept)
    const ok = await verifyBytes(bytes, "bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    assert.equal(ok, false)
  })
})

// -------------------------------------------------------------------
// 6. Alias — alias resolves to the correct CID.
// -------------------------------------------------------------------
describe("Alias", () => {
  it("bind and resolve in both directions", () => {
    const dict = new SessionDictionary()
    dict.bind(1, "bafyreiAAA")
    assert.equal(dict.resolveAlias(1), "bafyreiAAA")
    assert.equal(dict.resolveCid("bafyreiAAA"), 1)
  })

  it("allocate auto-increments", () => {
    const dict = new SessionDictionary()
    const a1 = dict.allocate("bafyreiAAA")
    const a2 = dict.allocate("bafyreiBBB")
    assert.equal(a1, 1)
    assert.equal(a2, 2)
    assert.equal(dict.resolveAlias(1), "bafyreiAAA")
    assert.equal(dict.resolveAlias(2), "bafyreiBBB")
  })

  it("allocate returns existing alias for known CID", () => {
    const dict = new SessionDictionary()
    dict.bind(5, "bafyreiAAA")
    assert.equal(dict.allocate("bafyreiAAA"), 5)
    // nextAlias advances past 5, so the next fresh one is 6.
    assert.equal(dict.allocate("bafyreiBBB"), 6)
  })
})

// -------------------------------------------------------------------
// 7. Unknown alias — unknown alias fails explicitly.
// -------------------------------------------------------------------
describe("Unknown alias", () => {
  it("resolveAlias returns undefined for unbound alias", () => {
    const dict = new SessionDictionary()
    assert.equal(dict.resolveAlias(42), undefined)
  })

  it("agent reports unknown-alias for negotiated-only alias", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asa0-ualias-"))
    try {
      const transport = new SimulatedTransport()
      const a = new SimulatedAgent("A", new LocalStore(join(dir, "a")), transport)
      const b = new SimulatedAgent("B", new LocalStore(join(dir, "b")), transport)
      await a.send("B", { asa: "0", kind: "concept-ref", concept: 99 })
      // B sends unknown-alias back to A; A records it in aliasErrors.
      assert.equal(a.aliasErrors.length, 1, "A should receive unknown-alias from B")
      assert.equal(a.aliasErrors[0]!.alias, 99)
      // Also verify on the transport wire.
      const reply = transport.log.find(
        (w) => w.envelope.kind === "unknown-alias" && w.from === "B"
      )
      assert.ok(reply, "transport should carry the unknown-alias reply")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

// -------------------------------------------------------------------
// 8. Fallback — unknown CID follows the fallback/resolution path.
// -------------------------------------------------------------------
describe("Fallback", () => {
  it("negotiation succeeds via fallback for unknown concept", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asa0-fallback-"))
    try {
      const transport = new SimulatedTransport()
      const a = new SimulatedAgent("A", new LocalStore(join(dir, "a")), transport)
      const b = new SimulatedAgent("B", new LocalStore(join(dir, "b")), transport)

      const concept: ConceptCore = {
        asa: "concept/v0",
        definition: "Fallback test concept.",
        constraints: { key: "value" }
      }
      const cid = await a.importConcept(concept)

      // B does NOT know the concept yet.
      assert.equal(await b.hasConcept(cid), false)

      const result = await negotiateConcept(a, b, cid)
      assert.equal(result.path, "fallback-provided", `expected fallback path, got ${result.path}`)
      assert.equal(typeof result.alias, "number")

      // B now has it and can resolve the alias.
      assert.equal(await b.hasConcept(cid), true)
      assert.equal(b.dictionary.resolveAlias(result.alias!), cid)

      // Send an alias-based message.
      await a.send("B", { asa: "0", kind: "concept-ref", concept: result.alias! })
      const received: ReceivedConcept | undefined = b.inbox.at(-1)
      assert.notEqual(received, undefined)
      assert.equal(received!.cid, cid)
      assert.equal(received!.via, "alias")
      assert.equal(received!.core.definition, concept.definition)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("mismatched fallback CID is refused", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asa0-fbad-"))
    try {
      const transport = new SimulatedTransport()
      const a = new SimulatedAgent("A", new LocalStore(join(dir, "a")), transport)
      const b = new SimulatedAgent("B", new LocalStore(join(dir, "b")), transport)

      // A sends a concept-ref with a CID that doesn't match the fallback.
      await a.send("B", {
        asa: "0",
        kind: "concept-ref",
        concept: "bafyreibaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fallback: { definition: "This definition produces a different CID." }
      })
      // B sends refuse back to A; A records it in refusals.
      assert.ok(
        a.refusals.some((r) => r.reason === "fallback-cid-mismatch"),
        "A should receive the refusal from B"
      )
      // Also verify on the transport wire.
      const reply = transport.log.find(
        (w) => w.envelope.kind === "refuse" && w.from === "B"
      )
      assert.ok(reply, "transport should carry the refusal from B")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
