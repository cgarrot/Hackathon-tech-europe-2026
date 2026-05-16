"use client";

import type { ForgeResult } from "@/compiler/schemas";
import type { GeneratedProject } from "@/generator/schemas";
import { useEffect, useMemo, useRef, useState } from "react";

type SuccessResponse = {
  ok: true;
  mode: "openai" | "ollama";
  warnings: string[];
  result: ForgeResult;
};

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

const examples = [
  "Je veux jouer à un jeu de loup-garou dans un village médiéval, 8 joueurs dont 2 IA, avec une voyante et une sorcière.",
  "Je veux un jeu d'enquête policière dans un manoir, 6 suspects dont 3 IA, un détective humain et des indices cachés.",
  "Je veux un blind test musical entre amis avec 4 manches, un animateur IA drôle, des scores et des pochettes générées.",
  "Je veux un débat philosophique entre Socrate, Nietzsche, Simone Weil et un public qui vote à chaque round."
];

const errorLabels: Record<string, string> = {
  invalid_llm_provider: "LLM_PROVIDER doit valoir openai ou ollama.",
  missing_llm_provider_configuration: "Configure un vrai provider LLM côté serveur avant de compiler.",
  missing_ollama_configuration: "Configuration Ollama incomplète: ajoute OLLAMA_API_KEY et OLLAMA_BASE_URL.",
  missing_openai_api_key: "Configuration OpenAI incomplète: ajoute OPENAI_API_KEY.",
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
  network_error: "Impossible de joindre l'API de compilation."
};

function formatError(response: ErrorResponse) {
  return errorLabels[response.error] ?? response.error;
}

type RoleOrActor = ForgeResult["gameSpec"]["rolesOrActors"][number];
type CardSpec = ForgeResult["package"]["cards"][number];
type AssetPrompt = ForgeResult["package"]["assetPrompts"][number];
type PersonaSpec = ForgeResult["package"]["personas"][number];

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
  const [prompt, setPrompt] = useState(examples[0]);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [projectResponse, setProjectResponse] = useState<ProjectResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<ErrorResponse | null>(null);
  const [speakingPersonaId, setSpeakingPersonaId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const result = response?.ok ? response.result : null;
  const mode = response?.ok ? response.mode : null;
  const generatedProject = projectResponse?.ok ? projectResponse.project : null;

  const badges = useMemo(() => {
    if (!result) {
      return ["Universal Compiler", "Game Packs", "OpenAI/Ollama"];
    }
    return [result.gameSpec.family, result.routing.selectedPack, `${result.gameSpec.players.total} players`, mode ?? "unknown"];
  }, [mode, result]);

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
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      activeAudioRef.current?.pause();
    };
  }, []);

  async function transcribePromptAudio(audioBlob: Blob) {
    setIsTranscribing(true);
    setVoiceError(null);
    setVoiceMessage("Transcription Gradium en streaming...");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `gameforge-prompt.${audioFileExtension(audioBlob.type)}`);
      const apiResponse = await fetch("/api/voice/stt?stream=1", {
        method: "POST",
        body: formData
      });

      if (!apiResponse.ok) {
        const contentType = apiResponse.headers.get("content-type") ?? "";
        const errorResponse = contentType.includes("application/json")
          ? (await apiResponse.json()) as ErrorResponse
          : { ok: false as const, error: await apiResponse.text() || "gradium_stt_failed" };
        setVoiceError(errorResponse);
        setVoiceMessage(null);
        return;
      }

      const reader = apiResponse.body?.getReader();
      if (!reader) {
        setVoiceError({ ok: false, error: "gradium_stt_failed" });
        setVoiceMessage(null);
        return;
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
              setVoiceMessage(`Transcription streaming: ${eventText}`);
            }
          } catch {
            transcriptChunks.push(trimmedLine);
            setVoiceMessage(`Transcription streaming: ${trimmedLine}`);
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
        return;
      }

      setPrompt((currentPrompt) => `${currentPrompt.trim()}\n\nVoix joueur: ${transcript}`.trim());
      setVoiceMessage(`Transcription ajoutée au prompt (${eventCount} évènement${eventCount > 1 ? "s" : ""}).`);
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_network_error" });
      setVoiceMessage(null);
    } finally {
      setIsTranscribing(false);
    }
  }

  async function startRecording() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
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
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setVoiceMessage("Enregistrement terminé, envoi à Gradium...");
    }
  }

  async function speakPersona(persona: PersonaSpec) {
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    setSpeakingPersonaId(persona.id);
    setVoiceError(null);
    setVoiceMessage(`Synthèse Gradium pour ${persona.displayName}...`);

    try {
      const line = persona.sampleLines[0] ?? persona.publicBackstory;
      const apiResponse = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line,
          personaId: persona.id,
          speechStyle: persona.speechStyle,
          language: result?.intake.language ?? "fr",
          outputFormat: "wav"
        })
      });

      if (!apiResponse.ok) {
        const json = (await apiResponse.json()) as ErrorResponse;
        setVoiceError(json);
        setVoiceMessage(null);
        setSpeakingPersonaId(null);
        return;
      }

      const audioBlob = await apiResponse.blob();
      const objectUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(objectUrl);
      activeAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        activeAudioRef.current = null;
        setSpeakingPersonaId(null);
        setVoiceMessage(`Lecture terminée pour ${persona.displayName}.`);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        activeAudioRef.current = null;
        setSpeakingPersonaId(null);
        setVoiceError({ ok: false, error: "gradium_tts_failed" });
        setVoiceMessage(null);
      };
      try {
        await audio.play();
      } catch (playError) {
        URL.revokeObjectURL(objectUrl);
        activeAudioRef.current = null;
        throw playError;
      }
    } catch (error) {
      setVoiceError({ ok: false, error: error instanceof Error ? error.message : "voice_network_error" });
      setVoiceMessage(null);
      setSpeakingPersonaId(null);
    }
  }

  async function compileGame() {
    setIsLoading(true);
    setResponse(null);
    setProjectResponse(null);

    try {
      const apiResponse = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const json = (await apiResponse.json()) as ApiResponse;
      setResponse(json);
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

    setIsGeneratingProject(true);
    setProjectResponse(null);

    try {
      const apiResponse = await fetch("/api/generate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgeResult: result })
      });
      const json = (await apiResponse.json()) as ProjectResponse;
      setProjectResponse(json);
    } catch (error) {
      setProjectResponse({ ok: false, error: error instanceof Error ? error.message : "project_generation_network_error" });
    } finally {
      setIsGeneratingProject(false);
    }
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

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">GameForge — Universal Game Compiler</p>
        <h1>Compile une idée en package de jeu.</h1>
        <p>
          Décris n'importe quel jeu. Le compiler route l'idée vers un pack, génère un GameSpec, puis produit règles,
          cartes, personas, prompts visuels et stubs de code. Configure OpenAI ou Ollama Cloud côté serveur pour compiler avec les vrais modèles.
        </p>
        <div className="badges">
          {badges.map((badge) => (
            <span className="badge" key={badge}>{badge}</span>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <h2>Demande utilisateur</h2>
          <p className="hint">Essaie Loup-garou, enquête, blind test, débat, survie ou une idée custom.</p>
          <textarea aria-label="Description du jeu à compiler" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="voice-toolbar" aria-label="Contrôles voix Gradium">
            <button
              type="button"
              className={isRecording ? "voice-recording" : "secondary"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading || isTranscribing}
            >
              {isRecording ? "Arrêter la dictée" : isTranscribing ? "Transcription..." : "Dicter avec Gradium"}
            </button>
            <span>{voiceMessage ?? "STT ajoute la voix du joueur au prompt; TTS lit les personas générés."}</span>
          </div>
          <div className="actions">
            <button type="button" onClick={compileGame} disabled={isLoading || prompt.trim().length < 8}>{isLoading ? "Compilation..." : "Compiler"}</button>
            <button type="button" className="secondary" onClick={downloadPackage} disabled={!result}>Télécharger JSON</button>
            <button type="button" className="secondary" onClick={generateProject} disabled={!result || isGeneratingProject}>
              {isGeneratingProject ? "Génération projet..." : "Générer manifest projet"}
            </button>
            <button type="button" className="secondary" onClick={downloadGeneratedProject} disabled={!generatedProject}>Télécharger projet</button>
          </div>
          {isLoading ? (
            <p className="hint progress-note">
              Pipeline en cours: intake → guide pack → GameSpec → artefacts. Ollama Cloud peut prendre 30-90s selon le modèle. Temps écoulé: {elapsedSeconds}s.
            </p>
          ) : null}
          <div className="examples example-actions">
            {examples.map((example, index) => (
              <button key={example} type="button" className="secondary" onClick={() => setPrompt(example)}>
                Exemple {index + 1}
              </button>
            ))}
          </div>
          {response && !response.ok ? <p className="error">Erreur: {formatError(response)}</p> : null}
          {voiceError ? <p className="error">Voix: {formatError(voiceError)}</p> : null}
          {projectResponse && !projectResponse.ok ? <p className="error">Erreur génération projet: {formatError(projectResponse)}</p> : null}
          {response?.ok && response.warnings.length > 0 ? (
            <div className="card demo-notes">
              <h3>Notes de démo</h3>
              {response.warnings.map((warning) => <p className="hint" key={warning}>{warning}</p>)}
            </div>
          ) : null}
        </div>

        <div className="panel result-grid">
          <h2>Support de partie</h2>
          {!result ? <p className="hint">Le résultat apparaîtra ici sous forme de cartes, plateau, phases et aides de jeu.</p> : null}
          {result ? (
            <>
              <GameSupportPreview
                result={result}
                project={generatedProject ?? undefined}
                onSpeakPersona={speakPersona}
                speakingPersonaId={speakingPersonaId}
              />
              <PackageFacts result={result} />
              <details className="card json-details">
                <summary>JSON complet validé</summary>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </details>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
