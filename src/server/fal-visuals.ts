import { fal } from "@fal-ai/client";
import { z } from "zod";
import type { ForgeResult } from "@/compiler/schemas";

export const FAL_FLUX_SCHNELL_MODEL = "fal-ai/flux/schnell";

const FalImageSchema = z
  .object({
    url: z.string().url(),
    content_type: z.string().optional(),
    file_name: z.string().optional(),
    file_size: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })
  .passthrough();

const FalImageResultSchema = z
  .object({
    images: z.array(FalImageSchema).min(1),
    seed: z.number().optional(),
    prompt: z.string().optional(),
    has_nsfw_concepts: z.array(z.boolean()).optional()
  })
  .passthrough();

export type FalImageSize = "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";
export type GameVisualAssetType = "location" | "character" | "role_card" | "ambience" | "item" | "ui";

export type GameVisualAssetSpec = {
  assetId: string;
  assetType: GameVisualAssetType;
  sourceKind: "hero" | "scene" | "card" | "icon" | "fallback";
  title: string;
  prompt: string;
  usage: string;
  imageSize: FalImageSize;
};
type RenderableAssetKind = Exclude<GameVisualAssetSpec["sourceKind"], "fallback">;

export type GeneratedVisualImage = {
  url: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
};

export type GeneratedVisualAsset = GameVisualAssetSpec & {
  images: GeneratedVisualImage[];
  seed?: number;
  model: string;
  provider: "fal";
};

export type GeneratedVisualSet = {
  provider: "fal";
  model: string;
  sourceGameId: string;
  title: string;
  assets: GeneratedVisualAsset[];
};

export class FalVisualConfigError extends Error {
  code = "missing_fal_key" as const;
}

export class FalVisualApiError extends Error {
  code = "fal_visual_generation_failed" as const;

  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

function requireFalKey() {
  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    throw new FalVisualConfigError("Missing FAL_KEY.");
  }
  return key;
}

function assetTypeForKind(kind: GameVisualAssetSpec["sourceKind"]): GameVisualAssetType {
  if (kind === "hero" || kind === "scene") {
    return "location";
  }
  if (kind === "card") {
    return "role_card";
  }
  if (kind === "icon") {
    return "ui";
  }
  return "ambience";
}

function imageSizeForKind(kind: GameVisualAssetSpec["sourceKind"]): FalImageSize {
  if (kind === "card") {
    return "portrait_4_3";
  }
  if (kind === "icon") {
    return "square_hd";
  }
  return "landscape_16_9";
}

function isRenderableAssetKind(kind: ForgeResult["package"]["assetPrompts"][number]["kind"]): kind is RenderableAssetKind {
  return kind === "hero" || kind === "scene" || kind === "card" || kind === "icon";
}

function visualTitleFromAsset(assetId: string, usage: string) {
  const candidate = usage.trim() || assetId;
  return candidate
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function hardenPrompt(prompt: string, kind: GameVisualAssetSpec["sourceKind"], theme: string) {
  const visualUse = kind === "card"
    ? "premium board game role card illustration"
    : kind === "icon"
      ? "clean game UI icon illustration"
      : "cinematic game background concept art";

  return [
    prompt.trim(),
    visualUse,
    `Game theme: ${theme}`,
    "coherent art direction, production-ready game asset, no readable text, no logo, no watermark, no gore, no real artist likeness"
  ].join(", ");
}

export function buildVisualAssetSpecs(result: ForgeResult, maxAssets = 4): GameVisualAssetSpec[] {
  const visualPrompts = result.package.assetPrompts
    .filter((asset): asset is typeof asset & { kind: RenderableAssetKind } => isRenderableAssetKind(asset.kind))
    .sort((left, right) => {
      const order = { hero: 0, scene: 1, card: 2, icon: 3, voice: 4 };
      return order[left.kind] - order[right.kind];
    })
    .slice(0, Math.min(4, Math.max(1, maxAssets)))
    .map((asset) => ({
      assetId: asset.id,
      assetType: assetTypeForKind(asset.kind),
      sourceKind: asset.kind,
      title: visualTitleFromAsset(asset.id, asset.usage),
      prompt: hardenPrompt(asset.prompt, asset.kind, result.gameSpec.theme),
      usage: asset.usage,
      imageSize: imageSizeForKind(asset.kind)
    } satisfies GameVisualAssetSpec));

  if (visualPrompts.length > 0) {
    return visualPrompts;
  }

  const fallbackSpecs: GameVisualAssetSpec[] = [
    {
      assetId: "game_background",
      assetType: "location",
      sourceKind: "fallback",
      title: "Décor principal",
      prompt: hardenPrompt(`${result.gameSpec.theme}, ${result.gameSpec.pitch}`, "scene", result.gameSpec.theme),
      usage: "main generated game background",
      imageSize: "landscape_16_9"
    },
    ...result.gameSpec.rolesOrActors.slice(0, 2).map((role) => ({
      assetId: `role_${role.id}`,
      assetType: "role_card" as const,
      sourceKind: "fallback" as const,
      title: role.name,
      prompt: hardenPrompt(`${role.name}, ${role.publicDescription}, ${role.privateGoal}`, "card", result.gameSpec.theme),
      usage: "fallback role card",
      imageSize: "portrait_4_3" as const
    }))
  ];

  return fallbackSpecs.slice(0, Math.min(4, Math.max(1, maxAssets)));
}

async function generateFalImage(spec: GameVisualAssetSpec) {
  try {
    const result = await fal.subscribe(FAL_FLUX_SCHNELL_MODEL, {
      input: {
        prompt: spec.prompt,
        image_size: spec.imageSize,
        num_images: 1,
        num_inference_steps: 4,
        output_format: "jpeg",
        enable_safety_checker: true,
        acceleration: "regular"
      },
      logs: false
    });

    return FalImageResultSchema.parse(result.data);
  } catch (error) {
    throw new FalVisualApiError(
      error instanceof Error ? error.message : "fal image generation failed",
      error
    );
  }
}

export async function generateVisualSetWithFal(result: ForgeResult, maxAssets = 4): Promise<GeneratedVisualSet> {
  fal.config({ credentials: requireFalKey() });
  const specs = buildVisualAssetSpecs(result, maxAssets);
  const assets: GeneratedVisualAsset[] = [];

  for (const spec of specs) {
    const generated = await generateFalImage(spec);
    assets.push({
      ...spec,
      provider: "fal",
      model: FAL_FLUX_SCHNELL_MODEL,
      seed: generated.seed,
      images: generated.images.map((image) => ({
        url: image.url,
        contentType: image.content_type,
        fileName: image.file_name,
        fileSize: image.file_size,
        width: image.width,
        height: image.height
      }))
    });
  }

  return {
    provider: "fal",
    model: FAL_FLUX_SCHNELL_MODEL,
    sourceGameId: result.gameSpec.gameId,
    title: result.gameSpec.title,
    assets
  };
}
