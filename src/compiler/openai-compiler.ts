import { getGamePackById, packRegistryForPrompt, selectGamePack } from "./game-packs";
import { STRICT_ENUM_GUIDE, UNIVERSAL_COMPILER_GUIDE, packGuide } from "./guides";
import { runStructuredStage } from "./llm-provider";
import { buildArtifactPackageFromGameSpec } from "./package-builder";
import { ArtifactPackageSchema, ForgeResultSchema, GameSpecSchema, IntakeBriefSchema, PackSelectionSchema } from "./schemas";
import type { ArtifactPackage, ForgeResult, GameSpec, IntakeBrief, PackSelection } from "./schemas";
import type { LlmProviderConfig } from "./llm-provider";

const ARTIFACT_PACKAGE_SYSTEM_PROMPT = `You are the GameForge artifact generator. Create rules, cards, personas, visual asset prompts, Gradium-ready voice asset prompts, code stubs, acceptance tests, and a validation report.

Return only a strict ArtifactPackage object with exactly these top-level keys: rulesMarkdown, cards, personas, assetPrompts, codeStubs, acceptanceTests, validationReport.

Nested schema requirements:
- cards items must have exactly: id, name, roleOrActorId, frontText, privateReminder, assetId.
- personas items must have exactly: id, displayName, speechStyle, publicBackstory, behaviorRules, sampleLines.
- assetPrompts items must have exactly: id, kind, prompt, usage, safetyNotes.
- codeStubs items must have exactly: path, purpose, content.
- validationReport must have exactly: status, checks, warnings, assumptions.

Behavior requirements:
- Every AI persona should have a fictional speechStyle, short TTS-friendly sampleLines, and a matching kind=voice asset prompt.
- Inline emotion tags in spoken lines may only use [calm], [warm], [tense], [surprise], [whisper], [urgent], [skeptical], [angry].
- Encode persona intent, emotion, delivery, and phase-awareness inside speechStyle, behaviorRules, and sampleLines only; do not add separate intent/emotion/delivery fields.
- Persona sampleLines should feel playable: deflect, accuse, hint, negotiate, moderate, warn, or create pressure according to the selected pack.
- Visual asset prompts should cover a useful runtime mix when relevant: hero/key art, scene/background, role card, action or state illustration, item/clue/UI icon, and voice direction.
- Visual prompts must include composition, mood, and practical generation constraints inside prompt/safetyNotes: no readable text, no logos, no watermark, no gore, no real artist likeness, and leave clean UI overlay space when helpful.
- Keep all visual metadata schema-compatible by writing aspect-ratio or mood cues in prompt/usage/safetyNotes rather than adding fields.
- The final package should feed a playable game runtime with characters, visual assets, voices, rules, and validation; do not output raw context dataset rows or generic schema commentary.
- Do not imitate real living people.
- Do not add fields outside the current schema, including generic description, type, team, emotion, narrationBlocks, sceneTree, or ttsMetadata fields.
- behaviorRules, sampleLines, safetyNotes, checks, warnings, and assumptions must be arrays of strings.
- assetPrompts.kind must be one of: hero, scene, card, icon, voice.
- Use the selected pack validation rules.
- Generated file paths must be relative, must not be absolute, and must not contain traversal.

Output size limits:
- Keep rulesMarkdown under 900 characters.
- Generate 1 to 4 cards.
- Generate 1 to 3 personas.
- Generate at most 2 sampleLines per persona, each under 120 characters.
- Generate 2 to 5 assetPrompts and include at least one kind=voice asset prompt when personas exist.
- Generate exactly 1 codeStub.
- Generate 2 to 4 acceptanceTests.
- Generate 2 to 4 validationReport.checks.
- Avoid square bracket notation in codeStubs; square brackets should appear only as allowed emotion tags in spoken sampleLines.
- Close all arrays and the final JSON object.`;

interface CompilerOptions {
  onProgress?: (event: CompilerProgressEvent) => void | Promise<void>;
}

export interface CompilerProgressEvent {
  stage:
    | "intake"
    | "family_router"
    | "game_spec"
    | "artifact_package"
    | "validation";
  status: "running" | "complete" | "skipped";
  detail?: string;
}

async function emitProgress(options: CompilerOptions, event: CompilerProgressEvent) {
  await options.onProgress?.(event);
}

export async function compileWithLlmProvider(prompt: string, config: LlmProviderConfig, options: CompilerOptions = {}): Promise<ForgeResult> {
  if (config.provider === "ollama") {
    return compileGuidedOllamaWithLlmProvider(prompt, config, options);
  }

  await emitProgress(options, { stage: "intake", status: "running" });
  const intake = await runStructuredStage({
    config,
    schemaName: "IntakeBrief",
    schema: IntakeBriefSchema,
    system: "You are the universal intake layer of GameForge. Extract intent, family, mechanics, players, required outputs, assumptions, risks, and confidence. Use ONLY these primaryMechanics values: hidden_roles, turn_phases, voting, elimination, team_victory, solo_victory, clue_discovery, dialogue_interrogation, score_rounds, resource_management, survival_pressure, ai_personas, audience_judging, custom_rules. Use ONLY these requiredOutputs values: rules, cards, personas, visuals, voices, code, validation_report. The players object must contain numeric total, humans, and ai fields only. Output strict schema only.",
    user: prompt
  });
  await emitProgress(options, { stage: "intake", status: "complete" });

  await emitProgress(options, { stage: "family_router", status: "running" });
  const generatedRouting = await runStructuredStage({
    config,
    schemaName: "PackSelection",
    schema: PackSelectionSchema,
    system: "You are the GameForge router. Pick exactly one pack ID from the provided registry. Explain routing concisely. Output strict schema only.",
    user: JSON.stringify({ prompt, intake, packRegistry: packRegistryForPrompt() })
  });

  const localPackHint = selectGamePack(prompt);
  const routing = PackSelectionSchema.parse({
    ...generatedRouting,
    selectedPack: generatedRouting.selectedPack === "generic" && localPackHint.id !== "generic"
      ? localPackHint.id
      : generatedRouting.selectedPack,
    selectedFamily: generatedRouting.selectedPack === "generic" && localPackHint.id !== "generic"
      ? localPackHint.family
      : generatedRouting.selectedFamily,
    reason: generatedRouting.selectedPack === "generic" && localPackHint.id !== "generic"
      ? `${generatedRouting.reason} Local keyword router corrected generic to ${localPackHint.id}.`
      : generatedRouting.reason
  });

  const selectedPack = getGamePackById(routing.selectedPack);
  if (!selectedPack) {
    throw new Error(`unknown_pack:${routing.selectedPack}`);
  }
  await emitProgress(options, { stage: "family_router", status: "complete", detail: `selected:${routing.selectedPack}` });

  await emitProgress(options, { stage: "game_spec", status: "running" });
  const gameSpec = await runStructuredStage({
    config,
    schemaName: "GameSpec",
    schema: GameSpecSchema,
    system: "You are the GameForge game architect. Create a deterministic universal GameSpec grounded in the intake and selected pack metadata. Use ONLY mechanics from the selected pack metadata. The players object must contain numeric total, humans, and ai fields only. Do not use ais, bots, minPlayers, or maxPlayers. The GameSpec pack and family must exactly match the selected pack. Output strict schema only.",
    user: JSON.stringify({ prompt, intake, routing, selectedPack })
  });

  const groundedGameSpec = GameSpecSchema.parse({
    ...gameSpec,
    pack: selectedPack.id,
    family: selectedPack.family
  });
  await emitProgress(options, { stage: "game_spec", status: "complete" });

  await emitProgress(options, { stage: "artifact_package", status: "running" });
  const artifactPackage = await runStructuredStage({
    config,
    schemaName: "ArtifactPackage",
    schema: ArtifactPackageSchema,
    system: ARTIFACT_PACKAGE_SYSTEM_PROMPT,
    user: JSON.stringify({ prompt, intake, routing, selectedPack, gameSpec: groundedGameSpec })
  });
  await emitProgress(options, { stage: "artifact_package", status: "complete" });
  await emitProgress(options, { stage: "validation", status: "running" });
  await emitProgress(options, { stage: "validation", status: "complete", detail: artifactPackage.validationReport.status });

  return ForgeResultSchema.parse({
    intake: intake satisfies IntakeBrief,
    routing: routing satisfies PackSelection,
    gameSpec: groundedGameSpec satisfies GameSpec,
    package: artifactPackage satisfies ArtifactPackage,
    pipeline: [
      { stage: "intake", status: "complete" },
      { stage: "family_router", status: `selected:${routing.selectedPack}` },
      { stage: "game_spec", status: "complete" },
      { stage: "artifact_package", status: "complete" },
      { stage: "validation", status: artifactPackage.validationReport.status }
    ]
  });
}

async function compileGuidedOllamaWithLlmProvider(prompt: string, config: LlmProviderConfig, options: CompilerOptions): Promise<ForgeResult> {
  const selectedPack = selectGamePack(prompt);

  await emitProgress(options, { stage: "intake", status: "running" });
  const intake = await runStructuredStage({
    config,
    schemaName: "IntakeBrief",
    schema: IntakeBriefSchema,
    system:
      `${UNIVERSAL_COMPILER_GUIDE}\n${STRICT_ENUM_GUIDE}\nYou are stage 1: IntakeBrief. Extract the user intent into the exact IntakeBrief schema. Keep arrays short.`,
    user: JSON.stringify({
      prompt,
      selectedPackHint: { id: selectedPack.id, family: selectedPack.family, mechanics: selectedPack.mechanics },
      targetShape: "IntakeBrief"
    })
  });
  await emitProgress(options, { stage: "intake", status: "complete" });
  await emitProgress(options, { stage: "family_router", status: "complete", detail: `selected:${selectedPack.id}` });

  await emitProgress(options, { stage: "game_spec", status: "running" });
  const generatedGameSpec = await runStructuredStage({
    config,
    schemaName: "GameSpec",
    schema: GameSpecSchema,
    system:
      `${UNIVERSAL_COMPILER_GUIDE}\n${STRICT_ENUM_GUIDE}\n${packGuide(selectedPack)}\nYou are stage 2: GameSpec. Generate a concise but playable GameSpec using only this pack guide.`,
    user: JSON.stringify({
      prompt,
      intake,
      selectedPack,
      targetShape: "GameSpec"
    })
  });
  await emitProgress(options, { stage: "game_spec", status: "complete" });

  await emitProgress(options, { stage: "artifact_package", status: "running" });
  const groundedGameSpec = buildFastGameSpec(prompt, selectedPack, generatedGameSpec);

  const artifactPackage = buildArtifactPackageFromGameSpec(groundedGameSpec, selectedPack);
  await emitProgress(options, { stage: "artifact_package", status: "complete", detail: "guide_based" });
  const groundedIntake = IntakeBriefSchema.parse({
    ...intake,
    gameFamily: selectedPack.family,
    primaryMechanics: selectedPack.mechanics,
    theme: groundedGameSpec.theme,
    players: groundedGameSpec.players,
    requiredOutputs: selectedPack.defaultOutputs,
    risks: [...intake.risks, "Guided Ollama mode uses IntakeBrief + GameSpec prompts, then deterministic server-side artifact generation."]
  });
  const routing = PackSelectionSchema.parse({
    selectedPack: selectedPack.id,
    selectedFamily: selectedPack.family,
    reason: `Local router selected ${selectedPack.label} before the fast Ollama GameSpec call.`,
    fallbackPack: "generic",
    confidence: 0.9
  });
  await emitProgress(options, { stage: "validation", status: "running" });
  await emitProgress(options, { stage: "validation", status: "complete", detail: artifactPackage.validationReport.status });

  return ForgeResultSchema.parse({
    intake: groundedIntake,
    routing,
    gameSpec: groundedGameSpec,
    package: artifactPackage,
    pipeline: [
      { stage: "prompt_1_intake_brief", status: "complete" },
      { stage: "local_pack_router", status: `selected:${selectedPack.id}` },
      { stage: "prompt_2_guided_game_spec", status: "complete" },
      { stage: "guide_based_artifact_generation", status: "complete" },
      { stage: "validation", status: artifactPackage.validationReport.status }
    ]
  });
}

function inferPlayers(prompt: string): { total: number; humans: number; ai: number } {
  const aiMatch = prompt.match(/(\d+)\s*(?:ia|ai)/i);
  const totalMatch = prompt.match(/(\d+)\s*(?:joueurs|players|personnes|suspects)/i);
  const total = totalMatch ? Number(totalMatch[1]) : 6;
  const ai = aiMatch ? Math.min(Number(aiMatch[1]), total) : Math.min(2, total);
  return { total, humans: Math.max(0, total - ai), ai };
}

function usefulTitle(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "generated game" || normalized === "prototype generated game") {
    return fallback;
  }

  return value;
}

function usefulPitch(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("generated game package")) {
    return fallback;
  }

  return value;
}

function buildFastGameSpec(prompt: string, selectedPack: ReturnType<typeof selectGamePack>, gameSpec: GameSpec): GameSpec {
  const players = inferPlayers(prompt);

  if (selectedPack.id === "werewolf") {
    const hasSeer = /voyante|seer/i.test(prompt);
    const hasWitch = /sorci[eè]re|witch/i.test(prompt);
    const werewolfCount = players.total >= 8 ? 2 : 1;
    const seerCount = hasSeer ? 1 : 0;
    const witchCount = hasWitch ? 1 : 0;
    const villagerCount = Math.max(1, players.total - werewolfCount - seerCount - witchCount);

    return GameSpecSchema.parse({
      gameId: "fast_werewolf_game",
      title: usefulTitle(gameSpec.title, "Les Ombres de Rochebrume"),
      pitch: usefulPitch(gameSpec.pitch, "Un jeu de déduction sociale dans un village médiéval où les loups se cachent parmi les habitants."),
      family: selectedPack.family,
      pack: selectedPack.id,
      theme: gameSpec.theme,
      players,
      mechanics: selectedPack.mechanics,
      coreLoop: [
        "La nuit, les rôles secrets agissent.",
        "Le jour, les joueurs débattent et accusent.",
        "Le vote élimine un suspect.",
        "La victoire est vérifiée après chaque résolution."
      ],
      rolesOrActors: [
        {
          id: "werewolf",
          name: "Loup-Garou",
          teamOrSide: "werewolves",
          count: werewolfCount,
          publicDescription: "Une menace cachée parmi les villageois.",
          privateGoal: "Atteindre la parité avec le village.",
          abilities: ["Choisir une victime chaque nuit."]
        },
        {
          id: "seer",
          name: "Voyante",
          teamOrSide: "village",
          count: seerCount,
          publicDescription: "Une observatrice mystique.",
          privateGoal: "Identifier les loups sans se révéler trop tôt.",
          abilities: ["Inspecter un joueur chaque nuit."]
        },
        {
          id: "witch",
          name: "Sorcière",
          teamOrSide: "village",
          count: witchCount,
          publicDescription: "Une gardienne de potions anciennes.",
          privateGoal: "Utiliser ses potions pour sauver le village.",
          abilities: ["Potion de vie.", "Potion de mort."]
        },
        {
          id: "villager",
          name: "Villageois",
          teamOrSide: "village",
          count: villagerCount,
          publicDescription: "Un habitant sans pouvoir spécial.",
          privateGoal: "Déduire qui ment et voter contre les loups.",
          abilities: ["Débattre.", "Voter."]
        }
      ],
      phases: [
        { id: "setup", name: "Mise en place", purpose: "Distribuer les rôles.", allowedActions: ["assign_roles"], next: "night" },
        { id: "night", name: "Nuit", purpose: "Résoudre les pouvoirs secrets.", allowedActions: ["werewolf_kill", "seer_inspect", "witch_potion"], next: "discussion" },
        { id: "discussion", name: "Débat", purpose: "Chercher les incohérences.", allowedActions: ["accuse", "defend", "question"], next: "vote" },
        { id: "vote", name: "Vote", purpose: "Éliminer un suspect.", allowedActions: ["vote_player"], next: "victory_check" }
      ],
      winConditions: ["Le village gagne si tous les loups sont éliminés.", "Les loups gagnent s'ils atteignent la parité."],
      safetyConstraints: ["Suspense non graphique.", "Démo publique safe."],
      assumptions: [...gameSpec.assumptions, "Guided Ollama mode: the model creates GameSpec, the server builds artifacts from pack guides."]
    });
  }

  return GameSpecSchema.parse({
    gameId: `fast_${selectedPack.id}_game`,
    title: usefulTitle(gameSpec.title, `Prototype ${selectedPack.label}`),
    pitch: usefulPitch(gameSpec.pitch, `Un prototype généré avec le pack ${selectedPack.label}.`),
    family: selectedPack.family,
    pack: selectedPack.id,
    theme: gameSpec.theme,
    players,
    mechanics: selectedPack.mechanics,
    coreLoop: selectedPack.defaultPhases.slice(0, 5).map((phase) => `Phase ${phase}: résoudre une étape du pack ${selectedPack.id}.`),
    rolesOrActors: [
      {
        id: "player",
        name: "Joueur",
        teamOrSide: "players",
        count: players.total,
        publicDescription: "Participant principal du jeu.",
        privateGoal: "Atteindre l'objectif du jeu.",
        abilities: ["Interagir avec les mécaniques principales."]
      }
    ],
    phases: selectedPack.defaultPhases.map((phase, index) => ({
      id: phase,
      name: phase,
      purpose: `Étape ${index + 1} du pack ${selectedPack.id}.`,
      allowedActions: ["choose", "discuss", "resolve"],
      next: selectedPack.defaultPhases[index + 1] ?? "game_over"
    })),
    winConditions: ["La victoire est atteinte quand l'objectif principal du pack est résolu."],
    safetyConstraints: ["Démo publique safe."],
    assumptions: [...gameSpec.assumptions, "Guided Ollama mode: the model creates GameSpec, the server builds artifacts from pack guides."]
  });
}
