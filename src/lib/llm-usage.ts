/** Which Gemini call in a chat turn the tokens were spent on. */
export type LlmStep = "chat" | "rewrite" | "relevance";

/** Token usage of one Gemini call, as stored in `response_delivered.llm_usage`. */
export type LlmUsage = {
  step: LlmStep;
  model: string;
  input_tokens: number;
  output_tokens: number;
};

export type UsageSink = (usage: LlmUsage) => void;

/** Subset of Gemini's GenerateContentResponseUsageMetadata that affects billing. */
type GeminiUsageMetadata = {
  promptTokenCount?: number;
  toolUsePromptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
};

/** Thinking tokens are billed as output, so they are counted as output here. */
export function usageFromMetadata(
  step: LlmStep,
  model: string,
  meta: GeminiUsageMetadata | undefined
): LlmUsage | null {
  if (!meta) return null;
  return {
    step,
    model,
    input_tokens: (meta.promptTokenCount ?? 0) + (meta.toolUsePromptTokenCount ?? 0),
    output_tokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };
}
