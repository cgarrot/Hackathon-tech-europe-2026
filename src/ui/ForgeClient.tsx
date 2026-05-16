"use client";

import type { ForgeResult } from "@/compiler/schemas";
import type { VoiceGameEvent, VoiceGamePublicSession } from "@/game-session/voice-game-engine";
import type { GeneratedProject } from "@/generator/schemas";
import { useEffect, useMemo, useRef, useState } from "react";

type SuccessResponse = {
  ok: true;
  mode: ProviderMode;
  warnings: string[];
  result: ForgeResult;
};

type ProviderMode = "openai" | "ollama" | "pioneer";

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

type VoiceSessionSuccessResponse = {
  ok: true;
  session: VoiceGamePublicSession;
};

type VoiceSessionResponse = VoiceSessionSuccessResponse | ErrorResponse;

type VoiceSessionRunStatus = "idle" | "starting" | "speaking" | "listening" | "advancing" | "ended" | "error";

const loadingSteps = [
  { label: "La demande devient une promesse de partie.", percent: 14 },
  { label: "Les règles trouvent leur rythme.", percent: 31 },
  { label: "Les personnages reçoivent une intention.", percent: 49 },
  { label: "Le monde cherche sa première image.", percent: 66 },
  { label: "Les voix se placent dans la scène.", percent: 83 },
  { label: "La porte s’ouvre.", percent: 100 }
];

const errorLabels: Record<string, string> = {
  invalid_llm_provider: "LLM_PROVIDER doit valoir openai, ollama ou pioneer.",
  missing_llm_provider_configuration: "Configure un vrai provider LLM côté serveur avant de compiler.",
  missing_ollama_configuration: "Configuration Ollama incomplète: ajoute OLLAMA_API_KEY et OLLAMA_BASE_URL.",
  missing_openai_api_key: "Configuration OpenAI incomplète: ajoute OPENAI_API_KEY.",
  missing_pioneer_configuration: "Configuration Pioneer/Kimi incomplète: ajoute PIONEER_API_KEY.",
  malformed_json: "La requête envoyée à l'API est invalide.",
  request_validation_error: "La demande est invalide ou trop courte.",
  compiler_schema_validation_failed: "Le provider a répondu avec une structure invalide.",
  compiler_invariant_failed: "Le package généré ne respecte pas les invariants GameForge.",
  rate_limit_exceeded: "Trop de compilations lancées. Attends quelques secondes puis réessaie.",
  too_many_concurrent_requests: "Une compilation GameForge est déjà en cours côté serveur. Réessaie dans quelques secondes.",
  llm_provider_error: "Le provider LLM a échoué. Réessaie ou change de modèle.",
  generated_project_validation_failed: "Le manifest projet généré est invalide.",
  project_generation_failed: "La génération du manifest projet a échoué.",
  project_generation_network_error: "Impossible de joindre l'API de génération projet.",
  missing_gradium_api_key: "Configure GRADIUM_API_KEY côté serveur pour activer la voix.",
  missing_gradium_voice_configuration: "Configure GRADIUM_FR_VOICE_ID ou GRADIUM_DEFAULT_VOICE_ID côté serveur pour lire les voix.",
  missing_audio_file: "Aucun audio n'a été reçu par l'API voix.",
  empty_audio: "L'enregistrement est vide. Réessaie en parlant plus près du micro.",
  audio_too_large: "L'enregistrement est trop long pour cette démo.",
  voice_recording_unsupported: "Ce navigateur ne supporte pas l'enregistrement audio MediaRecorder.",
  voice_microphone_denied: "Impossible d'accéder au micro. Vérifie l'autorisation navigateur.",
  gradium_stt_failed: "Gradium STT a refusé ou échoué la transcription.",
  gradium_tts_failed: "Gradium TTS a refusé ou échoué la synthèse vocale.",
  gradium_stt_route_failed: "La route serveur STT Gradium a échoué.",
  gradium_tts_route_failed: "La route serveur TTS Gradium a échoué.",
  too_many_concurrent_voice_requests: "Une requête voix Gradium est déjà en cours côté serveur.",
  voice_network_error: "Impossible de joindre l'API voix.",
  voice_session_not_found: "Cette session vocale n'existe plus. Relance une partie.",
  voice_session_advance_failed: "Impossible d'avancer la session vocale.",
  voice_session_start_failed: "Impossible de démarrer la session vocale.",
  voice_session_validation_failed: "La session vocale générée est invalide.",
  network_error: "Impossible de joindre l'API de compilation."
};

function formatError(response: ErrorResponse) {
  return errorLabels[response.error] ?? response.error;
}

function providerModeLabel(mode: ProviderMode) {
  switch (mode) {
    case "pioneer":
      return "Pioneer / Kimi";
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

  errors.push(`${label} doit etre une chaine non vide.`);
  return "";
}

function readBoundedInteger(value: unknown, label: string, errors: string[], min: number, max: number) {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }

  errors.push(`${label} doit etre un entier entre ${min} et ${max}.`);
  return min;
}

function readPoint(value: unknown, label: string, errors: string[], world?: { width: number; height: number }): PlayablePoint {
  if (!isRecord(value)) {
    errors.push(`${label} doit etre un objet { x, y }.`);
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
    errors.push(`entities[${index}] doit etre un objet.`);
    return { id: `invalid_${index}`, kind: "hazard", label: "Entite invalide", description: "Entite ignoree.", x: 0, y: 0, token: "?" };
  }

  const rawKind = value.kind;
  let kind: PlayableEntityKind = "hazard";
  if (rawKind === "collectible" || rawKind === "hazard" || rawKind === "goal") {
    kind = rawKind;
  } else {
    errors.push(`entities[${index}].kind est invalide.`);
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
    errors.push(`phases[${index}] doit etre un objet.`);
    return { id: `phase_${index}`, name: "Phase invalide", purpose: "Phase ignoree.", allowedActions: [], next: "" };
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
    return { ok: false, errors: ["Le runtime jouable doit etre un objet JSON."] };
  }

  if (value.runtimeVersion !== "1.0.0") {
    errors.push("runtimeVersion doit valoir 1.0.0.");
  }

  const worldSource = isRecord(value.world) ? value.world : {};
  if (!isRecord(value.world)) {
    errors.push("world doit etre un objet.");
  }
  const world = {
    width: readBoundedInteger(worldSource.width, "world.width", errors, 4, 24),
    height: readBoundedInteger(worldSource.height, "world.height", errors, 4, 18)
  };

  const playerSource = isRecord(value.player) ? value.player : {};
  if (!isRecord(value.player)) {
    errors.push("player doit etre un objet.");
  }
  const spawn = readPoint(playerSource.spawn, "player.spawn", errors, world);

  const entityValues = Array.isArray(value.entities) ? value.entities : [];
  if (!Array.isArray(value.entities)) {
    errors.push("entities doit etre un tableau.");
  }
  if (entityValues.length > 120) {
    errors.push("entities ne peut pas depasser 120 entrees.");
  }
  const entities = entityValues.slice(0, 120).map((entity, index) => parsePlayableEntity(entity, index, errors, world));
  const phaseValues = Array.isArray(value.phases) ? value.phases : [];
  if (!Array.isArray(value.phases)) {
    errors.push("phases doit etre un tableau.");
  }
  const phases = phaseValues.slice(0, 12).map((phase, index) => parsePlayablePhase(phase, index, errors));
  if (phases.length === 0) {
    errors.push("Le runtime vocal doit contenir au moins une phase.");
  }
  const ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) {
      errors.push(`Entite dupliquee: ${entity.id}.`);
    }
    ids.add(entity.id);
  }

  const rulesSource = isRecord(value.rules) ? value.rules : {};
  if (!isRecord(value.rules)) {
    errors.push("rules doit etre un objet.");
  }
  const collectibleCount = readBoundedInteger(rulesSource.collectibleCount, "rules.collectibleCount", errors, 1, 120);
  const actualCollectibles = entities.filter((entity) => entity.kind === "collectible").length;
  const goalCount = entities.filter((entity) => entity.kind === "goal").length;
  if (collectibleCount !== actualCollectibles) {
    errors.push("rules.collectibleCount doit correspondre au nombre de collectibles.");
  }
  if (goalCount !== 1) {
    errors.push("Le runtime doit contenir exactement une sortie goal.");
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
    return { ok: false, errors: ["data/playable-runtime.json n'est pas un JSON valide."] };
  }
}

function roleInitial(role: RoleOrActor) {
  return role.name.trim().slice(0, 1).toUpperCase() || "?";
}

function RoleQuantity({ count, label }: { count: number; label: string }) {
  const visiblePips = Array.from({ length: Math.min(count, 5) }, (_, index) => index);

  return (
    <div className="role-card-pips" aria-label={`${count} exemplaire${count > 1 ? "s" : ""} pour ${label}`}>
      {visiblePips.map((pip) => <span key={pip} />)}
      {count > visiblePips.length ? <em>+{count - visiblePips.length}</em> : null}
    </div>
  );
}

function latestVisualEvent(session: VoiceGamePublicSession | null) {
  return session?.events.findLast((event) => event.visualCue) ?? null;
}

function sessionStatusLabel(status: VoiceSessionRunStatus) {
  if (status === "starting") {
    return "démarrage";
  }
  if (status === "speaking") {
    return "TTS Gradium";
  }
  if (status === "listening") {
    return "micro ouvert";
  }
  if (status === "advancing") {
    return "moteur";
  }
  if (status === "ended") {
    return "terminé";
  }
  if (status === "error") {
    return "erreur";
  }
  return "prêt";
}

function entityKindLabel(kind: PlayableEntityKind) {
  if (kind === "collectible") {
    return "Objectif";
  }
  if (kind === "goal") {
    return "Sortie";
  }
  return "Obstacle";
}

function entityKindIcon(kind: PlayableEntityKind) {
  if (kind === "collectible") {
    return "◆";
  }
  if (kind === "goal") {
    return "◎";
  }
  return "▲";
}

function runtimeCells(runtime: PlayableRuntimeSpec) {
  return Array.from({ length: runtime.world.width * runtime.world.height }, (_, index) => ({
    id: `cell_${index}`,
    x: index % runtime.world.width,
    y: Math.floor(index / runtime.world.width)
  }));
}

function loadingProgress(elapsedSeconds: number) {
  const stepIndex = Math.min(loadingSteps.length - 1, Math.floor(elapsedSeconds / 2));
  return loadingSteps[stepIndex];
}

function ForgeLoadingScreen({ prompt, elapsedSeconds }: { prompt: string; elapsedSeconds: number }) {
  const progress = loadingProgress(elapsedSeconds);

  return (
    <main className="prepare-overlay" aria-labelledby="build-label">
      <section className="prepare-screen" aria-live="polite">
        <div className="prepare-brand" aria-label="GameForge">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GameForge</span>
        </div>

        <div className="forge-visual prepare-visual" aria-hidden="true">
          <div className="forge-core" />
          <div className="forge-orbit orbit-one" />
          <div className="forge-orbit orbit-two" />
          <div className="forge-card card-one" />
          <div className="forge-card card-two" />
          <div className="forge-card card-three" />
        </div>

        <div className="prepare-message">
          <p className="eyebrow" id="prepare-eyebrow">Préparation</p>
          <h1 className="message-enter" id="build-label">{progress.label}</h1>
          <p>{prompt.trim() || "Demande vocale en cours de forge."}</p>
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

function GeneratedGameFullscreen({
  result,
  mode,
  project,
  runtime,
  isGeneratingProject,
  session,
  runStatus,
  remainingSeconds,
  onStartVoiceGame,
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
  isGeneratingProject: boolean;
  session: VoiceGamePublicSession | null;
  runStatus: VoiceSessionRunStatus;
  remainingSeconds: number;
  onStartVoiceGame: () => void;
  onSpeakPersona: (persona: PersonaSpec) => void;
  speakingPersonaId: string | null;
  onGenerateProject: () => void;
  onDownloadPackage: () => void;
  onDownloadProject: () => void;
  onReset: () => void;
}) {
  const runtimeSpec = runtime?.ok ? runtime.spec : null;
  const activePhase = session?.activePhase ?? runtimeSpec?.phases[0] ?? result.gameSpec.phases[0];
  const activeVisual = latestVisualEvent(session);
  const recentEvents = session?.events.slice(-5).reverse() ?? [];
  const visibleRoles = result.gameSpec.rolesOrActors.slice(0, 6);
  const visiblePersonas = result.package.personas.slice(0, 3);
  const extractionStep = result.pipeline.find((step) => step.stage === "pioneer_gliner_extraction");
  const boardCells = runtimeSpec ? runtimeCells(runtimeSpec) : [];
  const playerGridStyle = runtimeSpec
    ? { gridColumn: runtimeSpec.player.spawn.x + 1, gridRow: runtimeSpec.player.spawn.y + 1 }
    : undefined;

  return (
    <main className="generated-game-fullscreen" aria-labelledby="generated-game-title">
      <header className="generated-game-topbar">
        <button type="button" className="generated-brand" onClick={onReset} aria-label="Créer un autre jeu">
          <span aria-hidden="true">G</span>
          <strong>GameForge</strong>
        </button>
        <div className="generated-topbar-actions">
          <button type="button" className="secondary" onClick={onDownloadPackage}>JSON</button>
          <button type="button" className="secondary" onClick={onGenerateProject} disabled={isGeneratingProject}>{isGeneratingProject ? "Runtime..." : "Regénérer runtime"}</button>
          <button type="button" className="secondary" onClick={onDownloadProject} disabled={!project}>Projet</button>
          <button type="button" onClick={onReset}>Nouveau jeu</button>
        </div>
      </header>

      <section className="generated-game-stage">
        <div className="generated-game-copy">
          <p className="eyebrow">Jeu généré plein écran</p>
          <h1 id="generated-game-title">{result.gameSpec.title}</h1>
          <p>{result.gameSpec.pitch}</p>
          <div className="badges">
            <span className="badge">Provider: {providerModeLabel(mode)}</span>
            {extractionStep ? <span className="badge">GLiNER {extractionStep.status}</span> : null}
            <span className="badge">{result.gameSpec.family}</span>
            <span className="badge">{result.gameSpec.pack}</span>
            <span className="badge">{result.gameSpec.players.total} joueurs</span>
            <span className="badge">{result.gameSpec.players.ai} IA</span>
          </div>
        </div>

        <div className="generated-game-board-wrap" aria-live="polite">
          {runtimeSpec ? (
            <div
              className="generated-game-board"
              style={{ gridTemplateColumns: `repeat(${runtimeSpec.world.width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${runtimeSpec.world.height}, minmax(0, 1fr))` }}
              aria-label={`Plateau jouable ${runtimeSpec.world.width} par ${runtimeSpec.world.height}`}
            >
              {boardCells.map((cell) => <span aria-hidden="true" className="generated-board-cell" key={cell.id} />)}
              {runtimeSpec.entities.map((entity) => (
                <article
                  className={`generated-board-entity generated-board-${entity.kind}`}
                  key={entity.id}
                  style={{ gridColumn: entity.x + 1, gridRow: entity.y + 1 }}
                  title={`${entityKindLabel(entity.kind)}: ${entity.description}`}
                >
                  <span aria-hidden="true">{entity.token || entityKindIcon(entity.kind)}</span>
                  <strong>{entity.label}</strong>
                </article>
              ))}
              <div className="generated-board-player" style={playerGridStyle} title={runtimeSpec.player.label}>
                <span aria-hidden="true">@</span>
                <strong>{runtimeSpec.player.label}</strong>
              </div>
            </div>
          ) : (
            <div className="generated-game-build" role="status">
              <div className="forge-visual" aria-hidden="true">
                <div className="forge-core" />
                <div className="forge-orbit orbit-one" />
                <div className="forge-orbit orbit-two" />
                <div className="forge-card card-one" />
                <div className="forge-card card-two" />
                <div className="forge-card card-three" />
              </div>
              <p className="eyebrow">Préparation du runtime</p>
              <h2>{isGeneratingProject ? "On forge le plateau jouable." : "Runtime indisponible."}</h2>
              <p className="hint">{isGeneratingProject ? "Le jeu est compilé; génération du manifest plein écran en cours." : "Relance la génération du manifest projet pour afficher le plateau."}</p>
            </div>
          )}
        </div>

        <aside className="generated-game-hud" aria-label="Contrôles de partie">
          <section className="generated-hud-card generated-phase-card">
            <span className="preview-label">Phase active</span>
            <h2>{activePhase?.name ?? "Phase générée"}</h2>
            <p>{activeVisual?.text ?? activePhase?.purpose ?? result.gameSpec.coreLoop[0]}</p>
            <div className="inline-play-stats">
              <span>{sessionStatusLabel(runStatus)}</span>
              <span>{runStatus === "listening" ? `${remainingSeconds}s voix` : session ? `round ${session.round}` : "runtime"}</span>
              <span>{runtimeSpec ? `${runtimeSpec.rules.collectibleCount} objectifs` : "manifest"}</span>
            </div>
            <button type="button" onClick={onStartVoiceGame} disabled={runStatus === "starting" || runStatus === "speaking" || runStatus === "listening" || runStatus === "advancing"}>
              {runStatus === "ended" ? "Relancer la partie" : runStatus === "idle" || runStatus === "error" ? "Commencer" : "Partie en cours..."}
            </button>
          </section>

          {runtime && !runtime.ok ? (
            <section className="generated-hud-card generated-runtime-errors" role="alert">
              <span className="preview-label">Runtime invalide</span>
              <ul>{runtime.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </section>
          ) : null}

          <section className="generated-hud-card">
            <span className="preview-label">Rôles en jeu</span>
            <div className="generated-role-strip">
              {visibleRoles.map((role) => (
                <article key={role.id}>
                  <strong>{roleInitial(role)}</strong>
                  <span>{role.name}</span>
                </article>
              ))}
            </div>
          </section>

          {visiblePersonas.length > 0 ? (
            <section className="generated-hud-card">
              <span className="preview-label">Voix IA</span>
              <div className="generated-persona-list">
                {visiblePersonas.map((persona) => (
                  <button type="button" className="secondary" key={persona.id} onClick={() => onSpeakPersona(persona)} disabled={speakingPersonaId !== null}>
                    {speakingPersonaId === persona.id ? "Lecture..." : persona.displayName}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="generated-hud-card generated-event-log">
            <span className="preview-label">Journal live</span>
            <ol>
              {recentEvents.length > 0 ? recentEvents.map((event) => (
                <li key={event.id}><strong>{event.speaker.displayName}</strong><span>{event.text}</span></li>
              )) : <li><strong>Prêt</strong><span>Le journal vocal se remplit après Start.</span></li>}
            </ol>
          </section>
        </aside>
      </section>

      <details className="generated-debug-drawer">
        <summary>Support détaillé, manifest et JSON validé</summary>
        <div className="generated-debug-grid">
          <PlayableRuntimePreview
            result={result}
            runtime={runtime}
            isLoading={isGeneratingProject}
            session={session}
            runStatus={runStatus}
            remainingSeconds={remainingSeconds}
            onStart={onStartVoiceGame}
          />
          <GameSupportPreview
            result={result}
            project={project ?? undefined}
            onSpeakPersona={onSpeakPersona}
            speakingPersonaId={speakingPersonaId}
          />
          <PackageFacts result={result} />
          <div className="card json-details">
            <h3>JSON complet validé</h3>
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
  onStart
}: {
  result: ForgeResult | null;
  runtime: PlayableRuntimeResult | null;
  isLoading: boolean;
  session: VoiceGamePublicSession | null;
  runStatus: VoiceSessionRunStatus;
  remainingSeconds: number;
  onStart: () => void;
}) {
  const activeVisual = latestVisualEvent(session);
  const activePhase = session?.activePhase;
  const recentEvents = session?.events.slice(-8).reverse() ?? [];
  const storyboardEvents = session?.events.filter((event) => event.visualCue).slice(-8) ?? [];
  const isRunning = runStatus === "starting" || runStatus === "speaking" || runStatus === "listening" || runStatus === "advancing";
  const startDisabled = !result || isLoading || isRunning;
  const runtimeTitle = runtime?.ok ? runtime.spec.title : result?.gameSpec.title;
  const runtimeObjective = runtime?.ok ? runtime.spec.objective : result?.gameSpec.pitch;

  return (
    <section className="inline-playable card" aria-labelledby="inline-playable-title">
      <span className="preview-label">Jeu vocal automatique · Gradium TTS/STT</span>
      <h3 id="inline-playable-title">Partie directe en un bouton</h3>
      {isLoading ? <p className="hint">Construction du manifest jouable en cours...</p> : null}
      {!result && !isLoading ? <p className="hint">Compile un jeu: la partie vocale s'affichera ici automatiquement, sans téléchargement.</p> : null}
      {result ? <p className="hint"><strong>{runtimeTitle}</strong> — {runtimeObjective}</p> : null}
      {runtime && !runtime.ok ? (
        <div className="inline-playable-error" role="alert">
          <strong>Runtime jouable invalide</strong>
          <ul>{runtime.errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      ) : null}
      <div className="inline-playable-layout voice-runtime-layout">
        <div className={`voice-stage voice-session-stage voice-session-${runStatus}`} aria-label="Sortie animation visuelle">
          <div className="voice-orb" aria-hidden="true" />
          <p className="eyebrow">Animation visuelle</p>
          <h4>{activePhase?.name ?? result?.gameSpec.title ?? "Partie vocale"}</h4>
          <p>{activeVisual?.text ?? activePhase?.purpose ?? "Le moteur attend le Start pour dérouler automatiquement les phases."}</p>
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
            <span>{runStatus === "listening" ? `${remainingSeconds}s voix` : session?.pendingInput ? "fenêtre prête" : "auto"}</span>
          </div>
          <button type="button" onClick={onStart} disabled={startDisabled}>
            {session?.status === "ended" || runStatus === "ended" ? "Relancer la partie" : isRunning ? "Partie en cours..." : "Commencer la partie"}
          </button>
          <p className="hint">
            Après Start, le moteur serveur déroule les phases, Gradium lit les répliques, puis le micro s'ouvre uniquement pendant les fenêtres vocales.
          </p>
          {session?.pendingInput ? <p className="voice-input-prompt">{session.pendingInput.prompt}</p> : null}
        </aside>

        <div className="video-output-panel" aria-label="Storyboard vidéo généré">
          <span className="preview-label">Output vidéo</span>
          <ol>
            {storyboardEvents.length > 0 ? storyboardEvents.map((event) => (
              <li className={event.sequence === activeVisual?.sequence ? "active-video-step" : ""} key={event.id}>
                <strong>{String(event.sequence).padStart(2, "0")} · {event.visualCue?.scene ?? event.phaseId ?? "scene"}</strong>
                <span>{event.visualCue?.mood ?? event.text}</span>
              </li>
            )) : <li><strong>00 · En attente</strong><span>Le storyboard se remplit dès le lancement.</span></li>}
          </ol>
        </div>

        <ol className="inline-play-log inline-play-log-full-width" aria-label="Journal du jeu généré">
          {recentEvents.length > 0 ? recentEvents.map((event) => (
            <li key={event.id}>
              <strong>{event.speaker.displayName}</strong>
              <span>{event.text}</span>
            </li>
          )) : <li>Le journal vocal apparaîtra ici après le Start.</li>}
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
    <section className="tabletop-preview" aria-label="Support visuel de partie">
      <div className="preview-hero">
        <div>
          <p className="eyebrow">Support tabletop · cartes, plateau, phases</p>
          <h3>{gameSpec.title}</h3>
          <p>{gameSpec.pitch}</p>
          <div className="badges">
            {project ? <span className="badge">{project.projectId}</span> : null}
            <span className="badge">{gameSpec.family}</span>
            <span className="badge">{gameSpec.pack}</span>
            <span className="badge">{roleTotal} rôles distribués</span>
          </div>
        </div>
        <div className="preview-stat-stack" aria-label="Configuration joueurs">
          <div><strong>{gameSpec.players.total}</strong><span>joueurs</span></div>
          <div><strong>{gameSpec.players.humans}</strong><span>humains</span></div>
          <div><strong>{gameSpec.players.ai}</strong><span>IA</span></div>
        </div>
      </div>

      <div className="tabletop-board">
        <article className="board-mat" aria-label="Plateau de support de partie">
          <div className="moon-dial">
            <span>{gameSpec.pack}</span>
            <strong>{gameSpec.players.total}</strong>
          </div>
          <div className="board-notes">
            <span className="preview-label">Plateau rapide</span>
            <h4>{gameSpec.theme}</h4>
            <p>{heroAsset?.prompt ?? `Créer une identité visuelle cohérente pour ${gameSpec.theme}.`}</p>
          </div>
        </article>

        <article className="phase-panel">
          <span className="preview-label">Piste de phases</span>
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
          <h4>Cartes de rôle prêtes à jouer</h4>
          <span>{gameSpec.rolesOrActors.length} rôles · {result.package.cards.length} cartes</span>
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
                {asset ? <em className="asset-note">Prompt visuel lié · {asset.usage}</em> : null}
              </article>
            );
          })}
        </div>
      </div>

      <div className="preview-grid">
        <article className="preview-card preview-card-strong">
          <span className="preview-label">Boucle de jeu</span>
          <ol className="preview-steps">
            {gameSpec.coreLoop.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </article>
        <article className="preview-card">
          <span className="preview-label">Conditions de victoire</span>
          <ul className="preview-list">
            {gameSpec.winConditions.map((condition) => (
              <li key={condition}>
                <strong>Objectif</strong>
                <span>{condition}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="preview-grid">
        <article className="preview-card">
          <span className="preview-label">Personas IA</span>
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
                  {speakingPersonaId === persona.id ? "Lecture..." : "Lire"}
                </button>
              </li>
            ))}
          </ul>
        </article>
        <article className="preview-card">
          <span className="preview-label">Assets à brancher</span>
          <p className="hint">
            {result.package.assetPrompts.length} prompts visuels/audio sont structurés; les voix `kind=voice` alimentent Gradium via manifest et routes serveur.
          </p>
        </article>
      </div>

      {project ? (
        <div className="manifest-list project-manifest-secondary">
          <div className="preview-section-heading">
            <h4>Manifest projet généré</h4>
            <span>{project.files.length} fichiers statiques</span>
          </div>
          <ul className="pipeline">
            {project.files.map((file) => (
              <li key={file.path}><span>{file.path}</span><span>{file.kind}</span></li>
            ))}
          </ul>
          <p className="hint">Secondaire: ce manifest est affiché seulement après `/api/generate-project`; le TSX/CSS généré reste un artefact téléchargeable, jamais exécuté par cette API.</p>
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
        <span className="preview-label">Artefacts</span>
        <ul className="preview-list">
          <li><strong>{result.package.cards.length} cartes</strong><span>Cartes ou aides de rôle</span></li>
          <li><strong>{result.package.personas.length} personas</strong><span>Acteurs IA client-only</span></li>
          <li><strong>{result.package.assetPrompts.length} prompts</strong><span>Directions visuelles et voix Gradium</span></li>
          <li><strong>{result.package.codeStubs.length} stubs</strong><span>Code reviewable, non exécuté</span></li>
        </ul>
      </article>
    </div>
  );
}

export function ForgeClient() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [projectResponse, setProjectResponse] = useState<ProjectResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);
  const [isStartingPromptRecording, setIsStartingPromptRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<ErrorResponse | null>(null);
  const [speakingPersonaId, setSpeakingPersonaId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [voiceSession, setVoiceSession] = useState<VoiceGamePublicSession | null>(null);
  const [voiceSessionStatus, setVoiceSessionStatus] = useState<VoiceSessionRunStatus>("idle");
  const [voiceWindowRemaining, setVoiceWindowRemaining] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const promptRecordingStartingRef = useRef(false);
  const voiceSessionRunningRef = useRef(false);
  const processedVoiceEventSequenceRef = useRef(0);

  const result = response?.ok ? response.result : null;
  const providerMode = response?.ok ? response.mode : null;
  const generatedProject = projectResponse?.ok ? projectResponse.project : null;
  const playableRuntime = useMemo(() => playableRuntimeFromProject(generatedProject), [generatedProject]);
  const isPromptVoiceBusy = isStartingPromptRecording || isRecording || isTranscribing;
  const voiceSessionBusy = voiceSessionStatus === "starting" || voiceSessionStatus === "speaking" || voiceSessionStatus === "listening" || voiceSessionStatus === "advancing";

  useEffect(() => {
    if (!isLoading) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isLoading]);

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
    setVoiceMessage(`${label}: transcription Gradium en streaming...`);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `gameforge-prompt.${audioFileExtension(audioBlob.type)}`);
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

      setVoiceMessage(`${label}: transcription reçue (${eventCount} évènement${eventCount > 1 ? "s" : ""}).`);
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
    const transcript = await transcribeAudioBlob(audioBlob, "Dictée prompt");
    if (!transcript) {
      return;
    }

    setPrompt(transcript.trim());
    setVoiceMessage("Demande vocale prête. Lance la génération quand tu veux.");
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
    setVoiceMessage("Micro ouvert: parle, puis clique sur Arrêter.");

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

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setVoiceMessage("Enregistrement terminé, envoi à Gradium...");
    }
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
    setVoiceMessage(`Synthèse Gradium pour ${params.label}...`);

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
      setVoiceMessage(`Lecture terminée pour ${params.label}.`);
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
      language: result?.intake.language ?? "fr",
      personaId: persona.id,
      speechStyle: persona.speechStyle
    });
  }

  async function recordTimedVoiceInput(durationSec: number) {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError({ ok: false, error: "voice_recording_unsupported" });
      return null;
    }

    const boundedDurationSec = Math.min(75, Math.max(3, durationSec));
    setVoiceError(null);
    setVoiceMessage(`Micro ouvert pour ${boundedDurationSec}s: parle maintenant.`);
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

    return transcribeAudioBlob(audioBlob, "Fenêtre vocale");
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
        const advancedSession = await advanceVoiceSessionFromApi(
          currentSession.sessionId,
          inputWindowReached && transcript ? { participantId: "human_1", transcript } : {}
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
    setVoiceSession(null);
    setVoiceError(null);
    setVoiceMessage("Démarrage de la session vocale serveur...");
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

  async function compileGame() {
    if (promptRecordingStartingRef.current || isPromptVoiceBusy || recorderRef.current?.state === "recording" || prompt.trim().length < 8) {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
        setVoiceMessage("Enregistrement terminé, transcription en cours...");
      } else if (promptRecordingStartingRef.current || isStartingPromptRecording) {
        setVoiceMessage("Ouverture du micro en cours...");
      }
      return;
    }

    voiceSessionRunningRef.current = false;
    activeAudioRef.current?.pause();
    setVoiceSession(null);
    setVoiceSessionStatus("idle");
    setVoiceWindowRemaining(0);
    processedVoiceEventSequenceRef.current = 0;
    setIsLoading(true);
    setResponse(null);
    setProjectResponse(null);

    try {
      const apiResponse = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider: "auto" })
      });
      const json = (await apiResponse.json()) as ApiResponse;
      setResponse(json);
      if (json.ok) {
        void generateProjectForResult(json.result, false);
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
    setVoiceSession(null);
    setVoiceSessionStatus("idle");
    setVoiceWindowRemaining(0);
    setVoiceMessage(null);
    setVoiceError(null);
    setSpeakingPersonaId(null);
    processedVoiceEventSequenceRef.current = 0;
  }

  if (isLoading) {
    return <ForgeLoadingScreen prompt={prompt} elapsedSeconds={elapsedSeconds} />;
  }

  if (result && providerMode) {
    return (
      <GeneratedGameFullscreen
        result={result}
        mode={providerMode}
        project={generatedProject}
        runtime={playableRuntime}
        isGeneratingProject={isGeneratingProject}
        session={voiceSession}
        runStatus={voiceSessionStatus}
        remainingSeconds={voiceWindowRemaining}
        onStartVoiceGame={startVoiceGameSession}
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
          <p>Dis le jeu que tu veux jouer. On le forge pendant que tu respires.</p>
        </div>

        <button
          className={`mic-button hero-mic-button${isRecording ? " listening" : ""}`}
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isStartingPromptRecording || isTranscribing || voiceSessionBusy}
        >
          <span className="mic-icon" aria-hidden="true" />
          <span>{isRecording ? "Arrêter" : isStartingPromptRecording ? "Ouverture…" : isTranscribing ? "Transcription…" : prompt.trim() ? "Speak again" : "Speak"}</span>
        </button>

        {prompt.trim() ? (
          <section className="voice-transcript-panel" aria-label="Demande vocale transcrite">
            <span>Demande vocale</span>
            <p>{prompt}</p>
          </section>
        ) : null}

        <button className="primary-button hero-generate-button" type="submit" disabled={prompt.trim().length < 8 || isPromptVoiceBusy}>
          <span className="button-icon" aria-hidden="true">↗</span>
          <span>Générer le jeu</span>
        </button>

        {voiceMessage ? <p className="input-status">{voiceMessage}</p> : null}
        {response && !response.ok ? <p className="error">Erreur: {formatError(response)}</p> : null}
        {voiceError ? <p className="error">Voix: {formatError(voiceError)}</p> : null}
      </form>
    </main>
  );
}
