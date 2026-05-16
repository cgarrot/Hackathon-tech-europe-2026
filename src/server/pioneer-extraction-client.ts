export interface PioneerEntityMention {
  label: string;
  text: string;
  confidence?: number;
  start?: number;
  end?: number;
}

export interface PioneerExtractionEvidence {
  source: "pioneer_gliner";
  modelId: string;
  labels: string[];
  entities: PioneerEntityMention[];
  entitiesByLabel: Record<string, string[]>;
}

interface PioneerExtractionConfig {
  apiKey: string;
  modelId: string;
  endpoint: string;
  labels: string[];
  threshold: number;
  timeoutMs: number;
}

type EnvSource = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const DEFAULT_ENDPOINT = "https://api.pioneer.ai/inference";
const DEFAULT_LABELS = ["game_type", "setting", "player_count", "ai_count", "role", "mechanic"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitList(value: string | undefined, fallback: string[]) {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return values && values.length > 0 ? [...new Set(values)] : fallback;
}

function readNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function resolvePioneerExtractionConfig(env: EnvSource = process.env): PioneerExtractionConfig | undefined {
  const apiKey = env.PIONEER_GLINER_API_KEY ?? env.PIONEER_API_KEY;
  const modelId = env.PIONEER_GLINER_MODEL_ID;

  if (!apiKey || !modelId) {
    return undefined;
  }

  return {
    apiKey,
    modelId,
    endpoint: env.PIONEER_GLINER_ENDPOINT ?? DEFAULT_ENDPOINT,
    labels: splitList(env.PIONEER_GLINER_LABELS, DEFAULT_LABELS),
    threshold: readNumber(env.PIONEER_GLINER_THRESHOLD, 0.45, 0, 1),
    timeoutMs: Math.floor(readNumber(env.PIONEER_GLINER_TIMEOUT_MS, 8_000, 100, 60_000))
  };
}

export function buildPioneerExtractionPayload(text: string, config: Pick<PioneerExtractionConfig, "modelId" | "labels" | "threshold">) {
  return {
    model_id: config.modelId,
    text,
    schema: {
      entities: config.labels
    },
    threshold: config.threshold
  };
}

function readEntityText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const rawText = value.text ?? value.value ?? value.entity;
  return typeof rawText === "string" && rawText.trim().length > 0 ? rawText.trim() : undefined;
}

function readOptionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeEntity(label: string, value: unknown): PioneerEntityMention | undefined {
  const text = readEntityText(value);
  if (!text) {
    return undefined;
  }

  if (!isRecord(value)) {
    return { label, text };
  }

  const confidence = readOptionalNumber(value, "confidence");
  const start = readOptionalNumber(value, "start");
  const end = readOptionalNumber(value, "end");

  return {
    label,
    text,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {})
  };
}

function normalizeEntities(value: unknown): PioneerEntityMention[] {
  if (!isRecord(value)) {
    return [];
  }

  const result = isRecord(value.result) ? value.result : value;
  const entityMap = isRecord(result.entities) ? result.entities : {};
  const mentions: PioneerEntityMention[] = [];
  const seen = new Set<string>();

  for (const [label, rawValues] of Object.entries(entityMap)) {
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    for (const rawValue of values) {
      const normalized = normalizeEntity(label, rawValue);
      if (!normalized) {
        continue;
      }

      const key = `${normalized.label}:${normalized.text.toLowerCase()}:${normalized.start ?? ""}:${normalized.end ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        mentions.push(normalized);
      }
    }
  }

  return mentions;
}

function groupEntitiesByLabel(entities: PioneerEntityMention[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const entity of entities) {
    grouped[entity.label] = grouped[entity.label] ?? [];
    if (!grouped[entity.label].includes(entity.text)) {
      grouped[entity.label].push(entity.text);
    }
  }
  return grouped;
}

export function extractionEvidenceToPromptText(evidence: PioneerExtractionEvidence | undefined): string {
  if (!evidence || evidence.entities.length === 0) {
    return "";
  }

  return evidence.entities
    .map((entity) => `${entity.label}:${entity.text}`)
    .join(" ");
}

export async function collectPioneerExtractionEvidence(
  text: string,
  options: { env?: EnvSource; fetcher?: FetchLike } = {}
): Promise<PioneerExtractionEvidence | undefined> {
  const config = resolvePioneerExtractionConfig(options.env);
  const normalizedText = text.trim();
  if (!config || normalizedText.length === 0) {
    return undefined;
  }

  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey
      },
      body: JSON.stringify(buildPioneerExtractionPayload(normalizedText, config)),
      signal: controller.signal
    });

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as unknown;
    const entities = normalizeEntities(data);
    if (entities.length === 0) {
      return undefined;
    }

    return {
      source: "pioneer_gliner",
      modelId: config.modelId,
      labels: config.labels,
      entities,
      entitiesByLabel: groupEntitiesByLabel(entities)
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
