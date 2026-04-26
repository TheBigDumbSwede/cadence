import "dotenv/config";

import { getSettingsService } from "./SettingsService";
import type { TextResponseOptions } from "../../src/shared/text-control";
import {
  buildHttpError,
  missingOpenAiApiKeyError,
  normalizeNetworkError
} from "./appErrorUtils";

const DEFAULT_MODEL = "gpt-5.4-mini";
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

function buildInstructions(instructions?: string, memoryContext?: string): string | undefined {
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
      throw missingOpenAiApiKeyError("openai-responses");
    }
    const apiKey = getSettingsService().getOpenAiApiKey();

    let response: Response;
    try {
      response = await fetch(RESPONSES_URL, {
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
    } catch (error) {
      throw normalizeNetworkError({
        error,
        provider: "openai-responses",
        fallbackMessage: "OpenAI Responses request",
        fallbackCode: "provider.openai_http_error"
      });
    }

    if (!response.ok) {
      throw await buildHttpError({
        response,
        provider: "openai-responses",
        code: "provider.openai_http_error",
        fallbackMessage: "OpenAI Responses request failed"
      });
    }

    const result = (await response.json()) as ResponsesApiResult;
    return {
      model: options?.model ?? DEFAULT_MODEL,
      text: extractOutputText(result)
    };
  }
}
