import type { GamePack } from "./game-packs";

export const UNIVERSAL_COMPILER_GUIDE = `
GameForge Universal Compiler Guide

Goal: transform a raw user idea into a structured game package.

Pipeline:
1. Intake: extract intent, family, mechanics, players, constraints, and desired outputs.
2. Routing: choose the best game pack.
3. GameSpec: generate playable roles/actors, phases, core loop, persona needs, and win conditions.
4. Artifact generation: derive rules, cards, personas, visual prompts, voice prompts, and code stubs from validated specs.

Do not invent arbitrary enum values. If uncertain, use custom_rules or generic.
Keep responses concise; the server expands artifacts from guides.
Preserve distinctive user themes instead of flattening them: space infiltration, music quiz, heist, philosophical debate, mystery mansion, survival island, and werewolf villages should keep their specific roles, phases, hazards, clues, or judging beats.
Plan for runtime artifacts from the start: roles/actors should support role cards, scene/background prompts, action/state moments, item or clue icons, fictional voice personas, and concise playable sample lines.
`;

export const STRICT_ENUM_GUIDE = `
Allowed GameFamily values:
social_deduction, investigation_mystery, quiz_party, debate_simulation, survival_elimination, strategy_board, roleplay_adventure, custom

Allowed Mechanic values:
hidden_roles, turn_phases, voting, elimination, team_victory, solo_victory, clue_discovery, dialogue_interrogation, score_rounds, resource_management, survival_pressure, ai_personas, audience_judging, custom_rules

Allowed ArtifactKind values:
rules, cards, personas, visuals, voices, code, validation_report

Player object must be exactly:
{ "total": number, "humans": number, "ai": number }

Do not use ais, bots, playerCount, minPlayers, maxPlayers, or nested count fields.
`;

export function packGuide(pack: GamePack) {
  return `
Game Pack Guide: ${pack.label}
Pack ID: ${pack.id}
Family: ${pack.family}
Guide: ${pack.guide}

Allowed mechanics for this pack:
${pack.mechanics.map((mechanic) => `- ${mechanic}`).join("\n")}

Default phase order:
${pack.defaultPhases.map((phase) => `- ${phase}`).join("\n")}

Validation rules:
${pack.validationRules.map((rule) => `- ${rule}`).join("\n")}

When the pack uses ai_personas or voices, include roles/actors that can support distinct fictional speech styles.
For persona-heavy packs, make roles/actors suitable for behaviors such as deflection, accusation, hidden-information hinting, interrogation, negotiation, moderation, crisis leadership, or environmental pressure.
For visual outputs later, include concrete locations, role silhouettes, items/clues, hazards, debate/quiz stages, or UI-relevant state moments that can become no-text image prompts.
For unusual concepts that route to the generic pack, preserve the user's genre nouns and interaction loop instead of replacing them with a plain board-game template.
Generate only a compact GameSpec. Do not generate final markdown, images, files, audio, or long code.
The server derives artifacts from the validated GameSpec and this guide.
`;
}
