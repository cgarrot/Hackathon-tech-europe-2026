import { z } from "zod";

export const GameFamilySchema = z.enum([
  "social_deduction",
  "investigation_mystery",
  "quiz_party",
  "debate_simulation",
  "survival_elimination",
  "strategy_board",
  "roleplay_adventure",
  "custom"
]);

export const MechanicSchema = z.enum([
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
]);

export const ArtifactKindSchema = z.enum([
  "rules",
  "cards",
  "personas",
  "visuals",
  "voices",
  "code",
  "validation_report"
]);

export const ForgeProviderChoiceSchema = z.enum(["auto", "openai", "ollama", "pioneer"]);

export const PlayerConfigSchema = z
  .object({
    total: z.number().int().min(1).max(40),
    humans: z.number().int().min(0).max(40),
    ai: z.number().int().min(0).max(40)
  })
  .strict()
  .superRefine((players, ctx) => {
    if (players.humans + players.ai !== players.total) {
      ctx.addIssue({
        code: "custom",
        message: "humans + ai must equal total",
        path: ["total"]
      });
    }
  });

export const IntakeBriefSchema = z
  .object({
    sourceRequest: z.string().min(8),
    language: z.string().min(2),
    gameFamily: GameFamilySchema,
    interactionModel: z.string().min(3),
    primaryMechanics: z.array(MechanicSchema).min(1),
    theme: z.string().min(2),
    players: PlayerConfigSchema,
    requiredOutputs: z.array(ArtifactKindSchema).min(1),
    explicitRequirements: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const PackSelectionSchema = z
  .object({
    selectedPack: z.string().min(1),
    selectedFamily: GameFamilySchema,
    reason: z.string().min(8),
    fallbackPack: z.string().min(1),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const RoleOrActorSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    teamOrSide: z.string().min(1),
    count: z.number().int().min(0).max(40),
    publicDescription: z.string().min(1),
    privateGoal: z.string().min(1),
    abilities: z.array(z.string()).default([])
  })
  .strict();

export const PhaseSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
    allowedActions: z.array(z.string()).min(1),
    next: z.string().min(1)
  })
  .strict();

export const GameSpecSchema = z
  .object({
    gameId: z.string().min(3),
    title: z.string().min(3),
    pitch: z.string().min(12),
    family: GameFamilySchema,
    pack: z.string().min(1),
    theme: z.string().min(2),
    players: PlayerConfigSchema,
    mechanics: z.array(MechanicSchema).min(1),
    coreLoop: z.array(z.string()).min(2),
    rolesOrActors: z.array(RoleOrActorSchema).min(1),
    phases: z.array(PhaseSchema).min(1),
    winConditions: z.array(z.string()).min(1),
    safetyConstraints: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([])
  })
  .strict();

export const CardSpecSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    roleOrActorId: z.string().min(1),
    frontText: z.string().min(1),
    privateReminder: z.string().min(1),
    assetId: z.string().min(1)
  })
  .strict();

export const PersonaSpecSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    speechStyle: z.string().min(1),
    publicBackstory: z.string().min(1),
    behaviorRules: z.array(z.string()).min(1),
    sampleLines: z.array(z.string()).min(1)
  })
  .strict();

export const AssetPromptSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["hero", "scene", "card", "icon", "voice"]),
    prompt: z.string().min(16),
    usage: z.string().min(1),
    safetyNotes: z.array(z.string()).default([])
  })
  .strict();

export const CodeStubSchema = z
  .object({
    path: z.string().min(1),
    purpose: z.string().min(1),
    content: z.string().min(1)
  })
  .strict()
  .superRefine((file, ctx) => {
    const normalized = file.path.replaceAll("\\", "/");
    const hasDrivePrefix = /^[a-zA-Z]:\//.test(normalized);
    if (normalized.includes("../") || normalized.startsWith("/") || hasDrivePrefix) {
      ctx.addIssue({
        code: "custom",
        message: "Generated file path must be relative and cannot traverse directories",
        path: ["path"]
      });
    }
  });

export const ValidationReportSchema = z
  .object({
    status: z.enum(["pass", "pass_with_notes", "fail"]),
    checks: z.array(z.string()).min(1),
    warnings: z.array(z.string()).default([]),
    assumptions: z.array(z.string()).default([])
  })
  .strict();

export const ArtifactPackageSchema = z
  .object({
    rulesMarkdown: z.string().min(20),
    cards: z.array(CardSpecSchema).default([]),
    personas: z.array(PersonaSpecSchema).default([]),
    assetPrompts: z.array(AssetPromptSchema).default([]),
    codeStubs: z.array(CodeStubSchema).default([]),
    acceptanceTests: z.array(z.string()).min(1),
    validationReport: ValidationReportSchema
  })
  .strict();

export const ForgeRequestSchema = z
  .object({
    prompt: z.string().min(8).max(4000),
    provider: ForgeProviderChoiceSchema.default("auto")
  })
  .strict();

export const ForgeResultSchema = z
  .object({
    intake: IntakeBriefSchema,
    routing: PackSelectionSchema,
    gameSpec: GameSpecSchema,
    package: ArtifactPackageSchema,
    pipeline: z.array(z.object({ stage: z.string(), status: z.string() }).strict()).min(1)
  })
  .strict();

export type GameFamily = z.infer<typeof GameFamilySchema>;
export type Mechanic = z.infer<typeof MechanicSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ForgeProviderChoice = z.infer<typeof ForgeProviderChoiceSchema>;
export type IntakeBrief = z.infer<typeof IntakeBriefSchema>;
export type PackSelection = z.infer<typeof PackSelectionSchema>;
export type GameSpec = z.infer<typeof GameSpecSchema>;
export type ArtifactPackage = z.infer<typeof ArtifactPackageSchema>;
export type ForgeRequest = z.infer<typeof ForgeRequestSchema>;
export type ForgeResult = z.infer<typeof ForgeResultSchema>;
