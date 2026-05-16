import { z } from "zod";
import { runStructuredStage, type LlmProviderConfig } from "./llm-provider";
import { ArtifactPackageSchema, type ArtifactPackage, type GameSpec, type IntakeBrief, type PackSelection } from "./schemas";
import { extractCompactBracketTags, isAllowedEmotionTag } from "@/voice-emotion-tags";

const DEFAULT_PIONEER_BASE_URL = "https://api.pioneer.ai/v1";
const DEFAULT_PIONEER_INFERENCE_ENDPOINT = "https://api.pioneer.ai/inference";
const DEFAULT_PIONEER_MODEL = "moonshotai/Kimi-K2.6";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;

const PioneerArtifactEnhancementSchema = z
  .object({
    visualAssetPrompts: z.array(z
      .object({
        id: z.string().min(1),
        prompt: z.string().min(16),
        usage: z.string().min(1).optional(),
        safetyNotes: z.array(z.string()).optional()
      })
      .strict()).default([]),
    ttsPersonaLines: z.array(z
      .object({
        id: z.string().min(1),
        speechStyle: z.string().min(1).optional(),
        sampleLines: z.array(z.string().min(1).max(120)).min(1).max(2)
      })
      .strict()).default([])
  })
  .strict();

type PioneerArtifactEnhancement = z.infer<typeof PioneerArtifactEnhancementSchema>;

export interface PioneerArtifactEnhancementResult {
  package: ArtifactPackage;
  pipelineStatus?: string;
}

export interface PioneerFineTuneArtifactConfig {
  apiKey: string;
  modelId: string;
  endpoint: string;
  timeoutMs: number;
}

export interface PioneerArtifactEnhancementParams {
  prompt: string;
  intake: IntakeBrief;
  routing: PackSelection;
  gameSpec: GameSpec;
  artifactPackage: ArtifactPackage;
  config?: LlmProviderConfig;
  fineTuneConfig?: PioneerFineTuneArtifactConfig;
}

const SYSTEM_PROMPT = `You are the GameForge Pioneer/Kimi complement enhancer.

You do NOT generate a whole game package. You only improve two fields:
1. visualAssetPrompts: rewrite image-generation prompts for existing non-voice assets only.
2. ttsPersonaLines: rewrite short text-to-speech sampleLines for existing personas only.

Return only a strict JSON object with exactly: visualAssetPrompts, ttsPersonaLines.

Rules:
- Preserve existing IDs. Never invent new asset IDs or persona IDs.
- visualAssetPrompts may target only assets whose kind is hero, scene, card, or icon; never target kind=voice.
- Visual prompts must include composition, mood, generation constraints, and practical UI overlay guidance.
- Visual prompts must say: no readable text, no logos, no watermark, no gore, no real artist likeness.
- ttsPersonaLines sampleLines must be concise spoken lines under 120 chars.
- Allowed emotion tags in sampleLines are only: [calm], [warm], [tense], [surprise], [whisper], [urgent], [skeptical], [angry].
- Do not add fields beyond the schema.
- Do not imitate real living people.`;

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolvePioneerArtifactEnhancementConfig(): LlmProviderConfig | undefined {
  if (!isEnabled(process.env.PIONEER_ARTIFACT_ENHANCEMENT)) {
    return undefined;
  }

  const apiKey = process.env.PIONEER_ARTIFACT_API_KEY?.trim()
    || process.env.PIONEER_ARTIFACT_FINE_TUNE_API_KEY?.trim()
    || process.env.PIONEER_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return {
    provider: "pioneer",
    model: process.env.PIONEER_ARTIFACT_MODEL?.trim() || process.env.PIONEER_MODEL?.trim() || DEFAULT_PIONEER_MODEL,
    apiKey,
    baseURL: process.env.PIONEER_ARTIFACT_BASE_URL?.trim() || process.env.PIONEER_BASE_URL?.trim() || DEFAULT_PIONEER_BASE_URL,
    timeoutMs: readPositiveInteger("PIONEER_ARTIFACT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    strictJsonSchema: false,
    maxOutputTokens: readPositiveInteger("PIONEER_ARTIFACT_MAX_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS)
  };
}

export function resolvePioneerFineTuneArtifactConfig(): PioneerFineTuneArtifactConfig | undefined {
  if (!isEnabled(process.env.PIONEER_ARTIFACT_ENHANCEMENT)) {
    return undefined;
  }

  const apiKey = process.env.PIONEER_ARTIFACT_FINE_TUNE_API_KEY?.trim()
    || process.env.PIONEER_ARTIFACT_API_KEY?.trim()
    || process.env.PIONEER_API_KEY?.trim();
  const modelId = process.env.PIONEER_ARTIFACT_FINE_TUNE_MODEL_ID?.trim();
  if (!apiKey || !modelId) {
    return undefined;
  }

  return {
    apiKey,
    modelId,
    endpoint: process.env.PIONEER_ARTIFACT_FINE_TUNE_ENDPOINT?.trim() || DEFAULT_PIONEER_INFERENCE_ENDPOINT,
    timeoutMs: readPositiveInteger("PIONEER_ARTIFACT_FINE_TUNE_TIMEOUT_MS", readPositiveInteger("PIONEER_ARTIFACT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new SyntaxError("No JSON object found in Pioneer fine-tune output.");
    }

    return JSON.parse(text.slice(first, last + 1)) as unknown;
  }
}

function collectTextCandidates(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTextCandidates(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  const directValues = [value.content, value.text, value.output, value.generated_text, value.response]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
  const messageValues = isRecord(value.message) ? collectTextCandidates(value.message.content) : [];
  const resultValues = collectTextCandidates(value.result);
  const dataValues = collectTextCandidates(value.data);
  const choiceValues = collectTextCandidates(value.choices);

  return [...directValues, ...messageValues, ...resultValues, ...dataValues, ...choiceValues];
}

async function fetchWithTimeout(endpoint: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildEnhancementUserPayload(params: PioneerArtifactEnhancementParams, visualAssets: unknown[], personas: unknown[]) {
  return JSON.stringify({
    prompt: params.prompt,
    intake: params.intake,
    routing: params.routing,
    gameSpec: params.gameSpec,
    visualAssets,
    personas
  });
}

async function runFineTunedArtifactEnhancement(
  config: PioneerFineTuneArtifactConfig,
  userPayload: string
): Promise<PioneerArtifactEnhancement> {
  const response = await fetchWithTimeout(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey
    },
    body: JSON.stringify({
      model_id: config.modelId,
      task: "generate",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${userPayload}\n\nReturn only the strict JSON complement object.` }
      ]
    })
  }, config.timeoutMs);

  if (!response.ok) {
    throw new Error(`pioneer_fine_tune_failed:${response.status}`);
  }

  const data = await response.json() as unknown;
  const direct = PioneerArtifactEnhancementSchema.safeParse(data);
  if (direct.success) {
    return direct.data;
  }

  for (const candidate of collectTextCandidates(data)) {
    const parsed = PioneerArtifactEnhancementSchema.safeParse(extractJsonObject(candidate));
    if (parsed.success) {
      return parsed.data;
    }
  }

  throw new Error("pioneer_fine_tune_invalid_json");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function safeSampleLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 120)
    .filter((line) => extractCompactBracketTags(line).every((tag) => isAllowedEmotionTag(tag)))
    .slice(0, 2);
}

function visualEnhancementsById(enhancement: PioneerArtifactEnhancement, allowedIds: Set<string>) {
  return new Map(enhancement.visualAssetPrompts
    .filter((asset) => allowedIds.has(asset.id))
    .map((asset) => [asset.id, asset]));
}

function ttsEnhancementsById(enhancement: PioneerArtifactEnhancement, allowedIds: Set<string>) {
  return new Map(enhancement.ttsPersonaLines
    .filter((persona) => allowedIds.has(persona.id) && safeSampleLines(persona.sampleLines).length > 0)
    .map((persona) => [persona.id, persona]));
}

function applyEnhancementPackage(params: PioneerArtifactEnhancementParams, enhancement: PioneerArtifactEnhancement) {
  const visualAssets = params.artifactPackage.assetPrompts
    .filter((asset) => asset.kind !== "voice")
    .map((asset) => ({ id: asset.id, kind: asset.kind, prompt: asset.prompt, usage: asset.usage, safetyNotes: asset.safetyNotes }));
  const personas = params.artifactPackage.personas
    .map((persona) => ({ id: persona.id, displayName: persona.displayName, speechStyle: persona.speechStyle, sampleLines: persona.sampleLines }));
  const visualIds = new Set(visualAssets.map((asset) => asset.id));
  const personaIds = new Set(personas.map((persona) => persona.id));
  const visualById = visualEnhancementsById(enhancement, visualIds);
  const ttsById = ttsEnhancementsById(enhancement, personaIds);
  let enhancedImagePrompts = 0;
  let enhancedTtsLines = 0;

  const nextPackage = ArtifactPackageSchema.parse({
    ...params.artifactPackage,
    assetPrompts: params.artifactPackage.assetPrompts.map((asset) => {
      if (asset.kind === "voice") {
        return asset;
      }

      const visual = visualById.get(asset.id);
      if (!visual) {
        return asset;
      }

      enhancedImagePrompts += 1;
      return {
        ...asset,
        prompt: visual.prompt.trim(),
        usage: visual.usage?.trim() || asset.usage,
        safetyNotes: uniqueStrings([...(asset.safetyNotes ?? []), ...(visual.safetyNotes ?? [])])
      };
    }),
    personas: params.artifactPackage.personas.map((persona) => {
      const tts = ttsById.get(persona.id);
      if (!tts) {
        return persona;
      }

      const sampleLines = safeSampleLines(tts.sampleLines);
      enhancedTtsLines += sampleLines.length;
      return {
        ...persona,
        speechStyle: tts.speechStyle?.trim() || persona.speechStyle,
        sampleLines
      };
    })
  });

  return { nextPackage, enhancedImagePrompts, enhancedTtsLines };
}

export async function enhanceArtifactPackageWithPioneer(params: PioneerArtifactEnhancementParams): Promise<PioneerArtifactEnhancementResult> {
  const fineTuneConfig = params.fineTuneConfig ?? resolvePioneerFineTuneArtifactConfig();
  const config = params.config ?? resolvePioneerArtifactEnhancementConfig();
  if (!fineTuneConfig && !config) {
    return { package: params.artifactPackage };
  }

  try {
    const visualAssets = params.artifactPackage.assetPrompts
      .filter((asset) => asset.kind !== "voice")
      .map((asset) => ({ id: asset.id, kind: asset.kind, prompt: asset.prompt, usage: asset.usage, safetyNotes: asset.safetyNotes }));
    const personas = params.artifactPackage.personas
      .map((persona) => ({ id: persona.id, displayName: persona.displayName, speechStyle: persona.speechStyle, sampleLines: persona.sampleLines }));

    if (visualAssets.length === 0 && personas.length === 0) {
      return { package: params.artifactPackage };
    }

    const userPayload = buildEnhancementUserPayload(params, visualAssets, personas);
    let enhancement: PioneerArtifactEnhancement | undefined;
    let source = "kimi";

    if (fineTuneConfig) {
      try {
        enhancement = await runFineTunedArtifactEnhancement(fineTuneConfig, userPayload);
        source = "fine_tune";
      } catch (error) {
        console.warn("GameForge Pioneer fine-tuned artifact enhancement failed open.", error);
      }
    }

    if (!enhancement && config) {
      enhancement = await runStructuredStage({
        config,
        schemaName: "PioneerArtifactEnhancement",
        schema: PioneerArtifactEnhancementSchema,
        system: SYSTEM_PROMPT,
        user: userPayload
      });
      source = fineTuneConfig ? "fallback_kimi" : "kimi";
    }

    if (!enhancement) {
      return {
        package: params.artifactPackage,
        pipelineStatus: fineTuneConfig ? "failed_open:fine_tune" : "failed_open"
      };
    }

    const { nextPackage, enhancedImagePrompts, enhancedTtsLines } = applyEnhancementPackage(params, enhancement);

    return {
      package: nextPackage,
      pipelineStatus: `${source}:images:${enhancedImagePrompts},tts_lines:${enhancedTtsLines}`
    };
  } catch (error) {
    console.warn("GameForge Pioneer artifact enhancement failed open.", error);
    return {
      package: params.artifactPackage,
      pipelineStatus: "failed_open"
    };
  }
}
