# Architecture

## Overview

Agentic Semantic Atlas separates semantic identity from transport, storage, trust and compression.

A concept is an immutable canonical object. Its canonical bytes are content-addressed to produce a globally verifiable identifier. Agents can retrieve the object from any compatible store, validate it locally, and optionally bind it to a short session-local identifier for compact communication.

## Core components

### 1. Concept object

A concept contains the minimum semantic material required to identify meaning reproducibly.

Candidate fields include:

- canonical type / schema version;
- human-readable labels and definitions;
- machine-readable constraints;
- language-independent relationships;
- optional examples;
- references to predecessor or related concepts.

A key design question is which metadata affects semantic identity. Publisher names, timestamps, popularity and signatures probably should **not** alter the concept CID unless they are themselves part of the intended meaning.

### 2. Canonical serialization

Content addressing only works interoperably if independent implementations hash identical bytes for equivalent content.

The protocol therefore needs a deterministic serialization profile. Candidate approaches include:

- DAG-CBOR / IPLD;
- deterministic CBOR;
- JSON Canonicalization Scheme;
- constrained JSON-LD with canonical RDF normalization.

The first prototype should strongly prefer the simplest option that can be implemented identically in multiple languages.

### 3. Global identifier

The canonical representation is hashed and expressed as a CID or equivalent self-describing content identifier.

Conceptually:

```text
concept
  ↓ canonicalize
canonical bytes
  ↓ multihash
hash
  ↓ CID codec/version
CID
```

A changed semantic definition yields different canonical bytes and therefore a different CID.

### 4. Distribution and resolution

The protocol should not require one transport.

An agent may resolve a concept from:

- local cache;
- IPFS;
- HTTP gateway;
- registry mirror;
- peer agent;
- application bundle;
- another content-addressed store.

Resolution is separate from identity: if the bytes hash to the expected CID, the source does not need to be trusted for integrity.

### 5. Semantic graph

Concepts need relationships across time and scope. Rather than modifying immutable objects, evolution can be represented as graph edges or signed statements.

Examples:

```text
A --superseded-by--> B
A --broader-than----> C
A --compatible-with-> D
A --derived-from----> E
```

Some edges may be objective parts of a concept definition. Others are assertions by publishers and therefore belong in a separate attestations layer.

### 6. Provenance and trust

Content addressing proves **what** content was retrieved, not **who endorses it** or whether an agent should trust its semantics.

Trust can be layered using signed attestations:

```text
publisher key
    ↓ signs
{ subjectCID, predicate, object/value, scope, expiry? }
```

This permits multiple communities to endorse, deprecate, map or reject the same concepts without requiring a single global authority.

### 7. Session dictionary

CIDs are good global identifiers but poor compression tokens. During a conversation, agents can negotiate a local dictionary:

```text
1  → bafy...concept-A
2  → bafy...concept-B
17 → bafy...concept-C
```

Messages can then reference `17` rather than transmitting the full CID or semantic object repeatedly.

This dictionary is:

- local to the session or channel;
- ephemeral;
- negotiated;
- safe to discard;
- never a source of global semantic identity.

### 8. Transport adapters

The atlas should sit above or alongside existing agent transports rather than replace them.

Potential adapters include:

- MCP metadata or tool schemas;
- A2A message parts / extensions;
- HTTP headers or bodies;
- message queues;
- bespoke multi-agent runtimes.

## Proposed data flow

```text
Agent A
  │
  │ wants to communicate concept X
  ▼
Local atlas cache
  │
  ├─ known? yes ──────────────┐
  │                           │
  └─ no → resolver → verify CID
                              │
                              ▼
                      negotiation layer
                              │
                       local ID = 17
                              │
                              ▼
                          Transport
                              │
                              ▼
                           Agent B
```

## Architecture properties

The intended architecture should provide:

- immutability of semantic identities;
- deterministic validation;
- offline caching;
- vendor neutrality;
- transport independence;
- graceful fallback;
- no mandatory central registry;
- support for competing ontologies;
- measurable compression benefits.

## Open architectural decisions

1. Exact canonical data format.
2. Whether concept graphs should be DAG-native IPLD objects.
3. Whether language labels belong in identity or in overlays.
4. How semantic equivalence should be expressed without pretending it is objective.
5. How much negotiation state a session should maintain.
6. How to prevent malicious concepts from triggering unsafe agent behavior.
7. Whether aliases can be pre-shared using standardized dictionaries.
8. How to benchmark lookup latency versus token savings.
