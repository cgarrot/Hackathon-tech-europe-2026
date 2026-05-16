import type { ForgeResult } from "@/compiler/schemas";

export const validForgeResult: ForgeResult = {
  intake: {
    sourceRequest: "Je veux jouer a un loup-garou medieval avec quatre joueurs.",
    language: "fr",
    gameFamily: "social_deduction",
    interactionModel: "tabletop party game",
    primaryMechanics: ["hidden_roles", "turn_phases", "voting", "elimination", "team_victory", "ai_personas"],
    theme: "Village medieval",
    players: {
      total: 4,
      humans: 3,
      ai: 1
    },
    requiredOutputs: ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"],
    explicitRequirements: ["Quatre joueurs", "Un loup cache"],
    assumptions: ["Partie courte de demonstration"],
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
    title: "Les Ombres du Hameau",
    pitch: "Un village vote chaque jour pour trouver le loup cache avant qu'il ne gagne.",
    family: "social_deduction",
    pack: "werewolf",
    theme: "Village medieval",
    players: {
      total: 4,
      humans: 3,
      ai: 1
    },
    mechanics: ["hidden_roles", "turn_phases", "voting", "elimination", "team_victory", "ai_personas"],
    coreLoop: [
      "Distribuer les roles secrets.",
      "Resoudre la nuit.",
      "Debattre le jour.",
      "Voter et verifier la victoire."
    ],
    rolesOrActors: [
      {
        id: "werewolf",
        name: "Loup",
        teamOrSide: "werewolves",
        count: 1,
        publicDescription: "Un villageois comme les autres en apparence.",
        privateGoal: "Atteindre la parite avec le village.",
        abilities: ["Choisir une victime la nuit."]
      },
      {
        id: "seer",
        name: "Voyante",
        teamOrSide: "village",
        count: 1,
        publicDescription: "Une villageoise attentive.",
        privateGoal: "Identifier le loup sans se reveler trop tot.",
        abilities: ["Inspecter un joueur."]
      },
      {
        id: "villager_a",
        name: "Villageois A",
        teamOrSide: "village",
        count: 1,
        publicDescription: "Un habitant sans pouvoir special.",
        privateGoal: "Trouver le loup par deduction.",
        abilities: ["Debattre", "Voter"]
      },
      {
        id: "villager_b",
        name: "Villageois B",
        teamOrSide: "village",
        count: 1,
        publicDescription: "Un habitant sans pouvoir special.",
        privateGoal: "Trouver le loup par deduction.",
        abilities: ["Debattre", "Voter"]
      }
    ],
    phases: [
      { id: "setup", name: "Mise en place", purpose: "Distribuer les roles.", allowedActions: ["assign_roles"], next: "night" },
      { id: "night", name: "Nuit", purpose: "Resoudre les pouvoirs secrets.", allowedActions: ["werewolf_kill", "seer_inspect"], next: "day" },
      { id: "day", name: "Jour", purpose: "Debattre et voter.", allowedActions: ["discuss", "vote"], next: "victory_check" }
    ],
    winConditions: [
      "Le village gagne si le loup est elimine.",
      "Le loup gagne s'il atteint la parite."
    ],
    safetyConstraints: ["Pas de violence graphique."],
    assumptions: ["Demo courte."]
  },
  package: {
    rulesMarkdown: "# Les Ombres du Hameau\n\nDebattez, votez et trouvez le loup avant la parite.",
    cards: [
      {
        id: "card_werewolf",
        name: "Loup",
        roleOrActorId: "werewolf",
        frontText: "Cache-toi parmi les villageois.",
        privateReminder: "Elimine le village.",
        assetId: "asset_werewolf"
      }
    ],
    personas: [
      {
        id: "ai_villager",
        displayName: "Mireille",
        speechStyle: "prudente et analytique",
        publicBackstory: "Une habitante qui connait les habitudes du village.",
        behaviorRules: ["Ne revele jamais d'information secrete.", "Pose des questions courtes."],
        sampleLines: ["Qui a change son histoire depuis hier ?"]
      }
    ],
    assetPrompts: [
      {
        id: "hero_visual",
        kind: "hero",
        prompt: "Medieval village at night, dramatic tabletop board game key art, safe non graphic style.",
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
        prompt: "Voice direction for Mireille. Language: fr. Base profile: FR feminine warm. Delivery: careful, hesitant, slightly tense. Character style: prudente et analytique. Theme: Village medieval. Backstory: Une habitante qui connait les habitudes du village.",
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
