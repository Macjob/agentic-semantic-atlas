# Agentic Semantic Atlas

> An experimental, open protocol for content-addressed semantic concepts shared between AI agents.

## Why?

AI agents mostly communicate using natural language or application-specific schemas. Natural language is expressive, but it is verbose and can be ambiguous. Schemas are precise, but they are usually local to one application or protocol.

Agentic Semantic Atlas explores a third layer: **globally addressable semantic concepts** that agents can reference compactly, verify independently, cache locally, and negotiate at runtime.

The core idea is simple:

```text
natural language / structured data
            ↓
  semantic concept reference
            ↓
 content-addressed definition (CID)
            ↓
 local short identifier negotiated by agents
```

A concept might have a canonical immutable representation identified by a CID, while two agents communicating in a session can agree that a tiny local integer such as `17` refers to that CID.

This separates:

- **meaning** — the semantic definition;
- **identity** — the content hash / CID;
- **transport** — MCP, A2A, HTTP, messaging, etc.;
- **compression** — short session-local identifiers;
- **trust** — signatures, attestations, publishers and policies.

## Example

Instead of repeatedly exchanging a verbose semantic structure:

```json
{
  "intent": "request-summary",
  "constraints": {
    "max_words": 100,
    "preserve_uncertainty": true,
    "include_sources": true
  }
}
```

an agent could reference an immutable semantic concept:

```text
cid:bafy...xyz
```

and after negotiation within a session:

```text
17
```

where both agents have agreed that local identifier `17` maps to that exact CID.

The local identifier is disposable. The CID is the verifiable semantic identity.

## Design principles

1. **Content-addressed semantics** — changing a definition produces a different identity.
2. **Human inspectability** — concepts should remain understandable without a specific model vendor.
3. **Agent neutrality** — no dependency on a particular LLM, embedding model, provider, or transport.
4. **Progressive adoption** — agents that do not understand the atlas can fall back to normal text or structured data.
5. **Local compression, global identity** — compact session IDs are aliases, never canonical identities.
6. **Explicit evolution** — semantic revisions form a graph instead of mutating old concepts.
7. **Verifiable provenance** — publishers may sign concepts or collections without controlling the global namespace.
8. **Decentralized availability** — definitions should be cacheable and distributable through content-addressed systems such as IPFS/IPLD.

## Proposed layers

```text
┌─────────────────────────────────────────┐
│ Agent applications                      │
├─────────────────────────────────────────┤
│ Semantic negotiation / local dictionary │
├─────────────────────────────────────────┤
│ Concept graph + version relationships   │
├─────────────────────────────────────────┤
│ Signatures / trust / provenance         │
├─────────────────────────────────────────┤
│ IPLD / CIDs / canonical serialization   │
├─────────────────────────────────────────┤
│ IPFS, HTTP, local caches, other stores  │
└─────────────────────────────────────────┘
```

## Repository status

This project is currently an **exploration and protocol-design experiment**, not a production standard.

A deep prior-art and architecture review currently classifies ASA as:

> **B — Mostly existing ideas, potentially useful integration.**

The research found substantial prior art in Semantic Web standards, Trusty URIs, nanopublications, agent ontology negotiation, content addressing, and negotiated compression dictionaries. The remaining hypothesis worth testing is whether their combination as a small runtime semantic layer for modern AI agents provides measurable practical value.

See [`docs/deep-research-findings.md`](docs/deep-research-findings.md) for the current research synthesis, ASA/0 recommendation, strongest arguments against the idea, and benchmark requirements.

The first questions are intentionally fundamental:

- What exactly belongs in the canonical representation of a concept?
- How should canonical serialization work so that independent implementations produce the same CID?
- Should relationships such as `broader`, `narrower`, `supersedes`, or `compatible-with` live inside the immutable object or in separate signed statements?
- How do agents negotiate short identifiers efficiently?
- How should an agent behave when it does not recognize a CID?
- How should conflicting definitions or competing publishers coexist?
- Can existing standards such as RDF, SKOS, OWL, JSON-LD, IPLD, MCP and A2A be reused rather than reinvented?
- When does semantic referencing actually reduce token usage after lookup overhead is included?

## Initial repository map

```text
docs/
  architecture.md
  protocol.md
  prior-art.md
  deep-research-findings.md
schemas/
  concept.schema.json
examples/
  concept.example.json
```

## Non-goals

At least initially, the project is **not** trying to:

- replace natural language;
- create a universal ontology controlled by one organization;
- make embeddings into permanent semantic identifiers;
- put every message on a blockchain;
- require IPFS for every implementation;
- standardize internal chain-of-thought or private model reasoning.

## ASA/0 prototype

A minimal working prototype that demonstrates content-addressed semantic concepts with session-local alias negotiation between two agents. See [`docs/asa0-prototype.md`](docs/asa0-prototype.md) for what it demonstrates, how it works, and its limitations.

```bash
npm install
npm run demo    # two-agent demonstration + benchmark
npm test        # automated protocol, benchmark, and fidelity tests
```

CLI usage:

```bash
npm run asa -- concept build examples/concept.example.json   # compute CID, cache locally
npm run asa -- concept inspect bafy...                         # resolve from local cache
```

### Model fidelity benchmark

The fidelity benchmark compares two equivalent prompting modes:

- `expanded` — repeats the full semantic concept in every task;
- `dictionary` — defines the concept once and references it through a compact session-local alias.

With a local Ollama model:

```bash
npm run benchmark:fidelity -- --provider ollama --model qwen3:4b --n 1,5,10,25 --json
```

To inspect raw model output while diagnosing a case:

```bash
npm run benchmark:fidelity -- --provider ollama --model qwen3:4b --n 5 --include-output --json
```

The Ollama adapter uses structured output constraints so the benchmark measures semantic fidelity rather than incidental JSON formatting failures. If Ollama runs on Windows while the command runs inside WSL, `127.0.0.1` may refer to different network namespaces; run the benchmark from the Windows shell or set `OLLAMA_HOST` to an Ollama endpoint reachable from the process running Node.

## Contributing

This is intentionally early. Criticism, competing designs, interoperability experiments, benchmarks and references to prior art are welcome.

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

This project is licensed under the [MIT License](LICENSE).
