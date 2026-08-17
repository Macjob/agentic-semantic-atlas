# Protocol Sketch

Status: **pre-specification / exploratory**

This document describes a minimal wire-level model for experimenting with the Agentic Semantic Atlas.

## 1. Terminology

- **Concept**: immutable semantic object with a content-derived global identifier.
- **CID**: content identifier for the canonical bytes of a concept.
- **Atlas**: a graph/collection of concepts and assertions about them.
- **Resolver**: component capable of retrieving bytes for a CID.
- **Attestation**: signed statement about a concept, relationship or collection.
- **Session alias**: compact integer or token temporarily mapped to a CID.
- **Peer**: another agent/application participating in the protocol.

## 2. Concept identity

An implementation MUST NOT treat labels, filenames, database IDs or session aliases as global semantic identities.

The global identity is derived from canonical bytes:

```text
CID = contentAddress(canonicalEncode(concept))
```

Changing any identity-bearing semantic field creates a new CID.

## 3. Minimal concept envelope

Illustrative only:

```json
{
  "asa": "concept/v0",
  "definition": "A request to produce a concise summary while retaining material uncertainty.",
  "constraints": {
    "preserve_uncertainty": true
  }
}
```

Fields such as signatures, retrieval URLs, popularity counts or local labels SHOULD be separable from the identity-bearing object unless the protocol explicitly defines them as semantic content.

## 4. Capability discovery

Before using atlas references, a peer MAY advertise support:

```json
{
  "asa": {
    "versions": ["0"],
    "codecs": ["dag-cbor"],
    "hashes": ["sha2-256"],
    "features": [
      "resolution",
      "session-aliases",
      "signed-attestations"
    ]
  }
}
```

This object can be embedded in a host protocol's capability/discovery mechanism.

A peer that does not advertise ASA support MUST still be reachable through the host protocol's normal fallback representation.

## 5. Resolution

Given a CID, a peer:

1. checks its local cache;
2. retrieves the corresponding bytes if needed;
3. recomputes the content identifier;
4. rejects the object if the identifier does not match;
5. decodes the verified canonical representation;
6. applies local trust and safety policy before acting on it.

Integrity verification does not imply semantic trust.

## 6. Session alias negotiation

### 6.1 Motivation

Full CIDs are globally useful but relatively long. Repeated references should be compressed locally.

### 6.2 Offer

```json
{
  "asa_op": "alias.offer",
  "bindings": [
    {"id": 1, "cid": "bafy...A"},
    {"id": 17, "cid": "bafy...C"}
  ]
}
```

### 6.3 Accept

```json
{
  "asa_op": "alias.accept",
  "ids": [1, 17]
}
```

After acceptance, `17` can represent the agreed CID within that alias scope.

### 6.4 Rules

- aliases MUST have an explicit scope;
- aliases MUST NOT be persisted as canonical semantic IDs;
- peers MUST be able to invalidate/rebind aliases through explicit protocol operations;
- an unknown alias MUST NOT be guessed;
- alias tables SHOULD be bounded to prevent untrusted peers from exhausting memory.

## 7. Semantic references in messages

Long form:

```json
{
  "semantic_ref": {
    "cid": "bafy...C"
  }
}
```

Compressed form:

```json
{
  "semantic_ref": {
    "alias": 17
  }
}
```

Fallback form:

```json
{
  "semantic_ref": {
    "cid": "bafy...C",
    "fallback": {
      "type": "text",
      "value": "Produce a concise summary while preserving uncertainty."
    }
  }
}
```

Fallbacks allow partial interoperability before the atlas is widely deployed.

## 8. Evolution

Concepts are immutable. A corrected or evolved meaning receives a new CID.

Evolution is represented explicitly:

```json
{
  "asa": "assertion/v0",
  "subject": "bafy...old",
  "predicate": "superseded-by",
  "object": "bafy...new"
}
```

This assertion may itself be content-addressed and optionally signed.

A `superseded-by` assertion does not erase the old concept.

## 9. Attestations

Illustrative signed envelope:

```json
{
  "asa": "attestation/v0",
  "issuer": "did:key:...",
  "statement": {
    "subject": "bafy...concept",
    "predicate": "endorsed-for",
    "object": "medical-vocabulary-example"
  },
  "signature": "..."
}
```

The signature format, key representation and canonical signing bytes remain open design decisions.

The base protocol SHOULD permit multiple trust systems rather than impose a single global certificate authority.

## 10. Security model

A concept is data, not executable authority.

Implementations MUST NOT assume that:

- a valid CID makes a concept safe;
- a valid signature makes an instruction safe;
- a popular concept is correct;
- semantic equivalence claims are objective;
- resolving linked concepts is always harmless.

Implementations should bound graph traversal, object size, alias count and resolution depth.

## 11. Transport bindings

ASA should be transport-neutral.

Potential bindings:

### A2A

Atlas capabilities can be advertised through an A2A extension/capability mechanism, while message Parts can carry semantic references.

### MCP

Atlas references can be carried in structured tool/resource metadata or through an extension, without making MCP responsible for defining the semantic namespace itself.

### HTTP / messaging

The same objects can be transmitted directly in JSON/CBOR envelopes.

## 12. First interoperability test

A useful first prototype needs only two independent implementations.

Test sequence:

```text
Agent A                 Agent B
   │                        │
   │ capability discovery   │
   ├───────────────────────>│
   │                        │
   │ concept CID            │
   ├───────────────────────>│
   │                        │ resolve + verify
   │                        │
   │ alias.offer 17 → CID   │
   ├───────────────────────>│
   │ alias.accept 17        │
   │<───────────────────────┤
   │                        │
   │ semantic_ref: 17       │
   ├───────────────────────>│
```

Success means both implementations independently derive/verify the same concept identity and interpret the alias unambiguously.

## 13. Benchmark questions

Any claim of compression should be measured rather than assumed.

Measure at least:

- initial concept transfer bytes;
- repeated reference bytes;
- tokenizer-specific token counts;
- lookup latency;
- cache hit rate;
- dictionary negotiation overhead;
- break-even number of repeated references;
- ambiguity/error rate compared with natural-language-only communication.
