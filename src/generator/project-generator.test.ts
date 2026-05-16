import { describe, expect, it } from "vitest";
import { buildGeneratedProject } from "./project-generator";
import { GeneratedProjectSchema } from "./schemas";
import { validForgeResult } from "../test/forge-fixture";

describe("buildGeneratedProject", () => {
  it("creates a client-only preview scaffold with a manifest", () => {
    const project = GeneratedProjectSchema.parse(buildGeneratedProject(validForgeResult));
    const paths = project.files.map((file) => file.path);

    expect(paths).toEqual(expect.arrayContaining([
      "README.md",
      "package.json",
      "tsconfig.json",
      "app/layout.tsx",
      "app/page.tsx",
      "app/globals.css",
      "data/visual-assets.json",
      "data/voice-manifest.json",
      "src/ui/CardGallery.tsx",
      "src/ui/GamePreview.tsx",
      "generated-project-manifest.json"
    ]));
  });

  it("keeps generated paths relative and allowlisted", () => {
    const project = buildGeneratedProject(validForgeResult);

    expect(project.files.every((file) => !file.path.startsWith("/") && !file.path.includes(".."))).toBe(true);
  });

  it("lists itself in the generated manifest", () => {
    const project = buildGeneratedProject(validForgeResult);
    const manifest = project.files.find((file) => file.path === "generated-project-manifest.json");

    expect(manifest?.content).toContain("generated-project-manifest.json");
    expect(manifest?.content).toContain("app/page.tsx");
    expect(manifest?.content).toContain("data/visual-assets.json");
    expect(manifest?.content).toContain("data/voice-manifest.json");
  });

  it("emits visual runtime assets joined to role quantities", () => {
    const project = buildGeneratedProject(validForgeResult);
    const visualAssetsFile = project.files.find((file) => file.path === "data/visual-assets.json");
    const visualAssets = JSON.parse(visualAssetsFile?.content ?? "{}") as {
      visuals: {
        assets: Array<{
          asset_id: string;
          asset_type: string;
          image_size: string;
          metadata: {
            role_id?: string;
            quantity?: number;
          };
        }>;
      };
    };

    expect(visualAssets.visuals.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        asset_id: "test-werewolf-game_tabletop_board",
        asset_type: "location",
        image_size: "landscape_16_9"
      }),
      expect.objectContaining({
        asset_id: "asset_werewolf",
        asset_type: "role_card",
        image_size: "portrait_4_3",
        metadata: expect.objectContaining({ role_id: "werewolf", quantity: 1 })
      })
    ]));
  });

  it("keeps voice prompts out of visual image assets", () => {
    const project = buildGeneratedProject({
      ...validForgeResult,
      package: {
        ...validForgeResult.package,
        assetPrompts: [
          ...validForgeResult.package.assetPrompts,
          {
            id: "voice_narrator",
            kind: "voice",
            prompt: "Warm mysterious narrator voice for a safe tabletop werewolf host.",
            usage: "voice host",
            safetyNotes: ["No impersonation"]
          }
        ]
      }
    });
    const visualAssetsFile = project.files.find((file) => file.path === "data/visual-assets.json");
    const visualAssets = JSON.parse(visualAssetsFile?.content ?? "{}") as {
      visuals: {
        assets: Array<{ asset_id: string }>;
      };
    };

    expect(visualAssets.visuals.assets.some((asset) => asset.asset_id === "voice_narrator")).toBe(false);
  });

  it("emits a Gradium voice manifest joined to personas", () => {
    const project = buildGeneratedProject(validForgeResult);
    const voiceManifestFile = project.files.find((file) => file.path === "data/voice-manifest.json");
    const voiceManifest = JSON.parse(voiceManifestFile?.content ?? "{}") as {
      voices: {
        provider: string;
        routes: { speechToText: string; textToSpeech: string };
        profiles: Array<{
          persona_id: string;
          voice_id_env: string;
          prompt: string;
        }>;
      };
    };

    expect(voiceManifest.voices.provider).toBe("gradium");
    expect(voiceManifest.voices.routes).toEqual({ speechToText: "/api/voice/stt", textToSpeech: "/api/voice/tts" });
    expect(voiceManifest.voices.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        persona_id: "ai_villager",
        voice_id_env: "GRADIUM_FR_VOICE_ID",
        prompt: expect.stringContaining("Mireille")
      })
    ]));
  });

  it("emits typed generated config for valid packages without card or asset arrays", () => {
    const project = buildGeneratedProject({
      ...validForgeResult,
      package: {
        ...validForgeResult.package,
        cards: [],
        assetPrompts: []
      }
    });
    const config = project.files.find((file) => file.path === "src/game/config.ts");
    const types = project.files.find((file) => file.path === "src/game/types.ts");
    const visualAssetsFile = project.files.find((file) => file.path === "data/visual-assets.json");
    const visualAssets = JSON.parse(visualAssetsFile?.content ?? "{}") as {
      visuals: {
        assets: Array<{ asset_type: string }>;
      };
    };

    expect(config?.content).toContain("import type { GeneratedGameConfig }");
    expect(config?.content).toContain("export const generatedGame: GeneratedGameConfig");
    expect(config?.content).not.toContain("as const");
    expect(types?.content).toContain("export interface GeneratedCardConfig");
    expect(visualAssets.visuals.assets).toEqual([
      expect.objectContaining({ asset_type: "location" })
    ]);
  });
});
