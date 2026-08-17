# Contributing

Agentic Semantic Atlas is at a very early protocol-design stage. Contributions that challenge assumptions are as valuable as code.

## Useful contribution types

- prior-art references;
- alternative protocol designs;
- canonicalization experiments;
- IPLD / DAG-CBOR prototypes;
- A2A or MCP adapter sketches;
- security and trust-model analysis;
- interoperability tests in different languages;
- benchmarks comparing token/byte savings against lookup overhead;
- examples where semantic aliases reduce ambiguity;
- counterexamples where the approach adds complexity without benefit.

## Design expectations

Please prefer proposals that preserve:

1. vendor neutrality;
2. deterministic verification;
3. transport independence;
4. graceful fallback to ordinary structured data or natural language;
5. explicit versioning instead of mutable semantic identities;
6. separation between integrity and trust;
7. measurable benefits rather than assumed compression gains.

## Proposing protocol changes

For substantial changes, open an issue first describing:

- the problem;
- the proposed behavior;
- alternatives considered;
- interoperability implications;
- security implications;
- migration/versioning implications;
- a minimal test case.

## Experimental status

Nothing in this repository should currently be treated as a stable standard. Names, schemas and wire formats may change substantially while the model is being tested.

## License note

A project license has not yet been selected. Until that decision is made, please avoid submitting substantial third-party code that would create unclear licensing expectations.
