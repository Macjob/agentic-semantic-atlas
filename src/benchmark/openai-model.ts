import OpenAI from "openai"

export interface ModelRun {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  responseId: string
}

export interface ModelGenerateOptions {
  expectedItems?: number
  outputField?: string
}

export interface TextModel {
  readonly name: string
  generate(prompt: string, options?: ModelGenerateOptions): Promise<ModelRun>
}

export class OpenAIResponsesModel implements TextModel {
  readonly name: string
  private readonly client: OpenAI

  constructor(model: string, client = new OpenAI()) {
    this.name = model
    this.client = client
  }

  async generate(prompt: string): Promise<ModelRun> {
    const response = await this.client.responses.create({
      model: this.name,
      input: prompt,
      store: false
    })

    return {
      text: response.output_text,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      responseId: response.id
    }
  }
}
