import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { normalizeStageOutput } from "./schema-normalizer";

export type RealLlmProvider = "openai" | "ollama";
export type CompilerMode = RealLlmProvider;

export interface LlmProviderConfig {
  provider: RealLlmProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  timeoutMs: number;
  strictJsonSchema: boolean;
}

export type ProviderResolution =
  | { type: "configured"; config: LlmProviderConfig }
  | { type: "error"; message: string };

const ProviderSchema = z.enum(["openai", "ollama"]);
const MAX_STAGE_ATTEMPTS = 2;

function withHardTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`provider_timeout:${label}`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function readProviderName(): RealLlmProvider | undefined {
  const rawProvider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (!rawProvider) {
    return undefined;
  }

  const parsed = ProviderSchema.safeParse(rawProvider);
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
}

function readTimeoutMs(): number {
  const rawTimeout = process.env.LLM_TIMEOUT_MS;
  const timeout = rawTimeout ? Number(rawTimeout) : 180_000;

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return 180_000;
  }

  return timeout;
}

export function resolveLlmProvider(): ProviderResolution {
  const rawProvider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (rawProvider) {
    const parsedProvider = ProviderSchema.safeParse(rawProvider);
    if (!parsedProvider.success) {
      return { type: "error", message: "invalid_llm_provider" };
    }
  }

  const provider = readProviderName();
  const timeoutMs = readTimeoutMs();

  if (provider === "ollama" || (!provider && process.env.OLLAMA_API_KEY)) {
    const apiKey = process.env.OLLAMA_API_KEY;
    const baseURL = process.env.OLLAMA_BASE_URL;
    const model = process.env.OLLAMA_MODEL ?? "gpt-oss:20b";

    if (!apiKey || !baseURL) {
      return { type: "error", message: "missing_ollama_configuration" };
    }

    return {
      type: "configured",
      config: {
        provider: "ollama",
        model,
        apiKey,
        baseURL,
        timeoutMs,
        strictJsonSchema: false
      }
    };
  }

  if (provider === "openai" || (!provider && process.env.OPENAI_API_KEY)) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

    if (!apiKey) {
      return { type: "error", message: "missing_openai_api_key" };
    }

    return {
      type: "configured",
      config: {
        provider: "openai",
        model,
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL,
        timeoutMs,
        strictJsonSchema: true
      }
    };
  }

  return {
    type: "error",
    message: "missing_llm_provider_configuration"
  };
}

function createClient(config: LlmProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");

    if (first === -1 || last === -1 || last <= first) {
      throw new SyntaxError("No JSON object found in model output.");
    }

    return JSON.parse(text.slice(first, last + 1));
  }
}

export async function runStructuredStage<TSchema extends z.ZodType>(params: {
  config: LlmProviderConfig;
  schemaName: string;
  schema: TSchema;
  system: string;
  user: string;
}): Promise<z.infer<TSchema>> {
  const client = createClient(params.config);
  let repairHint = "";
  const maxAttempts = MAX_STAGE_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages = [
      { role: "system", content: params.system },
      {
        role: "user",
        content: `${params.user}\n\nReturn only one valid JSON object. No markdown, no comments, no prose outside JSON.${repairHint}`
      }
    ] satisfies ChatCompletionMessageParam[];

    try {
      if (params.config.strictJsonSchema) {
        const completion = await withHardTimeout(
          client.chat.completions.parse({
            model: params.config.model,
            temperature: 0.2,
            messages,
            response_format: zodResponseFormat(params.schema, params.schemaName)
          }, { timeout: params.config.timeoutMs }),
          params.config.timeoutMs,
          params.schemaName
        );

        const parsed = completion.choices[0]?.message.parsed;
        if (!parsed) {
          throw new Error(`empty_parsed_output:${params.schemaName}`);
        }

        return params.schema.parse(normalizeStageOutput(params.schemaName, parsed));
      }

      const completion = await withHardTimeout(
        client.chat.completions.create({
          model: params.config.model,
          temperature: 0.2,
          messages,
          response_format: { type: "json_object" }
        }, { timeout: params.config.timeoutMs }),
        params.config.timeoutMs,
        params.schemaName
      );

      const content = completion.choices[0]?.message.content;
      if (!content) {
        throw new Error(`empty_model_output:${params.schemaName}`);
      }

      return params.schema.parse(normalizeStageOutput(params.schemaName, extractJsonObject(content)));
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      repairHint = `\n\nPrevious attempt failed for schema ${params.schemaName}: ${errorMessage}. Repair by returning valid JSON that exactly satisfies the requested schema.`;
    }
  }

  throw new Error(`stage_failed:${params.schemaName}`);
}
