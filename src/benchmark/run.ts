/**
 * Entry point for `npm run benchmark:tokens`.
 *
 * Usage:
 *   npm run benchmark:tokens [-- --json] [--encoding o200k_base]
 *
 * Defaults to cl100k_base. Prints per-concept WIRE LEVEL / MODEL LEVEL
 * reports plus an aggregate summary.
 */

import { readFile } from "node:fs/promises"
import { assertConceptCore, type ConceptCore } from "../concept/types.js"
import { createTokenizer } from "./token-count.js"
import {
  runTokenBenchmark,
  computeAggregate,
  formatTokenBenchmark,
  formatAggregate
} from "./token-benchmark.js"

interface CorpusEntry {
  name: string
  concept: ConceptCore
}

async function main(argv: string[]): Promise<void> {
  const json = argv.includes("--json")
  const encodingFlag = argv.findIndex((a) => a === "--encoding")
  const encodingArg = encodingFlag !== -1 ? argv[encodingFlag + 1] : undefined
  const encoding = typeof encodingArg === "string" && encodingArg.length > 0 ? encodingArg : "cl100k_base"

  const corpusRaw: unknown = JSON.parse(await readFile("tests/benchmark-concepts.json", "utf8"))
  if (!Array.isArray(corpusRaw) || corpusRaw.length === 0) {
    throw new Error("benchmark corpus must be a non-empty array")
  }
  const corpus: CorpusEntry[] = corpusRaw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`corpus entry ${i} is not an object`)
    }
    const { name, concept } = entry as { name?: unknown; concept?: unknown }
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`corpus entry ${i} has no valid name`)
    }
    assertConceptCore(concept)
    return { name, concept }
  })

  const tokenizer = createTokenizer(encoding)
  const results = []
  for (const { name, concept } of corpus) {
    results.push(await runTokenBenchmark(name, concept, tokenizer))
  }
  const aggregate = computeAggregate(results)

  if (json) {
    console.log(
      JSON.stringify(
        { tokenizer: tokenizer.name, encoding, results, aggregate },
        null,
        2
      )
    )
    return
  }

  console.log(`ASA/0 token benchmark — tokenizer: ${tokenizer.name}`)
  console.log(`Corpus: tests/benchmark-concepts.json (${corpus.length} concepts)`)
  for (const result of results) {
    console.log("")
    console.log("-".repeat(72))
    console.log(formatTokenBenchmark(result, tokenizer.name))
  }
  console.log(formatAggregate(aggregate, tokenizer.name))
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
