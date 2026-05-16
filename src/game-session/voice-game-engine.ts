import type { ForgeResult } from "@/compiler/schemas";

const MAX_SESSION_PHASES = 16;
const MAX_PHASE_ACTIONS = 12;
const MAX_SESSION_EVENTS = 240;
const MAX_SESSION_ROUNDS = 12;
const MAX_VOICE_INPUT_DURATION_SEC = 30;

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

export interface VoiceGamePlayerView {
  participantId: string;
  displayName: string;
  roleName: string;
  objective: string;
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

type VoiceGameIntentConfidence = "high" | "medium" | "low";
type VoiceGameEliminationKind = "night_kill" | "vote_elimination";

interface VoiceGamePlayerIntent {
  phaseId: string;
  phaseName: string;
  participantId: string;
  participantName: string;
  transcript: string;
  matchedAction?: string;
  confidence: VoiceGameIntentConfidence;
  summary: string;
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
  lastPlayerIntent?: VoiceGamePlayerIntent;
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
  ownPlayer?: VoiceGamePlayerView;
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

function identityTokens(value: string | undefined) {
  return normalizeIntentText(value ?? "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function hiddenRoleLeakTokens(result: ForgeResult) {
  return new Set(result.gameSpec.rolesOrActors.flatMap((role) => [
    ...identityTokens(role.id),
    ...identityTokens(role.name)
  ]));
}

function isHiddenRoleGame(result: ForgeResult) {
  return result.gameSpec.mechanics.includes("hidden_roles") || result.intake.primaryMechanics.includes("hidden_roles");
}

function sanitizePublicHiddenRoleIdentity(params: {
  value: string | undefined;
  fallback: string;
  hiddenRoleGame: boolean;
  roleLeakTokens: Set<string>;
}) {
  const trimmedValue = params.value?.trim();
  if (!trimmedValue) {
    return params.fallback;
  }

  if (!params.hiddenRoleGame) {
    return trimmedValue;
  }

  const leaksHiddenRole = identityTokens(trimmedValue).some((token) => params.roleLeakTokens.has(token));
  return leaksHiddenRole ? params.fallback : trimmedValue;
}

function buildParticipants(result: ForgeResult): VoiceGamePrivateParticipant[] {
  const roles = expandRoles(result);
  const total = result.gameSpec.players.total;
  const humans = result.gameSpec.players.humans;
  const hiddenRoleGame = isHiddenRoleGame(result);
  const roleLeakTokens = hiddenRoleLeakTokens(result);

  return Array.from({ length: total }, (_, index) => {
    const role = roles[index % Math.max(roles.length, 1)];
    const persona = result.package.personas[(index - humans) % Math.max(result.package.personas.length, 1)];
    const isHuman = index < humans;
    const aiOrdinal = index + 1 - humans;
    const displayName = isHuman ? `Player ${index + 1}` : sanitizePublicHiddenRoleIdentity({
      value: persona?.displayName,
      fallback: `AI ${aiOrdinal}`,
      hiddenRoleGame,
      roleLeakTokens
    });
    const personaId = isHuman ? undefined : sanitizePublicHiddenRoleIdentity({
      value: persona?.id,
      fallback: `ai_${aiOrdinal}`,
      hiddenRoleGame,
      roleLeakTokens
    });

    return {
      id: isHuman ? `human_${index + 1}` : `ai_${index + 1 - humans}`,
      displayName,
      kind: isHuman ? "human" : "ai",
      personaId,
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
    displayName: "Game master",
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
    return "dark, secretive, low-light";
  }
  if (/vote|accus/.test(normalized)) {
    return "tense public frame, faces in focus";
  }
  if (/day|jour|discussion|debate/.test(normalized)) {
    return "social anxious energy";
  }
  return "cinematic readable immersion";
}

function narrationForPhase(phase: VoiceGamePhase) {
  return `${phase.name}. ${phase.purpose} You have ${phase.durationSec} seconds for this beat.`;
}

function stableTextScore(value: string) {
  return Array.from(value).reduce((score, character) => score + character.charCodeAt(0), 0);
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function intentTokens(value: string) {
  return normalizeIntentText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

const actionIntentMatchers = [
  {
    action: /werewolf|wolf|loup|kill|elimin|attack|victim|victime/,
    transcript: /tue|tuer|elimine|eliminer|attaque|attaquer|victime|mange|kill|loup/,
    score: 4
  },
  {
    action: /seer|voyante|inspect|scan|reveal|vision/,
    transcript: /inspecte|inspecter|verifie|verifier|regarde|sonder|sonde|voyante|vision|revele|reveler/,
    score: 4
  },
  {
    action: /vote|voter|ballot|accus|suspect/,
    transcript: /vote|voter|contre|accuse|accuser|suspect|suspecte|eliminer|choisis|choisir/,
    score: 3
  },
  {
    action: /discuss|debate|talk|speak|discut|parler/,
    transcript: /pense|crois|soupconne|suspect|argument|explique|parle|avis|indice|preuve/,
    score: 3
  },
  {
    action: /answer|repond|reply|question|quiz/,
    transcript: /reponse|reponds|repondre|answer|question|propose|dis|donne/,
    score: 3
  },
  {
    action: /choice|choose|choisir|select|decision/,
    transcript: /choisis|choisir|selectionne|selectionner|option|decision|prends/,
    score: 3
  },
  {
    action: /protect|guard|save|heal|witch|potion/,
    transcript: /protege|proteger|sauve|sauver|garde|soigne|potion/,
    score: 4
  }
];

function readableAction(action: string) {
  return action.replace(/[_-]+/g, " ");
}

function scoreActionAgainstTranscript(action: string, transcript: string) {
  const normalizedAction = normalizeIntentText(action);
  const normalizedTranscript = normalizeIntentText(transcript);
  const tokenScore = intentTokens(action).reduce((score, token) => score + (normalizedTranscript.includes(token) ? 2 : 0), 0);
  const matcherScore = actionIntentMatchers.reduce((score, matcher) => {
    if (matcher.action.test(normalizedAction) && matcher.transcript.test(normalizedTranscript)) {
      return score + matcher.score;
    }
    return score;
  }, 0);

  return tokenScore + matcherScore;
}

function analyzePlayerTranscript(params: {
  phase: VoiceGamePhase;
  participantId: string;
  participantName: string;
  transcript: string;
}): VoiceGamePlayerIntent {
  const rankedActions = params.phase.allowedActions
    .map((action) => ({ action, score: scoreActionAgainstTranscript(action, params.transcript) }))
    .sort((left, right) => right.score - left.score);
  const bestAction = rankedActions.find((action) => action.score > 0);
  const confidence: VoiceGameIntentConfidence = bestAction ? (bestAction.score >= 4 ? "high" : "medium") : "low";
  const clippedTranscript = params.transcript.slice(0, 800);
  const actionText = bestAction ? `detected "${readableAction(bestAction.action)}"` : "open-ended reaction captured";

  return {
    phaseId: params.phase.id,
    phaseName: params.phase.name,
    participantId: params.participantId,
    participantName: params.participantName,
    transcript: clippedTranscript,
    matchedAction: bestAction?.action,
    confidence,
    summary: `${params.participantName} signaled ${actionText} during ${params.phase.name}: "${clippedTranscript.slice(0, 180)}"`
  };
}

function playerIntentActionText(intent: VoiceGamePlayerIntent) {
  return intent.matchedAction ? `"${readableAction(intent.matchedAction)}"` : "open-ended cue";
}

function continuationTextForIntent(intent: VoiceGamePlayerIntent, phase: VoiceGamePhase) {
  return `Continuity seeded by ${intent.participantName}: ${playerIntentActionText(intent)} captured in ${intent.phaseName}. ${phase.name} now builds from "${intent.transcript.slice(0, 220)}".`;
}

function normalizedWords(value: string) {
  return normalizeIntentText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function participantAliases(participant: VoiceGamePrivateParticipant) {
  const aliases = new Set<string>();
  aliases.add(participant.displayName);
  aliases.add(participant.id);
  aliases.add(participant.id.replaceAll("_", " "));

  const humanMatch = /^human_(\d+)$/.exec(participant.id);
  if (humanMatch) {
    aliases.add(`player ${humanMatch[1]}`);
    aliases.add(`joueur ${humanMatch[1]}`);
  }

  const aiMatch = /^ai_(\d+)$/.exec(participant.id);
  if (aiMatch) {
    aliases.add(`ai ${aiMatch[1]}`);
    aliases.add(`ia ${aiMatch[1]}`);
  }

  return Array.from(aliases)
    .map((alias) => normalizedWords(alias))
    .filter((alias) => alias.length >= 3);
}

function transcriptMentionsAlias(transcript: string, alias: string) {
  return ` ${transcript} `.includes(` ${alias} `);
}

function findTargetParticipant(session: VoiceGameSession, actorId: string, transcript: string) {
  const normalizedTranscript = normalizedWords(transcript);
  const candidates = session.participants.filter((participant) => participant.alive && participant.id !== actorId);
  const matches = candidates.flatMap((participant) => {
    const aliases = participantAliases(participant).filter((alias) => transcriptMentionsAlias(normalizedTranscript, alias));
    const longestAliasLength = aliases.reduce((longest, alias) => Math.max(longest, alias.length), 0);
    return longestAliasLength > 0 ? [{ participant, longestAliasLength }] : [];
  });

  return matches.sort((left, right) => right.longestAliasLength - left.longestAliasLength)[0]?.participant;
}

function eliminationKindForIntent(phase: VoiceGamePhase, intent: VoiceGamePlayerIntent): VoiceGameEliminationKind | undefined {
  const action = normalizeIntentText(intent.matchedAction ?? "");
  const transcript = normalizeIntentText(intent.transcript);
  const phaseIntent = normalizedPhaseIntent(phase);

  if (/seer|voyante|inspect|scan|reveal|vision|protect|guard|save|heal|witch|potion/.test(action)) {
    return undefined;
  }

  const voteContext = /vote|voter|ballot|accus|suspect/.test(`${action} ${phaseIntent}`);
  const voteTranscript = /vote|voter|contre|accuse|accuser|suspect|suspecte|eliminer|elimine|exile|bannir|banish/.test(transcript);
  if (voteContext && voteTranscript) {
    return "vote_elimination";
  }

  const killContext = /werewolf|wolf|loup|kill|elimin|attack|victim|victime|night|nuit/.test(`${action} ${phaseIntent}`);
  const killTranscript = /tue|tuer|elimine|eliminer|attaque|attaquer|victime|mange|devore|devorer|kill|loup/.test(transcript);
  if (killContext && killTranscript) {
    return "night_kill";
  }

  return undefined;
}

function isWerewolfParticipant(participant: VoiceGamePrivateParticipant) {
  const identity = normalizeIntentText(`${participant.roleId} ${participant.roleName} ${participant.teamOrSide}`);
  return /werewolf|wolf|loup|garou/.test(identity);
}

function victoryTextForSession(session: VoiceGameSession) {
  const wolfParticipants = session.participants.filter(isWerewolfParticipant);
  if (wolfParticipants.length === 0) {
    return undefined;
  }

  const aliveWolves = wolfParticipants.filter((participant) => participant.alive).length;
  const aliveNonWolves = session.participants.filter((participant) => participant.alive && !isWerewolfParticipant(participant)).length;
  if (aliveWolves === 0) {
    return "Village victory: no wolf faction remains alive.";
  }
  if (aliveWolves >= aliveNonWolves) {
    return "Werewolf victory: the wolves have reached parity with the village.";
  }

  return undefined;
}

function endSessionWithVictory(session: VoiceGameSession, phaseId: string, text: string) {
  session.status = "ended";
  session.pendingInput = undefined;
  session.lastPlayerIntent = undefined;
  pushEvent(session, {
    kind: "game_ended",
    phaseId,
    speaker: narratorSpeaker(),
    text,
    visibility: "public",
    visualCue: { scene: "ending", mood: "faction victory resolved", motion: "fade_out" }
  });
}

function resolvePlayerElimination(session: VoiceGameSession, phase: VoiceGamePhase, intent: VoiceGamePlayerIntent) {
  const eliminationKind = eliminationKindForIntent(phase, intent);
  if (!eliminationKind) {
    return false;
  }

  const target = findTargetParticipant(session, intent.participantId, intent.transcript);
  if (!target) {
    pushEvent(session, {
      kind: "state_updated",
      phaseId: phase.id,
      speaker: { id: "system", kind: "system", displayName: "Rules engine" },
      text: `No elimination resolved for ${intent.participantName}: name a living target such as ${session.participants
        .filter((participant) => participant.alive && participant.id !== intent.participantId)
        .map((participant) => participant.displayName)
        .join(", ") || "another player"}.`,
      visibility: "public"
    });
    return false;
  }

  target.alive = false;
  pushEvent(session, {
    kind: "state_updated",
    phaseId: phase.id,
    speaker: { id: "system", kind: "system", displayName: "Rules engine" },
    text: eliminationKind === "night_kill"
      ? `${target.displayName} is eliminated by the night action and will no longer act.`
      : `${target.displayName} is eliminated by the table vote and will no longer act.`,
    visibility: "public",
    visualCue: { scene: phase.id, mood: "elimination resolved", motion: "token_removed" }
  });

  const victoryText = victoryTextForSession(session);
  if (victoryText) {
    endSessionWithVictory(session, phase.id, victoryText);
    return true;
  }

  return false;
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
  let bestLine: string | undefined;
  let bestKeywordIndex = Number.MAX_SAFE_INTEGER;
  let bestMatchCount = 0;

  for (const line of sampleLines) {
    const normalizedLine = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchingKeywordIndexes = keywords.flatMap((keyword, index) => (normalizedLine.includes(keyword) ? [index] : []));
    if (matchingKeywordIndexes.length === 0) {
      continue;
    }

    const earliestKeywordIndex = Math.min(...matchingKeywordIndexes);
    if (earliestKeywordIndex < bestKeywordIndex || (earliestKeywordIndex === bestKeywordIndex && matchingKeywordIndexes.length > bestMatchCount)) {
      bestLine = line;
      bestKeywordIndex = earliestKeywordIndex;
      bestMatchCount = matchingKeywordIndexes.length;
    }
  }

  if (bestLine) {
    return bestLine;
  }

  const selector = stableTextScore(`${participant.id}:${phase.id}:${round}`);
  return sampleLines[selector % sampleLines.length];
}

function personaLine(participant: VoiceGamePrivateParticipant, phase: VoiceGamePhase, round: number, playerIntent?: VoiceGamePlayerIntent) {
  if (playerIntent) {
    return `${participant.displayName} reacts to ${playerIntent.participantName}: "${playerIntent.transcript.slice(0, 160)}". ${participant.displayName} retunes their beat for ${phase.name} around this ${playerIntentActionText(playerIntent)}.`;
  }

  const generatedSample = pickGeneratedSampleLine(participant, phase, round);
  if (generatedSample) {
    return generatedSample;
  }

  const styleHint = participant.speechStyle ? `Tone: ${participant.speechStyle}; ` : "";

  const normalized = `${phase.id} ${phase.name}`.toLowerCase();
  if (/night|nuit/.test(normalized)) {
    return `${styleHint}${participant.displayName} watches the tableau in silence through ${phase.name}.`;
  }

  if (/vote|accus/.test(normalized)) {
    return `${styleHint}${participant.displayName} hesitates, weighs arguments, then weighs in.`;
  }

  return `${styleHint}${participant.displayName} threads ${phase.name} with intent: ${phase.purpose}`;
}

function inputPromptForPhase(session: VoiceGameSession, phase: VoiceGamePhase) {
  const livingPlayers = session.participants
    .filter((participant) => participant.alive)
    .map((participant) => participant.displayName)
    .join(", ");
  const targetHint = /vote|voter|kill|elimin|loup|wolf|werewolf|accus/.test(normalizedPhaseIntent(phase))
    ? ` Name a living target to resolve votes or eliminations. Living players: ${livingPlayers}.`
    : "";

  return `Speak now for ${phase.name}. Expected actions: ${phase.allowedActions.join(", ") || "open reaction"}.${targetHint}`;
}

function normalizedPhaseIntent(phase: VoiceGamePhase) {
  return `${phase.id} ${phase.name} ${phase.purpose} ${phase.allowedActions.join(" ")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function generatedSilentPlayerResponse(phase: VoiceGamePhase) {
  const normalized = normalizedPhaseIntent(phase);

  if (/night|nuit|secret|werewolf|wolf|loup|seer|voyante|inspect/.test(normalized)) {
    return "Doing my covert action quietly without revealing who I really am.";
  }

  if (/vote|voter|ballot/.test(normalized)) {
    return "I'm voting against whoever feels least consistent with the table—I own this call.";
  }

  if (/accus|suspect|discuss|debate|talk|speak|discut|parler/.test(normalized)) {
    return "Vague replies feel off; someone needs to explain themselves clearly.";
  }

  if (/answer|repond|reply|question|quiz/.test(normalized)) {
    return "Locking my answer—short and confident.";
  }

  if (/choice|choose|choisir|select|decision/.test(normalized)) {
    return "Choosing the lane that favors my faction, then scanning for how the crowd reacts.";
  }

  return `Making a deliberate move during ${phase.name} so momentum keeps tipping forward.`;
}

function addPrivateRoleEvents(session: VoiceGameSession) {
  for (const participant of session.participants) {
    pushEvent(session, {
      kind: "state_updated",
      speaker: { id: "system", kind: "system", displayName: "Secret deal-out" },
      text: `${participant.displayName}, your hidden role is ${participant.roleName}. Objective: ${participant.teamOrSide}.`,
      visibility: "private",
      recipientParticipantId: participant.id
    });
  }
}

function addPhaseEvents(session: VoiceGameSession) {
  const phase = currentPhase(session);
  const carriedPlayerIntent = session.lastPlayerIntent;
  session.pendingInput = undefined;
  session.lastPlayerIntent = undefined;

  pushEvent(session, {
    kind: "phase_started",
    phaseId: phase.id,
    speaker: { id: "system", kind: "system", displayName: "System" },
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

  if (carriedPlayerIntent) {
    pushEvent(session, {
      kind: "state_updated",
      phaseId: phase.id,
      speaker: { id: "system", kind: "system", displayName: "Voice inference" },
      text: continuationTextForIntent(carriedPlayerIntent, phase),
      visibility: "public",
      visualCue: { scene: phase.id, mood: "plot branch shaped by player vocal input", motion: "branch_reveal" }
    });
  }

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
      text: personaLine(participant, phase, session.round, carriedPlayerIntent),
      visibility: "public",
      visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "character_reaction" }
    });
  }

  pushEvent(session, {
    kind: "visual_cue",
    phaseId: phase.id,
    speaker: { id: "visual_director", kind: "system", displayName: "Video director" },
    text: `Storyboard: ${phase.name} — ${phaseMood(phase)}.`,
    visibility: "public",
    visualCue: { scene: phase.id, mood: phaseMood(phase), motion: "storyboard_frame" }
  });

  if (phase.inputMode === "voice") {
    const inputWindow = {
      id: `${session.sessionId}:${phase.id}:input:${session.round}`,
      phaseId: phase.id,
      durationSec: Math.min(MAX_VOICE_INPUT_DURATION_SEC, phase.durationSec),
      prompt: inputPromptForPhase(session, phase),
      expectedActions: phase.allowedActions
    };
    session.pendingInput = inputWindow;
    pushEvent(session, {
      kind: "input_window",
      phaseId: phase.id,
      speaker: { id: "system", kind: "system", displayName: "Voice window" },
      text: inputWindow.prompt,
      visibility: "public",
      durationSec: inputWindow.durationSec,
      visualCue: { scene: phase.id, mood: "mic hot, tabletop tension spike", motion: "recording_pulse" }
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
    text: `Session underway for ${session.title}. Voice engine advancing phases automatically.`,
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
  let sessionEndedByResolution = false;
  if (transcript && session.pendingInput) {
    const participant = findParticipant(session, input.participantId);
    const participantId = participant?.id ?? "human_1";
    const participantName = participant?.displayName ?? "Player";
    const playerIntent = analyzePlayerTranscript({
      phase: previousPhase,
      participantId,
      participantName,
      transcript
    });
    session.lastPlayerIntent = playerIntent;
    pushEvent(session, {
      kind: "transcript_received",
      phaseId: previousPhase.id,
      speaker: {
        id: participantId,
        kind: "player",
        displayName: participantName
      },
      text: playerIntent.transcript,
      visibility: "public",
      visualCue: { scene: previousPhase.id, mood: "player vocal captured live", motion: "subtitle_pop" }
    });
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Voice inference" },
      text: `Voice cue: ${playerIntent.summary}. This intent primes the incoming phase.`,
      visibility: "public"
    });
    sessionEndedByResolution = resolvePlayerElimination(session, previousPhase, playerIntent);
  } else if (transcript) {
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Engine" },
      text: `Transcript discarded for ${previousPhase.name}: no voice window was open.`,
      visibility: "public"
    });
  } else if (session.pendingInput) {
    const participant = findParticipant(session, input.participantId);
    const displayName = participant?.displayName ?? "Player";
    pushEvent(session, {
      kind: "utterance",
      phaseId: previousPhase.id,
      speaker: {
        id: participant?.id ?? "human_1",
        kind: "player",
        displayName,
        speechStyle: participant?.speechStyle ?? "spontaneous and natural"
      },
      text: generatedSilentPlayerResponse(previousPhase).slice(0, 800),
      visibility: "public",
      visualCue: { scene: previousPhase.id, mood: "fallback player reaction synthesized", motion: "subtitle_pop" }
    });
    pushEvent(session, {
      kind: "state_updated",
      phaseId: previousPhase.id,
      speaker: { id: "system", kind: "system", displayName: "Engine" },
      text: `No live voice received for ${previousPhase.name}; auto line filled for ${displayName}.`,
      visibility: "public"
    });
  }

  session.pendingInput = undefined;
  if (sessionEndedByResolution) {
    return session;
  }

  const nextIndex = nextPhaseIndex(session, previousPhase);
  if (nextIndex < 0) {
    const finalIntent = session.lastPlayerIntent;
    session.lastPlayerIntent = undefined;
    session.status = "ended";
    pushEvent(session, {
      kind: "game_ended",
      phaseId: previousPhase.id,
      speaker: narratorSpeaker(),
      text: finalIntent
        ? `Demo path closes after honoring ${finalIntent.summary}. Replay ${session.title} with the same vocal log whenever you want.`
        : `Demo path wraps. Replay ${session.title} with the same vocal log whenever you want.`,
      visibility: "public",
      visualCue: { scene: "ending", mood: "cinematic resolution pass", motion: "fade_out" }
    });
    return session;
  }

  if (nextIndex <= session.activePhaseIndex) {
    if (session.round >= MAX_SESSION_ROUNDS) {
      const finalIntent = session.lastPlayerIntent;
      session.lastPlayerIntent = undefined;
      session.status = "ended";
      pushEvent(session, {
        kind: "game_ended",
        phaseId: previousPhase.id,
        speaker: narratorSpeaker(),
        text: finalIntent
          ? `Hard stop at ${MAX_SESSION_ROUNDS} rounds—last spoken intent was ${finalIntent.summary}.`
          : `Hit the ${MAX_SESSION_ROUNDS}-round safety cap cleanly.`,
        visibility: "public",
        visualCue: { scene: "ending", mood: "session safeguard ceiling", motion: "fade_out" }
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
  const ownHumanPlayer = session.participants.find((participant) => participant.kind === "human");

  return {
    sessionId: session.sessionId,
    sourceGameId: session.sourceGameId,
    title: session.title,
    language: session.language,
    status: session.status,
    round: session.round,
    activePhase: currentPhase(session),
    participants: session.participants.map(({ id, displayName, kind, personaId, alive }) => ({ id, displayName, kind, personaId, alive })),
    ownPlayer: ownHumanPlayer ? {
      participantId: ownHumanPlayer.id,
      displayName: ownHumanPlayer.displayName,
      roleName: ownHumanPlayer.roleName,
      objective: ownHumanPlayer.teamOrSide
    } : undefined,
    pendingInput: session.pendingInput,
    events: publicEvents
  };
}
