import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { computeAggregate, runTokenBenchmark, strictBreakEvenTokens } from "../src/benchmark/token-benchmark.js"
import { createTokenizer } from "../src/benchmark/token-count.js"
import type { ConceptCore } from "../src/concept/types.js"

const concept: ConceptCore = {
  asa: "concept/v0",
  definition: "Produce a concise summary while preserving material uncertainty.",
  constraints: {
    preserve_uncertainty: true,
    concise: true
  }
}

describe("Token benchmark", () => {
  it("computes strict token break-even", () => {
    assert.equal(strictBreakEvenTokens(20, 5, 16), 2)
    assert.equal(strictBreakEvenTokens(20, 16, 16), null)
  })

  it("aggregates both lossy and lossless dictionary metrics", async () => {
    const tokenizer = createTokenizer("cl100k_base")
    const result = await runTokenBenchmark("summary", concept, tokenizer)
    const aggregate = computeAggregate([result])

    assert.equal(
      aggregate.tokenBreakEvenLosslessDictVsVerbose.mean,
      result.model.tokenBreakEvenLosslessDictVsVerbose
    )
    assert.equal(
      aggregate.tokenBreakEvenLosslessDictVsCid.mean,
      result.model.tokenBreakEvenLosslessDictVsCid
    )

    const n10 = result.model.rows.find((row) => row.n === 10)
    assert.ok(n10)
    assert.equal(
      aggregate.savingsAtN10.dictLosslessVsVerbose,
      n10.verboseTokens - n10.dictLosslessTokens
    )
  })
})
