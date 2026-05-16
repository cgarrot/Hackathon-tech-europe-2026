import type { ForgeResult } from "@/compiler/schemas";

const MAX_SESSION_PHASES = 16;
const MAX_PHASE_ACTIONS = 12;
const MAX_SESSION_EVENTS = 240;
const MAX_SESSION_ROUNDS = 12;

export type VoiceGameEventKind =
  | "session_started"
  | "phase_started"
  | "utterance"
  | "visual_cue"
  | "input_window"
  | "transcript_received"
  | "state_updated"
  | "game_ended";

export type VoiceGameSpeakerKind = "narrator" | "persona" | "system" | "player";
export type VoiceGameSessionStatus = "running" | "ended";

export interface VoiceGameParticipant {
  id: string;
  displayName: string;
  kind: "human" | "ai";
  personaId?: string;
  alive: boolean;
}

interface VoiceGamePrivateParticipant extends VoiceGameParticipant {
  roleId: string;
  roleName: string;
  teamOrSide: string;
  speechStyle?: string;
  sampleLines: string[];
}

export interface VoiceGamePhase {
  id: string;
  name: string;
  purpose: string;
  allowedActions: string[];
  next: string;
  durationSec: number;
  inputMode: "none" | "voice";
}

export interface VoiceGameInputWindow {
  id: string;
  phaseId: string;
  durationSec: number;
  prompt: string;
  expectedActions: string[];
}

export interface VoiceGameEvent {
  id: string;
  sequence: number;
  kind: VoiceGameEventKind;
  phaseId?: string;
  speaker: {
    id: string;
    kind: VoiceGameSpeakerKind;
    displayName: string;
    personaId?: string;
    speechStyle?: string;
  };
  text: string;
  visibility: "public" | "private";
  recipientParticipantId?: string;
  durationSec?: number;
  visualCue?: {
    scene: string;
    mood: string;
    motion: string;
  };
}

export interface VoiceGameSession {
  sessionId: string;
  sourceGameId: string;
  title: string;
  language: string;
  status: VoiceGameSessionStatus;
  round: number;
  activePhaseIndex: number;
  phases: VoiceGamePhase[];
  participants: VoiceGamePrivateParticipant[];
  pendingInput?: VoiceGameInputWindow;
  events: VoiceGameEvent[];
  nextSequence: number;
}

export interface VoiceGamePublicSession {
  sessionId: string;
  sourceGameId: string;
  title: string;
  language: string;
  status: VoiceGameSessionStatus;
  round: number;
  activePhase: VoiceGamePhase;
  participants: VoiceGameParticipant[];
  pendingInput?: VoiceGameInputWindow;
  events: VoiceGameEvent[];
}

export interface AdvanceVoiceGameInput {
  transcript?: string;
  participantId?: string;
}

function phaseDurationSec(allowedActions: string[]) {
  return Math.min(75, Math.max(16, 18 + allowedActions.length * 8));
}

function phaseNeedsVoiceInput(phaseId: string, actions: string[]) {
  const normalized = `${phaseId} ${actions.join(" ")}`.toLowerCase();
  return /discuss|debate|vote|accuse|answer|choice|interrog|talk|speak|discut|voter|repond|choisir|kill|inspect|night|nuit|seer|wolf|loup|voyante/.test(normalized);
}

function normalizePhases(result: ForgeResult): VoiceGamePhase[] {
  return result.gameSpec.phases.slice(0, MAX_SESSION_PHASES).map((phase) => ({
    ...phase,
    allowedActions: phase.allowedActions.slice(0, MAX_PHASE_ACTIONS),
    durationSec: phaseDurationSec(phase.allowedActions.slice(0, MAX_PHASE_ACTIONS)),
    inputMode: phaseNeedsVoiceInput(phase.id, phase.allowedActions) ? "voice" : "none"
  }));
}

function expandRoles(result: ForgeResult) {
  const roles = result.gameSpec.rolesOrActors.flatMap((role) => {
    const count = Math.max(0, role.count);
    return Array.from({ length: count }, () => role);
  });

  return roles.length > 0 ? roles : result.gameSpec.rolesOrActors;
}

function buildParticipants(result: ForgeResult): VoiceGamePrivateParticipant[] {
  const roles = expandRoles(result);
  const total = result.gameSpec.players.total;
  const humans = result.gameSpec.players.humans;

  return Array.from({ length: total }, (_, index) => {
    const role = roles[index % Math.max(roles.length, 1)];
    const persona = result.package.personas[(index - humans) % Math.max(result.package.personas.length, 1)];
    const isHuman = index < humans;
    const displayName = isHuman ? `Joueur ${index + 1}` : persona?.displayName ?? `IA ${index + 1 - humans}`;

    return {
      id: isHuman ? `human_${index + 1}` : `ai_${index + 1 - humans}`,
      displayName,
      kind: isHuman ? "human" : "ai",
      personaId: isHuman ? undefined : persona?.id,
      alive: true,
      roleId: role?.id ?? "participant",
      roleName: role?.name ?? "Participant",
      teamOrSide: role?.teamOrSide ?? "neutral",
      speechStyle: persona?.speechStyle,
      sampleLines: persona?.sampleLines ?? []
    };
  });
}

function narratorSpeaker() {
  return {
    id: "narrator",
    kind: "narrator" as const,
    displayName: "Maître du jeu",
    speechStyle: "mysterious"
  };
}

function eventId(sessionId: string, sequence: number) {
  return `${sessionId}:${sequence}`;
}

function pushEvent(session: VoiceGameSession, event: Omit<VoiceGameEvent, "id" | "sequence">) {
  const fullEvent: VoiceGameEvent = {
    ...event,
    id: eventId(session.sessionId, session.nextSequence),
    sequence: session.nextSequence
  };
  session.events.push(fullEvent);
  if (session.events.length > MAX_SESSION_EVENTS) {
    session.events.splice(0, session.events.length - MAX_SESSION_EVENTS);
  }
  session.nextSequence += 1;
  return fullEvent;
}

function currentPhase(session: VoiceGameSession) {
  return session.phases[session.activePhaseIndex] ?? session.phases[0];
}

function phaseMood(phase: VoiceGamePhase) {
  const normalized = `${phase.id} ${phase.name}`.toLowerCase();
  if (/night|nuit/.test(normalized)) {
    return "sombre, secret, basse lumière";
  }
  if (/vote|accus/.test(normalized)) {
    return "tendu, public, focalisé sur les visages";
  }
  if (/day|jour|discussion|debate/.test(normalized)) {
    return "social, nerveux, révélateur";
  }
  return "cinématique, lisible, immersif";
}

function narrationForPhase(phase: VoiceGamePhase) {
  return `${phase.name}. ${phase.purpose} Vous avez ${phase.durationSec} secondes pour cette séquence.`;
}

function stableTextScore(value: string) {
  return Array.from(value).reduce((score, character) => score + character.charCodeAt(0), 0);
}

function phaseKeywords(phase: VoiceGamePhase) {
  return `${phase.id} ${phase.name} ${phase.purpose} ${phase.allowedActions.join(" ")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function pickGeneratedSampleLine(participant: VoiceGamePrivateParticipant, phase: VoiceGamePhase, round: number) {
  const sampleLines = participant.sampleLines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (sampleLines.length === 0) {
    return undefined;
  }

  const keywords = phaseKeywords(phase);
  const matchingLine = sampleLines.find((line) => {
    const normalizedLine = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return keywords.some((keyword) => normalizedLine.includes(keyword));
  });
  if (matchingLine) {
    return matchingLine;
  }

  const selector = stableTextScore(`${participant.id}:${phase.id}:${round}`);
  return sampleLines[selector % sampleLines.length];
}

function personaLine(participant: VoiceGamePrivateParticipant, phase: VoiceGamePhase, round: number) {
  const generatedSample = pickGeneratedSampleLine(participant, phase, round);
  if (generatedSample) {
    return generatedSample;
  }

  const styleHint = participant.speechStyle ? `Sur un ton ${participant.speechStyle}, ` : "";

  const normalized = `${phase.id} ${phase.name}`.toLowerCase();
  if (/night|nuit/.test(normalized)) {
    return `${styleHint}${participant.displayName} observe la scène en silence pendant ${phase.name}.`;
  }

  if (/vote|accus/.test(normalized)) {
    return `${styleHint}${participant.displayName} hésite, puis compare les arguments avant de répondre.`;
  }

  return `${styleHint}${participant.displayName} réagit à la phase ${phase.name}: ${phase.purpose}`;
}

function addPrivateRoleEvents(session: VoiceGameSession) {
  for (const participant of session.participants) {
    pushEvent(session, {
      kind: "state_updated",
      speaker: { id: "system", kind: "system", displayName: "Distribution secrète" },
      text: `${participant.displayName}, ton rôle secret est ${participant.roleName}. Objectif: ${participant.teamOrSide}.`,
      visibility: "private",
      recipientParticipantId: participant.id
    });
  }
}

function addPhaseEvents(session: VoiceGameSession) {
  const phase = currentPhase(session);
  session.pendingInput = undefined;

  pushEvent(session, {
    kind: "phase_started",
    phaseId: phase.id,
    speaker: { id: "system", kind: "system", displayName: "Système" },
    text: `Phase ${session.activePhaseIndex + 1}/${session.phases.length}: ${phase.name}`,
    visibility: "public",
    durationSec: phase.durationSec,
    visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "cut" }
  });

  pushEvent(session, {
    kind: "utterance",
    phaseId: phase.id,
    speaker: narratorSpeaker(),
    text: narrationForPhase(phase),
    visibility: "public",
    visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "slow_push" }
  });

  const aiSpeakers = session.participants.filter((participant) => participant.kind === "ai" && participant.alive).slice(0, 2);
  for (const participant of aiSpeakers) {
    pushEvent(session, {
      kind: "utterance",
      phaseId: phase.id,
      speaker: {
        id: participant.id,
        kind: "persona",
        displayName: participant.displayName,
        personaId: participant.personaId,
        speechStyle: participant.speechStyle ?? "expressive"
      },
      text: personaLine(participant, phase, session.round),
      visibility: "public",
      visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "character_reaction" }
    });
  }

  pushEvent(session, {
    kind: "visual_cue",
    phaseId: phase.id,
    speaker: { id: "visual_director", kind: "system", displayName: "Direction vidéo" },
    text: `Storyboard: ${phase.name} — ${phaseMood(phase)}.`,
    visibility: "public",
    visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "storyboard_frame" }
  });

  if (phase.inputMode === "voice") {
    const inputWindow = {
      id: `${session.sessionId}:${phase.id}:input:${session.round}`,
      phaseId: phase.id,
      durationSec: phase.durationSec,
      prompt: `Parlez maintenant pour ${phase.name}. Actions attendues: ${phase.allowedActions.join(", ") || "réaction libre"}.`,
      expectedActions: phase.allowedActions
    };
    session.pendingInput = inputWindow;
    pushEvent(session, {
      kind: "input_window",
      phaseId: phase.id,
      speaker: { id: "system", kind: "system", displayName: "Fenêtre vocale" },
      text: inputWindow.prompt,
      visibility: "public",
      durationSec: inputWindow.durationSec,
      visualCue: { scene: phase.id, mood: "micro ouvert, tension de table", motion: "recording_pulse" }
    });
  }
}

export function createVoiceGameSession(params: { sessionId: string; result: ForgeResult }): VoiceGameSession {
  const phases = normalizePhases(params.result);
  const session: VoiceGameSession = {
    sessionId: params.sessionId,
    sourceGameId: params.result.gameSpec.gameId,
    title: params.result.gameSpec.title,
    language: params.result.intake.language,
    status: "running",
    round: 1,
    activePhaseIndex: 0,
    phases,
    participants: buildParticipants(params.result),
    events: [],
    nextSequence: 1
  };

  pushEvent(session, {
    kind: "session_started",
    speaker: { id: "system", kind: "system", displayName: "GameForge" },
    text: `Session lancée pour ${session.title}. Le moteur vocal déroule les phases automatiquement.`,
    visibility: "public"
  });
  addPrivateRoleEvents(session);
  addPhaseEvents(session);
  return session;
}

function findParticipant(session: VoiceGameSession, participantId?: string) {
  if (participantId) {
    return session.participants.find((participant) => participant.id === participantId && participant.kind === "human" && participant.alive);
  }

  return session.participants.find((participant) => participant.kind === "human" && participant.alive);
}

function nextPhaseIndex(session: VoiceGameSession, previousPhase: VoiceGamePhase) {
  const explicitNextIndex = session.phases.findIndex((phase) => phase.id === previousPhase.next);
  if (explicitNextIndex >= 0) {
    return explicitNextIndex;
  }

  const sequentialNextIndex = session.activePhaseIndex + 1;
  return sequentialNextIndex < session.phases.length ? sequentialNextIndex : -1;
}

export function advanceVoiceGameSession(session: VoiceGameSession, input: AdvanceVoiceGameInput = {}) {
  if (session.status === "ended") {
    return session;
  }

  const previousPhase = currentPhase(session);
  const transcript = input.transcript?.trim();
  if (transcript && session.pendingInput) {
    const participant = findParticipant(session, input.participantId);
    pushEvent(session, {
      kind: "transcript_received",
      phaseId: previousPhase.id,
      speaker: {
        id: participant?.id ?? "human_1",
        kind: "player",
        displayName: participant?.displayName ?? "Joueur"
      },
      text: transcript.slice(0, 800),
      visibility: "public",
      visualCue: { scene: previousPhase.id, mood: "voix joueur capturée", motion: "subtitle_pop" }
    });
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Moteur" },
      text: `Input vocal accepté pour ${previousPhase.name}. Le moteur garde l'état et prépare la suite.`,
      visibility: "public"
    });
  } else if (transcript) {
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Moteur" },
      text: `Transcript ignoré pour ${previousPhase.name}: aucune fenêtre vocale n'était ouverte.`,
      visibility: "public"
    });
  } else if (session.pendingInput) {
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Moteur" },
      text: `Aucun input vocal reçu pour ${previousPhase.name}; application du comportement par défaut.`,
      visibility: "public"
    });
  }

  session.pendingInput = undefined;
  const nextIndex = nextPhaseIndex(session, previousPhase);
  if (nextIndex < 0) {
    session.status = "ended";
    pushEvent(session, {
      kind: "game_ended",
      phaseId: previousPhase.id,
      speaker: narratorSpeaker(),
      text: `La séquence de démonstration se termine. ${session.title} peut être rejoué avec le même journal vocal.`,
      visibility: "public",
      visualCue: { scene: "ending", mood: "résolution cinématique", motion: "fade_out" }
    });
    return session;
  }

  if (nextIndex <= session.activePhaseIndex) {
    if (session.round >= MAX_SESSION_ROUNDS) {
      session.status = "ended";
      pushEvent(session, {
        kind: "game_ended",
        phaseId: previousPhase.id,
        speaker: narratorSpeaker(),
        text: `La session atteint sa limite de ${MAX_SESSION_ROUNDS} rounds et se termine proprement.`,
        visibility: "public",
        visualCue: { scene: "ending", mood: "limite de session atteinte", motion: "fade_out" }
      });
      return session;
    }
    session.round += 1;
  }
  session.activePhaseIndex = nextIndex;
  addPhaseEvents(session);
  return session;
}

function toPublicVoiceGameEvent(event: VoiceGameEvent): VoiceGameEvent | null {
  if (event.visibility !== "public") {
    return null;
  }

  return {
    ...event,
    recipientParticipantId: undefined
  };
}

export function toPublicVoiceGameSession(session: VoiceGameSession): VoiceGamePublicSession {
  const publicEvents = session.events.flatMap((event) => {
    const publicEvent = toPublicVoiceGameEvent(event);
    return publicEvent ? [publicEvent] : [];
  });

  return {
    sessionId: session.sessionId,
    sourceGameId: session.sourceGameId,
    title: session.title,
    language: session.language,
    status: session.status,
    round: session.round,
    activePhase: currentPhase(session),
    participants: session.participants.map(({ id, displayName, kind, personaId, alive }) => ({ id, displayName, kind, personaId, alive })),
    pendingInput: session.pendingInput,
    events: publicEvents
  };
}
