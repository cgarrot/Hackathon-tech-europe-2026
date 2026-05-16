import { describe, expect, it, vi } from "vitest";
import { buildPioneerExtractionPayload, collectPioneerExtractionEvidence } from "./pioneer-extraction-client";

describe("pioneer-extraction-client", () => {
  it("skips extraction when required config is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}"));

    await expect(collectPioneerExtractionEvidence("Je veux un loup-garou", {
      env: { PIONEER_API_KEY: "test-key" },
      fetcher: fetchMock
    })).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the documented Pioneer GLiNER payload", () => {
    expect(buildPioneerExtractionPayload("Je veux 6 joueurs", {
      modelId: "job-test",
      labels: ["game_type", "player_count"],
      threshold: 0.4
    })).toEqual({
      model_id: "job-test",
      text: "Je veux 6 joueurs",
      schema: {
        entities: ["game_type", "player_count"]
      },
      threshold: 0.4
    });
  });

  it("extracts and groups entity evidence from Pioneer responses", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      result: {
        entities: {
          game_type: [{ text: "loup-garou", confidence: 0.98, start: 11, end: 21 }],
          player_count: ["6 joueurs"],
          role: ["voyante", "loup-garou"]
        }
      }
    })));

    const evidence = await collectPioneerExtractionEvidence("Je veux un loup-garou à 6 joueurs avec une voyante", {
      env: {
        PIONEER_API_KEY: "test-key",
        PIONEER_GLINER_MODEL_ID: "job-gliner",
        PIONEER_GLINER_ENDPOINT: "https://pioneer.example/inference",
        PIONEER_GLINER_LABELS: "game_type,player_count,role",
        PIONEER_GLINER_THRESHOLD: "0.4"
      },
      fetcher: fetchMock
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock).toHaveBeenCalledWith("https://pioneer.example/inference", expect.objectContaining({ method: "POST" }));
    expect(init?.headers).toMatchObject({ "X-API-Key": "test-key" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model_id: "job-gliner",
      schema: { entities: ["game_type", "player_count", "role"] },
      threshold: 0.4
    });
    expect(evidence).toMatchObject({
      source: "pioneer_gliner",
      modelId: "job-gliner",
      entitiesByLabel: {
        game_type: ["loup-garou"],
        player_count: ["6 joueurs"],
        role: ["voyante", "loup-garou"]
      }
    });
    expect(evidence?.entities[0]).toMatchObject({ label: "game_type", text: "loup-garou", confidence: 0.98, start: 11, end: 21 });
  });

  it("fails open on upstream errors and malformed responses", async () => {
    const env = { PIONEER_API_KEY: "test-key", PIONEER_GLINER_MODEL_ID: "job-gliner" };
    const failingFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ detail: "bad" }), { status: 500 }));
    const malformedFetch = vi.fn<typeof fetch>(async () => new Response("not-json"));
    const rejectedFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });

    await expect(collectPioneerExtractionEvidence("test", { env, fetcher: failingFetch })).resolves.toBeUndefined();
    await expect(collectPioneerExtractionEvidence("test", { env, fetcher: malformedFetch })).resolves.toBeUndefined();
    await expect(collectPioneerExtractionEvidence("test", { env, fetcher: rejectedFetch })).resolves.toBeUndefined();
  });
});
