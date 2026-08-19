# Model fidelity benchmark

## Purpose

This benchmark tests the central ASA compression hypothesis at the model boundary: can a model apply the same semantic concept with the same task-level fidelity when the concept is defined once in a session dictionary and later referenced by a compact alias, instead of repeating the full definition for every task?

The benchmark intentionally compares two prompt encodings of the same semantics:

- **expanded** — every task contains the full normalized concept;
- **dictionary** — the normalized concept is defined once as session alias `1`, and each task references `concept: 1`.

## Current local run

Date: 2026-08-18

Model: `qwen3:4b` via local Ollama.

Corpus:

- uncertainty classification;
- priority routing;
- identifier normalization.

Generation controls:

- temperature `0`;
- thinking disabled, with `/no_think` compatibility for the local Qwen3 template;
- bounded generation;
- structured output schema requiring exactly one result per task and the concept-declared output field.

Repeated corpus tasks receive unique occurrence IDs so scaling runs cannot be accidentally deduplicated by the model.

## Results

All measured rows below achieved **1.00 fidelity in both expanded and dictionary modes**.

| Case | n | Expanded input tokens | Dictionary input tokens | Input reduction |
| --- | ---: | ---: | ---: | ---: |
| uncertainty-classification | 5 | 620 | 333 | 46.3% |
| uncertainty-classification | 10 | 1,183 | 491 | 58.5% |
| uncertainty-classification | 25 | 2,884 | 977 | 66.1% |
| priority-routing | 5 | 544 | 313 | 42.5% |
| priority-routing | 10 | 1,031 | 465 | 54.9% |
| priority-routing | 25 | 2,504 | 933 | 62.7% |
| identifier-normalization | 5 | 495 | 284 | 42.6% |
| identifier-normalization | 10 | 933 | 412 | 55.8% |
| identifier-normalization | 25 | 2,259 | 808 | 64.2% |

Aggregated across the three cases:

| n | Expanded input tokens | Dictionary input tokens | Input reduction | Expanded fidelity | Dictionary fidelity |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 1,659 | 930 | 43.9% | 1.00 | 1.00 |
| 10 | 3,147 | 1,368 | 56.5% | 1.00 | 1.00 |
| 25 | 7,647 | 2,718 | 64.5% | 1.00 | 1.00 |

## What this supports

For this model and corpus, the session-dictionary representation preserved measured task fidelity while reducing input-token cost increasingly as the same concept was reused. The expected amortization effect is visible: the one-time dictionary definition becomes cheaper than repeating the concept as reuse grows.

This is useful evidence for the ASA hypothesis, but it is **not yet evidence of general model interoperability**. The current run covers one local model, three task families, one alias style, and deterministic structured outputs.

## Benchmark-design fixes discovered during the run

The first implementation exposed several artifacts that could have been mistaken for semantic failures:

1. `npm test` used a recursive glob that was not portable in the execution environment; it now uses the repository's flat test layout.
2. The output contract originally said “task id” without requiring an `id` field, so models could return semantically correct data under `task_id` or another field name.
3. Two corpus concepts expected `label` or `priority` without declaring those output-field names in their concept constraints.
4. Scaling beyond the five base tasks originally recycled duplicate IDs, allowing a model to collapse repeated tasks.
5. Generic JSON mode allowed malformed or structurally inconsistent results to contaminate semantic fidelity. The Ollama adapter now uses a JSON Schema derived from the expected item count and concept output field.
6. Unbounded generation could make local benchmark runs appear hung; the Ollama adapter now bounds output and request duration.

These changes make the benchmark stricter about the transport contract while keeping the semantic value itself model-generated.

## Reproduce

```bash
npm run benchmark:fidelity -- --provider ollama --model qwen3:4b --n 5,10,25 --json
```

For raw model responses during diagnostics:

```bash
npm run benchmark:fidelity -- --provider ollama --model qwen3:4b --n 5 --include-output --json
```

If Ollama runs on Windows while Node runs inside WSL, the two processes may not share the same `127.0.0.1`. Run the benchmark from the Windows shell or configure `OLLAMA_HOST` to an endpoint reachable by the Node process.

## Next benchmark work

The next useful step is repeated trials across multiple model families and providers, reporting fidelity distributions rather than a single deterministic run. A stronger suite should also add heterogeneous concepts, longer definitions, cross-concept dictionaries, alias negotiation failures, adversarial ambiguity, and explicit break-even analysis that includes dictionary setup cost.
