import { describe, expect, it } from "vitest";
import { validForgeResult } from "@/test/forge-fixture";
import { buildVisualAssetSpecs } from "./fal-visuals";

function fixture() {
  return structuredClone(validForgeResult);
}

describe("fal visual specs", () => {
  it("builds fal-ready specs from ForgeResult asset prompts", () => {
    const specs = buildVisualAssetSpecs(fixture());

    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      assetId: "hero_visual",
      assetType: "location",
      imageSize: "landscape_16_9"
    });
    expect(specs[1]).toMatchObject({
      assetId: "asset_werewolf",
      assetType: "role_card",
      imageSize: "portrait_4_3"
    });
    expect(specs[0]?.prompt).toContain("no readable text");
  });

  it("derives fallback background and role cards when explicit visual prompts are absent", () => {
    const result = fixture();
    result.package.assetPrompts = result.package.assetPrompts.filter((asset) => asset.kind === "voice");

    const specs = buildVisualAssetSpecs(result, 3);

    expect(specs.map((spec) => spec.assetType)).toEqual(["location", "role_card", "role_card"]);
    expect(specs[0]?.title).toBe("Décor principal");
  });
});
