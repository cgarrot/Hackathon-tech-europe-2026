const mechanics = [
  "hidden_roles",
  "turn_phases",
  "voting",
  "elimination",
  "team_victory",
  "solo_victory",
  "clue_discovery",
  "dialogue_interrogation",
  "score_rounds",
  "resource_management",
  "survival_pressure",
  "ai_personas",
  "audience_judging",
  "custom_rules"
] as const;

const artifactKinds = ["rules", "cards", "personas", "visuals", "voices", "code", "validation_report"] as const;

const gameFamilies = [
  "social_deduction",
  "investigation_mystery",
  "quiz_party",
  "debate_simulation",
  "survival_elimination",
  "strategy_board",
  "roleplay_adventure",
  "custom"
] as const;

const assetKinds = ["hero", "scene", "card", "icon", "voice"] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToken(value: unknown): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      return Number(match[0]);
    }
  }

  return undefined;
}

function mapValue<T extends readonly string[]>(value: unknown, allowed: T, aliases: Record<string, T[number]>): T[number] | undefined {
  const normalized = normalizeToken(value);
  const direct = allowed.find((item) => item === normalized);
  return direct ?? aliases[normalized];
}

const mechanicAliases: Record<string, (typeof mechanics)[number]> = {
  hidden_role: "hidden_roles",
  hidden_roles_game: "hidden_roles",
  roles_caches: "hidden_roles",
  role_cache: "hidden_roles",
  roles_secrets: "hidden_roles",
  secret_roles: "hidden_roles",
  phases: "turn_phases",
  phases_de_tour: "turn_phases",
  turn_based: "turn_phases",
  night_day: "turn_phases",
  day_night_phases: "turn_phases",
  vote: "voting",
  votes: "voting",
  public_vote: "voting",
  voting_phase: "voting",
  elimination_vote: "voting",
  elimination_des_joueurs: "elimination",
  player_elimination: "elimination",
  team: "team_victory",
  teams: "team_victory",
  faction_victory: "team_victory",
  victoire_equipe: "team_victory",
  deduction: "clue_discovery",
  clues: "clue_discovery",
  clues_discovery: "clue_discovery",
  indices: "clue_discovery",
  interrogation: "dialogue_interrogation",
  dialogue: "dialogue_interrogation",
  interviews: "dialogue_interrogation",
  scoring: "score_rounds",
  score: "score_rounds",
  rounds: "score_rounds",
  resources: "resource_management",
  resource: "resource_management",
  survival: "survival_pressure",
  survie: "survival_pressure",
  ai: "ai_personas",
  ia: "ai_personas",
  ai_players: "ai_personas",
  ai_personality: "ai_personas",
  ai_personalities: "ai_personas",
  personas_ia: "ai_personas",
  audience_vote: "audience_judging",
  public_vote_judging: "audience_judging",
  custom: "custom_rules",
  rules_custom: "custom_rules"
};

const artifactAliases: Record<string, (typeof artifactKinds)[number]> = {
  rule: "rules",
  regles: "rules",
  rules_md: "rules",
  role_cards: "cards",
  card: "cards",
  cartes: "cards",
  characters: "personas",
  ai_personas: "personas",
  ia_personas: "personas",
  visuals_assets: "visuals",
  assets: "visuals",
  images: "visuals",
  visual_assets: "visuals",
  voice: "voices",
  audio: "voices",
  code_stubs: "code",
  generated_code: "code",
  validation: "validation_report",
  report: "validation_report"
};

const familyAliases: Record<string, (typeof gameFamilies)[number]> = {
  social_deduction_game: "social_deduction",
  deduction_sociale: "social_deduction",
  loup_garou: "social_deduction",
  werewolf: "social_deduction",
  mystery: "investigation_mystery",
  investigation: "investigation_mystery",
  enquete: "investigation_mystery",
  murder_mystery: "investigation_mystery",
  quiz: "quiz_party",
  blind_test: "quiz_party",
  debate: "debate_simulation",
  debat: "debate_simulation",
  survival: "survival_elimination",
  survie: "survival_elimination",
  roleplay: "roleplay_adventure",
  rpg: "roleplay_adventure"
};

const assetAliases: Record<string, (typeof assetKinds)[number]> = {
  image: "scene",
  background: "scene",
  bg: "scene",
  illustration: "hero",
  cover: "hero",
  card_image: "card",
  role_card: "card",
  audio: "voice",
  tts: "voice"
};

function normalizeArray<T extends readonly string[]>(value: unknown, allowed: T, aliases: Record<string, T[number]>, fallback: T[number][]): T[number][] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = rawValues
    .map((item) => mapValue(item, allowed, aliases))
    .filter((item): item is T[number] => Boolean(item));

  return [...new Set(normalized.length > 0 ? normalized : fallback)];
}

function normalizePlayers(value: unknown): unknown {
  if (!isRecord(value)) {
    return { total: 1, humans: 1, ai: 0 };
  }

  const ai = normalizeNumber(value.ai ?? value.ais ?? value.aiPlayers ?? value.ia ?? value.ias ?? value.bots) ?? 0;
  const total = normalizeNumber(value.total ?? value.totalPlayers ?? value.players ?? value.joueurs) ?? undefined;
  const humans = normalizeNumber(value.humans ?? value.humanPlayers ?? value.humains) ?? (total !== undefined ? Math.max(0, total - ai) : undefined);
  const computedTotal = total ?? (humans !== undefined ? humans + ai : undefined);

  return {
    total: computedTotal ?? 1,
    humans: humans ?? Math.max(0, (computedTotal ?? 1) - ai),
    ai
  };
}

function normalizeConfidence(value: unknown): number {
  const confidence = normalizeNumber(value) ?? 0.7;
  if (confidence > 1) {
    return Math.min(1, confidence / 100);
  }
  return Math.max(0, Math.min(1, confidence));
}

const packAliases: Record<string, string> = {
  loup_garou: "werewolf",
  werewolf_game: "werewolf",
  mafia: "werewolf",
  mystery_game: "mystery",
  enquete: "mystery",
  investigation: "mystery",
  cluedo: "mystery",
  quiz_party: "quiz",
  blind_test: "quiz",
  debate_simulation: "debate",
  debat: "debate",
  survival_elimination: "survival",
  survie: "survival",
  custom_game: "generic"
};

const packFamilies: Record<string, (typeof gameFamilies)[number]> = {
  werewolf: "social_deduction",
  mystery: "investigation_mystery",
  quiz: "quiz_party",
  debate: "debate_simulation",
  survival: "survival_elimination",
  generic: "custom"
};

function normalizePackId(value: unknown): string {
  const normalized = normalizeToken(value);
  if (["werewolf", "mystery", "quiz", "debate", "survival", "generic"].includes(normalized)) {
    return normalized;
  }
  return packAliases[normalized] ?? "generic";
}

function normalizeRoleOrActor(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    id: value.id ?? value.key ?? normalizeToken(value.name ?? "actor"),
    name: value.name ?? value.label ?? "Generated Actor",
    teamOrSide: value.teamOrSide ?? value.team ?? value.side ?? "players",
    count: normalizeNumber(value.count) ?? normalizeNumber(value.minCount) ?? 1,
    publicDescription: value.publicDescription ?? value.description ?? value.public ?? "Generated participant.",
    privateGoal: value.privateGoal ?? value.goal ?? value.winCondition ?? "Achieve the game objective.",
    abilities: Array.isArray(value.abilities) ? value.abilities : []
  };
}

function normalizeCard(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const name = String(value.name ?? value.title ?? "Generated Card");
  const id = String(value.id ?? value.cardId ?? normalizeToken(name));

  return {
    id,
    name,
    roleOrActorId: value.roleOrActorId ?? value.roleId ?? value.actorId ?? id,
    frontText: value.frontText ?? value.text ?? value.description ?? name,
    privateReminder: value.privateReminder ?? value.reminder ?? value.privateText ?? "Use this card according to the rules.",
    assetId: value.assetId ?? `asset_${id}`
  };
}

function normalizePersona(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const displayName = String(value.displayName ?? value.name ?? "Generated Persona");

  return {
    id: value.id ?? value.personaId ?? normalizeToken(displayName),
    displayName,
    speechStyle: value.speechStyle ?? value.style ?? "clear, playful, in-character",
    publicBackstory: value.publicBackstory ?? value.backstory ?? "A generated game persona.",
    behaviorRules: Array.isArray(value.behaviorRules) ? value.behaviorRules : Array.isArray(value.rules) ? value.rules : ["Stay in character and follow the public game state."],
    sampleLines: Array.isArray(value.sampleLines) ? value.sampleLines : Array.isArray(value.examples) ? value.examples : ["I'm ready to play my part."]
  };
}

function normalizePhase(value: unknown): unknown {
  if (!isRecord(value)) {
    const id = normalizeToken(value || "phase");
    return {
      id,
      name: String(value || id),
      purpose: `Resolve ${String(value || id)} phase.`,
      allowedActions: ["choose", "discuss", "resolve"],
      next: "game_over"
    };
  }

  const id = String(value.id ?? value.key ?? normalizeToken(value.name ?? "phase"));
  return {
    id,
    name: value.name ?? value.label ?? id,
    purpose: value.purpose ?? value.description ?? "Resolve this phase.",
    allowedActions: Array.isArray(value.allowedActions) ? value.allowedActions : Array.isArray(value.actions) ? value.actions : ["choose"],
    next: value.next ?? value.nextPhase ?? "game_over"
  };
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (isRecord(item)) {
      const candidate = item.text ?? item.condition ?? item.description ?? item.name ?? item.goal ?? item.value;
      if (candidate) {
        return String(candidate);
      }
    }

    return String(item);
  }).filter((item) => item.trim().length > 0);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAssetPrompt(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    id: value.id ?? normalizeToken(value.name ?? value.kind ?? "asset"),
    kind: mapValue(value.kind ?? value.type, assetKinds, assetAliases) ?? "hero",
    prompt: value.prompt ?? value.description ?? "Safe polished game art asset prompt.",
    usage: value.usage ?? value.purpose ?? "game asset",
    safetyNotes: Array.isArray(value.safetyNotes) ? value.safetyNotes : []
  };
}

function normalizeCodeStub(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    path: value.path ?? value.file ?? "src/generated/game/config.ts",
    purpose: value.purpose ?? value.description ?? "Generated code stub.",
    content: value.content ?? value.code ?? "export {};"
  };
}

export function normalizeStageOutput(schemaName: string, value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (schemaName === "ForgeResult") {
    const intake = normalizeStageOutput("IntakeBrief", value.intake ?? value.intakeBrief ?? value.analysis ?? value);
    const routingSource = isRecord(value.routing) ? value.routing : isRecord(value.packSelection) ? value.packSelection : {};
    const routing = normalizeStageOutput("PackSelection", routingSource);
    const routingRecord = isRecord(routing) ? routing : { selectedPack: "generic", selectedFamily: "custom" };
    const gameSpecSource = isRecord(value.gameSpec) ? value.gameSpec : isRecord(value.spec) ? value.spec : {};
    const gameSpecBase = normalizeStageOutput("GameSpec", gameSpecSource);
    const gameSpecRecord = isRecord(gameSpecBase) ? gameSpecBase : {};
    const selectedPack = String(routingRecord.selectedPack ?? "generic");
    const selectedFamily = packFamilies[selectedPack] ?? "custom";
    const artifactPackage = normalizeStageOutput("ArtifactPackage", value.package ?? value.artifactPackage ?? value.artifacts ?? {});
    const pipeline = Array.isArray(value.pipeline)
      ? value.pipeline.map((step) => {
          if (!isRecord(step)) {
            return { stage: "unknown", status: String(step) };
          }

          return {
            stage: String(step.stage ?? step.name ?? "unknown"),
            status: String(step.status ?? "complete")
          };
        })
      : [
          { stage: "one_shot_intake", status: "complete" },
          { stage: "family_router", status: `selected:${selectedPack}` },
          { stage: "game_spec", status: "complete" },
          { stage: "artifact_package", status: "complete" },
          { stage: "validation", status: "pass_with_notes" }
        ];

    return {
      intake,
      routing,
      gameSpec: {
        ...gameSpecRecord,
        pack: selectedPack,
        family: selectedFamily
      },
      package: artifactPackage,
      pipeline
    };
  }

  if (schemaName === "IntakeBrief") {
    return {
      sourceRequest: value.sourceRequest ?? value.prompt ?? value.intent ?? "Generated request",
      language: value.language ?? "en",
      gameFamily: mapValue(value.gameFamily ?? value.family, gameFamilies, familyAliases) ?? "custom",
      interactionModel: value.interactionModel ?? value.intent ?? value.description ?? "Generated game interaction model",
      primaryMechanics: normalizeArray(value.primaryMechanics ?? value.mechanics, mechanics, mechanicAliases, ["custom_rules"]),
      theme: value.theme ?? value.setting ?? "generated theme",
      players: normalizePlayers(value.players),
      requiredOutputs: normalizeArray(value.requiredOutputs ?? value.outputs ?? value.artifacts, artifactKinds, artifactAliases, ["rules", "visuals", "code", "validation_report"]),
      explicitRequirements: Array.isArray(value.explicitRequirements) ? value.explicitRequirements : [],
      assumptions: Array.isArray(value.assumptions) ? value.assumptions : [],
      risks: Array.isArray(value.risks) ? value.risks : [],
      confidence: normalizeConfidence(value.confidence)
    };
  }

  if (schemaName === "PackSelection") {
    const selectedPack = normalizePackId(value.selectedPack ?? value.pack);
    return {
      selectedPack,
      selectedFamily: packFamilies[selectedPack] ?? mapValue(value.selectedFamily ?? value.family, gameFamilies, familyAliases) ?? "custom",
      reason: value.reason ?? `Selected ${selectedPack} from model output.`,
      fallbackPack: normalizePackId(value.fallbackPack ?? "generic"),
      confidence: normalizeConfidence(value.confidence)
    };
  }

  if (schemaName === "GameSpec") {
    return {
      gameId: value.gameId ?? value.id ?? normalizeToken(value.title ?? "generated_game"),
      title: value.title ?? value.name ?? "Generated Game",
      pitch: value.pitch ?? value.description ?? "A generated GameForge playable package.",
      family: packFamilies[normalizePackId(value.pack)] ?? mapValue(value.family, gameFamilies, familyAliases) ?? "custom",
      pack: normalizePackId(value.pack),
      theme: value.theme ?? value.setting ?? "custom game world",
      players: normalizePlayers(value.players),
      mechanics: normalizeArray(value.mechanics, mechanics, mechanicAliases, ["custom_rules"]),
      coreLoop: normalizeStringList(value.coreLoop ?? value.loop, ["Setup the game.", "Players take actions.", "Resolve victory."]),
      rolesOrActors: Array.isArray(value.rolesOrActors) ? value.rolesOrActors.map(normalizeRoleOrActor) : Array.isArray(value.roles) ? value.roles.map(normalizeRoleOrActor) : [normalizeRoleOrActor({ name: "Player", count: 1 })],
      phases: Array.isArray(value.phases) ? value.phases.map(normalizePhase) : [normalizePhase({ id: "turn", next: "game_over" })],
      winConditions: normalizeStringList(value.winConditions ?? value.victoryConditions, ["Complete the objective defined by the game."]),
      safetyConstraints: Array.isArray(value.safetyConstraints) ? value.safetyConstraints : [],
      assumptions: Array.isArray(value.assumptions) ? value.assumptions : []
    };
  }

  if (schemaName === "ArtifactPackage") {
    return {
      rulesMarkdown: value.rulesMarkdown ?? value.rules ?? "# Generated Rules\n\nRules generated by GameForge.",
      cards: Array.isArray(value.cards) ? value.cards.map(normalizeCard) : [],
      personas: Array.isArray(value.personas) ? value.personas.map(normalizePersona) : [],
      assetPrompts: Array.isArray(value.assetPrompts) ? value.assetPrompts.map(normalizeAssetPrompt) : [],
      codeStubs: Array.isArray(value.codeStubs) ? value.codeStubs.map(normalizeCodeStub) : [],
      acceptanceTests: Array.isArray(value.acceptanceTests) ? value.acceptanceTests : ["Generated package validates against schema."],
      validationReport: isRecord(value.validationReport)
        ? {
            status: mapValue(value.validationReport.status, ["pass", "pass_with_notes", "fail"] as const, { passed: "pass", ok: "pass", warning: "pass_with_notes", warnings: "pass_with_notes", failed: "fail" }) ?? "pass_with_notes",
            checks: Array.isArray(value.validationReport.checks) ? value.validationReport.checks : ["Schema-normalized package."],
            warnings: Array.isArray(value.validationReport.warnings) ? value.validationReport.warnings : [],
            assumptions: Array.isArray(value.validationReport.assumptions) ? value.validationReport.assumptions : []
          }
        : { status: "pass_with_notes", checks: ["Schema-normalized package."], warnings: [], assumptions: [] }
    };
  }

  return value;
}
