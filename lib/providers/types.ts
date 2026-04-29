/**
 * Provider abstraction for text generation.
 *
 * Decouples prompt-based text generation from a specific model vendor
 * (Gemini, DeepSeek, etc.) so that callers can switch providers via
 * environment configuration.
 */

export interface TextGenerationOptions {
  /** Override the model name for this call. */
  model?: string
  /** Optional temperature (0-2). */
  temperature?: number
}

/**
 * A TextProvider generates text completions from a prompt string.
 * Implementations wrap vendor-specific SDKs.
 */
export interface TextProvider {
  /** Human-readable provider name, e.g. "gemini" or "deepseek". */
  readonly name: string
  /** Generate a text completion for the given prompt. */
  generateText(prompt: string, options?: TextGenerationOptions): Promise<string>
}
