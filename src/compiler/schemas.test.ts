import { describe, expect, it } from "vitest";
import { ForgeRequestSchema, ForgeResultSchema } from "./schemas";
import { validForgeResult } from "../test/forge-fixture";

describe("Forge schemas", () => {
  it("accepts the canonical ForgeResult fixture", () => {
    expect(ForgeResultSchema.parse(validForgeResult).gameSpec.gameId).toBe("test_werewolf_game");
  });

  it("rejects forceMock from app requests", () => {
    const parsed = ForgeRequestSchema.safeParse({
      prompt: "Je veux generer un vrai jeu avec un vrai provider.",
      forceMock: true
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts request-level OpenAI and Ollama provider choices", () => {
    expect(ForgeRequestSchema.parse({
      prompt: "Je veux générer un jeu avec OpenAI.",
      provider: "openai"
    }).provider).toBe("openai");

    expect(ForgeRequestSchema.parse({
      prompt: "Je veux générer un jeu avec Ollama.",
      provider: "ollama"
    }).provider).toBe("ollama");

    expect(ForgeRequestSchema.safeParse({
      prompt: "Je veux générer un jeu avec Kimi via Pioneer.",
      provider: "pioneer"
    }).success).toBe(false);
  });

  it("defaults forge requests to auto provider resolution", () => {
    expect(ForgeRequestSchema.parse({
      prompt: "Je veux générer un jeu avec le provider configuré."
    }).provider).toBe("auto");
  });
});
