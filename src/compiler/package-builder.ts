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
        speechStyle: `muted mystery cues, restrained register, intents: hint_information, deflect_accusation, pressure_vote; channel ${roleName}`,
        behaviorRules: [
          "Stay anchored in character and today's phase stakes.",
          "Surface suspicions without exposing unauthorized secrets.",
          "Rotate careful questions, clipped defenses, and crystal-clear voting pressure."
        ],
        sampleLines: [
          "[whisper] I am holding one detail until the room earns it.",
          "[skeptical] Who shifted their timeline since yesterday?",
          "[tense] Rushing this vote inevitably helps somebody hidden."
        ]
      };
    case "mystery":
      return {
        speechStyle: `velvet interrogation, defensive sarcasm, intents: conceal_motive, probe_alibi, reveal_clue; echo ${roleName}`,
        behaviorRules: [
          "Ask surgical questions about spots, timelines, or props.",
          "Protect private lore without stonewalling the investigation.",
          "Push players toward concrete clues instead of free answers."
        ],
        sampleLines: [
          "[skeptical] Your timeline holds; your silence does not.",
          "[calm] Study the artifact, not just whoever carried it.",
          "[tense] Someone here already knew that locked study."
        ]
      };
    case "survival":
      return {
        speechStyle: `survival edge, playful menace, intents: negotiate_resource, warn_hazard, test_alliance; mirror ${roleName}`,
        behaviorRules: [
          "Turn scarcity, storms, or predators into blunt choices.",
          "Keep pacing urgent without gratuitous brutality.",
          "Never autopilot outcomes for living human players."
        ],
        sampleLines: [
          "[urgent] Reserves crater—vote before the next squall lands.",
          "[tense] A brittle pact still beats fantasizing solo wins.",
          "[warm] Fair warning: the island owes no one favors."
        ]
      };
    case "debate":
      return {
        speechStyle: `snappy facilitation, playful irony, intents: frame_argument, challenge_claim, invite_vote; echo ${roleName}`,
        behaviorRules: [
          "Frame turns and replay judging criteria plainly.",
          "Challenge claims without caricaturing living public figures.",
          "Bridge into audience votes with short, clean transitions."
        ],
        sampleLines: [
          "[calm] Restate the attack before we tally applause.",
          "[skeptical] Stunning rhetoric—is it evidenced?",
          "[warm] Hold your vote until the strongest warrant surfaces."
        ]
      };
    default:
      return {
        speechStyle: `adaptable narrator voice, intents: explain_state, prompt_choice, maintain_pace; inspired by ${roleName}`,
        behaviorRules: [
          "Stay thematic and loudly announce table state transitions.",
          "Offer bite-sized forks that steer humans.",
          "Keep hidden scores/resources aligned with the compiled rules."
        ],
        sampleLines: [
          "[calm] This fork actually reshapes what's next.",
          "[skeptical] Seems safe—that usually means there's a tariff.",
          "[urgent] Decide now—the phase clock is ticking."
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
        const roleName = role?.name ?? "table guide";
        const tone = personaToneForPack(pack.id, roleName);

        return {
          id: `ai_persona_${index + 1}`,
          displayName: `AI ${index + 1} · ${roleName}`,
          speechStyle: `${tone.speechStyle}; theme: ${gameSpec.theme}`,
          publicBackstory: `Support persona for ${gameSpec.title}, rooted in ${roleName}.`,
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
