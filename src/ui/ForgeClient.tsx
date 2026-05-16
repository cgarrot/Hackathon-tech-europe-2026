"use client";

import type { ForgeResult } from "@/compiler/schemas";
import type { VoiceGameEvent, VoiceGamePublicSession } from "@/game-session/voice-game-engine";
import type { GeneratedProject } from "@/generator/schemas";
import type { GeneratedVisualSet } from "@/server/fal-visuals";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type SuccessResponse = {
  ok: true;
  mode: ProviderMode;
  warnings: string[];
  result: ForgeResult;
};

type ProviderMode = "openai" | "ollama";

type ErrorResponse = {
  ok: false;
  error: string;
  details?: unknown;
};

type ApiResponse = SuccessResponse | ErrorResponse;

type ProjectSuccessResponse = {
  ok: true;
  project: GeneratedProject;
};

type ProjectResponse = ProjectSuccessResponse | ErrorResponse;

type VisualsSuccessResponse = {
  ok: true;
  visualSet: GeneratedVisualSet;
};

type VisualsResponse = VisualsSuccessResponse | ErrorResponse;

type VoiceSessionSuccessResponse = {
  ok: true;
  session: VoiceGamePublicSession;
};

type VoiceSessionResponse = VoiceSessionSuccessResponse | ErrorResponse;

type VoiceSessionRunStatus = "idle" | "starting" | "speaking" | "listening" | "advancing" | "ended" | "error";

type ForgeProgressStage =
  | "intake"
  | "family_router"
  | "game_spec"
  | "artifact_package"
  | "validation";

type ForgeProgressEvent = {
  stage: ForgeProgressStage;
  status: "running" | "complete" | "skipped";
  detail?: string;
};

type ForgeStreamEvent =
  | { type: "progress"; progress: ForgeProgressEvent }
  | { type: "result"; ok: true; mode: ProviderMode; warnings: string[]; result: ForgeResult }
  | { type: "error"; ok: false; error: string; details?: unknown };

const loadingStageCopy: Record<ForgeProgressStage, { label: string; percent: number }> = {
  intake: { label: "Your idea becomes the promise of a session.", percent: 20 },
  family_router: { label: "The right game family locks in.", percent: 35 },
  game_spec: { label: "Rules lock into rhythm.", percent: 52 },
  artifact_package: { label: "Characters, cards, and scenes take shape.", percent: 72 },
  validation: { label: "The door opens.", percent: 100 }
};

const initialLoadingProgress = { label: "Connecting to the game forge.", percent: 4 };

const isDevelopmentMode = process.env.NODE_ENV === "development";
const devPromptWithoutStt =
  "Create a 4-player co-op haunted underwater-station game with secret roles, audio clues, and a final timed phase.";

const errorLabels: Record<string, string> = {
  invalid_llm_provider: "LLM_PROVIDER must be openai or ollama.",
  missing_llm_provider_configuration: "Configure a real LLM provider on the server before compiling.",
  missing_ollama_configuration: "Incomplete Ollama setup: add OLLAMA_API_KEY and OLLAMA_BASE_URL.",
  missing_openai_api_key: "Incomplete OpenAI setup: add OPENAI_API_KEY.",
  malformed_json: "The JSON sent to the API is invalid.",
  request_validation_error: "The request is invalid or too short.",
  compiler_schema_validation_failed: "The provider returned an invalid structure.",
  compiler_invariant_failed: "The generated package does not satisfy GameForge invariants.",
  rate_limit_exceeded: "Too many compile requests. Wait a few seconds and try again.",
  too_many_concurrent_requests: "A GameForge compile is already running on the server. Try again in a few seconds.",
  llm_provider_error: "The LLM provider failed. Retry or switch models.",
  generated_project_validation_failed: "The generated project manifest is invalid.",
  project_generation_failed: "Project manifest generation failed.",
  project_generation_network_error: "Could not reach the project generation API.",
  missing_gradium_api_key: "Set GRADIUM_API_KEY on the server to enable voice.",
  missing_gradium_voice_configuration: "Set GRADIUM_FR_VOICE_ID or GRADIUM_DEFAULT_VOICE_ID on the server for playback.",
  missing_audio_file: "No audio was received by the voice API.",
  empty_audio: "The recording is empty. Try again, speaking closer to the mic.",
  audio_too_large: "The recording is too long for this demo.",
  voice_recording_unsupported: "This browser does not support MediaRecorder audio capture.",
  voice_audio_transcode_unsupported: "This browser cannot convert microphone audio to WAV for Gradium.",
  voice_microphone_denied: "Could not access the microphone. Check browser permissions.",
  gradium_stt_failed: "Gradium STT rejected or failed transcription.",
  gradium_tts_failed: "Gradium TTS rejected or failed speech synthesis.",
  gradium_stt_route_failed: "The Gradium STT server route failed.",
  gradium_tts_route_failed: "The Gradium TTS server route failed.",
  too_many_concurrent_voice_requests: "A Gradium voice request is already in flight on the server.",
  voice_network_error: "Could not reach the voice API.",
  voice_session_not_found: "This voice session no longer exists. Start a new run.",
  voice_session_advance_failed: "Could not advance the voice session.",
  voice_session_start_failed: "Could not start the voice session.",
  voice_session_validation_failed: "The generated voice session is invalid.",
  network_error: "Could not reach the compile API."
};

function formatError(response: ErrorResponse) {
  return errorLabels[response.error] ?? response.error;
}

function providerModeLabel(mode: ProviderMode) {
  switch (mode) {
    case "ollama":
      return "Ollama Cloud";
    case "openai":
      return "OpenAI";
  }
}

async function readApiErrorResponse(response: Response, fallbackError: string): Promise<ErrorResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json() as unknown;
      if (isRecord(payload) && payload.ok === false && typeof payload.error === "string") {
        return { ok: false, error: payload.error, details: payload.details };
      }
    } catch {
      return { ok: false, error: fallbackError };
    }
  }

  const text = await response.text();
  return { ok: false, error: text || fallbackError };
}

async function readForgeStream(response: Response, onEvent: (event: ForgeStreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("network_error");
  }

  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }
      onEvent(JSON.parse(trimmedLine) as ForgeStreamEvent);
    }
  }

  const finalLine = `${pending}${decoder.decode()}`.trim();
  if (finalLine) {
    onEvent(JSON.parse(finalLine) as ForgeStreamEvent);
  }
}

type RoleOrActor = ForgeResult["gameSpec"]["rolesOrActors"][number];
type CardSpec = ForgeResult["package"]["cards"][number];
type AssetPrompt = ForgeResult["package"]["assetPrompts"][number];
type PersonaSpec = ForgeResult["package"]["personas"][number];
type PlayableEntityKind = "collectible" | "hazard" | "goal";

interface PlayablePoint {
  x: number;
  y: number;
}

interface PlayableEntity {
  id: string;
  kind: PlayableEntityKind;
  label: string;
  description: string;
  x: number;
  y: number;
  token: string;
}

interface PlayablePhase {
  id: string;
  name: string;
  purpose: string;
  allowedActions: string[];
  next: string;
}

interface PlayableRuntimeSpec {
  runtimeVersion: "1.0.0";
  sourceGameId: string;
  title: string;
  theme: string;
  objective: string;
  world: {
    width: number;
    height: number;
  };
  player: {
    label: string;
    token: "@";
    spawn: PlayablePoint;
  };
  entities: PlayableEntity[];
  phases: PlayablePhase[];
  rules: {
    collectibleCount: number;
  };
}

type PlayableRuntimeResult =
  | { ok: true; spec: PlayableRuntimeSpec }
  | { ok: false; errors: string[] };

function preferredRecordingMimeType() {
  const candidates = ["audio/ogg;codecs=opus", "audio/ogg", "audio/wav", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((candidate) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEventString(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string" ? value[key].trim() : "";
}

function collectEventText(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const directText = [readEventString(value, "text"), readEventString(value, "transcript")].filter((candidate) => candidate.length > 0);
  const alternatives = Array.isArray(value.alternatives)
    ? value.alternatives.flatMap((alternative) => collectEventText(alternative))
    : [];
  const resultTexts = Array.isArray(value.results)
    ? value.results.flatMap((result) => collectEventText(result))
    : [];

  return [...directText, ...alternatives, ...resultTexts];
}

function audioFileExtension(contentType: string) {
  if (contentType.includes("webm")) {
    return "webm";
  }

  if (contentType.includes("ogg")) {
    return "ogg";
  }

  if (contentType.includes("wav")) {
    return "wav";
  }

  if (contentType.includes("mp4")) {
    return "mp4";
  }

  return "webm";
}

function isGradiumSttCompatibleAudio(contentType: string) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  return normalized === "audio/wav" || normalized === "audio/ogg" || normalized === "audio/opus" || normalized === "audio/pcm";
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeAudioBufferAsWav(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataByteLength = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

async function transcodeAudioBlobToWav(audioBlob: Blob) {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    throw new Error("voice_audio_transcode_unsupported");
  }

  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    return new Blob([encodeAudioBufferAsWav(audioBuffer)], { type: "audio/wav" });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

function findCardForRole(cards: CardSpec[], roleId: string) {
  return cards.find((card) => card.roleOrActorId === roleId);
}

function findAssetForCard(assets: AssetPrompt[], card: CardSpec | undefined) {
  if (!card) {
    return undefined;
  }

  return assets.find((asset) => asset.id === card.assetId);
}

function readRequiredString(source: Record<string, unknown>, key: string, label: string, errors: string[]) {
  const value = source[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  errors.push(`${label} must be a non-empty string.`);
  return "";
}

function readBoundedInteger(value: unknown, label: string, errors: string[], min: number, max: number) {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }

  errors.push(`${label} must be an integer between ${min} and ${max}.`);
  return min;
}

function readPoint(value: unknown, label: string, errors: string[], world?: { width: number; height: number }): PlayablePoint {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object { x, y }.`);
    return { x: 0, y: 0 };
  }

  const maxX = world ? world.width - 1 : 40;
  const maxY = world ? world.height - 1 : 40;
  return {
    x: readBoundedInteger(value.x, `${label}.x`, errors, 0, maxX),
    y: readBoundedInteger(value.y, `${label}.y`, errors, 0, maxY)
  };
}

function parsePlayableEntity(value: unknown, index: number, errors: string[], world: { width: number; height: number }): PlayableEntity {
  if (!isRecord(value)) {
    errors.push(`entities[${index}] must be an object.`);
    return { id: `invalid_${index}`, kind: "hazard", label: "Invalid entity", description: "Entity ignored.", x: 0, y: 0, token: "?" };
  }

  const rawKind = value.kind;
  let kind: PlayableEntityKind = "hazard";
  if (rawKind === "collectible" || rawKind === "hazard" || rawKind === "goal") {
    kind = rawKind;
  } else {
    errors.push(`entities[${index}].kind is invalid.`);
  }

  return {
    id: readRequiredString(value, "id", `entities[${index}].id`, errors),
    kind,
    label: readRequiredString(value, "label", `entities[${index}].label`, errors),
    description: typeof value.description === "string" ? value.description : "",
    x: readBoundedInteger(value.x, `entities[${index}].x`, errors, 0, world.width - 1),
    y: readBoundedInteger(value.y, `entities[${index}].y`, errors, 0, world.height - 1),
    token: typeof value.token === "string" && value.token.length > 0 ? value.token.slice(0, 2) : "?"
  };
}

function parsePlayablePhase(value: unknown, index: number, errors: string[]): PlayablePhase {
  if (!isRecord(value)) {
    errors.push(`phases[${index}] must be an object.`);
    return { id: `phase_${index}`, name: "Invalid phase", purpose: "Phase ignored.", allowedActions: [], next: "" };
  }

  return {
    id: readRequiredString(value, "id", `phases[${index}].id`, errors),
    name: readRequiredString(value, "name", `phases[${index}].name`, errors),
    purpose: readRequiredString(value, "purpose", `phases[${index}].purpose`, errors),
    allowedActions: Array.isArray(value.allowedActions)
      ? value.allowedActions.filter((action): action is string => typeof action === "string" && action.trim().length > 0).slice(0, 8)
      : [],
    next: typeof value.next === "string" ? value.next : ""
  };
}

function parsePlayableRuntime(value: unknown): PlayableRuntimeResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Playable runtime must be a JSON object."] };
  }

  if (value.runtimeVersion !== "1.0.0") {
    errors.push("runtimeVersion must be 1.0.0.");
  }

  const worldSource = isRecord(value.world) ? value.world : {};
  if (!isRecord(value.world)) {
    errors.push("world must be an object.");
  }
  const world = {
    width: readBoundedInteger(worldSource.width, "world.width", errors, 4, 24),
    height: readBoundedInteger(worldSource.height, "world.height", errors, 4, 18)
  };

  const playerSource = isRecord(value.player) ? value.player : {};
  if (!isRecord(value.player)) {
    errors.push("player must be an object.");
  }
  const spawn = readPoint(playerSource.spawn, "player.spawn", errors, world);

  const entityValues = Array.isArray(value.entities) ? value.entities : [];
  if (!Array.isArray(value.entities)) {
    errors.push("entities must be an array.");
  }
  if (entityValues.length > 120) {
    errors.push("entities cannot exceed 120 entries.");
  }
  const entities = entityValues.slice(0, 120).map((entity, index) => parsePlayableEntity(entity, index, errors, world));
  const phaseValues = Array.isArray(value.phases) ? value.phases : [];
  if (!Array.isArray(value.phases)) {
    errors.push("phases must be an array.");
  }
  const phases = phaseValues.slice(0, 12).map((phase, index) => parsePlayablePhase(phase, index, errors));
  if (phases.length === 0) {
    errors.push("The voice runtime must include at least one phase.");
  }
  const ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) {
      errors.push(`Duplicate entity: ${entity.id}.`);
    }
    ids.add(entity.id);
  }

  const rulesSource = isRecord(value.rules) ? value.rules : {};
  if (!isRecord(value.rules)) {
    errors.push("rules must be an object.");
  }
  const collectibleCount = readBoundedInteger(rulesSource.collectibleCount, "rules.collectibleCount", errors, 1, 120);
  const actualCollectibles = entities.filter((entity) => entity.kind === "collectible").length;
  const goalCount = entities.filter((entity) => entity.kind === "goal").length;
  if (collectibleCount !== actualCollectibles) {
    errors.push("rules.collectibleCount must match the number of collectibles.");
  }
  if (goalCount !== 1) {
    errors.push("The runtime must contain exactly one goal exit.");
  }

  const spec: PlayableRuntimeSpec = {
    runtimeVersion: "1.0.0",
    sourceGameId: readRequiredString(value, "sourceGameId", "sourceGameId", errors),
    title: readRequiredString(value, "title", "title", errors),
    theme: readRequiredString(value, "theme", "theme", errors),
    objective: readRequiredString(value, "objective", "objective", errors),
    world,
    player: {
      label: readRequiredString(playerSource, "label", "player.label", errors),
      token: "@",
      spawn
    },
    entities,
    phases,
    rules: {
      collectibleCount
    }
  };

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}

function playableRuntimeFromProject(project: GeneratedProject | null): PlayableRuntimeResult | null {
  const runtimeFile = project?.files.find((file) => file.path === "data/playable-runtime.json");
  if (!runtimeFile) {
    return null;
  }

  try {
    return parsePlayableRuntime(JSON.parse(runtimeFile.content) as unknown);
  } catch {
    return { ok: false, errors: ["data/playable-runtime.json is not valid JSON."] };
  }
}

function roleInitial(role: RoleOrActor) {
  return role.name.trim().slice(0, 1).toUpperCase() || "?";
}

function RoleQuantity({ count, label }: { count: number; label: string }) {
  const visiblePips = Array.from({ length: Math.min(count, 5) }, (_, index) => index);

  return (
    <div className="role-card-pips" aria-label={`${count} cop${count > 1 ? "ies" : "y"} for ${label}`}>
      {visiblePips.map((pip) => <span key={pip} />)}
      {count > visiblePips.length ? <em>+{count - visiblePips.length}</em> : null}
    </div>
  );
}

function latestVisualEvent(session: VoiceGamePublicSession | null) {
  return session?.events.findLast((event) => event.visualCue) ?? null;
}

function latestVoiceEvent(session: VoiceGamePublicSession | null) {
  return session?.events.at(-1) ?? null;
}

function findActiveVoiceEvent(session: VoiceGamePublicSession | null, activeEventSequence: number | null) {
  if (!session || activeEventSequence === null) {
    return null;
  }

  return session.events.find((event) => event.sequence === activeEventSequence) ?? null;
}

function visualEventForCurrentStep(session: VoiceGamePublicSession | null, activeEventSequence: number | null) {
  const activeEvent = findActiveVoiceEvent(session, activeEventSequence);
  if (activeEvent?.visualCue) {
    return activeEvent;
  }

  if (!session) {
    return null;
  }

  if (activeEventSequence !== null) {
    return session.events.findLast((event) => Boolean(event.visualCue) && event.sequence <= activeEventSequence) ?? latestVisualEvent(session);
  }

  return latestVisualEvent(session);
}

function eventKindLabel(kind: VoiceGameEvent["kind"]) {
  switch (kind) {
    case "session_started":
      return "Start";
    case "phase_started":
      return "Phase";
    case "utterance":
      return "Line";
    case "visual_cue":
      return "Visual";
    case "input_window":
      return "Your turn";
    case "transcript_received":
      return "Reply";
    case "state_updated":
      return "State";
    case "game_ended":
      return "End";
  }
}

interface PlayerGuidancePhase {
  name: string;
  purpose: string;
  allowedActions: string[];
}

function friendlyActionLabel(action: string) {
  const normalized = action.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/werewolf|wolf|loup|kill|elimin/.test(normalized)) {
    return "Name a victim out loud";
  }
  if (/seer|voyante|inspect|scan|reveal/.test(normalized)) {
    return "Choose someone to inspect";
  }
  if (/witch|potion|heal|save|protect|guard/.test(normalized)) {
    return "Say who to protect or save";
  }
  if (/vote|voter/.test(normalized)) {
    return "Vote for a specific player";
  }
  if (/accuse|accus/.test(normalized)) {
    return "Accuse someone with a clear reason";
  }
  if (/defend|defendre|defense/.test(normalized)) {
    return "Defend yourself in one clear sentence";
  }
  if (/discuss|debate|talk|speak|discut|parler/.test(normalized)) {
    return "Share a clue or suspicion";
  }
  if (/answer|repond|reply/.test(normalized)) {
    return "Give your spoken answer";
  }
  if (/choice|choose|choisir|select/.test(normalized)) {
    return "Announce your choice clearly";
  }
  if (/search|collect|indice|clue|objectif/.test(normalized)) {
    return "Look for a clue or objective";
  }

  return `Do: ${action.replace(/[_-]+/g, " ")}`;
}

function uniqueActionHints(actions: string[]) {
  return Array.from(new Set(actions.map(friendlyActionLabel))).slice(0, 4);
}

function playerGuidanceFor(params: {
  phase: PlayerGuidancePhase | undefined;
  session: VoiceGamePublicSession | null;
  runStatus: VoiceSessionRunStatus;
  remainingSeconds: number;
  inputWindowIsLive: boolean;
}) {
  const actionHints = uniqueActionHints(params.phase?.allowedActions ?? []);
  const fallbackActions = actionHints.length > 0 ? actionHints : ["Listen to the scene", "Prepare a short decision"];
  const pendingPrompt = params.session?.pendingInput?.prompt;

  if (params.runStatus === "error") {
    return {
      tone: "danger",
      title: "Fix the issue",
      body: "Check the voice status, then restart once the problem is cleared.",
      actions: ["Read the error", "Retry after fixing"]
    };
  }

  if (params.runStatus === "ended") {
    return {
      tone: "done",
      title: "Session ended",
      body: "Read the live log to see how it wrapped up, or start again to replay.",
      actions: ["Review the log", "Start another run"]
    };
  }

  if (params.inputWindowIsLive && pendingPrompt) {
    return {
      tone: "live",
      title: "Speak now",
      body: `You have ${params.remainingSeconds}s: say one short phrase with your choice. ${pendingPrompt}`,
      actions: fallbackActions
    };
  }

  if (pendingPrompt) {
    return {
      tone: "prepare",
      title: "Prepare your line",
      body: "The mic opens after narration. Decide what you'll say—but don't speak yet.",
      actions: fallbackActions
    };
  }

  if (params.runStatus === "speaking") {
    return {
      tone: "listen",
      title: "Listen, then decide",
      body: "The host or an AI persona is speaking. Track names, clues, and accusations before your next reply.",
      actions: fallbackActions
    };
  }

  if (params.runStatus === "advancing") {
    return {
      tone: "wait",
      title: "Wait for resolution",
      body: "The engine is applying the last reply and gearing up for the next phase.",
      actions: ["Watch the log", "Prep the next beat"]
    };
  }

  if (params.runStatus === "starting") {
    return {
      tone: "wait",
      title: "Setting up the table",
      body: "The session starts. Wait for first instructions from the host.",
      actions: ["Wait for narration", "Scan public roles"]
    };
  }

  return {
    tone: "ready",
    title: params.session ? `Play the phase: ${params.phase?.name ?? "in progress"}` : "Start the session",
    body: params.session
      ? params.phase?.purpose ?? "Follow instructions for this phase."
      : "Click Start—this panel will spell out what to hear, rehearse, or say next.",
    actions: params.session ? fallbackActions : ["Click Start", "Follow your to-do strip"]
  };
}

function sessionStatusLabel(status: VoiceSessionRunStatus) {
  if (status === "starting") {
    return "starting";
  }
  if (status === "speaking") {
    return "speech playing";
  }
  if (status === "listening") {
    return "mic open";
  }
  if (status === "advancing") {
    return "waiting";
  }
  if (status === "ended") {
    return "done";
  }
  if (status === "error") {
    return "error";
  }
  return "ready";
}

function activeSpeakerTitle(params: {
  activeEvent: VoiceGameEvent | null;
  runStatus: VoiceSessionRunStatus;
  session: VoiceGamePublicSession | null;
}) {
  if (params.runStatus === "listening") {
    return `Your turn · ${params.session?.ownPlayer?.displayName ?? "Player"}`;
  }

  if (params.runStatus === "speaking" && params.activeEvent) {
    return `${params.activeEvent.speaker.displayName} is speaking`;
  }

  if (params.runStatus === "advancing") {
    return "Resolving the next beat";
  }

  if (params.activeEvent) {
    return `${eventKindLabel(params.activeEvent.kind)} · ${params.activeEvent.speaker.displayName}`;
  }

  return "Board ready";
}

function activeSpeakerBody(params: {
  activeEvent: VoiceGameEvent | null;
  runStatus: VoiceSessionRunStatus;
  session: VoiceGamePublicSession | null;
  activePhase: PlayerGuidancePhase | undefined;
}) {
  if (params.runStatus === "listening") {
    return params.session?.pendingInput?.prompt ?? "The mic is open. Say your answer now.";
  }

  return params.activeEvent?.text ?? params.activePhase?.purpose ?? "Start the session to see every action, line, and mic window live.";
}

function loadingProgress(progress: ForgeProgressEvent | null) {
  if (!progress) {
    return initialLoadingProgress;
  }

  return loadingStageCopy[progress.stage] ?? initialLoadingProgress;
}

function ForgeLoadingScreen({ prompt, progressEvent }: { prompt: string; progressEvent: ForgeProgressEvent | null }) {
  const progress = loadingProgress(progressEvent);

  return (
    <main className="prepare-overlay" aria-labelledby="build-label">
      <section className="prepare-screen" aria-live="polite">
        <div className="forge-visual prepare-visual" aria-hidden="true">
          <div className="forge-core" />
          <div className="forge-orbit orbit-one" />
          <div className="forge-orbit orbit-two" />
          <div className="forge-card card-one" />
          <div className="forge-card card-two" />
          <div className="forge-card card-three" />
        </div>

        <div className="prepare-message">
          <p className="eyebrow" id="prepare-eyebrow">Preparing</p>
          <h1 className="message-enter" id="build-label">{progress.label}</h1>
          <p>{prompt.trim() || "Forging voice request…"}</p>
        </div>

        <div className="prepare-progress">
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <span>{progress.percent}%</span>
        </div>
      </section>
    </main>
  );
}

function FalVisualStage({
  visualSet,
  isGenerating,
  error,
  fallbackTitle
}: {
  visualSet: GeneratedVisualSet | null;
  isGenerating: boolean;
  error: ErrorResponse | null;
  fallbackTitle: string;
}) {
  const assets = visualSet?.assets ?? [];
  const primaryAsset = assets.find((asset) => asset.sourceKind === "hero" || asset.sourceKind === "scene") ?? assets[0];
  const primaryImage = primaryAsset?.images[0];

  return (
    <div className="fal-visual-stage" aria-label="Visuels générés par fal">
      {primaryImage ? (
        <figure className="fal-primary-visual">
          <img src={primaryImage.url} alt={primaryAsset.title} />
          <figcaption>
            <span>fal · {primaryAsset.assetType}</span>
            <strong>{primaryAsset.title}</strong>
            <em>{primaryAsset.usage}</em>
          </figcaption>
        </figure>
      ) : (
        <div className={`fal-visual-placeholder${isGenerating ? " fal-visual-placeholder-live" : ""}`} role="status">
          <div className="voice-orb" aria-hidden="true" />
          <p className="eyebrow">fal visuals</p>
          <h2>{isGenerating ? "Génération des décors et cartes..." : fallbackTitle}</h2>
          <p>{error ? formatError(error) : "Les backgrounds, scènes et cartes de personnage apparaîtront ici."}</p>
        </div>
      )}

      {isGenerating && primaryImage ? <span className="fal-generation-pill">fal continue...</span> : null}
    </div>
  );
}

function primaryFalVisualAsset(visualSet: GeneratedVisualSet | null) {
  const assets = visualSet?.assets ?? [];
  return assets.find((asset) => asset.sourceKind === "hero" || asset.sourceKind === "scene") ?? assets[0];
}

function cssUrl(value: string) {
  return `url("${value.replaceAll('"', "%22")}")`;
}

function GeneratedGameFullscreen({
  result,
  mode,
  project,
  runtime,
  visualSet,
  isGeneratingVisuals,
  visualError,
  isGeneratingProject,
  session,
  runStatus,
  remainingSeconds,
  voiceMessage,
  voiceError,
  activeEventSequence,
  onStartVoiceGame,
  onEndVoiceInput,
  onGenerateVisuals,
  onSpeakPersona,
  speakingPersonaId,
  onGenerateProject,
  onDownloadPackage,
  onDownloadProject,
  onReset
}: {
  result: ForgeResult;
  mode: ProviderMode;
  project: GeneratedProject | null;
  runtime: PlayableRuntimeResult | null;
  visualSet: GeneratedVisualSet | null;
  isGeneratingVisuals: boolean;
  visualError: ErrorResponse | null;
  isGeneratingProject: boolean;
  session: VoiceGamePublicSession | null;
  runStatus: VoiceSessionRunStatus;
  remainingSeconds: number;
  voiceMessage: string | null;
  voiceError: ErrorResponse | null;
  activeEventSequence: number | null;
  onStartVoiceGame: () => void;
  onEndVoiceInput: () => void;
  onGenerateVisuals: () => void;
  onSpeakPersona: (persona: PersonaSpec) => void;
  speakingPersonaId: string | null;
  onGenerateProject: () => void;
  onDownloadPackage: () => void;
  onDownloadProject: () => void;
  onReset: () => void;
}) {
  const runtimeSpec = runtime?.ok ? runtime.spec : null;
  const activePhase = session?.activePhase ?? runtimeSpec?.phases[0] ?? result.gameSpec.phases[0];
  const activeEvent = findActiveVoiceEvent(session, activeEventSequence) ?? latestVoiceEvent(session);
  const activeVisual = visualEventForCurrentStep(session, activeEventSequence);
  const phaseSource = runtimeSpec?.phases ?? result.gameSpec.phases;
  const currentPhaseIndex = session ? phaseSource.findIndex((phase) => phase.id === session.activePhase.id) : 0;
  const phaseProgress = session
    ? `${Math.max(1, currentPhaseIndex + 1)}/${phaseSource.length}`
    : runtimeSpec ? `1/${runtimeSpec.phases.length}` : "setup";
  const inputWindowIsLive = runStatus === "listening";
  const playerGuidance = playerGuidanceFor({ phase: activePhase, session, runStatus, remainingSeconds, inputWindowIsLive });
  const speakerTitle = activeSpeakerTitle({ activeEvent, runStatus, session });
  const speakerBody = activeSpeakerBody({ activeEvent, runStatus, session, activePhase });
  const ownPlayer = session?.ownPlayer;
  const falBackgroundImage = primaryFalVisualAsset(visualSet)?.images[0]?.url;
  const gameBackgroundStyle = falBackgroundImage
    ? ({ "--gameforge-visual-background": cssUrl(falBackgroundImage) } as CSSProperties)
    : undefined;

  return (
    <main className="generated-game-fullscreen" style={gameBackgroundStyle} aria-labelledby="generated-game-title">
      <header className="generated-game-topbar">
        <div className="generated-topbar-shelf">
          <div className="generated-brand">
            <span aria-hidden="true">G</span>
            <strong>GameForge</strong>
          </div>
          <span className="generated-topbar-divider" aria-hidden="true" />
          <div className="generated-topbar-actions">
            <button type="button" onClick={onReset}>New game</button>
          </div>
        </div>
      </header>

      <section className="generated-game-stage">
        <div className="generated-game-copy">
          <p className="eyebrow">Game ready</p>
          <h1 id="generated-game-title">{result.gameSpec.title}</h1>
          <p>{result.gameSpec.pitch}</p>
          <div className="badges">
            <span className="badge">{result.gameSpec.players.total} players</span>
            <span className="badge">{result.gameSpec.players.ai} AI</span>
          </div>
        </div>

        <div className="generated-game-board-wrap">
          <div className="generated-live-banner" role="status" aria-live="polite">
            <span className={`generated-live-dot generated-live-dot-${runStatus}`} aria-hidden="true" />
            <div>
              <strong>{speakerTitle}</strong>
              <p>{speakerBody}</p>
            </div>
            <em>{session ? `round ${session.round} · phase ${phaseProgress}` : "visual backdrop"}</em>
          </div>
          <FalVisualStage
            visualSet={visualSet}
            isGenerating={isGeneratingVisuals}
            error={visualError}
            fallbackTitle={isGeneratingProject && !session ? "Preparing visual scaffold…" : activePhase?.name ?? result.gameSpec.title}
          />
          <div className="generated-board-legend" aria-label="fal visual status">
            <span><strong>fal</strong> {visualSet?.model ?? "flux/schnell"}</span>
            <span><strong>{visualSet?.assets.length ?? 0}</strong> assets</span>
            <span><strong>{falBackgroundImage ? "background" : "pending"}</strong> page image</span>
            <button type="button" className="secondary" onClick={onGenerateVisuals} disabled={isGeneratingVisuals}>
              {isGeneratingVisuals ? "fal..." : "Regenerate fal"}
            </button>
          </div>
        </div>

        <aside className="generated-game-hud" aria-label="Session controls">
          <section className={`generated-hud-card generated-player-brief generated-player-brief-${playerGuidance.tone}`}>
            <span className="preview-label">Do next</span>
            <h2>{playerGuidance.title}</h2>
            <p>{playerGuidance.body}</p>
            <div className="generated-player-actions" aria-label="Suggested actions">
              {playerGuidance.actions.map((action, index) => <span key={`${action}-${index}`}>{action}</span>)}
            </div>
            {inputWindowIsLive ? (
              <button type="button" className="voice-end-button" onClick={onEndVoiceInput}>
                End speech
              </button>
            ) : null}
          </section>

          {ownPlayer ? (
            <section className="generated-hud-card generated-self-role" aria-label="Your role">
              <span className="preview-label">Your role</span>
              <h2>{ownPlayer.roleName}</h2>
              <p>{ownPlayer.displayName} · objective: {ownPlayer.objective}</p>
            </section>
          ) : null}

          <section className={`generated-hud-card generated-speaker-card generated-speaker-card-${runStatus}`} aria-live="polite">
            <span className="preview-label">{inputWindowIsLive ? "Your turn" : "Active speaker"}</span>
            <h2>{speakerTitle}</h2>
            <p>{speakerBody}</p>
          </section>

          <section className="generated-hud-card generated-phase-card">
            <span className="preview-label">Active phase</span>
            <h2>{activePhase?.name ?? "Generated phase"}</h2>
            <p>{activeVisual?.text ?? activePhase?.purpose ?? result.gameSpec.coreLoop[0]}</p>
            <div className="inline-play-stats">
              <span>{sessionStatusLabel(runStatus)}</span>
              <span>{activePhase?.name ?? "generated phase"}</span>
              <span>{runStatus === "listening" ? `${remainingSeconds}s voice` : session ? `round ${session.round}` : "ready"}</span>
              <span>phase {phaseProgress}</span>
            </div>
            {session?.pendingInput ? (
              <div className={`generated-input-window${inputWindowIsLive ? " generated-input-window-live" : ""}`} role="status">
                <strong>{inputWindowIsLive ? "Mic open" : "Voice window soon"}</strong>
                <span>{session.pendingInput.prompt}</span>
                {inputWindowIsLive ? (
                  <button type="button" className="voice-end-button voice-end-button-compact" onClick={onEndVoiceInput}>
                    End speech
                  </button>
                ) : null}
              </div>
            ) : null}
            <button type="button" onClick={onStartVoiceGame} disabled={runStatus === "starting" || runStatus === "speaking" || runStatus === "listening" || runStatus === "advancing"}>
              {runStatus === "ended" ? "Restart session" : runStatus === "idle" || runStatus === "error" ? "Start" : "Session running..."}
            </button>
          </section>

          {runtime && !runtime.ok ? (
            <section className="generated-hud-card generated-runtime-errors" role="alert">
              <span className="preview-label">Visual board</span>
              <strong>Board unavailable</strong>
              <p>The voice loop still plays. Technical details remain in the panel below.</p>
            </section>
          ) : null}

          {visualError ? (
            <section className="generated-hud-card generated-runtime-errors" role="alert">
              <span className="preview-label">fal visuels</span>
              <ul><li>{formatError(visualError)}</li></ul>
            </section>
          ) : null}

          {voiceMessage || voiceError ? (
            <section className={`generated-hud-card generated-voice-status${voiceError ? " generated-voice-status-error" : ""}`} role={voiceError ? "alert" : "status"}>
              <span className="preview-label">Voice status</span>
              <strong>{voiceError ? "Blocked" : sessionStatusLabel(runStatus)}</strong>
              <p>{voiceError ? formatError(voiceError) : voiceMessage}</p>
            </section>
          ) : null}

          <section className="generated-hud-card generated-event-log">
            <span className="preview-label">Current beat</span>
            <ol>
              {activeEvent ? (
                <li className="generated-event-current" key={activeEvent.id}>
                  <em>{String(activeEvent.sequence).padStart(2, "0")} · {eventKindLabel(activeEvent.kind)}</em>
                  <strong>{activeEvent.speaker.displayName}</strong>
                  <span>{activeEvent.text}</span>
                </li>
              ) : (
                <li>
                  <strong>Ready</strong>
                  <span>Start the session to track the active voice beat here.</span>
                </li>
              )}
            </ol>
          </section>
        </aside>
      </section>

      <details className="generated-debug-drawer">
        <summary>Technical details & exports</summary>
        <div className="generated-debug-grid">
          <section className="generated-hud-card generated-export-panel">
            <span className="preview-label">Advanced actions</span>
            <div className="generated-export-actions">
              <button type="button" className="secondary" onClick={onDownloadPackage}>Download JSON</button>
              <button type="button" className="secondary" onClick={onGenerateProject} disabled={isGeneratingProject}>{isGeneratingProject ? "Project…" : "Regenerate project"}</button>
              <button type="button" className="secondary" onClick={onDownloadProject} disabled={!project}>Download project</button>
            </div>
            <div className="badges">
              <span className="badge">Provider: {providerModeLabel(mode)}</span>
              <span className="badge">{result.gameSpec.family}</span>
              <span className="badge">{result.gameSpec.pack}</span>
            </div>
          </section>
          <PlayableRuntimePreview
            result={result}
            runtime={runtime}
            isLoading={isGeneratingProject}
            session={session}
            runStatus={runStatus}
            remainingSeconds={remainingSeconds}
            activeEventSequence={activeEventSequence}
            onStart={onStartVoiceGame}
            onEndVoiceInput={onEndVoiceInput}
          />
          <GameSupportPreview
            result={result}
            project={project ?? undefined}
            onSpeakPersona={onSpeakPersona}
            speakingPersonaId={speakingPersonaId}
          />
          <PackageFacts result={result} />
          <div className="card json-details">
            <h3>Validated Forge JSON</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      </details>
    </main>
  );
}

function PlayableRuntimePreview({
  result,
  runtime,
  isLoading,
  session,
  runStatus,
  remainingSeconds,
  activeEventSequence,
  onStart,
  onEndVoiceInput
}: {
  result: ForgeResult | null;
  runtime: PlayableRuntimeResult | null;
  isLoading: boolean;
  session: VoiceGamePublicSession | null;
  runStatus: VoiceSessionRunStatus;
  remainingSeconds: number;
  activeEventSequence: number | null;
  onStart: () => void;
  onEndVoiceInput: () => void;
}) {
  const activeEvent = findActiveVoiceEvent(session, activeEventSequence) ?? latestVoiceEvent(session);
  const activeVisual = visualEventForCurrentStep(session, activeEventSequence);
  const activePhase = session?.activePhase;
  const recentEvents = session?.events.slice(-8).reverse() ?? [];
  const storyboardEvents = session?.events.filter((event) => event.visualCue).slice(-8) ?? [];
  const isRunning = runStatus === "starting" || runStatus === "speaking" || runStatus === "listening" || runStatus === "advancing";
  const startDisabled = !result || isLoading || isRunning;
  const runtimeTitle = runtime?.ok ? runtime.spec.title : result?.gameSpec.title;
  const runtimeObjective = runtime?.ok ? runtime.spec.objective : result?.gameSpec.pitch;

  return (
    <section className="inline-playable card" aria-labelledby="inline-playable-title">
      <span className="preview-label">Auto voice demo · Gradium TTS/STT</span>
      <h3 id="inline-playable-title">One-tap hosted session</h3>
      {isLoading ? <p className="hint">Building playable manifest…</p> : null}
      {!result && !isLoading ? <p className="hint">Compile a game—the voice loop appears here automatically, no downloads required.</p> : null}
      {result ? <p className="hint"><strong>{runtimeTitle}</strong> — {runtimeObjective}</p> : null}
      {runtime && !runtime.ok ? (
        <div className="inline-playable-error" role="alert">
          <strong>Playable scaffold needs edits</strong>
          <ul>{runtime.errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      ) : null}
      <div className="inline-playable-layout voice-runtime-layout">
        <div className={`voice-stage voice-session-stage voice-session-${runStatus}`} aria-label="Animated visual backdrop">
          <div className="voice-orb" aria-hidden="true" />
          <p className="eyebrow">Visual animation</p>
          <h4>{activePhase?.name ?? result?.gameSpec.title ?? "Voice session"}</h4>
          <p>{activeEvent?.text ?? activeVisual?.text ?? activePhase?.purpose ?? "Tap Start—the server rolls phases automatically once you begin."}</p>
          <div className="voice-actors">
            {(session?.participants ?? []).slice(0, 8).map((participant) => (
              <span className={participant.alive ? undefined : "inactive-actor"} key={participant.id} title={participant.displayName}>
                {participant.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <aside className="inline-play-controls voice-controls">
          <div className="inline-play-stats">
            <span>{sessionStatusLabel(runStatus)}</span>
            <span>round {session?.round ?? 1}</span>
            <span>{runStatus === "listening" ? `${remainingSeconds}s voice` : session?.pendingInput ? "window ready" : "auto"}</span>
          </div>
          <button type="button" onClick={onStart} disabled={startDisabled}>
            {session?.status === "ended" || runStatus === "ended" ? "Restart session" : isRunning ? "Session running…" : "Start session"}
          </button>
          <p className="hint">
            After Start the server phases advance, Gradium reads each line aloud, then the mic opens only during voice windows.
          </p>
          {session?.pendingInput ? (
            <p className={`voice-input-prompt${runStatus === "listening" ? " voice-input-prompt-live" : ""}`}>
              {runStatus === "listening" ? session.pendingInput.prompt : `Up next: ${session.pendingInput.prompt}`}
            </p>
          ) : null}
          {runStatus === "listening" ? (
            <button type="button" className="voice-end-button" onClick={onEndVoiceInput}>
              End speech
            </button>
          ) : null}
        </aside>

        <div className="video-output-panel" aria-label="Generated video storyboard">
          <span className="preview-label">Video storyboard</span>
          <ol>
            {storyboardEvents.length > 0 ? storyboardEvents.map((event) => (
              <li className={event.sequence === activeVisual?.sequence ? "active-video-step" : ""} key={event.id}>
                <strong>{String(event.sequence).padStart(2, "0")} · {event.visualCue?.scene ?? event.phaseId ?? "scene"}</strong>
                <span>{event.visualCue?.mood ?? event.text}</span>
              </li>
            )) : <li><strong>00 · Waiting</strong><span>The storyboard fills in after launch.</span></li>}
          </ol>
        </div>

        <ol className="inline-play-log inline-play-log-full-width" aria-label="Generated session log">
          {recentEvents.length > 0 ? recentEvents.map((event) => (
            <li className={event.sequence === activeEventSequence ? "generated-event-current" : undefined} key={event.id}>
              <strong>{event.speaker.displayName}</strong>
              <span>{event.text}</span>
            </li>
          )) : <li>The voice log will appear here once you tap Start.</li>}
        </ol>
      </div>
    </section>
  );
}

function GameSupportPreview({
  result,
  project,
  onSpeakPersona,
  speakingPersonaId
}: {
  result: ForgeResult;
  project?: GeneratedProject;
  onSpeakPersona: (persona: PersonaSpec) => void;
  speakingPersonaId: string | null;
}) {
  const { gameSpec } = result;
  const heroAsset = result.package.assetPrompts.find((asset) => asset.kind === "hero") ?? result.package.assetPrompts[0];
  const visibleRoles = gameSpec.rolesOrActors.slice(0, 8);
  const visiblePhases = gameSpec.phases.slice(0, 6);
  const visiblePersonas = result.package.personas.slice(0, 3);
  const roleTotal = gameSpec.rolesOrActors.reduce((total, role) => total + role.count, 0);

  return (
    <section className="tabletop-preview" aria-label="Tabletop support preview">
      <div className="preview-hero">
        <div>
          <p className="eyebrow">Tabletop support · cards, board, phases</p>
          <h3>{gameSpec.title}</h3>
          <p>{gameSpec.pitch}</p>
          <div className="badges">
            <span className="badge">{gameSpec.family}</span>
            <span className="badge">{gameSpec.pack}</span>
            <span className="badge">{roleTotal} roles dealt</span>
          </div>
        </div>
        <div className="preview-stat-stack" aria-label="Player lineup">
          <div><strong>{gameSpec.players.total}</strong><span>players</span></div>
          <div><strong>{gameSpec.players.humans}</strong><span>humans</span></div>
          <div><strong>{gameSpec.players.ai}</strong><span>AI</span></div>
        </div>
      </div>

      <div className="tabletop-board">
        <article className="board-mat" aria-label="Play surface preview">
          <div className="moon-dial">
            <span>{gameSpec.pack}</span>
            <strong>{gameSpec.players.total}</strong>
          </div>
          <div className="board-notes">
            <span className="preview-label">Quick board</span>
            <h4>{gameSpec.theme}</h4>
            <p>{heroAsset?.prompt ?? `Build a cohesive visual identity for ${gameSpec.theme}.`}</p>
          </div>
        </article>

        <article className="phase-panel">
          <span className="preview-label">Phase track</span>
          <ol className="phase-track">
            {visiblePhases.map((phase, index) => (
              <li className="phase-step" key={phase.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{phase.name}</strong>
                  <p>{phase.purpose}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <div>
        <div className="preview-section-heading">
          <h4>Role cards ready to play</h4>
          <span>{gameSpec.rolesOrActors.length} roles · {result.package.cards.length} cards</span>
        </div>
        <div className="support-card-grid">
          {visibleRoles.map((role) => {
            const card = findCardForRole(result.package.cards, role.id);
            const asset = findAssetForCard(result.package.assetPrompts, card);

            return (
              <article className="support-role-card" key={role.id}>
                <div className="role-card-top">
                  <span className="role-seal">{roleInitial(role)}</span>
                  <RoleQuantity count={role.count} label={role.name} />
                </div>
                <p className="card-kicker">{role.teamOrSide}</p>
                <h4>{card?.name ?? role.name}</h4>
                <span>{card?.frontText ?? role.publicDescription}</span>
                <small>{card?.privateReminder ?? role.privateGoal}</small>
                {asset ? <em className="asset-note">Linked visual prompt · {asset.usage}</em> : null}
              </article>
            );
          })}
        </div>
      </div>

      <div className="preview-grid">
        <article className="preview-card preview-card-strong">
          <span className="preview-label">Game loop</span>
          <ol className="preview-steps">
            {gameSpec.coreLoop.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </article>
        <article className="preview-card">
          <span className="preview-label">Win conditions</span>
          <ul className="preview-list">
            {gameSpec.winConditions.map((condition) => (
              <li key={condition}>
                <strong>Goal</strong>
                <span>{condition}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="preview-grid">
        <article className="preview-card">
          <span className="preview-label">AI personas</span>
          <ul className="preview-list">
            {visiblePersonas.map((persona) => (
              <li key={persona.id}>
                <div>
                  <strong>{persona.displayName}</strong>
                  <span>{persona.speechStyle}</span>
                </div>
                <button
                  type="button"
                  className="secondary voice-play-button"
                  onClick={() => onSpeakPersona(persona)}
                  disabled={speakingPersonaId !== null}
                >
                  {speakingPersonaId === persona.id ? "Playing…" : "Play"}
                </button>
              </li>
            ))}
          </ul>
        </article>
        <article className="preview-card">
          <span className="preview-label">Plug-in assets</span>
          <p className="hint">
            {result.package.assetPrompts.length} visual/audio prompts structured; voices with `kind=voice` route to Gradium through the manifest and server APIs.
          </p>
        </article>
      </div>

      {project ? (
        <div className="manifest-list project-manifest-secondary">
          <div className="preview-section-heading">
            <h4>Exported project manifest</h4>
            <span>{project.files.length} static files</span>
          </div>
          <ul className="pipeline">
            {project.files.map((file) => (
              <li key={file.path}><span>{file.path}</span><span>{file.kind}</span></li>
            ))}
          </ul>
          <p className="hint">Secondary detail: manifest shows only after `/api/generate-project`; generated TSX/CSS remains a downloadable artifact and is never executed by this API.</p>
        </div>
      ) : null}
    </section>
  );
}

function PackageFacts({ result }: { result: ForgeResult }) {
  return (
    <div className="preview-grid">
      <article className="preview-card">
        <span className="preview-label">Pipeline</span>
        <ul className="pipeline">
          {result.pipeline.map((step) => (
            <li key={step.stage}><span>{step.stage}</span><span>{step.status}</span></li>
          ))}
        </ul>
      </article>
      <article className="preview-card">
        <span className="preview-label">Artifacts</span>
        <ul className="preview-list">
          <li><strong>{result.package.cards.length} cards</strong><span>Role aids</span></li>
          <li><strong>{result.package.personas.length} personas</strong><span>Client-only AI cast</span></li>
          <li><strong>{result.package.assetPrompts.length} prompts</strong><span>Visual + Gradium voice directions</span></li>
          <li><strong>{result.package.codeStubs.length} stubs</strong><span>Reviewable snippets, never executed server-side</span></li>
        </ul>
      </article>
    </div>
  );
}

export function ForgeClient() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [projectResponse, setProjectResponse] = useState<ProjectResponse | null>(null);
  const [visualsResponse, setVisualsResponse] = useState<VisualsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [isStartingPromptRecording, setIsStartingPromptRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<ErrorResponse | null>(null);
  const [speakingPersonaId, setSpeakingPersonaId] = useState<string | null>(null);
  const [forgeProgress, setForgeProgress] = useState<ForgeProgressEvent | null>(null);
  const [voiceSession, setVoiceSession] = useState<VoiceGamePublicSession | null>(null);
  const [voiceSessionStatus, setVoiceSessionStatus] = useState<VoiceSessionRunStatus>("idle");
  const [voiceWindowRemaining, setVoiceWindowRemaining] = useState(0);
  const [activeVoiceEventSequence, setActiveVoiceEventSequence] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const promptRecordingStartingRef = useRef(false);
  const voiceSessionRunningRef = useRef(false);
  const processedVoiceEventSequenceRef = useRef(0);

  const result = response?.ok ? response.result : null;
  const providerMode = response?.ok ? response.mode : null;
  const generatedProject = projectResponse?.ok ? projectResponse.project : null;
  const generatedVisualSet = visualsResponse?.ok ? visualsResponse.visualSet : null;
  const visualError = visualsResponse && !visualsResponse.ok ? visualsResponse : null;
  const playableRuntime = useMemo(() => playableRuntimeFromProject(generatedProject), [generatedProject]);
  const isPromptVoiceBusy = isStartingPromptRecording || isRecording || isTranscribing;
  const voiceSessionBusy = voiceSessionStatus === "starting" || voiceSessionStatus === "speaking" || voiceSessionStatus === "listening" || voiceSessionStatus === "advancing";

  useEffect(() => {
    return () => {
      voiceSessionRunningRef.current = false;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      activeAudioRef.current?.pause();
    };
  }, []);

  async function transcribeAudioBlob(audioBlob: Blob, label: string) {
    setIsTranscribing(true);
    setVoiceError(null);
    setVoiceMessage(`${label}: streaming Gradium transcription…`);

    try {
      const gradiumAudioBlob = isGradiumSttCompatibleAudio(audioBlob.type)
        ? audioBlob
        : await transcodeAudioBlobToWav(audioBlob);

      if (gradiumAudioBlob !== audioBlob) {
        setVoiceMessage(`${label}: converting audio to WAV for Gradium…`);
      }

      const formData = new FormData();
      formData.append("audio", gradiumAudioBlob, `gameforge-prompt.${audioFileExtension(gradiumAudioBlob.type)}`);
      const apiResponse = await fetch("/api/voice/stt?stream=1", {
        method: "POST",
        body: formData
      });

      if (!apiResponse.ok) {
        const errorResponse = await readApiErrorResponse(apiResponse, "gradium_stt_failed");
        setVoiceError(errorResponse);
        setVoiceMessage(null);
        return null;
      }

      const reader = apiResponse.body?.getReader();
      if (!reader) {
        setVoiceError({ ok: false, error: "gradium_stt_failed" });
        setVoiceMessage(null);
        return null;
      }

      const decoder = new TextDecoder();
      const transcriptChunks: string[] = [];
      let pending = "";
      let eventCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) {
            continue;
          }

          eventCount += 1;
          try {
            const event = JSON.parse(trimmedLine) as unknown;
            const eventText = collectEventText(event).join(" ").trim();
            if (eventText) {
              transcriptChunks.push(eventText);
              setVoiceMessage(`${label}: ${eventText}`);
            }
          } catch {
            transcriptChunks.push(trimmedLine);
            setVoiceMessage(`${label}: ${trimmedLine}`);
          }
        }
      }

      const flushed = decoder.decode().trim();
      const finalLine = `${pending}${flushed}`.trim();
      if (finalLine) {
        eventCount += 1;
        try {
          const event = JSON.parse(finalLine) as unknown;
          transcriptChunks.push(...collectEventText(event));
        } catch {
          transcriptChunks.push(finalLine);
        }
      }

      const transcript = transcriptChunks.join(" ").replace(/\s+/g, " ").trim();
      if (!transcript) {
        setVoiceError({ ok: false, error: "empty_audio" });
        setVoiceMessage(null);
        return null;
      }

      setVoiceMessage(`${label}: transcript received (${eventCount} event${eventCount !== 1 ? "s" : ""}).`);
      return transcript;
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_network_error" });
      setVoiceMessage(null);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }

  async function transcribePromptAudio(audioBlob: Blob) {
    const transcript = await transcribeAudioBlob(audioBlob, "Prompt dictation");
    if (!transcript) {
      return;
    }

    setPrompt(transcript.trim());
    setIsEditingPrompt(false);
    setVoiceMessage("Voice request ready—generate whenever you’re set.");
  }

  async function startRecording() {
    if (promptRecordingStartingRef.current || isRecording || isTranscribing) {
      return;
    }

    promptRecordingStartingRef.current = true;
    setIsStartingPromptRecording(true);

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      promptRecordingStartingRef.current = false;
      setIsStartingPromptRecording(false);
      setVoiceError({ ok: false, error: "voice_recording_unsupported" });
      return;
    }

    setVoiceError(null);
    setVoiceMessage("Mic is live—talk, then hit Stop.");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void transcribePromptAudio(blob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_microphone_denied" });
      setVoiceMessage(null);
    } finally {
      promptRecordingStartingRef.current = false;
      setIsStartingPromptRecording(false);
    }
  }

  function stopRecording(message = "Recording sent to Gradium…") {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setVoiceMessage(message);
    }
  }

  function endVoiceInputEarly() {
    stopRecording("End speech: sending your answer to Gradium…");
  }

  async function playAudioBlob(audioBlob: Blob) {
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;

    const objectUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(objectUrl);
    let cleanedUp = false;
    const cleanup = () => {
      if (!cleanedUp) {
        URL.revokeObjectURL(objectUrl);
        cleanedUp = true;
      }
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
      }
    };

    activeAudioRef.current = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("gradium_tts_failed"));
      };
      audio.play().catch((error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error("gradium_tts_failed"));
      });
    });
  }

  async function playTtsText(params: {
    text: string;
    label: string;
    language: string;
    personaId?: string;
    speakerId?: string;
    speechStyle?: string;
  }) {
    const speakingId = params.personaId ?? params.speakerId ?? null;
    setSpeakingPersonaId(speakingId);
    setVoiceError(null);
    setVoiceMessage(`Gradium synth for ${params.label}…`);

    try {
      const apiResponse = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: params.text.slice(0, 1200),
          personaId: params.personaId,
          speechStyle: params.speechStyle,
          language: params.language,
          outputFormat: "wav"
        })
      });

      if (!apiResponse.ok) {
        const errorResponse = await readApiErrorResponse(apiResponse, "gradium_tts_failed");
        setVoiceError(errorResponse);
        setVoiceMessage(null);
        setSpeakingPersonaId(null);
        return false;
      }

      const audioBlob = await apiResponse.blob();
      await playAudioBlob(audioBlob);
      setVoiceMessage(`Playback finished for ${params.label}.`);
      return true;
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_network_error" });
      setVoiceMessage(null);
      return false;
    } finally {
      setSpeakingPersonaId(null);
    }
  }

  async function speakPersona(persona: PersonaSpec) {
    const line = persona.sampleLines[0] ?? persona.publicBackstory;
    await playTtsText({
      text: line,
      label: persona.displayName,
      language: result?.intake.language ?? "en",
      personaId: persona.id,
      speechStyle: persona.speechStyle
    });
  }

  async function recordTimedVoiceInput(durationSec: number) {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError({ ok: false, error: "voice_recording_unsupported" });
      return null;
    }

    const boundedDurationSec = Math.min(30, Math.max(3, durationSec));
    setVoiceError(null);
    setVoiceMessage(`Mic open ${boundedDurationSec}s—speak now.`);
    setVoiceWindowRemaining(boundedDurationSec);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;

      return await new Promise<Blob | null>((resolve) => {
        let countdown = boundedDurationSec;
        const timers: { intervalId?: number; timeoutId?: number } = {};
        let settled = false;

        const finish = (blob: Blob | null) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timers.intervalId !== undefined) {
            window.clearInterval(timers.intervalId);
          }
          if (timers.timeoutId !== undefined) {
            window.clearTimeout(timers.timeoutId);
          }
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          setIsRecording(false);
          setVoiceWindowRemaining(0);
          resolve(blob);
        };

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          const blob = chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null;
          finish(blob);
        };

        recorder.onerror = () => {
          setVoiceError({ ok: false, error: "voice_recording_unsupported" });
          setVoiceMessage(null);
          finish(null);
        };

        recorder.start();
        setIsRecording(true);
        timers.intervalId = window.setInterval(() => {
          countdown = Math.max(0, countdown - 1);
          setVoiceWindowRemaining(countdown);
        }, 1000);
        timers.timeoutId = window.setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          } else {
            finish(null);
          }
        }, boundedDurationSec * 1000);
      });
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_microphone_denied" });
      setVoiceMessage(null);
      setIsRecording(false);
      setVoiceWindowRemaining(0);
      return null;
    }
  }

  async function startVoiceSessionFromApi(forgeResult: ForgeResult) {
    const apiResponse = await fetch("/api/game-session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forgeResult })
    });

    if (!apiResponse.ok) {
      setVoiceError(await readApiErrorResponse(apiResponse, "voice_session_start_failed"));
      return null;
    }

    const json = (await apiResponse.json()) as VoiceSessionResponse;
    if (!json.ok) {
      setVoiceError(json);
      return null;
    }

    return json.session;
  }

  async function advanceVoiceSessionFromApi(sessionId: string, input: { transcript?: string; participantId?: string }) {
    const apiResponse = await fetch(`/api/game-session/${encodeURIComponent(sessionId)}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!apiResponse.ok) {
      setVoiceError(await readApiErrorResponse(apiResponse, "voice_session_advance_failed"));
      return null;
    }

    const json = (await apiResponse.json()) as VoiceSessionResponse;
    if (!json.ok) {
      setVoiceError(json);
      return null;
    }

    return json.session;
  }

  async function handleVoiceInputWindow(event: VoiceGameEvent, language: string) {
    const promptSpoken = await playTtsText({
      text: event.text,
      label: event.speaker.displayName,
      language,
      speakerId: event.speaker.id,
      speechStyle: event.speaker.speechStyle
    });
    if (!promptSpoken) {
      return null;
    }

    setVoiceSessionStatus("listening");
    const audioBlob = await recordTimedVoiceInput(event.durationSec ?? 20);
    if (!audioBlob || audioBlob.size === 0) {
      return null;
    }

    return transcribeAudioBlob(audioBlob, "Voice window");
  }

  async function runVoiceGameSession(initialSession: VoiceGamePublicSession) {
    voiceSessionRunningRef.current = true;
    let currentSession = initialSession;

    try {
      while (voiceSessionRunningRef.current) {
        const newEvents = currentSession.events
          .filter((event) => event.sequence > processedVoiceEventSequenceRef.current)
          .sort((left, right) => left.sequence - right.sequence);
        if (newEvents.length === 0) {
          setVoiceError({ ok: false, error: "voice_session_advance_failed", details: "No new events to process." });
          setVoiceSessionStatus("error");
          voiceSessionRunningRef.current = false;
          return;
        }

        let inputWindowReached = false;
        let transcript: string | null = null;

        for (const event of newEvents) {
          if (!voiceSessionRunningRef.current) {
            return;
          }
          processedVoiceEventSequenceRef.current = Math.max(processedVoiceEventSequenceRef.current, event.sequence);
          setActiveVoiceEventSequence(event.sequence);

          if (event.kind === "utterance" || event.kind === "game_ended") {
            setVoiceSessionStatus("speaking");
            const spoken = await playTtsText({
              text: event.text,
              label: event.speaker.displayName,
              language: currentSession.language,
              personaId: event.speaker.personaId,
              speakerId: event.speaker.id,
              speechStyle: event.speaker.speechStyle
            });
            if (!spoken) {
              setVoiceSessionStatus("error");
              voiceSessionRunningRef.current = false;
              return;
            }
          }

          if (event.kind === "input_window") {
            inputWindowReached = true;
            transcript = await handleVoiceInputWindow(event, currentSession.language);
          }
        }

        if (!voiceSessionRunningRef.current) {
          return;
        }

        if (currentSession.status === "ended") {
          setVoiceSessionStatus("ended");
          voiceSessionRunningRef.current = false;
          return;
        }

        setVoiceSessionStatus("advancing");
        const advanceInput: { transcript?: string; participantId?: string } = inputWindowReached
          ? { participantId: "human_1", ...(transcript ? { transcript } : {}) }
          : {};
        const advancedSession = await advanceVoiceSessionFromApi(
          currentSession.sessionId,
          advanceInput
        );
        if (!advancedSession) {
          setVoiceSessionStatus("error");
          voiceSessionRunningRef.current = false;
          return;
        }

        currentSession = advancedSession;
        setVoiceSession(advancedSession);
      }
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_network_error" });
      setVoiceMessage(null);
      setVoiceSessionStatus("error");
      voiceSessionRunningRef.current = false;
    }
  }

  async function startVoiceGameSession() {
    if (!result) {
      return;
    }

    voiceSessionRunningRef.current = false;
    activeAudioRef.current?.pause();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    processedVoiceEventSequenceRef.current = 0;
    setActiveVoiceEventSequence(null);
    setVoiceSession(null);
    setVoiceError(null);
    setVoiceMessage("Starting server voice session…");
    setVoiceSessionStatus("starting");

    try {
      const session = await startVoiceSessionFromApi(result);
      if (!session) {
        setVoiceSessionStatus("error");
        return;
      }

      setVoiceSession(session);
      void runVoiceGameSession(session);
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_session_start_failed" });
      setVoiceSessionStatus("error");
      setVoiceMessage(null);
    }
  }

  async function generateProjectForResult(forgeResult: ForgeResult, resetProject: boolean) {
    setIsGeneratingProject(true);
    if (resetProject) {
      setProjectResponse(null);
    }

    try {
      const apiResponse = await fetch("/api/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgeResult })
      });
      const json = (await apiResponse.json()) as ProjectResponse;
      setProjectResponse(json);
    } catch (error) {
      setProjectResponse({ ok: false, error: error instanceof Error ? error.message : "project_generation_network_error" });
    } finally {
      setIsGeneratingProject(false);
    }
  }

  async function generateVisualsForResult(forgeResult: ForgeResult, resetVisuals: boolean) {
    setIsGeneratingVisuals(true);
    if (resetVisuals) {
      setVisualsResponse(null);
    }

    try {
      const apiResponse = await fetch("/api/visuals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgeResult, maxAssets: 4 })
      });
      const json = apiResponse.ok
        ? await apiResponse.json() as VisualsResponse
        : await readApiErrorResponse(apiResponse, "fal_visual_generation_failed");
      setVisualsResponse(json);
    } catch (error) {
      setVisualsResponse({ ok: false, error: error instanceof Error ? error.message : "visual_generation_network_error" });
    } finally {
      setIsGeneratingVisuals(false);
    }
  }

  async function compileGame() {
    if (promptRecordingStartingRef.current || isPromptVoiceBusy || recorderRef.current?.state === "recording" || prompt.trim().length < 8) {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
        setVoiceMessage("Recording stopped—transcribing...");
      } else if (promptRecordingStartingRef.current || isStartingPromptRecording) {
        setVoiceMessage("Opening microphone…");
      }
      return;
    }

    voiceSessionRunningRef.current = false;
    activeAudioRef.current?.pause();
    setVoiceSession(null);
    setVoiceSessionStatus("idle");
    setVoiceWindowRemaining(0);
    setActiveVoiceEventSequence(null);
    processedVoiceEventSequenceRef.current = 0;
    setIsLoading(true);
    setForgeProgress(null);
    setResponse(null);
    setProjectResponse(null);
    setVisualsResponse(null);

    try {
      const apiResponse = await fetch("/api/forge?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider: "auto" })
      });

      if (!apiResponse.ok) {
        setResponse(await readApiErrorResponse(apiResponse, "network_error"));
        return;
      }

      let finalResponse: ApiResponse | null = null;
      await readForgeStream(apiResponse, (event) => {
        if (event.type === "progress") {
          setForgeProgress(event.progress);
          return;
        }

        if (event.type === "result") {
          finalResponse = {
            ok: true,
            mode: event.mode,
            warnings: event.warnings,
            result: event.result
          };
          setResponse(finalResponse);
          void generateProjectForResult(event.result, false);
          void generateVisualsForResult(event.result, false);
          return;
        }

        finalResponse = { ok: false, error: event.error, details: event.details };
        setResponse(finalResponse);
      });

      if (!finalResponse) {
        setResponse({ ok: false, error: "network_error" });
      }
    } catch (error) {
      setResponse({ ok: false, error: error instanceof Error ? error.message : "network_error" });
    } finally {
      setIsLoading(false);
    }
  }

  async function generateProject() {
    if (!result) {
      return;
    }

    await generateProjectForResult(result, true);
  }

  async function generateVisuals() {
    if (!result) {
      return;
    }

    await generateVisualsForResult(result, true);
  }

  function downloadPackage() {
    if (!result) {
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.gameSpec.gameId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadGeneratedProject() {
    if (!generatedProject) {
      return;
    }
    const blob = new Blob([JSON.stringify(generatedProject, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generatedProject.projectId}-generated-project.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetToComposer() {
    voiceSessionRunningRef.current = false;
    activeAudioRef.current?.pause();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setResponse(null);
    setProjectResponse(null);
    setVisualsResponse(null);
    setIsGeneratingVisuals(false);
    setVoiceSession(null);
    setVoiceSessionStatus("idle");
    setVoiceWindowRemaining(0);
    setActiveVoiceEventSequence(null);
    setVoiceMessage(null);
    setVoiceError(null);
    setSpeakingPersonaId(null);
    setIsEditingPrompt(false);
    processedVoiceEventSequenceRef.current = 0;
  }

  function fillDevPromptWithoutStt() {
    setPrompt(devPromptWithoutStt);
    setIsEditingPrompt(false);
    setVoiceError(null);
    setVoiceMessage("Dev mode: prompt injected without speech-to-text.");
  }

  if (isLoading) {
    return <ForgeLoadingScreen prompt={prompt} progressEvent={forgeProgress} />;
  }

  if (result && providerMode) {
    return (
      <GeneratedGameFullscreen
        result={result}
        mode={providerMode}
        project={generatedProject}
        runtime={playableRuntime}
        visualSet={generatedVisualSet}
        isGeneratingVisuals={isGeneratingVisuals}
        visualError={visualError}
        isGeneratingProject={isGeneratingProject}
        session={voiceSession}
        runStatus={voiceSessionStatus}
        remainingSeconds={voiceWindowRemaining}
        voiceMessage={voiceMessage}
        voiceError={voiceError}
        activeEventSequence={activeVoiceEventSequence}
        onStartVoiceGame={startVoiceGameSession}
        onEndVoiceInput={endVoiceInputEarly}
        onGenerateVisuals={generateVisuals}
        onSpeakPersona={speakPersona}
        speakingPersonaId={speakingPersonaId}
        onGenerateProject={generateProject}
        onDownloadPackage={downloadPackage}
        onDownloadProject={downloadGeneratedProject}
        onReset={resetToComposer}
      />
    );
  }

  return (
    <main className="input-overlay">
      <form className="input-screen" aria-labelledby="page-title" onSubmit={(event) => { event.preventDefault(); void compileGame(); }}>
        <div className="input-heading">
          <h1 id="page-title">GameForge</h1>
          <p>Describe the tabletop game you want—and we forge it beat by beat.</p>
        </div>

        <div className="hero-voice-actions">
          <button
            className={`mic-button hero-mic-button${isRecording ? " listening" : ""}`}
            type="button"
            onClick={isRecording ? () => stopRecording() : startRecording}
            disabled={isStartingPromptRecording || isTranscribing || voiceSessionBusy}
          >
            <span className="mic-icon" aria-hidden="true" />
            <span>{isRecording ? "Stop" : isStartingPromptRecording ? "Opening mic…" : isTranscribing ? "Transcribing…" : prompt.trim() ? "Record again" : "Speak"}</span>
          </button>

          {isDevelopmentMode ? (
            <button
              className="ghost-button dev-stt-bypass-button"
              type="button"
              onClick={fillDevPromptWithoutStt}
              disabled={isPromptVoiceBusy || voiceSessionBusy}
            >
              Dev: bypass STT
            </button>
          ) : null}
        </div>

        {prompt.trim() ? (
          <section className="voice-transcript-panel" aria-label="Transcribed voice request">
            <div className="voice-transcript-header">
              <span>Voice brief</span>
              <button
                className="ghost-button transcript-edit-button"
                type="button"
                onClick={() => setIsEditingPrompt((current) => !current)}
                disabled={isPromptVoiceBusy || voiceSessionBusy}
                aria-label={isEditingPrompt ? "Save edits" : "Edit voice request"}
                title={isEditingPrompt ? "Save" : "Edit"}
              >
                <span aria-hidden="true">{isEditingPrompt ? "✓" : "✎"}</span>
              </button>
            </div>
            {isEditingPrompt ? (
              <textarea
                className="transcript-input"
                aria-label="Edit voice request text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            ) : (
              <p>{prompt}</p>
            )}
          </section>
        ) : null}

        <button className="primary-button hero-generate-button" type="submit" disabled={prompt.trim().length < 8 || isPromptVoiceBusy} suppressHydrationWarning>
          <span className="button-icon" aria-hidden="true">↗</span>
          <span>Forge game</span>
        </button>

        {voiceMessage ? <p className="input-status">{voiceMessage}</p> : null}
        {response && !response.ok ? <p className="error">Error: {formatError(response)}</p> : null}
        {voiceError ? <p className="error">Voice: {formatError(voiceError)}</p> : null}
      </form>
    </main>
  );
}
