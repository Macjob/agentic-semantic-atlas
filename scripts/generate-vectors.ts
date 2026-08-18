/**
 * Regenerates tests/vectors.json.
 *
 * Usage: npx tsx scripts/generate-vectors.ts
 */

import { readFile, writeFile } from "node:fs/promises"
import { conceptCID } from "../src/concept/cid.js"
import { assertConceptCore, type ConceptCore } from "../src/concept/types.js"

const example: unknown = JSON.parse(await readFile("examples/concept.example.json", "utf8"))
assertConceptCore(example)

const CONCEPTS: Array<{ name: string; concept: ConceptCore }> = [
  {
    name: "spec-minimal-example",
    concept: {
      asa: "concept/v0",
      definition: "Produce a concise summary.",
      constraints: { preserve_uncertainty: true }
    }
  },
  { name: "repository-example", concept: example },
  {
    name: "no-constraints",
    concept: {
      asa: "concept/v0",
      definition: "Answer the question."
    }
  }
]

const vectors = []
for (const { name, concept } of CONCEPTS) {
  const { cid, bytes } = await conceptCID(concept)
  vectors.push({
    name,
    concept,
    cid,
    canonicalBytesHex: Buffer.from(bytes).toString("hex")
  })
}

await writeFile("tests/vectors.json", JSON.stringify({ vectors }, null, 2) + "\n", "utf8")
for (const vector of vectors) {
  console.log(`${vector.name}: ${vector.cid}`)
}
