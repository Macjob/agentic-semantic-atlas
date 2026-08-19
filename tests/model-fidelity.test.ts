import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildDictionaryPrompt,
  buildExpandedPrompt,
  expandTasks,
  parseBenchmarkOutput,
  scoreBenchmarkOutput,
  type FidelityCase
} from "../src/benchmark/model-fidelity.js"

const fixture: FidelityCase = {
  name: "uncertainty-classification",
  concept: {
    asa: "concept/v0",
    definition: "Classify each statement as fact, inference, or uncertain.",
    constraints: {
      allowed_labels: ["fact", "inference", "uncertain"],
      preserve_uncertainty: true,
      output_field: "label",
      output_format: "json"
    }
  },
  tasks: [
    { id: "a", input: "The report explicitly states revenue was 10.", expected: { label: "fact" } },
    { id: "b", input: "Revenue probably rose because traffic increased.", expected: { label: "inference" } },
    { id: "c", input: "The source is incomplete, so the result cannot be determined.", expected: { label: "uncertain" } }
  ]
}

describe("Model fidelity benchmark", () => {
  it("dictionary prompt defines the concept once and references aliases per task", () => {
    const prompt = buildDictionaryPrompt(fixture, 3)
    assert.equal(prompt.match(/\"asa\":\"concept\/v0\"/g)?.length, 1)
    assert.equal(prompt.match(/\"concept\":1/g)?.length, 3)
  })

  it("expanded prompt repeats the full concept for every task", () => {
    const prompt = buildExpandedPrompt(fixture, 3)
    assert.equal(prompt.match(/\"asa\":\"concept\/v0\"/g)?.length, 3)
  })

  it("gives repeated tasks unique ids", () => {
    assert.deepEqual(expandTasks(fixture, 5).map((task) => task.id), ["a", "b", "c", "a#2", "b#2"])
  })

  it("parses fenced JSON output", () => {
    const parsed = parseBenchmarkOutput('```json\n[{"id":"a","label":"fact"}]\n```')
    assert.deepEqual(parsed, [{ id: "a", label: "fact" }])
  })

  it("parses a results object", () => {
    const parsed = parseBenchmarkOutput('{"results":[{"id":"a","label":"fact"}]}')
    assert.deepEqual(parsed, [{ id: "a", label: "fact" }])
  })

  it("scores exact expected fields without penalizing additional fields", () => {
    const score = scoreBenchmarkOutput(fixture.tasks, [
      { id: "a", label: "fact", explanation: "explicit" },
      { id: "b", label: "inference" },
      { id: "c", label: "wrong" }
    ])
    assert.equal(score.correct, 2)
    assert.equal(score.total, 3)
    assert.equal(score.fidelity, 2 / 3)
  })
})
