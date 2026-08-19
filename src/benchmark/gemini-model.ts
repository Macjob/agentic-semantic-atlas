import { GoogleGenAI } from "@google/genai"
import type { ModelRun, TextModel } from "./openai-model.js"

export class GeminiModel implements TextModel {
  readonly name: string
  private readonly client: GoogleGenAI

  constructor(model: string, apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) {
    if (!apiKey) {
      throw new Error("Gemini API key not found. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY.")
    }
    this.name = model
    this.client = new GoogleGenAI({ apiKey })
  }

  async generate(prompt: string): Promise<ModelRun> {
    const response = await this.client.models.generateContent({
      model: this.name,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0
      }
    })

    return {
      text: response.text ?? "",
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      responseId: response.responseId ?? "gemini"
    }
  }
}
