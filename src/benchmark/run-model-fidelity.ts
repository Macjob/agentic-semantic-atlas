import { readFile } from "node:fs/promises"
import { assertConceptCore } from "../concept/types.js"
import {
  buildDictionaryPrompt,
  buildExpandedPrompt,
  expandTasks,
  parseBenchmarkOutput,
  scoreBenchmarkOutput,
  type FidelityCase
} from "./model-fidelity.js"
import { createTokenizer } from "./token-count.js"
import { OpenAIResponsesModel, type TextModel } from "./openai-model.js"
import { GeminiModel } from "./gemini-model.js"
import { OllamaModel } from "./ollama-model.js"

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function parseDepths(raw: string | undefined): number[] {
  const values = (raw ?? "1,5,10,25").split(",").map((value) => Number(value.trim()))
  if (values.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error("Invalid --n values")
  }
  return values
}

function createModel(provider: string, modelName: string): TextModel {
  switch (provider) {
    case "openai":
      return new OpenAIResponsesModel(modelName)
    case "gemini":
      return new GeminiModel(modelName)
    case "ollama":
      return new OllamaModel(modelName)
    default:
      throw new Error(`Unknown --provider ${provider}. Supported providers: openai, gemini, ollama`)
  }
}

async function loadCases(): Promise<FidelityCase[]> {
  const raw: unknown = JSON.parse(await readFile("tests/fidelity-cases.json", "utf8"))
  if (!Array.isArray(raw)) throw new Error("Fidelity corpus must be an array")
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`Invalid case ${index}`)
    const item = entry as Record<string, unknown>
    if (typeof item.name !== "string" || !Array.isArray(item.tasks)) throw new Error(`Invalid case ${index}`)
    assertConceptCore(item.concept)
    return entry as FidelityCase
  })
}

function defaultModelForProvider(provider: string): string {
  switch (provider) {
    case "gemini":
      return "gemini-2.5-flash"
    case "ollama":
      return "qwen3:4b"
    default:
      return "gpt-5.6"
  }
}

function outputFieldForCase(testCase: FidelityCase): string | undefined {
  const outputField = testCase.concept.constraints?.output_field
  return typeof outputField === "string" ? outputField : undefined
}

async function main(args: string[]): Promise<void> {
  const provider = valueAfter(args, "--provider") ?? "gemini"
  const defaultModel = defaultModelForProvider(provider)
  const modelName = valueAfter(args, "--model") ?? defaultModel
  const depths = parseDepths(valueAfter(args, "--n"))
  const dryRun = args.includes("--dry-run")
  const json = args.includes("--json")
  const includeOutput = args.includes("--include-output")
  const tokenizer = createTokenizer(valueAfter(args, "--encoding") ?? "o200k_base")
  const model = dryRun ? null : createModel(provider, modelName)
  const cases = await loadCases()
  const results: Array<Record<string, unknown>> = []

  for (const testCase of cases) {
    for (const n of depths) {
      for (const mode of ["expanded", "dictionary"] as const) {
        const prompt = mode === "expanded"
          ? buildExpandedPrompt(testCase, n)
          : buildDictionaryPrompt(testCase, n)
        const estimatedInputTokens = tokenizer.count(prompt)

        if (dryRun) {
          results.push({ case: testCase.name, n, mode, estimatedInputTokens })
          continue
        }

        const response = await model!.generate(prompt, {
          expectedItems: n,
          outputField: outputFieldForCase(testCase)
        })
        let fidelity = 0
        let correct = 0
        let parseError: string | undefined
        try {
          const parsed = parseBenchmarkOutput(response.text)
          const score = scoreBenchmarkOutput(expandTasks(testCase, n), parsed)
          fidelity = score.fidelity
          correct = score.correct
        } catch (error) {
          parseError = error instanceof Error ? error.message : String(error)
        }

        results.push({
          case: testCase.name,
          n,
          mode,
          estimatedInputTokens,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          fidelity,
          correct,
          total: n,
          output: includeOutput ? response.text : undefined,
          parseError
        })
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ provider, model: modelName, dryRun, results }, null, 2))
    return
  }

  console.log(`ASA model fidelity benchmark — ${dryRun ? "dry run" : `${provider}/${modelName}`}`)
  for (const result of results) console.log(result)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
