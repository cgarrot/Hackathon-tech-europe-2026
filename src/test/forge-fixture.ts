import type { ForgeResult } from "@/compiler/schemas";

export const validForgeResult: ForgeResult = {
  intake: {
    sourceRequest: "I want to play medieval werewolf with four players.",
    language: "en",
    gameFamily: "social_deduction",
    interactionModel: "tabletop party game",
    primaryMechanics: ["hidden_roles", "turn_phases", "voting", "elimination", "team_victory", "ai_personas"],
    theme: "Medieval hamlet",
    players: {
      total: 4,
      humans: 3,
      ai: 1
    },
    requiredOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    explicitRequirements: ["Four players", "One hidden wolf"],
    assumptions: ["Short demo-length session"],
    risks: [],
    confidence: 0.92
  },
  routing: {
    selectedPack: "werewolf",
    selectedFamily: "social_deduction",
    reason: "The request is a hidden-role werewolf game.",
    fallbackPack: "generic",
    confidence: 0.95
  },
  gameSpec: {
    gameId: "test_werewolf_game",
    title: "Shadows Over the Hamlet",
    pitch: "Each sunrise the villagers vote trying to exile the lone wolf before parity flips.",
    family: "social_deduction",
    pack: "werewolf",
    theme: "Medieval hamlet",
    players: {
      total: 4,
      humans: 3,
      ai: 1
    },
    mechanics: ["hidden_roles", "turn_phases", "voting", "elimination", "team_victory", "ai_personas"],
    coreLoop: [
      "Secretly distribute roles.",
      "Resolve nighttime powers quietly.",
      "Debate loudly by day.",
      "Vote until someone swings from the scaffold."
    ],
    rolesOrActors: [
      {
        id: "werewolf",
        name: "Wolf",
        teamOrSide: "werewolves",
        count: 1,
        publicDescription: "Looks ordinary among the villagers.",
        privateGoal: "Reach parity with the village faction.",
        abilities: ["Choose a nighttime victim."]
      },
      {
        id: "seer",
        name: "Seer",
        teamOrSide: "village",
        count: 1,
        publicDescription: "A watchful citizen reading tells.",
        privateGoal: "Spot wolves without tipping your hand.",
        abilities: ["Inspect one player."]
      },
      {
        id: "villager_a",
        name: "Villager Alpha",
        teamOrSide: "village",
        count: 1,
        publicDescription: "No flashy powers—just suspicion.",
        privateGoal: "Deduce the wolf through chatter.",
        abilities: ["Debate.", "Vote."]
      },
      {
        id: "villager_b",
        name: "Villager Bravo",
        teamOrSide: "village",
        count: 1,
        publicDescription: "No flashy powers—just suspicion.",
        privateGoal: "Deduce the wolf through chatter.",
        abilities: ["Debate.", "Vote."]
      }
    ],
    phases: [
      { id: "setup", name: "Setup", purpose: "Hand out concealed roles quietly.", allowedActions: ["assign_roles"], next: "night" },
      { id: "night", name: "Night", purpose: "Resolve secret powers secretly.", allowedActions: ["werewolf_kill", "seer_inspect"], next: "day" },
      { id: "day", name: "Day", purpose: "Debate and vote.", allowedActions: ["discuss", "vote"], next: "victory_check" }
    ],
    winConditions: [
      "Town wins once the wolf is banished.",
      "Wolves win once they seize parity alive."
    ],
    safetyConstraints: ["No graphic torture."],
    assumptions: ["Short demo pacing."]
  },
  package: {
    rulesMarkdown: "# Shadows Over the Hamlet\n\nArgue loudly, tally votes, and oust wolves before parity hits.",
    cards: [
      {
        id: "card_werewolf",
        name: "Wolf",
        roleOrActorId: "werewolf",
        frontText: "Blend in with sleepy villagers.",
        privateReminder: "Cull the innocents patiently.",
        assetId: "asset_werewolf"
      }
    ],
    personas: [
      {
        id: "ai_villager",
        displayName: "Mireille",
        speechStyle: "cautious investigator tone",
        publicBackstory: "Knows everyone's routines around the commons.",
        behaviorRules: ["Never leak illicit secrets aloud.", "Keep questions tight and repeatable."],
        sampleLines: ["Who changed their story overnight?"]
      }
    ],
    assetPrompts: [
      {
        id: "hero_visual",
        kind: "hero",
        prompt: "Medieval village at night, dramatic tabletop board game key art, safe non-graphic style.",
        usage: "hero preview",
        safetyNotes: ["No gore"]
      },
      {
        id: "asset_werewolf",
        kind: "card",
        prompt: "Werewolf role card, parchment frame, moonlit village, safe stylized illustration.",
        usage: "role card",
        safetyNotes: ["Stylized only"]
      },
      {
        id: "voice_ai_villager",
        kind: "voice",
        prompt: "Voice direction for Mireille. Language: en. Base profile: EN feminine warm (warm English voice, expressive, clear). Delivery: careful, hesitant, slightly tense; pace medium; energy medium. Character style: cautious investigator tone. Theme: Medieval hamlet. Backstory: Knows everyone's routines around the commons.",
        usage: "Gradium voice/persona direction for Mireille",
        safetyNotes: ["No impersonation of real living people", "Keep voice assistant safe and fictional"]
      }
    ],
    codeStubs: [
      {
        path: "src/generated/test-werewolf-game/config.ts",
        purpose: "Generated game package configuration.",
        content: "export const gameId = 'test_werewolf_game';\n"
      }
    ],
    acceptanceTests: ["Every player has exactly one role.", "Win conditions are explicit."],
    validationReport: {
      status: "pass",
      checks: ["Routed to werewolf.", "Role count matches player count."],
      warnings: [],
      assumptions: ["Demo fixture."]
    }
  },
  pipeline: [
    { stage: "intake", status: "complete" },
    { stage: "family_router", status: "selected:werewolf" },
    { stage: "game_spec", status: "complete" },
    { stage: "artifact_package", status: "complete" },
    { stage: "validation", status: "pass" }
  ]
};
