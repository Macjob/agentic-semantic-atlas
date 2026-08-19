import type { ModelGenerateOptions, ModelRun, TextModel } from "./openai-model.js"

interface OllamaGenerateResponse {
  response?: string
  prompt_eval_count?: number
  eval_count?: number
}

function structuredFormat(options?: ModelGenerateOptions): "json" | Record<string, unknown> {
  if (!options?.outputField || !options.expectedItems) return "json"

  return {
    type: "object",
    properties: {
      results: {
        type: "array",
        minItems: options.expectedItems,
        maxItems: options.expectedItems,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            [options.outputField]: { type: "string" }
          },
          required: ["id", options.outputField],
          additionalProperties: false
        }
      }
    },
    required: ["results"],
    additionalProperties: false
  }
}

export class OllamaModel implements TextModel {
  readonly name: string
  private readonly baseUrl: string

  constructor(model: string, baseUrl = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434") {
    this.name = model
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  async generate(prompt: string, options?: ModelGenerateOptions): Promise<ModelRun> {
    const effectivePrompt = /^qwen3(?::|-)/i.test(this.name) ? `/no_think\n${prompt}` : prompt

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.name,
        prompt: effectivePrompt,
        stream: false,
        format: structuredFormat(options),
        think: false,
        options: { temperature: 0, num_predict: 1024 }
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Ollama request failed (${response.status}): ${body}`)
    }

    const body = await response.json() as OllamaGenerateResponse
    if (typeof body.response !== "string") throw new Error("Ollama response did not include text")

    return {
      text: body.response,
      inputTokens: body.prompt_eval_count ?? null,
      outputTokens: body.eval_count ?? null,
      responseId: `ollama:${this.name}:${Date.now()}`
    }
  }
}
