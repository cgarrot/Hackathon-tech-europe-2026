import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PioneerExtractionEvidence } from "@/server/pioneer-extraction-client";
import { validForgeResult } from "../test/forge-fixture";
import { compileWithLlmProvider } from "./openai-compiler";
import { runStructuredStage } from "./llm-provider";
import type { LlmProviderConfig } from "./llm-provider";

vi.mock("./llm-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm-provider")>();
  return {
    ...actual,
    runStructuredStage: vi.fn()
  };
});

const mockedRunStructuredStage = vi.mocked(runStructuredStage);

const config: LlmProviderConfig = {
  provider: "pioneer",
  model: "moonshotai/Kimi-K2.6",
  apiKey: "test-key",
  baseURL: "https://api.pioneer.ai/v1",
  timeoutMs: 1_000,
  strictJsonSchema: false
};

const evidence: PioneerExtractionEvidence = {
  source: "pioneer_gliner",
  modelId: "job-gliner",
  labels: ["game_type", "player_count", "role"],
  entities: [
    { label: "game_type", text: "loup-garou", confidence: 0.98 },
    { label: "player_count", text: "6 joueurs" }
  ],
  entitiesByLabel: {
    game_type: ["loup-garou"],
    player_count: ["6 joueurs"]
  }
};

function installCompilerStageMocks() {
  mockedRunStructuredStage.mockImplementation(async (params) => {
    if (params.schemaName === "IntakeBrief") {
      return validForgeResult.intake as never;
    }

    if (params.schemaName === "PackSelection") {
      return validForgeResult.routing as never;
    }

    if (params.schemaName === "GameSpec") {
      return validForgeResult.gameSpec as never;
    }

    if (params.schemaName === "ArtifactPackage") {
      return validForgeResult.package as never;
    }

    if (params.schemaName === "PioneerArtifactEnhancement") {
      return {
        visualAssetPrompts: [{ id: "hero_visual", prompt: "Enhanced hero image prompt with cinematic composition, no readable text, no logos, no watermark, no gore, no real artist likeness." }],
        ttsPersonaLines: [{ id: "ai_villager", sampleLines: ["[warm] Je surveille les ombres."] }]
      } as never;
    }

    throw new Error(`unexpected_schema:${params.schemaName}`);
  });
}

describe("compileWithLlmProvider extraction evidence", () => {
  beforeEach(() => {
    mockedRunStructuredStage.mockReset();
    installCompilerStageMocks();
  });

  it("injects upstream GLiNER evidence into model stage payloads", async () => {
    const result = await compileWithLlmProvider("Je veux un loup-garou à 6 joueurs", config, { extractionEvidence: evidence });
    const calls = mockedRunStructuredStage.mock.calls;

    expect(result.pipeline[0]).toEqual({ stage: "pioneer_gliner_extraction", status: "entities:2" });
    expect(JSON.parse(calls[0]?.[0].user ?? "{}")).toMatchObject({ extractionEvidence: { source: "pioneer_gliner" } });
    expect(JSON.parse(calls[1]?.[0].user ?? "{}")).toMatchObject({ extractionEvidence: { entitiesByLabel: { game_type: ["loup-garou"] } } });
    expect(JSON.parse(calls[2]?.[0].user ?? "{}")).toMatchObject({ extractionEvidence: { modelId: "job-gliner" } });
    expect(JSON.parse(calls[3]?.[0].user ?? "{}")).toMatchObject({ extractionEvidence: { labels: ["game_type", "player_count", "role"] } });
  });

  it("preserves the previous prompt shape when extraction is skipped", async () => {
    const result = await compileWithLlmProvider("Je veux un loup-garou", config, { skipExtraction: true });
    const calls = mockedRunStructuredStage.mock.calls;

    expect(result.pipeline.some((step) => step.stage === "pioneer_gliner_extraction")).toBe(false);
    expect(calls[0]?.[0].user).toBe("Je veux un loup-garou");
  });

  it("can use Pioneer only as a complement for images and TTS lines", async () => {
    const result = await compileWithLlmProvider("Je veux un loup-garou", config, {
      skipExtraction: true,
      pioneerArtifactEnhancementConfig: config
    });

    expect(result.pipeline).toEqual(expect.arrayContaining([
      { stage: "pioneer_artifact_enhancement", status: "kimi:images:1,tts_lines:1" }
    ]));
    expect(result.package.assetPrompts.find((asset) => asset.id === "hero_visual")?.prompt).toContain("Enhanced hero image prompt");
    expect(result.package.personas[0]?.sampleLines).toEqual(["[warm] Je surveille les ombres."]);
    expect(mockedRunStructuredStage).toHaveBeenCalledWith(expect.objectContaining({ schemaName: "PioneerArtifactEnhancement" }));
  });
});
