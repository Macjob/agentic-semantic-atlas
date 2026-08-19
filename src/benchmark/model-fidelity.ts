import { normalizeConcept } from "../concept/canonical.js"
import type { ConceptCore } from "../concept/types.js"

export interface FidelityTask {
  id: string
  input: string
  expected: Record<string, unknown>
}

export interface FidelityCase {
  name: string
  concept: ConceptCore
  tasks: FidelityTask[]
}

export interface FidelityScore {
  correct: number
  total: number
  fidelity: number
}

const OUTPUT_INSTRUCTION =
  "Return ONLY a JSON object with a results array. Produce exactly one result for each Task, in order, with an \"id\" field exactly equal to that task id plus the fields required by the concept. Do not echo task inputs, concept metadata, or dictionary entries."

function selectedTasks(testCase: FidelityCase, n: number): FidelityTask[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer")
  if (testCase.tasks.length === 0) throw new Error(`case ${testCase.name} has no tasks`)
  return Array.from({ length: n }, (_, index) => {
    const task = testCase.tasks[index % testCase.tasks.length]!
    const cycle = Math.floor(index / testCase.tasks.length)
    return cycle === 0 ? task : { ...task, id: `${task.id}#${cycle + 1}` }
  })
}

export function buildExpandedPrompt(testCase: FidelityCase, n: number): string {
  const concept = normalizeConcept(testCase.concept)
  const tasks = selectedTasks(testCase, n)
  const lines = [OUTPUT_INSTRUCTION, ""]

  tasks.forEach((task, index) => {
    lines.push(`Task ${index + 1}:`)
    lines.push(JSON.stringify({ concept, id: task.id, input: task.input }))
  })

  return lines.join("\n")
}

export function buildDictionaryPrompt(testCase: FidelityCase, n: number): string {
  const concept = normalizeConcept(testCase.concept)
  const tasks = selectedTasks(testCase, n)
  const lines = [
    OUTPUT_INSTRUCTION,
    "Interpret every numeric concept reference using this lossless ASA session dictionary. Resolve the alias before solving each task; do not copy the dictionary entry into the result:",
    `1 = ${JSON.stringify(concept)}`,
    ""
  ]

  tasks.forEach((task, index) => {
    lines.push(`Task ${index + 1}:`)
    lines.push(JSON.stringify({ concept: 1, id: task.id, input: task.input }))
  })

  return lines.join("\n")
}

export function parseBenchmarkOutput(text: string): Array<Record<string, unknown>> {
  const trimmed = text.trim()
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed

  const parsed: unknown = JSON.parse(unfenced)
  const output = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as Record<string, unknown>).results)
      ? (parsed as { results: unknown[] }).results
      : null
  if (!output) throw new Error("model output must be a JSON array or an object with a results array")
  for (const [index, item] of output.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`model output item ${index} must be an object`)
    }
  }
  return output as Array<Record<string, unknown>>
}

function deepEqualExpected(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected)
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => deepEqualExpected(actual[index], value))
  }
  if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false
  const actualObject = actual as Record<string, unknown>
  return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
    deepEqualExpected(actualObject[key], value)
  )
}

export function scoreBenchmarkOutput(
  tasks: FidelityTask[],
  output: Array<Record<string, unknown>>
): FidelityScore {
  let correct = 0
  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index]!
    const actual = output[index]
    if (!actual) continue
    if (actual.id !== task.id) continue
    if (deepEqualExpected(actual, task.expected)) correct++
  }
  return {
    correct,
    total: tasks.length,
    fidelity: tasks.length === 0 ? 0 : correct / tasks.length
  }
}

export function expandTasks(testCase: FidelityCase, n: number): FidelityTask[] {
  return selectedTasks(testCase, n)
}
