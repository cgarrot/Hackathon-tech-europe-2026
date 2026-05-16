import { describe, expect, it } from "vitest";
import { GAME_PACKS } from "./game-packs";
import { buildArtifactPackageFromGameSpec } from "./package-builder";
import { validForgeResult } from "../test/forge-fixture";

const werewolfPack = GAME_PACKS.find((pack) => pack.id === "werewolf") ?? GAME_PACKS[0];

describe("buildArtifactPackageFromGameSpec", () => {
  it("creates visual prompts for every generated role card", () => {
    const artifactPackage = buildArtifactPackageFromGameSpec(validForgeResult.gameSpec, werewolfPack);
    const assetIds = new Set(artifactPackage.assetPrompts.map((asset) => asset.id));

    expect(artifactPackage.cards.length).toBe(validForgeResult.gameSpec.rolesOrActors.length);
    expect(artifactPackage.cards.every((card) => assetIds.has(card.assetId))).toBe(true);
    expect(assetIds.has("tabletop_board_visual")).toBe(true);
  });

  it("creates one persona per AI player up to the demo cap", () => {
    const artifactPackage = buildArtifactPackageFromGameSpec({
      ...validForgeResult.gameSpec,
      players: { total: 4, humans: 2, ai: 2 }
    }, werewolfPack);

    expect(artifactPackage.personas).toHaveLength(2);
    expect(artifactPackage.assetPrompts.filter((asset) => asset.kind === "voice")).toHaveLength(2);
    expect(artifactPackage.assetPrompts.filter((asset) => asset.kind === "voice")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        prompt: expect.stringContaining("Use a fictional game persona only"),
        usage: expect.stringContaining("Gradium voice/persona direction")
      })
    ]));
    expect(artifactPackage.acceptanceTests).toContain("Generated voice prompts map every AI persona to a fictional speech direction.");
  });
});
