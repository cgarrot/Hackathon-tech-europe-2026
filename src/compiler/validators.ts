import type { ForgeResult } from "./schemas";
import { getGamePackById } from "./game-packs";

export function validateForgeResult(result: ForgeResult): string[] {
  const issues: string[] = [];
  const roleTotal = result.gameSpec.rolesOrActors.reduce((sum, role) => sum + role.count, 0);
  const selectedPack = getGamePackById(result.routing.selectedPack);

  if (!selectedPack) {
    issues.push("unknown_selected_pack");
  } else {
    if (result.routing.selectedFamily !== selectedPack.family) {
      issues.push("routing_family_does_not_match_pack_registry");
    }
    if (result.gameSpec.family !== selectedPack.family) {
      issues.push("game_family_does_not_match_pack_registry");
    }
  }

  if (result.gameSpec.pack !== result.routing.selectedPack) {
    issues.push("game_pack_does_not_match_routing_pack");
  }

  if (result.gameSpec.family === "social_deduction" && roleTotal !== result.gameSpec.players.total) {
    issues.push("social_deduction_role_count_mismatch");
  }

  if (result.gameSpec.winConditions.length === 0) {
    issues.push("missing_win_conditions");
  }

  if (result.package.assetPrompts.some((asset) => asset.prompt.length < 16)) {
    issues.push("asset_prompt_too_short");
  }

  if (result.package.codeStubs.some((file) => {
    const normalized = file.path.replaceAll("\\", "/");
    return normalized.includes("../") || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized);
  })) {
    issues.push("invalid_generated_file_path");
  }

  return issues;
}
