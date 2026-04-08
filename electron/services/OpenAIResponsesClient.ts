import "dotenv/config";

import { getSettingsService } from "./SettingsService";
import type { TextResponseOptions } from "../../src/shared/text-control";

const DEFAULT_MODEL = "gpt-5-mini";
const RESPONSES_URL = "https://api.openai.com/v1/responses";

type ResponsesApiResult = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractOutputText(result: ResponsesApiResult): string {
  if (typeof result.output_text === "string" && result.output_text.length > 0) {
    return result.output_text;
  }

  const fragments =
    result.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text ?? "") ?? [];

  return fragments.join("");
}

function buildInstructions(
  instructions?: string,
  memoryContext?: string
): string | undefined {
  const parts = [instructions?.trim() ?? "", memoryContext?.trim() ?? ""].filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("\n\n");
}

export class OpenAIResponsesClient {
  isConfigured(): boolean {
    return Boolean(getSettingsService().getOpenAiApiKey());
  }

  getState(): { configured: boolean; apiKeyPresent: boolean; model: string } {
    return {
      apiKeyPresent: this.isConfigured(),
      configured: this.isConfigured(),
      model: DEFAULT_MODEL
    };
  }

  async createResponse(input: string, options?: TextResponseOptions) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    const apiKey = getSettingsService().getOpenAiApiKey();

    const response = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: options?.model ?? DEFAULT_MODEL,
        input,
        instructions: buildInstructions(options?.instructions, options?.memoryContext)
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Responses API failed: ${response.status} ${errorBody}`);
    }

    const result = (await response.json()) as ResponsesApiResult;
    return {
      model: options?.model ?? DEFAULT_MODEL,
      text: extractOutputText(result)
    };
  }
}
