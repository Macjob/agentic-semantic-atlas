# Deep Research Findings

## Status

**Current assessment: B — Mostly existing ideas, potentially useful integration.**

The research does **not** support presenting Agentic Semantic Atlas (ASA) as a fundamentally new invention. Most of its building blocks already exist in mature standards and prior academic work. The useful hypothesis is narrower: whether combining those pieces into a small runtime primitive for modern AI agents provides measurable interoperability, semantic precision, or compression benefits.

This document records the current evidence and should be treated as a research checkpoint, not a final specification.

---

## 1. What already exists

Several areas substantially overlap with ASA:

- **RDF / RDFS / OWL / SKOS** already provide globally identifiable semantic resources, ontologies, concept schemes, and relationships such as broader, narrower, related, exactMatch, and closeMatch.
- **JSON-LD** already maps local compact terms to globally meaningful identifiers through contexts.
- **RDFC-1.0 / URDNA2015** address canonicalization of RDF datasets.
- **Trusty URIs** combine cryptographic hashes with verifiable, immutable identifiers for structured Linked Data artifacts.
- **Nanopublications** combine small semantic assertions with provenance and publication metadata, often using immutable/verifiable identifiers.
- **KQML / FIPA ACL** addressed agent communication and the need for shared vocabularies or ontologies.
- **FIPA Ontology Service** and later ontology-negotiation work explicitly studied heterogeneous agents discovering, sharing, translating, or negotiating semantic mappings.
- **ANEMONE** is especially relevant prior art for semantic negotiation between agents with different ontologies.
- **IPFS / IPLD / CID / DAG-CBOR** provide content addressing, immutable identity, deterministic representations, graph links, and transport-independent resolution.
- **DIDs / Verifiable Credentials / Data Integrity** provide identity, signatures, provenance, and trust mechanisms without implying that a signed statement is true.
- **HPACK / QPACK** demonstrate shared dynamic tables where repeated values are replaced by compact local indexes.
- **Compression Dictionary Transport (RFC 9842)** demonstrates explicit negotiation and reuse of shared dictionaries.
- **MCP and A2A** already provide modern agent interoperability and extension mechanisms.

The conclusion is therefore important:

> ASA should not claim to invent semantic identifiers, content addressing, agent semantic negotiation, signed assertions, or negotiated compact dictionaries.

---

## 2. The defensible integration gap

The research did not identify a dominant standard that combines all of the following as a single small runtime mechanism for modern AI agents:

1. a typed semantic object;
2. immutable global identity derived from content;
3. transport-independent resolution;
4. provenance and trust kept separate from semantic identity;
5. ephemeral compact aliases negotiated between agents;
6. explicit fallback when a semantic reference is unknown;
7. first-class bindings to modern protocols such as MCP and A2A.

This is **not proof of novelty**. It is the current architectural gap identified by the research.

A concise statement of ASA's hypothesis is therefore:

> **Refer exactly to this verifiable semantic object, and during this exchange call it `17`.**

The first half has strong prior art in content-addressed knowledge. The second half has strong prior art in protocol compression. The research question is whether their composition is practically useful for AI agents.

---

## 3. Recommended conceptual separation

ASA should separate four object classes instead of allowing one object to carry everything.

### Concept Core

The immutable, meaning-bearing object. A change to its normative semantics creates a new CID.

### Relation Assertion

A separate claim connecting semantic objects, for example:

- `supersedes`
- `refines`
- `broader`
- `narrower`
- `equivalent`
- `closeMatch`
- `compatibleWith`
- `deprecated`

These relations are often contextual or disputable and therefore should not automatically be treated as intrinsic properties of the target concept.

### Attestation

A signed statement indicating who authored, endorsed, deprecated, mapped, or otherwise asserted something about a Concept Core or Relation Assertion.

A valid signature establishes authorship/control of a key, not semantic truth.

### Presentation Overlay

Non-normative material useful to humans or models, such as:

- translations;
- UI labels;
- illustrative examples;
- comments;
- documentation;
- embeddings;
- popularity or ranking metadata.

These should not normally change the identity of the Concept Core.

---

## 4. ASA/0 canonical representation

### Recommended profile

For the first prototype:

```text
CIDv1
codec = dag-cbor
hash  = sha2-256
```

### Why DAG-CBOR

DAG-CBOR is a good ASA/0 choice because it is deterministic, compact, part of IPLD, and supports CID links directly.

ASA/0 should **not** attempt to solve semantic equivalence through canonicalization. Canonicalization should only guarantee:

> Two independent implementations receiving the same abstract ASA object generate identical bytes and therefore the same CID.

It should not try to prove that two differently written concepts mean the same thing.

### Alternatives considered

- **Deterministic CBOR**: technically suitable, but ASA would need to define more of its own profile.
- **JCS / RFC 8785**: useful for JSON tooling and debugging, but less natural for IPLD links.
- **JSON-LD + RDFC-1.0**: powerful future semantic profile, but substantially more complex for a minimal prototype.
- **Protocol Buffers**: should not be used as the normative identity encoding because deterministic serialization is not guaranteed to be canonical across implementations and versions.

---

## 5. What belongs in the Concept Core

The CID should cover only meaning-bearing normative content.

Likely candidates:

- ASA schema/profile version;
- object kind;
- normative operation or semantic structure;
- normative constraints and values;
- constitutive links to other CIDs.

Examples of information that should generally remain outside the Concept Core:

- publisher;
- signature;
- publication timestamp;
- retrieval URL;
- IPFS location;
- cache metadata;
- popularity metrics;
- UI labels;
- non-normative translations;
- illustrative examples;
- comments;
- embeddings.

### Embeddings

Embeddings should explicitly **not** define concept identity. They depend on model, version, precision, and preprocessing pipeline. A suitable representation would instead be an external assertion such as:

```text
embedding-model-X produced vector Y for CID Z
```

---

## 6. Semantic versioning and evolution

Concepts should be immutable.

A revised meaning creates a new CID rather than mutating the old concept.

Example:

```text
CID_A  Concept Core
CID_B  revised Concept Core

CID_R  Relation Assertion:
       subject   = CID_A
       predicate = supersededBy
       object    = CID_B
```

An attestation can then state who endorses that relationship.

This avoids pretending there is a single globally authoritative version history.

Multiple communities may legitimately publish competing definitions and mappings.

---

## 7. Trust model

ASA must preserve these distinctions:

```text
CID => integrity / exact content identity
CID != authority, truth, safety, usefulness
```

and:

```text
valid signature => possession/control of a signing key
valid signature != semantic truth
```

### ASA/0 recommendation

Use a small signed Attestation object. COSE is a natural future candidate if ASA remains CBOR-based.

DIDs can be supported later for key discovery and rotation, but they should not be required for the first prototype.

### Blockchain

No blockchain requirement is currently justified.

CIDs already solve immutable content identity, signatures solve attribution, and HTTP/IPFS/cache mechanisms solve distribution. A ledger would only become relevant if a future requirement needs global ordering, adversarial timestamping, or some other consensus property.

---

## 8. Federated semantics, not a universal dictionary

ASA should assume that different communities may define similar or conflicting concepts indefinitely.

For example:

```text
CID_A = definition used by community A
CID_B = definition used by community B
```

Same labels do not imply same meaning.

Mappings should therefore be external assertions, for example:

```text
CID_A --exactMatch?--> CID_B
CID_A --closeMatch?--> CID_C
```

Those mappings may themselves have attestations and trust policies.

ASA should not create a central "one true dictionary".

---

## 9. Alias negotiation model

The compact alias mechanism is the most distinctive runtime component worth prototyping.

Recommended properties:

- aliases are local, ephemeral references;
- the durable cache is indexed by CID, never by alias;
- alias spaces are scoped;
- each direction owns the aliases it sends;
- bindings include an epoch/version;
- an alias must never be silently rebound inside an epoch;
- unknown aliases must never be guessed;
- peers advertise dictionary limits;
- fallback must be explicit.

A minimal exchange could look like:

```text
A -> B: supports ASA/0
B -> A: supports ASA/0

A -> B: OFFER scope=S epoch=1
        17 -> CID_X

B -> A: ACK scope=S epoch=1 alias=17

A -> B: REF scope=S epoch=1 alias=17
```

If B cannot resolve the reference:

```text
B -> A: DICTIONARY_MISS scope=S epoch=1 alias=17
A -> B: CID_X + structured fallback
```

This deliberately borrows synchronization lessons from HPACK/QPACK rather than inventing a completely new state model.

---

## 10. MCP and A2A integration

ASA should be a semantic extension layer, not another transport protocol.

### MCP

The preferred direction is an MCP extension carrying explicit ASA metadata and dictionary handles/state where necessary.

Conceptually:

```json
{
  "_meta": {
    "asa": {
      "version": "0",
      "dictionary": "D123",
      "epoch": 4,
      "semanticRef": 17
    }
  }
}
```

The exact extension identifier and format remain open design questions.

### A2A

ASA fits naturally as an A2A extension declared in agent capabilities and carried in message/part metadata.

The architectural boundary should remain:

> MCP/A2A define **how agents interact**. ASA defines **which exact semantic object an interaction refers to**.

---

## 11. Compression is still an unproven hypothesis

ASA must not claim token savings before measurement.

A short alias can obviously be smaller than a CID or verbose semantic definition, but total system cost includes:

- concept acquisition;
- alias negotiation;
- cache misses;
- resolver latency;
- canonicalization;
- possible re-expansion before the LLM sees the data.

ASA may save network bytes while saving **zero model tokens** if a runtime expands every alias into the complete semantic definition before inference.

The benchmark must therefore separate:

- wire bytes;
- compressed wire bytes;
- model-input tokens;
- lookup latency;
- cache hit rate;
- negotiation overhead;
- task accuracy;
- semantic mismatch rate;
- monetary cost.

---

## 12. Required benchmark

Compare at minimum:

1. natural language;
2. structured JSON;
3. JSON-LD;
4. full ASA CID references;
5. ASA aliases.

Include workloads with:

- one-shot concepts;
- highly repeated concepts;
- parameterized concepts;
- high concept churn;
- cold cache;
- warm cache;
- MCP and A2A framing;
- corrupted or malicious sources.

### Break-even

For setup cost `S`, baseline cost per repeated use `B`, and alias cost `A`:

```text
N_break-even > S / (B - A)
```

The existing research used simulated numbers only to illustrate this calculation. Those values are **not experimental evidence** and must not be cited as performance results.

Conventional compression such as Brotli/Zstd and dictionary compression should be included as controls so ASA does not claim savings that lower layers already provide.

---

## 13. Security risks

### Resource exhaustion

Untrusted peers can send huge dictionaries, deeply linked graphs, pathological canonicalization inputs, or excessive resolution requests.

ASA needs hard limits on object size, graph depth, concurrent resolution, dictionary size, and processing time.

### Semantic injection

A valid CID may point to content containing malicious instructions for an LLM.

Content integrity must never imply executable authority.

Resolved semantic objects should be typed data, and applications decide which fields, if any, are exposed to a model.

### Alias desynchronization and replay

Scope, direction, epoch, acknowledgements, and no-rebind rules should prevent stale aliases from acquiring new meanings.

### Equivalence poisoning

An attacker can publish a perfectly valid signed assertion claiming two concepts are equivalent.

That signature proves only who made the assertion. Mapping relationships need trust policies.

### Downgrade confusion

Fallback must distinguish between:

- authoritative semantic identity;
- informative representation;
- replacement meaning.

A fallback should never silently change the intended semantics.

---

## 14. Strongest arguments against ASA

The project should keep these objections visible.

1. **Natural language plus JSON Schema may already be good enough.** ASA may introduce more complexity than the ambiguity it removes.
2. **Content identity is not semantic identity.** Different CIDs can mean effectively the same thing; almost identical CIDs may encode meaningful differences.
3. **Ontology explosion.** Immutable revision could produce huge numbers of near-duplicate concepts and move ambiguity from words to CID selection.
4. **Compression may be redundant.** Existing transport compression, dictionary compression, tokenizer behavior, and prompt caching may eliminate most practical savings.
5. **Coordination cost.** Both agents need compatible schemas, resolvers, policies, and dictionary state.
6. **Wire compression may not reduce model-context cost.** The system may simply expand the compact reference before inference.
7. **The hard problem may still be ontology alignment.** That is an established research field with decades of prior work.

If ASA cannot demonstrate measurable advantages against these objections, it should remain an interesting experiment rather than evolve into a larger protocol.

---

## 15. Recommended ASA/0 scope

The first implementation should remain extremely small.

Required primitives:

```text
ConceptCore
CID
Resolver
DictionaryBinding
SemanticRef
```

Optional next primitives:

```text
RelationAssertion
Attestation
```

Suggested initial rules:

1. ASA/0 objects conform to a closed schema.
2. Normative identity encoding is DAG-CBOR.
3. Identity uses CIDv1 + dag-cbor + sha2-256.
4. Any normative Concept Core change creates a new CID.
5. Resolvers verify CID integrity locally.
6. Aliases are positive scope-local integers.
7. A binding is scoped by direction and epoch.
8. Aliases cannot rebind during an epoch.
9. Unknown aliases produce explicit fallback/error.
10. Resource limits and local trust policies always apply.

---

## 16. Interoperability experiment

Build two independent implementations, preferably in different languages, for example Go and TypeScript.

Both receive the same abstract Concept Core and independently produce:

```text
canonical_bytes_A == canonical_bytes_B
CID_A             == CID_B
```

Then test:

1. CID resolution;
2. integrity verification;
3. alias negotiation;
4. semantic reference exchange;
5. unknown alias behavior;
6. old epoch behavior;
7. structured fallback;
8. dictionary overflow;
9. altered bytes;
10. resolution through different stores returning the same verified object.

Two wrappers around the same custom canonicalization implementation should not count as independent implementations.

---

## 17. What would justify a paper

The concept alone is not enough for a strong research contribution because the prior art is substantial.

A defensible paper would need to be framed as **system + protocol + benchmark**, not as invention of content-addressed semantics.

Potential working title:

> **Content-Addressed Semantics for Agent-to-Agent Communication**

Useful evidence would include:

- bit-for-bit interoperability between independent implementations;
- thousands of controlled interactions;
- measured break-even points;
- comparison with conventional compression;
- real model token measurements;
- p50/p95/p99 latency under multiple cache-hit rates;
- semantic accuracy/error experiments;
- MCP/A2A integration results;
- component ablations for CID, cache, aliases, and schema semantics.

A negative result would still be valuable if it clearly identifies when ASA should **not** be used.

---

## 18. Current classification

### B — Mostly existing ideas, potentially useful integration

ASA currently looks like a composition of established ideas rather than a fundamentally new primitive.

The project should move to **C — Distinct architectural contribution worth prototyping** only after a minimal implementation demonstrates measurable practical value.

The next milestone is therefore not a broader specification.

It is **ASA/0 + independent interoperability + benchmark**.

---

## Key references from the research

- W3C RDF Dataset Canonicalization (RDFC-1.0)
- W3C JSON-LD 1.1
- W3C SKOS Reference
- W3C OWL 2
- W3C DID Core
- W3C Verifiable Credentials Data Model
- RFC 8785 — JSON Canonicalization Scheme
- RFC 8949 — CBOR
- RFC 9052 — COSE
- RFC 7541 — HPACK
- RFC 9204 — QPACK
- RFC 9842 — Compression Dictionary Transport
- IPLD DAG-CBOR specification
- CID specification / multiformats
- Trusty URIs — Kuhn & Dumontier
- Nanopublications literature and guidelines
- KQML — Finin et al.
- FIPA ACL and Ontology Service specifications
- ANEMONE — ontology negotiation in heterogeneous multi-agent systems
- Named Data Networking / Content-Centric Networking literature
- MCP specification and extension model
- A2A protocol and extension model
