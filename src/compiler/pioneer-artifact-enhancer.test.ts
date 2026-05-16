import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validForgeResult } from "@/test/forge-fixture";
import { runStructuredStage } from "./llm-provider";
import { enhanceArtifactPackageWithPioneer, resolvePioneerArtifactEnhancementConfig, resolvePioneerFineTuneArtifactConfig } from "./pioneer-artifact-enhancer";
import type { LlmProviderConfig } from "./llm-provider";

vi.mock("./llm-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm-provider")>();
  return {
    ...actual,
    runStructuredStage: vi.fn()
  };
});

const mockedRunStructuredStage = vi.mocked(runStructuredStage);
const originalEnv = process.env;

const config: LlmProviderConfig = {
  provider: "pioneer",
  model: "moonshotai/Kimi-K2.6",
  apiKey: "test-key",
  baseURL: "https://api.pioneer.ai/v1",
  timeoutMs: 1_000,
  strictJsonSchema: false,
  maxOutputTokens: 800
};

function params() {
  return {
    prompt: "Je veux un loup-garou vocal avec belles images.",
    intake: validForgeResult.intake,
    routing: validForgeResult.routing,
    gameSpec: validForgeResult.gameSpec,
    artifactPackage: validForgeResult.package,
    config
  };
}

describe("pioneer-artifact-enhancer", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mockedRunStructuredStage.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("stays disabled unless complement mode is explicitly enabled", () => {
    delete process.env.PIONEER_ARTIFACT_ENHANCEMENT;
    process.env.PIONEER_API_KEY = "test-key";

    expect(resolvePioneerArtifactEnhancementConfig()).toBeUndefined();
  });

  it("resolves Pioneer complement config from dedicated env with safe defaults", () => {
    process.env.PIONEER_ARTIFACT_ENHANCEMENT = "true";
    process.env.PIONEER_ARTIFACT_API_KEY = "artifact-key";
    process.env.PIONEER_ARTIFACT_MODEL = "moonshotai/Kimi-K2.6";

    expect(resolvePioneerArtifactEnhancementConfig()).toMatchObject({
      provider: "pioneer",
      apiKey: "artifact-key",
      model: "moonshotai/Kimi-K2.6",
      baseURL: "https://api.pioneer.ai/v1",
      strictJsonSchema: false
    });
  });

  it("resolves the fine-tuned Pioneer artifact model for native inference", () => {
    process.env.PIONEER_ARTIFACT_ENHANCEMENT = "true";
    process.env.PIONEER_ARTIFACT_FINE_TUNE_API_KEY = "fine-tune-key";
    process.env.PIONEER_ARTIFACT_FINE_TUNE_MODEL_ID = "fb57ac07-9602-4ee4-95ed-b6024176729a";

    expect(resolvePioneerFineTuneArtifactConfig()).toEqual({
      apiKey: "fine-tune-key",
      modelId: "fb57ac07-9602-4ee4-95ed-b6024176729a",
      endpoint: "https://api.pioneer.ai/inference",
      timeoutMs: 45_000
    });
  });

  it("enhances only image prompts and persona TTS lines", async () => {
    mockedRunStructuredStage.mockResolvedValueOnce({
      visualAssetPrompts: [
        {
          id: "hero_visual",
          prompt: "Cinematic medieval village key art, moonlit composition, safe stylized board-game mood, no readable text, no logos, no watermark, no gore, no real artist likeness, clean overlay space.",
          usage: "hero preview image",
          safetyNotes: ["Clean UI overlay space"]
        },
        {
          id: "voice_ai_villager",
          prompt: "This must be ignored because voice assets are not image prompts."
        }
      ],
      ttsPersonaLines: [
        {
          id: "ai_villager",
          speechStyle: "prudente, tendue, analytique",
          sampleLines: ["[tense] Quelqu'un évite mon regard.", "[happy] invalid tag ignored"]
        }
      ]
    });

    const result = await enhanceArtifactPackageWithPioneer(params());

    expect(result.pipelineStatus).toBe("kimi:images:1,tts_lines:1");
    expect(result.package.assetPrompts.find((asset) => asset.id === "hero_visual")?.prompt).toContain("Cinematic medieval village");
    expect(result.package.assetPrompts.find((asset) => asset.id === "voice_ai_villager")?.prompt).toBe(validForgeResult.package.assetPrompts.find((asset) => asset.id === "voice_ai_villager")?.prompt);
    expect(result.package.personas[0]?.speechStyle).toBe("prudente, tendue, analytique");
    expect(result.package.personas[0]?.sampleLines).toEqual(["[tense] Quelqu'un évite mon regard."]);
  });

  it("fails open when the Pioneer complement call is unavailable", async () => {
    mockedRunStructuredStage.mockRejectedValueOnce(new Error("provider_timeout:PioneerArtifactEnhancement"));

    const result = await enhanceArtifactPackageWithPioneer(params());

    expect(result.package).toEqual(validForgeResult.package);
    expect(result.pipelineStatus).toBe("failed_open");
  });

  it("uses the fine-tuned native Pioneer model before Kimi fallback", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        content: JSON.stringify({
          visualAssetPrompts: [
            {
              id: "hero_visual",
              prompt: "Fine-tuned moonlit village image prompt, cinematic tabletop composition, no readable text, no logos, no watermark, no gore, no real artist likeness."
            }
          ],
          ttsPersonaLines: [
            { id: "ai_villager", sampleLines: ["[whisper] Le fine-tune entend le village."] }
          ]
        })
      }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enhanceArtifactPackageWithPioneer({
      ...params(),
      fineTuneConfig: {
        apiKey: "fine-tune-key",
        modelId: "fb57ac07-9602-4ee4-95ed-b6024176729a",
        endpoint: "https://api.pioneer.ai/inference",
        timeoutMs: 1_000
      }
    });
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body)) as { model_id: string; task: string };

    expect(body).toMatchObject({ model_id: "fb57ac07-9602-4ee4-95ed-b6024176729a", task: "generate" });
    expect(mockedRunStructuredStage).not.toHaveBeenCalled();
    expect(result.pipelineStatus).toBe("fine_tune:images:1,tts_lines:1");
    expect(result.package.personas[0]?.sampleLines).toEqual(["[whisper] Le fine-tune entend le village."]);
  });

  it("falls back to Kimi when the fine-tuned artifact model fails", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("missing addon", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    mockedRunStructuredStage.mockResolvedValueOnce({
      visualAssetPrompts: [
        {
          id: "hero_visual",
          prompt: "Fallback Kimi image prompt, safe cinematic composition, no readable text, no logos, no watermark, no gore, no real artist likeness."
        }
      ],
      ttsPersonaLines: [{ id: "ai_villager", sampleLines: ["[warm] Kimi prend le relais."] }]
    });

    const result = await enhanceArtifactPackageWithPioneer({
      ...params(),
      fineTuneConfig: {
        apiKey: "fine-tune-key",
        modelId: "broken-fine-tune",
        endpoint: "https://api.pioneer.ai/inference",
        timeoutMs: 1_000
      }
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(mockedRunStructuredStage).toHaveBeenCalledWith(expect.objectContaining({ schemaName: "PioneerArtifactEnhancement" }));
    expect(result.pipelineStatus).toBe("fallback_kimi:images:1,tts_lines:1");
    expect(result.package.personas[0]?.sampleLines).toEqual(["[warm] Kimi prend le relais."]);
  });
});
