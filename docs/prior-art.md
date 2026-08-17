# Prior Art and Adjacent Standards

Agentic Semantic Atlas is intentionally an integration experiment. Most required building blocks already exist; the hypothesis is that they have not yet been combined into a lightweight, content-addressed semantic reference layer optimized for agent-to-agent communication.

This document maps nearby work and, importantly, what ASA should **not** reinvent.

## 1. RDF / Linked Data

RDF provides a graph data model based on subjects, predicates and objects, with globally identifiable resources.

Useful ideas for ASA:

- graph-shaped semantics;
- explicit predicates;
- decentralized linking;
- vocabulary reuse;
- separation between identifiers and human labels.

Difference:

Traditional RDF identifiers are normally IRIs. ASA is exploring content-derived immutable identifiers as the semantic identity layer.

Reference: https://www.w3.org/RDF/

## 2. SKOS

SKOS (Simple Knowledge Organization System) is a W3C Recommendation for sharing and linking knowledge organization systems.

It already models concepts and relationships such as broader/narrower mappings, labels and concept schemes.

Useful ideas for ASA:

- `Concept` as a first-class object;
- preferred/alternative labels;
- broader/narrower relationships;
- mapping relationships between concept schemes.

Difference:

ASA is not primarily a thesaurus representation format. Its focus is immutable semantic identity, agent interoperability, compact negotiated aliases and decentralized resolution.

Reference: https://www.w3.org/TR/skos-reference/

## 3. OWL

OWL provides a Web ontology language with formal semantics and automated reasoning capabilities.

Useful ideas for ASA:

- formal class/property semantics;
- equivalence and disjointness;
- machine-checkable constraints;
- reuse of existing ontologies.

Difference:

ASA should avoid requiring full description-logic reasoning for basic interoperability. Formal ontology links may be optional layers.

Reference: https://www.w3.org/OWL/

## 4. JSON-LD

JSON-LD maps JSON documents into linked-data semantics.

Useful ideas for ASA:

- developer-friendly JSON representation;
- explicit semantic context;
- compatibility with RDF ecosystems.

Potential issue:

Content addressing requires deterministic canonical bytes. Equivalent JSON-LD documents can have different lexical representations, so canonicalization must be specified if JSON-LD is identity-bearing.

Reference: https://www.w3.org/TR/json-ld11/

## 5. IPFS / CIDs / Multiformats

IPFS uses content addressing rather than location addressing. CIDs identify content using cryptographic hashes plus self-describing codec/hash information.

Useful ideas for ASA:

- immutable content identity;
- location-independent retrieval;
- local verification;
- cacheability;
- deduplication;
- multihash/multicodec extensibility.

Key insight:

A CID solves **global verifiable identity**, not compact communication. ASA therefore proposes session-local aliases layered over CIDs.

References:

- https://docs.ipfs.tech/concepts/content-addressing/
- https://github.com/multiformats/cid

## 6. IPLD

IPLD is especially close to the storage/modeling layer ASA needs. It provides a data model for content-addressed linked data and uses CIDs for links between immutable blocks.

Useful ideas for ASA:

- DAG-oriented content graphs;
- CID links;
- codecs such as DAG-CBOR;
- schemas;
- transport-independent content identity.

A likely prototype path is to encode canonical concepts as IPLD/DAG-CBOR objects rather than invent a new binary format.

Reference: https://ipld.io/docs/

## 7. Merkle DAGs / Git

Git demonstrates a mature architecture where immutable content-addressed objects form versioned graphs.

Useful analogy:

```text
Git
blob/tree/commit → hash identity → history graph

ASA
concept/assertion/atlas → CID identity → semantic evolution graph
```

The analogy is structural, not semantic: Git hashes repository objects, while ASA would define canonical semantic objects and relationships.

## 8. DIDs and Verifiable Credentials

Decentralized Identifiers and Verifiable Credentials address identity and signed claims.

Useful ideas for ASA:

- publisher identity;
- key rotation;
- signed attestations;
- trust without making the content store itself authoritative.

Important separation:

A concept CID answers “what exact semantic object is this?” A signature/credential answers “who made or endorses this claim?”

References:

- https://www.w3.org/TR/did-core/
- https://www.w3.org/TR/vc-data-model-2.0/

## 9. MCP — Model Context Protocol

MCP standardizes how applications expose tools, resources and context to AI systems. As of July 28, 2026, MCP's current specification generation has a stateless core and a first-class extension framework.

ASA could integrate with MCP by carrying semantic references in metadata or through an extension.

Difference:

MCP is a protocol for interactions and context/tool interoperability. It does not attempt to define a global immutable semantic concept namespace.

References:

- https://modelcontextprotocol.io/
- https://blog.modelcontextprotocol.io/posts/2026-07-28/

## 10. A2A — Agent2Agent Protocol

A2A is an open standard hosted by the Linux Foundation, originally contributed by Google, for communication and interoperability between independent agent systems. Its specification reached version 1.0.0 in 2026.

A2A already addresses:

- agent discovery;
- capability description;
- message exchange;
- modality negotiation;
- long-running tasks;
- cross-framework agent interoperability.

ASA should not compete with this transport/interaction layer. A natural direction is an A2A extension whose payloads can contain ASA semantic references.

References:

- https://a2a-protocol.org/
- https://github.com/a2aproject/A2A

## 11. Schema registries

Systems such as Avro/Protobuf schema registries solve a related operational problem: both sides agree on compact identifiers for shared structured schemas.

Useful idea for ASA:

```text
short ID → shared definition
```

Difference:

Schema registries normally depend on a registry authority and identify data structure rather than reusable semantic meaning. ASA explores decentralized content identities with local aliases.

## 12. Dictionaries and compression

General-purpose compression already replaces repeated byte/token sequences with shorter references. LLM tokenizers also map frequently useful text fragments to compact token IDs.

ASA differs because its dictionary entries are intended to be:

- explicit semantic objects;
- independently resolvable;
- content-addressed;
- reusable across implementations;
- inspectable by humans;
- negotiable between agents.

This means ASA should be benchmarked against ordinary compression and prompt caching; semantic referencing is only useful where it provides measurable interoperability, precision or bandwidth/token savings.

## What appears to be missing

The individual pieces are mature, but the specific combination below appears to be the interesting design space:

```text
formal/shared semantics
        +
content-derived immutable identity
        +
decentralized resolution
        +
signed provenance
        +
session-local compact aliases
        +
agent-protocol adapters
```

This is a hypothesis, not a novelty claim. A deeper literature and standards review is required before claiming that no equivalent system exists.

## Research checklist

Before positioning ASA as a new protocol, investigate at least:

- semantic web content-addressing projects;
- RDF canonicalization and trusty URIs;
- nanopublications;
- immutable knowledge graphs;
- ontology versioning systems;
- schema registry ID negotiation;
- dictionary compression protocols;
- agent communication languages (ACL/KQML/FIPA);
- A2A extensions;
- MCP extensions;
- content-addressed capability systems.
