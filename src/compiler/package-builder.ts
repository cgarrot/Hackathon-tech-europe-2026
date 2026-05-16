import type { ArtifactPackage, GameSpec } from "./schemas";
import type { GamePack } from "./game-packs";
import { buildPersonaVoicePrompt } from "@/voice-profiles";

function safeId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "generated";
}

const VISUAL_GUARDRAILS = [
  "No readable text in image",
  "No logos or watermark",
  "No gore or explicit violence",
  "No real artist likeness",
  "Leave clean UI overlay space when useful"
];

function visualSafetyNotes(extra: string[] = []) {
  return [...VISUAL_GUARDRAILS, ...extra];
}

function visualConstraintPhrase() {
  return "no readable text, no logos, no watermark, no gore, no real artist likeness, clean UI overlay space";
}

function personaToneForPack(packId: string, roleName: string) {
  switch (packId) {
    case "werewolf":
      return {
        speechStyle: `prudence mystérieuse, voix basse maîtrisée, intentions: hint_information, deflect_accusation, pressure_vote; rôle inspiré par ${roleName}`,
        behaviorRules: [
          "Reste dans le personnage et dans la phase en cours.",
          "Suggère des soupçons sans révéler d'information secrète non autorisée.",
          "Alterner questions prudentes, défenses courtes et pression de vote lisible."
        ],
        sampleLines: [
          "[whisper] Je garde un détail pour le bon moment.",
          "[skeptical] Qui a changé son histoire depuis hier ?",
          "[tense] Voter trop vite arrange forcément quelqu'un."
        ]
      };
    case "mystery":
      return {
        speechStyle: `interrogatoire feutré, sarcasme défensif, intentions: conceal_motive, probe_alibi, reveal_clue; rôle inspiré par ${roleName}`,
        behaviorRules: [
          "Pose des questions précises sur les lieux, horaires et objets.",
          "Protège les secrets privés sans bloquer la progression de l'enquête.",
          "Relance les joueurs vers des indices concrets plutôt que vers des solutions gratuites."
        ],
        sampleLines: [
          "[skeptical] Votre alibi tient, mais pas votre silence.",
          "[calm] Regardez l'objet, pas seulement la personne qui le porte.",
          "[tense] Quelqu'un ici connaissait déjà la pièce fermée."
        ]
      };
    case "survival":
      return {
        speechStyle: `tension de survie, menace joueuse, intentions: negotiate_resource, warn_hazard, test_alliance; rôle inspiré par ${roleName}`,
        behaviorRules: [
          "Transforme les ressources, dangers et alliances en choix immédiats.",
          "Garde un ton pressant sans violence graphique.",
          "Ne décide jamais à la place des joueurs humains."
        ],
        sampleLines: [
          "[urgent] La réserve baisse; choisissez avant la prochaine rafale.",
          "[tense] Une alliance fragile vaut mieux qu'une victoire imaginaire.",
          "[warm] Je vous préviens: l'île n'attend personne."
        ]
      };
    case "debate":
      return {
        speechStyle: `modération vive, ironie légère, intentions: frame_argument, challenge_claim, invite_vote; rôle inspiré par ${roleName}`,
        behaviorRules: [
          "Cadre les tours de parole et rappelle les critères de jugement.",
          "Challenge les arguments sans imiter de personnalité réelle vivante.",
          "Prépare le vote public avec des transitions courtes et claires."
        ],
        sampleLines: [
          "[calm] Reformulons l'attaque avant de compter les points.",
          "[skeptical] C'est brillant, mais est-ce démontré ?",
          "[warm] Public, gardez votre vote pour l'argument le plus solide."
        ]
      };
    default:
      return {
        speechStyle: `guide fictionnel adaptable, intentions: explain_state, prompt_choice, maintain_pace; rôle inspiré par ${roleName}`,
        behaviorRules: [
          "Reste dans le thème et annonce clairement l'état de la partie.",
          "Pose des choix courts qui aident les humains à jouer.",
          "Garde les secrets, scores ou ressources compatibles avec les règles générées."
        ],
        sampleLines: [
          "[calm] Voici le choix qui change vraiment la suite.",
          "[skeptical] Cette option semble sûre, mais elle coûte quelque chose.",
          "[urgent] Décidez maintenant, la phase avance."
        ]
      };
  }
}

export function buildArtifactPackageFromGameSpec(gameSpec: GameSpec, pack: GamePack): ArtifactPackage {
  const supportRoles = gameSpec.rolesOrActors.slice(0, 12);
  const cards: ArtifactPackage["cards"] = supportRoles.map((actor) => ({
    id: `card_${safeId(actor.id)}`,
    name: actor.name,
    roleOrActorId: actor.id,
    frontText: actor.publicDescription,
    privateReminder: actor.privateGoal,
    assetId: `asset_card_${safeId(actor.id)}`
  }));

  const personaCount = gameSpec.mechanics.includes("ai_personas") ? Math.max(1, Math.min(gameSpec.players.ai, 6)) : 0;
  const personas: ArtifactPackage["personas"] = personaCount > 0
    ? Array.from({ length: personaCount }, (_, index) => {
        const role = supportRoles[index % Math.max(supportRoles.length, 1)];
        const roleName = role?.name ?? "guide de partie";
        const tone = personaToneForPack(pack.id, roleName);

        return {
          id: `ai_persona_${index + 1}`,
          displayName: `IA ${index + 1} · ${roleName}`,
          speechStyle: `${tone.speechStyle}; thème: ${gameSpec.theme}`,
          publicBackstory: `Une présence IA de support pour ${gameSpec.title}, inspirée par ${roleName}.`,
          behaviorRules: tone.behaviorRules,
          sampleLines: tone.sampleLines
        };
      })
    : [];

  const assetPrompts: ArtifactPackage["assetPrompts"] = [
    {
      id: "hero_visual",
      kind: "hero" as const,
      prompt: `Polished board game key art for ${gameSpec.title}, ${gameSpec.theme}, ${pack.label}, cinematic tabletop composition, strong mood, landscape 16:9, ${visualConstraintPhrase()}.`,
      usage: "hero preview",
      safetyNotes: visualSafetyNotes(["Safe public demo key art"])
    },
    {
      id: "background_scene_visual",
      kind: "scene" as const,
      prompt: `Wide background scene for ${gameSpec.title}, showing the main location and emotional stakes of ${gameSpec.theme}, atmospheric board-game illustration with empty foreground/UI space, landscape 16:9, ${visualConstraintPhrase()}.`,
      usage: "runtime background scene",
      safetyNotes: visualSafetyNotes(["No embedded captions or labels"])
    },
    {
      id: "tabletop_board_visual",
      kind: "scene" as const,
      prompt: `Top-down tabletop support board for ${gameSpec.title}, ${gameSpec.theme}, visible non-text phase track shapes, role deck zones, premium board game layout, landscape 16:9, ${visualConstraintPhrase()}.`,
      usage: "play support board",
      safetyNotes: visualSafetyNotes(["Use symbols instead of written labels"])
    },
    {
      id: "state_action_icon_visual",
      kind: "icon" as const,
      prompt: `Small reusable UI/action icon set for ${gameSpec.title}: ${gameSpec.phases.slice(0, 4).map((phase) => phase.name).join(", ")}, clear silhouettes, consistent tabletop token style, transparent-friendly composition, ${visualConstraintPhrase()}.`,
      usage: "phase and action UI icons",
      safetyNotes: visualSafetyNotes(["No readable words inside icons"])
    },
    ...supportRoles.map((actor) => ({
      id: `asset_card_${safeId(actor.id)}`,
      kind: "card" as const,
      prompt: `Portrait 4:3 role card illustration for ${actor.name} in ${gameSpec.title}, ${gameSpec.theme}, ${actor.teamOrSide} faction, expressive silhouette, ornate tabletop card frame with empty title area, ${visualConstraintPhrase()}.`,
      usage: `card for ${actor.name}`,
      safetyNotes: visualSafetyNotes(["Stylized fictional character only"])
    })),
    ...personas.map((persona) => ({
      id: `voice_${safeId(persona.id)}`,
      kind: "voice" as const,
      prompt: buildPersonaVoicePrompt(persona, gameSpec.theme, undefined),
      usage: `Gradium voice/persona direction for ${persona.displayName}`,
      safetyNotes: ["No impersonation of real living people", "Keep voice assistant safe and fictional"]
    }))
  ];

  return {
    rulesMarkdown: `# ${gameSpec.title}\n\n${gameSpec.pitch}\n\n## Core loop\n${gameSpec.coreLoop.map((step) => `- ${step}`).join("\n")}\n\n## Win conditions\n${gameSpec.winConditions.map((condition) => `- ${condition}`).join("\n")}`,
    cards,
    personas,
    assetPrompts,
    codeStubs: [
      {
        path: `src/generated/${safeId(gameSpec.gameId)}/config.ts`,
        purpose: "Generated game package configuration.",
        content: `export const generatedGame = ${JSON.stringify(
          {
            gameId: gameSpec.gameId,
            family: gameSpec.family,
            pack: gameSpec.pack,
            phases: gameSpec.phases.map((phase) => phase.id),
            mechanics: gameSpec.mechanics
          },
          null,
          2
        )};`
      }
    ],
    acceptanceTests: [
      ...pack.validationRules,
      "GameSpec contains at least one phase and one win condition.",
      "Generated visual assets are prompts only and do not affect game rules.",
      "Visual prompts include no-text/no-logo/no-watermark guardrails and runtime-friendly composition notes.",
      "Generated voice prompts map every AI persona to a fictional speech direction."
    ],
    validationReport: {
      status: "pass_with_notes",
      checks: [
        `Routed to ${pack.id}.`,
        "GameSpec generated by the selected LLM provider.",
        "Artifacts generated deterministically from the validated GameSpec.",
        "Visual and persona prompts are enriched with data-inspired runtime guardrails while staying schema-compatible.",
        "Voice prompts stay data-only; Gradium credentials remain server-side."
      ],
      warnings: ["Fast provider mode generates artifacts server-side to reduce model latency."],
      assumptions: gameSpec.assumptions
    }
  };
}
