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
});
