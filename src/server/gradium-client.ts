import { normalizeVoiceLanguage } from "@/voice-profiles";

const DEFAULT_GRADIUM_BASE_URL = "https://api.gradium.ai/api";
const DEFAULT_GRADIUM_TIMEOUT_MS = 60_000;
const DEFAULT_TTS_FORMAT = "wav";
const MAX_TTS_TEXT_LENGTH = 1_200;

export type GradiumAudioFormat =
  | "wav"
  | "pcm"
  | "opus"
  | "ulaw_8000"
  | "mulaw_8000"
  | "alaw_8000"
  | "pcm_8000"
  | "pcm_16000"
  | "pcm_22050"
  | "pcm_24000"
  | "pcm_44100"
  | "pcm_48000";

export interface GradiumConfig {
  apiKey: string;
  baseUrl: string;
  defaultLanguage: "fr" | "en";
  timeoutMs: number;
}

export interface GradiumTtsRequest {
  text: string;
  voiceId?: string;
  language?: string;
  outputFormat?: GradiumAudioFormat;
}

export interface GradiumTtsResult {
  audio: ArrayBuffer;
  contentType: string;
  voiceId: string;
  outputFormat: GradiumAudioFormat;
}

export interface GradiumTtsStreamResult {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  voiceId: string;
  outputFormat: GradiumAudioFormat;
}

export interface GradiumTranscriptionResult {
  text: string;
  eventCount: number;
}

export interface GradiumTranscriptionStreamResult {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  inputFormat?: "wav" | "pcm" | "opus";
}

export class GradiumConfigError extends Error {
  constructor(readonly code: "missing_gradium_api_key" | "missing_gradium_voice_configuration") {
    super(code);
    this.name = "GradiumConfigError";
  }
}

export class GradiumApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: string) {
    super(code);
    this.name = "GradiumApiError";
  }
}

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string" ? value[key].trim() : "";
}

function collectAlternativeText(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const transcript = readString(entry, "transcript");
    const text = readString(entry, "text");
    return [transcript, text].filter((candidate) => candidate.length > 0);
  });
}

function collectTranscriptionText(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const directText = [readString(value, "text"), readString(value, "transcript")].filter((candidate) => candidate.length > 0);
  const alternatives = collectAlternativeText(value.alternatives);
  const utteranceText = isRecord(value.utterance) ? [readString(value.utterance, "text")].filter((candidate) => candidate.length > 0) : [];
  const channelAlternatives = isRecord(value.channel) ? collectAlternativeText(value.channel.alternatives) : [];
  const resultTexts = Array.isArray(value.results) ? value.results.flatMap((result) => collectTranscriptionText(result)) : [];

  return [...directText, ...alternatives, ...utteranceText, ...channelAlternatives, ...resultTexts];
}

function parseNdjson(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return { text: line };
      }
    });
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function audioAcceptHeader(outputFormat: GradiumAudioFormat) {
  if (outputFormat === "opus") {
    return "audio/ogg, application/octet-stream";
  }

  if (outputFormat === "wav") {
    return "audio/wav, application/octet-stream";
  }

  return "audio/pcm, application/octet-stream";
}

function normalizeAudioContentType(contentType: string) {
  const baseType = contentType.split(";")[0]?.trim().toLowerCase();
  if (baseType === "audio/wav" || baseType === "audio/pcm" || baseType === "audio/ogg" || baseType === "audio/opus") {
    return baseType;
  }

  return contentType || "application/octet-stream";
}

function inputFormatForContentType(contentType: string): "wav" | "pcm" | "opus" | undefined {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("audio/wav")) {
    return "wav";
  }

  if (normalized.includes("audio/pcm")) {
    return "pcm";
  }

  if (normalized.includes("audio/ogg") || normalized.includes("audio/opus")) {
    return "opus";
  }

  return undefined;
}

async function readErrorDetails(response: Response) {
  try {
    return (await response.text()).slice(0, 800);
  } catch {
    return undefined;
  }
}

function streamWithTimeoutCleanup(body: ReadableStream<Uint8Array>, clear: () => void) {
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      clear();
    }
  }));
}

export function resolveGradiumConfig(): GradiumConfig {
  const apiKey = process.env.GRADIUM_API_KEY?.trim();
  if (!apiKey) {
    throw new GradiumConfigError("missing_gradium_api_key");
  }

  return {
    apiKey,
    baseUrl: stripTrailingSlash(process.env.GRADIUM_BASE_URL?.trim() || DEFAULT_GRADIUM_BASE_URL),
    defaultLanguage: normalizeVoiceLanguage(process.env.GRADIUM_LANGUAGE),
    timeoutMs: readPositiveInteger("GRADIUM_TIMEOUT_MS", DEFAULT_GRADIUM_TIMEOUT_MS)
  };
}

export function resolveGradiumVoiceId(language: string | undefined, explicitVoiceId?: string) {
  const trimmedExplicitVoiceId = explicitVoiceId?.trim();
  if (trimmedExplicitVoiceId) {
    return trimmedExplicitVoiceId;
  }

  const normalizedLanguage = normalizeVoiceLanguage(language ?? process.env.GRADIUM_LANGUAGE);
  const languageSpecificVoiceId = normalizedLanguage === "en" ? process.env.GRADIUM_EN_VOICE_ID : process.env.GRADIUM_FR_VOICE_ID;
  const voiceId = languageSpecificVoiceId?.trim() || process.env.GRADIUM_DEFAULT_VOICE_ID?.trim();

  if (!voiceId) {
    throw new GradiumConfigError("missing_gradium_voice_configuration");
  }

  return voiceId;
}

async function requestSynthesis(request: GradiumTtsRequest, config: GradiumConfig) {
  const text = request.text.trim();
  if (!text || text.length > MAX_TTS_TEXT_LENGTH) {
    throw new GradiumApiError("invalid_tts_text", 400);
  }

  const outputFormat = request.outputFormat ?? DEFAULT_TTS_FORMAT;
  const voiceId = resolveGradiumVoiceId(request.language ?? config.defaultLanguage, request.voiceId);
  const timeout = withTimeout(config.timeoutMs);
  const response = await fetch(`${config.baseUrl}/post/speech/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: audioAcceptHeader(outputFormat),
      "x-api-key": config.apiKey
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      output_format: outputFormat,
      only_audio: true
    }),
    signal: timeout.signal
  });

  if (!response.ok) {
    timeout.clear();
    throw new GradiumApiError("gradium_tts_failed", response.status, await readErrorDetails(response));
  }

  return { response, timeout, voiceId, outputFormat };
}

export async function synthesizeSpeech(request: GradiumTtsRequest, config = resolveGradiumConfig()): Promise<GradiumTtsResult> {
  const synthesis = await requestSynthesis(request, config);

  try {
    return {
      audio: await synthesis.response.arrayBuffer(),
      contentType: synthesis.response.headers.get("content-type") ?? audioAcceptHeader(synthesis.outputFormat).split(",")[0],
      voiceId: synthesis.voiceId,
      outputFormat: synthesis.outputFormat
    };
  } finally {
    synthesis.timeout.clear();
  }
}

export async function synthesizeSpeechStream(request: GradiumTtsRequest, config = resolveGradiumConfig()): Promise<GradiumTtsStreamResult> {
  const synthesis = await requestSynthesis(request, config);
  if (!synthesis.response.body) {
    synthesis.timeout.clear();
    throw new GradiumApiError("gradium_tts_empty_stream", 502);
  }

  return {
    body: streamWithTimeoutCleanup(synthesis.response.body, synthesis.timeout.clear),
    contentType: synthesis.response.headers.get("content-type") ?? audioAcceptHeader(synthesis.outputFormat).split(",")[0],
    voiceId: synthesis.voiceId,
    outputFormat: synthesis.outputFormat
  };
}

async function requestTranscription(audio: ArrayBuffer, contentType: string, config: GradiumConfig) {
  if (audio.byteLength === 0) {
    throw new GradiumApiError("empty_audio", 400);
  }

  const normalizedContentType = normalizeAudioContentType(contentType);
  const inputFormat = inputFormatForContentType(normalizedContentType);
  const timeout = withTimeout(config.timeoutMs);
  const url = new URL(`${config.baseUrl}/post/speech/asr`);
  if (inputFormat) {
    url.searchParams.set("input_format", inputFormat);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": normalizedContentType,
      Accept: "application/x-ndjson, application/json, text/plain",
      "x-api-key": config.apiKey
    },
    body: audio,
    signal: timeout.signal
  });

  if (!response.ok) {
    const details = await readErrorDetails(response);
    timeout.clear();
    throw new GradiumApiError("gradium_stt_failed", response.status, details);
  }

  return { response, timeout, inputFormat, contentType: normalizedContentType };
}

export async function transcribeAudio(audio: ArrayBuffer, contentType: string, config = resolveGradiumConfig()): Promise<GradiumTranscriptionResult> {
  const transcription = await requestTranscription(audio, contentType, config);

  try {
    const rawText = await transcription.response.text();
    const events = parseNdjson(rawText);
    const transcript = events.flatMap((event) => collectTranscriptionText(event)).join(" ").replace(/\s+/g, " ").trim();

    return {
      text: transcript || rawText.trim(),
      eventCount: events.length
    };
  } finally {
    transcription.timeout.clear();
  }
}

export async function transcribeAudioStream(audio: ArrayBuffer, contentType: string, config = resolveGradiumConfig()): Promise<GradiumTranscriptionStreamResult> {
  const transcription = await requestTranscription(audio, contentType, config);
  if (!transcription.response.body) {
    transcription.timeout.clear();
    throw new GradiumApiError("gradium_stt_empty_stream", 502);
  }

  return {
    body: streamWithTimeoutCleanup(transcription.response.body, transcription.timeout.clear),
    contentType: transcription.response.headers.get("content-type") ?? "application/x-ndjson",
    inputFormat: transcription.inputFormat
  };
}
