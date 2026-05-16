import type { ArtifactKind, GameFamily, Mechanic } from "./schemas";

export interface GamePack {
  id: string;
  label: string;
  family: GameFamily;
  triggers: string[];
  mechanics: Mechanic[];
  defaultOutputs: ArtifactKind[];
  guide: string;
  defaultPhases: string[];
  validationRules: string[];
}

export const GAME_PACKS: GamePack[] = [
  {
    id: "werewolf",
    label: "Werewolf / Loup-garou",
    family: "social_deduction",
    triggers: ["loup", "garou", "werewolf", "mafia", "village", "voyante", "sorciere", "sorcière"],
    mechanics: ["hidden_roles", "turn_phases", "voting", "elimination", "team_victory", "ai_personas"],
    defaultOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    guide: "Hidden-role social deduction with night actions, public discussion, voting, and faction victory.",
    defaultPhases: ["setup", "night", "dawn", "discussion", "vote", "resolution", "victory_check"],
    validationRules: [
      "At least one hostile hidden role is required.",
      "Every player must receive exactly one role.",
      "Both village and hostile factions need explicit win conditions."
    ]
  },
  {
    id: "mystery",
    label: "Mystery / Cluedo-like investigation",
    family: "investigation_mystery",
    triggers: ["enquete", "enquête", "murder", "meurtre", "manoir", "cluedo", "detective", "détective", "suspect"],
    mechanics: ["clue_discovery", "dialogue_interrogation", "solo_victory", "ai_personas", "custom_rules"],
    defaultOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    guide: "Investigation game with suspects, clues, locations, interrogations, and accusation resolution.",
    defaultPhases: ["setup", "exploration", "interrogation", "deduction", "accusation", "resolution"],
    validationRules: [
      "There must be one culprit, one motive, and at least three clues.",
      "Each suspect needs public and private information.",
      "The solution must be knowable from generated clues."
    ]
  },
  {
    id: "quiz",
    label: "Quiz / Blind-test party game",
    family: "quiz_party",
    triggers: ["quiz", "blind test", "trivia", "question", "musical", "score", "round"],
    mechanics: ["score_rounds", "turn_phases", "solo_victory", "audience_judging"],
    defaultOutputs: ["rules", "cards", "visuals", "voices", "code", "validation_report"],
    guide: "Round-based party game with prompts, scoring, reveal moments, and optional host persona.",
    defaultPhases: ["setup", "round_intro", "answer", "reveal", "score_update", "final_results"],
    validationRules: [
      "Every round must have a prompt, valid answer, and scoring rule.",
      "Tie-break behavior must be explicit.",
      "Generated content should avoid copyrighted exact audio reproduction."
    ]
  },
  {
    id: "debate",
    label: "Debate simulation",
    family: "debate_simulation",
    triggers: ["debat", "débat", "philosophie", "philosoph", "socrate", "nietzsche", "argument", "vote public"],
    mechanics: ["dialogue_interrogation", "audience_judging", "score_rounds", "ai_personas"],
    defaultOutputs: ["rules", "personas", "visuals", "voices", "code", "validation_report"],
    guide: "Structured debate with persona speakers, timed turns, rebuttals, audience judging, and scoring.",
    defaultPhases: ["setup", "opening", "argument", "rebuttal", "audience_vote", "judgement"],
    validationRules: [
      "Each debater needs a distinct stance and speaking style.",
      "The judge criteria must be explicit.",
      "Persona imitation must avoid claiming to be real living people."
    ]
  },
  {
    id: "survival",
    label: "Survival elimination",
    family: "survival_elimination",
    triggers: ["survie", "survival", "ile", "île", "battle royale", "famine", "tempete", "tempête", "predateur", "prédateur"],
    mechanics: ["resource_management", "survival_pressure", "turn_phases", "elimination", "solo_victory", "ai_personas"],
    defaultOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    guide: "Survival game with resources, hazards, events, alliances, and elimination pressure.",
    defaultPhases: ["setup", "event", "resource_choice", "conflict", "elimination", "survival_check"],
    validationRules: [
      "Resources must be finite and trackable.",
      "Elimination triggers must be fair and explicit.",
      "Hazards need counterplay."
    ]
  },
  {
    id: "generic",
    label: "Generic custom game",
    family: "custom",
    triggers: [],
    mechanics: ["custom_rules", "turn_phases", "ai_personas"],
    defaultOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    guide: "Fallback pack for unusual concepts. It converts the idea into phases, roles, goals, and artifacts conservatively.",
    defaultPhases: ["setup", "turn", "interaction", "resolution", "victory_check"],
    validationRules: [
      "The core loop must be explainable in three to five steps.",
      "Every player must have a meaningful action.",
      "Victory or ending conditions must be explicit."
    ]
  }
];

export function scorePack(prompt: string, pack: GamePack): number {
  const normalizedPrompt = prompt.toLowerCase();
  return pack.triggers.reduce((score, trigger) => {
    return normalizedPrompt.includes(trigger.toLowerCase()) ? score + 1 : score;
  }, 0);
}

export function selectGamePack(prompt: string): GamePack {
  const scored = GAME_PACKS
    .filter((pack) => pack.id !== "generic")
    .map((pack) => ({ pack, score: scorePack(prompt, pack) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return GAME_PACKS.find((pack) => pack.id === "generic") ?? GAME_PACKS[0];
  }

  return best.pack;
}

export function getGamePackById(id: string): GamePack | undefined {
  return GAME_PACKS.find((pack) => pack.id === id);
}

export function packRegistryForPrompt(): Array<Pick<GamePack, "id" | "label" | "family" | "guide" | "mechanics" | "defaultPhases" | "validationRules">> {
  return GAME_PACKS.map(({ id, label, family, guide, mechanics, defaultPhases, validationRules }) => ({
    id,
    label,
    family,
    guide,
    mechanics,
    defaultPhases,
    validationRules
  }));
}
