import { beforeEach, describe, expect, it, vi } from "vitest";
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
  provider: "openai",
  model: "gpt-test",
  apiKey: "test-key",
  timeoutMs: 1_000,
  strictJsonSchema: true
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

    throw new Error(`unexpected_schema:${params.schemaName}`);
  });
}

describe("compileWithLlmProvider", () => {
  beforeEach(() => {
    mockedRunStructuredStage.mockReset();
    installCompilerStageMocks();
  });

  it("passes the user prompt directly to the intake stage", async () => {
    const result = await compileWithLlmProvider("Je veux un loup-garou", config);
    const calls = mockedRunStructuredStage.mock.calls;

    expect(result.pipeline.some((step) => step.stage.toLowerCase().includes("pioneer"))).toBe(false);
    expect(calls[0]?.[0].user).toBe("Je veux un loup-garou");
  });

  it("emits progress events for the real compiler stages", async () => {
    const progress: string[] = [];

    await compileWithLlmProvider("Je veux un loup-garou", config, {
      onProgress: (event) => {
        progress.push(`${event.stage}:${event.status}`);
      }
    });

    expect(progress).toEqual([
      "intake:running",
      "intake:complete",
      "family_router:running",
      "family_router:complete",
      "game_spec:running",
      "game_spec:complete",
      "artifact_package:running",
      "artifact_package:complete",
      "validation:running",
      "validation:complete"
    ]);
  });
});
