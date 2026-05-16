import type { ForgeResult, GameSpec } from "@/compiler/schemas";
import { buildPersonaVoiceProfile } from "@/voice-profiles";
import { GeneratedProjectSchema, type GeneratedProject, type GeneratedProjectFile } from "./schemas";

function safeId(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "generated-game";
}

function jsonFile(path: string, purpose: string, value: unknown): GeneratedProjectFile {
  return {
    path,
    kind: "json",
    purpose,
    content: `${JSON.stringify(value, null, 2)}\n`
  };
}

function mdFile(path: string, purpose: string, content: string): GeneratedProjectFile {
  return { path, kind: "md", purpose, content };
}

function tsFile(path: string, purpose: string, content: string): GeneratedProjectFile {
  return { path, kind: "ts", purpose, content };
}

function tsxFile(path: string, purpose: string, content: string): GeneratedProjectFile {
  return { path, kind: "tsx", purpose, content };
}

function cssFile(path: string, purpose: string, content: string): GeneratedProjectFile {
  return { path, kind: "css", purpose, content };
}

function roleUnion(gameSpec: GameSpec) {
  return gameSpec.rolesOrActors.map((role) => JSON.stringify(role.id)).join(" | ") || "string";
}

function phaseUnion(gameSpec: GameSpec) {
  return gameSpec.phases.map((phase) => JSON.stringify(phase.id)).join(" | ") || "string";
}

type AssetPrompt = ForgeResult["package"]["assetPrompts"][number];
type CardSpec = ForgeResult["package"]["cards"][number];
type RoleOrActor = ForgeResult["gameSpec"]["rolesOrActors"][number];
type VisualAssetType = "location" | "character" | "role_card" | "ambience" | "item" | "ui";
type VisualImageSize = "portrait_4_3" | "landscape_16_9";
type VisualMetadataValue = string | number | boolean | string[];

interface VisualAsset {
  asset_id: string;
  asset_type: VisualAssetType;
  prompt: string;
  image_size: VisualImageSize;
  metadata: Record<string, VisualMetadataValue>;
}

interface VisualAssetsDocument {
  visuals: {
    assets: VisualAsset[];
  };
}

interface VoiceManifestDocument {
  voices: {
    provider: "gradium";
    mode: "server_route";
    routes: {
      speechToText: "/api/voice/stt";
      textToSpeech: "/api/voice/tts";
    };
    profiles: Array<{
      persona_id: string;
      display_name: string;
      language: "fr" | "en";
      profile_id: string;
      voice_id_env: string;
      style_id: string;
      delivery: string;
      prompt: string;
      sample_lines: string[];
      asset_prompt_id?: string;
    }>;
  };
}

function assetTypeForKind(kind: AssetPrompt["kind"]): VisualAssetType {
  switch (kind) {
    case "hero":
      return "ambience";
    case "scene":
      return "location";
    case "card":
      return "role_card";
    case "icon":
      return "ui";
    case "voice":
      return "character";
  }
}

function imageSizeForKind(kind: AssetPrompt["kind"]): VisualImageSize {
  return kind === "card" || kind === "voice" ? "portrait_4_3" : "landscape_16_9";
}

function findRoleForCard(roles: RoleOrActor[], card: CardSpec) {
  return roles.find((role) => role.id === card.roleOrActorId);
}

function findAssetPrompt(assets: AssetPrompt[], assetId: string) {
  return assets.find((asset) => asset.id === assetId);
}

function buildRoleCardVisual(result: ForgeResult, card: CardSpec): VisualAsset {
  const role = findRoleForCard(result.gameSpec.rolesOrActors, card);
  const assetPrompt = findAssetPrompt(result.package.assetPrompts, card.assetId);

  return {
    asset_id: card.assetId,
    asset_type: "role_card",
    prompt: assetPrompt?.prompt ?? `Role card illustration for ${card.name} in ${result.gameSpec.title}, ${result.gameSpec.theme}, safe tabletop card art.`,
    image_size: "portrait_4_3",
    metadata: {
      source: "gameforge_role_card",
      card_id: card.id,
      role_id: card.roleOrActorId,
      role_name: role?.name ?? card.name,
      team_or_side: role?.teamOrSide ?? "unknown",
      quantity: role?.count ?? 1,
      usage: assetPrompt?.usage ?? "role card",
      safety_notes: assetPrompt?.safetyNotes ?? []
    }
  };
}

function buildPromptVisual(asset: AssetPrompt): VisualAsset {
  return {
    asset_id: asset.id,
    asset_type: assetTypeForKind(asset.kind),
    prompt: asset.prompt,
    image_size: imageSizeForKind(asset.kind),
    metadata: {
      source: "gameforge_asset_prompt",
      kind: asset.kind,
      usage: asset.usage,
      safety_notes: asset.safetyNotes
    }
  };
}

function buildBoardVisual(result: ForgeResult): VisualAsset {
  const roleTotal = result.gameSpec.rolesOrActors.reduce((sum, role) => sum + role.count, 0);

  return {
    asset_id: `${safeId(result.gameSpec.gameId)}_tabletop_board`,
    asset_type: "location",
    prompt: `Top-down visual tabletop support board for ${result.gameSpec.title}, ${result.gameSpec.theme}, with phase track (${result.gameSpec.phases.map((phase) => phase.name).join(", ")}) and safe non-graphic board game styling.`,
    image_size: "landscape_16_9",
    metadata: {
      source: "gameforge_tabletop_support",
      game_id: result.gameSpec.gameId,
      theme: result.gameSpec.theme,
      role_total: roleTotal,
      phase_ids: result.gameSpec.phases.map((phase) => phase.id)
    }
  };
}

function buildVisualAssets(result: ForgeResult): VisualAssetsDocument {
  const roleCardAssetIds = new Set(result.package.cards.map((card) => card.assetId));
  const promptAssets = result.package.assetPrompts
    .filter((asset) => asset.kind !== "voice" && !roleCardAssetIds.has(asset.id))
    .map((asset) => buildPromptVisual(asset));
  const roleCardAssets = result.package.cards.map((card) => buildRoleCardVisual(result, card));

  return {
    visuals: {
      assets: [buildBoardVisual(result), ...promptAssets, ...roleCardAssets]
    }
  };
}

function buildVoiceManifest(result: ForgeResult): VoiceManifestDocument {
  return {
    voices: {
      provider: "gradium",
      mode: "server_route",
      routes: {
        speechToText: "/api/voice/stt",
        textToSpeech: "/api/voice/tts"
      },
      profiles: result.package.personas.map((persona, index) => {
        const profile = buildPersonaVoiceProfile(persona, {
          language: result.intake.language,
          theme: result.gameSpec.theme,
          index,
          assetPrompts: result.package.assetPrompts
        });

        return {
          persona_id: profile.personaId,
          display_name: profile.displayName,
          language: profile.language,
          profile_id: profile.profileId,
          voice_id_env: profile.voiceIdEnv,
          style_id: profile.styleId,
          delivery: profile.delivery,
          prompt: profile.prompt,
          sample_lines: profile.sampleLines,
          asset_prompt_id: profile.assetPromptId
        };
      })
    }
  };
}

function buildReadme(result: ForgeResult) {
  const { gameSpec } = result;
  return `# ${gameSpec.title}\n\n${gameSpec.pitch}\n\n## GameForge package\n\n- Family: ${gameSpec.family}\n- Pack: ${gameSpec.pack}\n- Players: ${gameSpec.players.total} total (${gameSpec.players.humans} humans, ${gameSpec.players.ai} AI)\n- Visual runtime data: data/visual-assets.json\n- Voice runtime data: data/voice-manifest.json\n\n## Run the preview\n\nThis package is generated as a reviewable client-only Next.js preview. The GameForge server does not install dependencies, execute generated code, or write files to disk.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Core loop\n\n${gameSpec.coreLoop.map((step) => `- ${step}`).join("\n")}\n\n## Win conditions\n\n${gameSpec.winConditions.map((condition) => `- ${condition}`).join("\n")}\n`;
}

function buildPackageJson(projectId: string) {
  return {
    name: projectId,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      typecheck: "tsc --noEmit"
    },
    dependencies: {
      next: "^16.2.6",
      react: "^19.1.0",
      "react-dom": "^19.1.0"
    },
    devDependencies: {
      "@types/node": "^24.0.0",
      "@types/react": "^19.1.0",
      "@types/react-dom": "^19.1.0",
      typescript: "^5.8.0"
    }
  };
}

function buildTsConfig() {
  return {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: true,
      plugins: [{ name: "next" }]
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"]
  };
}

function buildAppLayout(gameSpec: GameSpec) {
  const metadata = JSON.stringify({ title: gameSpec.title, description: gameSpec.pitch }, null, 2);
  return `import type { ReactNode } from "react";\nimport "./globals.css";\n\nexport const metadata = ${metadata};\n\nexport default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {\n  return (\n    <html lang="fr">\n      <body>{children}</body>\n    </html>\n  );\n}\n`;
}

function buildAppPage() {
  return `import { GamePreview } from "../src/ui/GamePreview";\nimport "../src/ui/game-preview.css";\n\nexport default function Page() {\n  return <GamePreview />;\n}\n`;
}

function buildGlobalStyles() {
  return `* {\n  box-sizing: border-box;\n}\n\nhtml,\nbody {\n  min-height: 100%;\n  margin: 0;\n}\n\nbutton,\ninput,\ntextarea {\n  font: inherit;\n}\n`;
}

function buildTypes(gameSpec: GameSpec) {
  return `export type RoleId = ${roleUnion(gameSpec)};\nexport type PhaseId = ${phaseUnion(gameSpec)};\nexport type AssetPromptKind = "hero" | "scene" | "card" | "icon" | "voice";\n\nexport interface GeneratedPlayerConfig {\n  total: number;\n  humans: number;\n  ai: number;\n}\n\nexport interface GeneratedRoleOrActor {\n  id: string;\n  name: string;\n  teamOrSide: string;\n  count: number;\n  publicDescription: string;\n  privateGoal: string;\n  abilities: string[];\n}\n\nexport interface GeneratedPhase {\n  id: string;\n  name: string;\n  purpose: string;\n  allowedActions: string[];\n  next: string;\n}\n\nexport interface GeneratedGameSpecConfig {\n  gameId: string;\n  title: string;\n  pitch: string;\n  family: string;\n  pack: string;\n  theme: string;\n  players: GeneratedPlayerConfig;\n  mechanics: string[];\n  coreLoop: string[];\n  rolesOrActors: GeneratedRoleOrActor[];\n  phases: GeneratedPhase[];\n  winConditions: string[];\n  safetyConstraints: string[];\n  assumptions: string[];\n}\n\nexport interface GeneratedCardConfig {\n  id: string;\n  name: string;\n  roleOrActorId: string;\n  frontText: string;\n  privateReminder: string;\n  assetId: string;\n}\n\nexport interface GeneratedPersonaConfig {\n  id: string;\n  displayName: string;\n  speechStyle: string;\n  publicBackstory: string;\n  behaviorRules: string[];\n  sampleLines: string[];\n}\n\nexport interface GeneratedAssetPromptConfig {\n  id: string;\n  kind: AssetPromptKind;\n  prompt: string;\n  usage: string;\n  safetyNotes: string[];\n}\n\nexport interface GeneratedGameConfig {\n  gameSpec: GeneratedGameSpecConfig;\n  cards: GeneratedCardConfig[];\n  personas: GeneratedPersonaConfig[];\n  assetPrompts: GeneratedAssetPromptConfig[];\n  acceptanceTests: string[];\n}\n\nexport interface GeneratedPlayer {\n  id: string;\n  name: string;\n  roleId: RoleId;\n  isAI: boolean;\n  alive: boolean;\n}\n\nexport interface GeneratedGameState {\n  phase: PhaseId;\n  players: GeneratedPlayer[];\n  round: number;\n  log: string[];\n}\n`;
}

function buildConfig(result: ForgeResult) {
  return `import type { GeneratedGameConfig } from "./types";\n\nexport const generatedGame: GeneratedGameConfig = ${JSON.stringify(
    {
      gameSpec: result.gameSpec,
      cards: result.package.cards,
      personas: result.package.personas,
      assetPrompts: result.package.assetPrompts,
      acceptanceTests: result.package.acceptanceTests
    },
    null,
    2
  )};\n`;
}

function buildRules(gameSpec: GameSpec) {
  return `import type { GeneratedGameState } from "./types";\n\nexport function nextPhase(currentPhase: string): string {\n  const phases = ${JSON.stringify(gameSpec.phases.map((phase) => phase.id))};\n  const index = phases.indexOf(currentPhase);\n  return phases[index + 1] ?? phases[0] ?? "setup";\n}\n\nexport function appendLog(state: GeneratedGameState, message: string): GeneratedGameState {\n  return {\n    ...state,\n    log: [...state.log, message]\n  };\n}\n\nexport function alivePlayers(state: GeneratedGameState) {\n  return state.players.filter((player) => player.alive);\n}\n`;
}

function buildCardGallery() {
  return `"use client";

import voiceManifest from "../../data/voice-manifest.json";
import { generatedGame } from "../game/config";

function roleQuantityLabel(count: number) {
  return count > 1 ? count + " exemplaires" : "1 exemplaire";
}

export function CardGallery() {
  return (
    <>
      <section className="card-gallery" aria-labelledby="roles-title">
        <div className="section-heading">
          <p className="eyebrow">Deck de support</p>
          <h2 id="roles-title">Cartes de rôle</h2>
        </div>
        <div className="card-grid">
          {generatedGame.gameSpec.rolesOrActors.map((role) => {
            const card = generatedGame.cards.find((candidate) => candidate.roleOrActorId === role.id);
            const asset = card ? generatedGame.assetPrompts.find((candidate) => candidate.id === card.assetId) : undefined;

            return (
              <article className="role-card" key={role.id}>
                <div className="card-topline">
                  <span className="role-seal">{role.name.slice(0, 1).toUpperCase()}</span>
                  <span className="quantity-pill">{roleQuantityLabel(role.count)}</span>
                </div>
                <p className="card-kicker">{role.teamOrSide}</p>
                <h3>{card?.name ?? role.name}</h3>
                <p>{card?.frontText ?? role.publicDescription}</p>
                <small>{card?.privateReminder ?? role.privateGoal}</small>
                <em>{asset?.usage ?? "Support visuel pret a connecter"}</em>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card-gallery" aria-labelledby="voices-title">
        <div className="section-heading">
          <p className="eyebrow">Voix IA</p>
          <h2 id="voices-title">Profils Gradium</h2>
        </div>
        <div className="card-grid">
          {voiceManifest.voices.profiles.map((voice) => (
            <article className="role-card" key={voice.persona_id}>
              <p className="card-kicker">{voice.profile_id} / {voice.style_id}</p>
              <h3>{voice.display_name}</h3>
              <p>{voice.delivery}</p>
              <small>{voice.sample_lines[0] ?? voice.prompt}</small>
              <em>{voice.voice_id_env} reste une variable serveur GameForge, jamais un secret client.</em>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
`;
}

function buildGamePreview() {
  return `"use client";\n\nimport visualAssets from "../../data/visual-assets.json";\nimport { generatedGame } from "../game/config";\nimport { CardGallery } from "./CardGallery";\n\nfunction roleTotal() {\n  return generatedGame.gameSpec.rolesOrActors.reduce((sum, role) => sum + role.count, 0);\n}\n\nexport function GamePreview() {\n  const totalRoles = roleTotal();\n  const firstPhase = generatedGame.gameSpec.phases[0];\n  const visualQueue = visualAssets.visuals.assets;\n\n  return (\n    <main className="game-shell">\n      <section className="hero-panel">\n        <div className="hero-copy">\n          <p className="eyebrow">{generatedGame.gameSpec.family} / {generatedGame.gameSpec.pack}</p>\n          <h1>{generatedGame.gameSpec.title}</h1>\n          <p>{generatedGame.gameSpec.pitch}</p>\n          <div className="badge-row">\n            <span>{generatedGame.gameSpec.players.total} joueurs</span>\n            <span>{generatedGame.gameSpec.players.humans} humains</span>\n            <span>{generatedGame.gameSpec.players.ai} IA</span>\n            <span>{totalRoles} roles distribues</span>\n          </div>\n        </div>\n        <aside className="table-board" aria-label="Plateau de support">\n          <div className="moon-token">\n            <span>phase active</span>\n            <strong>{firstPhase?.name ?? "Setup"}</strong>\n          </div>\n          <p>{generatedGame.gameSpec.theme}</p>\n        </aside>\n      </section>\n\n      <section className="support-layout">\n        <article className="phase-card">\n          <p className="eyebrow">Piste de phases</p>\n          <ol className="phase-strip">\n            {generatedGame.gameSpec.phases.map((phase, index) => (\n              <li key={phase.id}>\n                <span>{String(index + 1).padStart(2, "0")}</span>\n                <div>\n                  <strong>{phase.name}</strong>\n                  <p>{phase.purpose}</p>\n                </div>\n              </li>\n            ))}\n          </ol>\n        </article>\n\n        <article className="loop-card">\n          <p className="eyebrow">Boucle jouable</p>\n          <ol>\n            {generatedGame.gameSpec.coreLoop.map((step) => <li key={step}>{step}</li>)}\n          </ol>\n        </article>\n      </section>\n\n      <CardGallery />\n\n      <section className="visual-assets-panel" aria-labelledby="visual-assets-title">\n        <div className="section-heading">\n          <p className="eyebrow">Runtime visuel</p>\n          <h2 id="visual-assets-title">Assets prêts pour FAL / Gradium</h2>\n        </div>\n        <div className="visual-asset-grid">\n          {visualQueue.map((asset) => (\n            <article key={asset.asset_id}>\n              <span>{asset.asset_type}</span>\n              <h3>{asset.asset_id}</h3>\n              <p>{asset.prompt}</p>\n            </article>\n          ))}\n        </div>\n      </section>\n    </main>\n  );\n}\n`;
}

function buildStyles() {
  return `:root {\n  --gf-bg: #070a0f;\n  --gf-ink: #f7f0df;\n  --gf-muted: #b9c0b1;\n  --gf-line: rgba(255, 255, 255, 0.16);\n  --gf-panel: rgba(255, 255, 255, 0.07);\n  --gf-panel-strong: rgba(255, 255, 255, 0.12);\n  --gf-gold: #f3b95f;\n  --gf-gold-soft: rgba(243, 185, 95, 0.18);\n  --gf-green: #97d7a4;\n  --gf-night: rgba(0, 0, 0, 0.34);\n  --gf-space-1: 4px;\n  --gf-space-2: 8px;\n  --gf-space-3: 12px;\n  --gf-space-4: 16px;\n  --gf-space-5: 20px;\n  --gf-space-6: 24px;\n  --gf-space-8: 32px;\n  --gf-radius-md: 16px;\n  --gf-radius-lg: 24px;\n  --gf-radius-pill: 999px;\n  --gf-shadow: 0 30px 90px rgba(0, 0, 0, 0.36);\n  --gf-font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;\n  --gf-font-body: "Avenir Next", "Trebuchet MS", Verdana, sans-serif;\n}\n\nbody {\n  background:\n    radial-gradient(circle at 10% 0%, var(--gf-gold-soft), transparent 30rem),\n    radial-gradient(circle at 82% 12%, rgba(151, 215, 164, 0.12), transparent 26rem),\n    var(--gf-bg);\n  color: var(--gf-ink);\n  font-family: var(--gf-font-body);\n}\n\n.game-shell {\n  display: grid;\n  gap: var(--gf-space-8);\n  min-height: 100vh;\n  width: min(1180px, calc(100vw - 32px));\n  margin: 0 auto;\n  padding: clamp(32px, 6vw, 76px) 0;\n}\n\n.hero-panel,\n.phase-card,\n.loop-card,\n.card-gallery,\n.visual-assets-panel {\n  border: 1px solid var(--gf-line);\n  border-radius: var(--gf-radius-lg);\n  background: linear-gradient(180deg, var(--gf-panel-strong), var(--gf-panel));\n  box-shadow: var(--gf-shadow);\n}\n\n.hero-panel {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.42fr);\n  gap: var(--gf-space-6);\n  overflow: hidden;\n  padding: var(--gf-space-6);\n}\n\n.hero-copy h1 {\n  max-width: 780px;\n  margin: var(--gf-space-2) 0 var(--gf-space-4);\n  font-family: var(--gf-font-display);\n  font-size: clamp(2.6rem, 7vw, 6.5rem);\n  line-height: 0.9;\n}\n\n.hero-copy p {\n  max-width: 720px;\n  color: var(--gf-muted);\n  font-size: 1.08rem;\n  line-height: 1.7;\n}\n\n.eyebrow,\n.card-kicker,\n.visual-asset-grid span {\n  color: var(--gf-gold);\n  text-transform: uppercase;\n  letter-spacing: 0.14em;\n  font-size: 0.76rem;\n  font-weight: 900;\n}\n\n.badge-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--gf-space-2);\n}\n\n.badge-row span,\n.quantity-pill {\n  border: 1px solid var(--gf-line);\n  border-radius: var(--gf-radius-pill);\n  padding: var(--gf-space-2) var(--gf-space-3);\n  color: var(--gf-muted);\n  background: var(--gf-night);\n  font-size: 0.82rem;\n}\n\n.table-board {\n  position: relative;\n  display: grid;\n  place-items: center;\n  min-height: 280px;\n  overflow: hidden;\n  border: 1px solid rgba(243, 185, 95, 0.34);\n  border-radius: var(--gf-radius-md);\n  background:\n    radial-gradient(circle at center, rgba(243, 185, 95, 0.26), transparent 5.5rem),\n    linear-gradient(135deg, rgba(13, 29, 17, 0.92), rgba(0, 0, 0, 0.42));\n}\n\n.table-board::before {\n  position: absolute;\n  inset: var(--gf-space-4);\n  border: 1px dashed rgba(243, 185, 95, 0.28);\n  border-radius: var(--gf-radius-md);\n  content: "";\n}\n\n.table-board > p {\n  position: absolute;\n  bottom: var(--gf-space-5);\n  color: var(--gf-muted);\n}\n\n.moon-token {\n  position: relative;\n  z-index: 1;\n  display: grid;\n  place-items: center;\n  width: min(13rem, 70%);\n  aspect-ratio: 1;\n  border: 1px solid rgba(243, 185, 95, 0.48);\n  border-radius: 50%;\n  background:\n    radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.24), transparent 1.6rem),\n    radial-gradient(circle, rgba(243, 185, 95, 0.22), rgba(0, 0, 0, 0.46));\n  text-align: center;\n}\n\n.moon-token span {\n  color: var(--gf-muted);\n  font-size: 0.72rem;\n  font-weight: 900;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n}\n\n.moon-token strong {\n  max-width: 10rem;\n  color: var(--gf-gold);\n  font-family: var(--gf-font-display);\n  font-size: clamp(1.4rem, 4vw, 2.2rem);\n  line-height: 0.95;\n}\n\n.support-layout {\n  display: grid;\n  grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr);\n  gap: var(--gf-space-4);\n}\n\n.phase-card,\n.loop-card,\n.card-gallery,\n.visual-assets-panel {\n  padding: var(--gf-space-6);\n}\n\n.phase-strip,\n.loop-card ol {\n  display: grid;\n  gap: var(--gf-space-3);\n  margin: var(--gf-space-4) 0 0;\n}\n\n.phase-strip {\n  padding: 0;\n  list-style: none;\n}\n\n.phase-strip li {\n  display: grid;\n  grid-template-columns: auto minmax(0, 1fr);\n  gap: var(--gf-space-3);\n  align-items: start;\n}\n\n.phase-strip li > span {\n  display: grid;\n  place-items: center;\n  width: 2.1rem;\n  aspect-ratio: 1;\n  border: 1px solid rgba(243, 185, 95, 0.42);\n  border-radius: 50%;\n  color: var(--gf-gold);\n  background: var(--gf-night);\n  font-weight: 900;\n}\n\n.phase-strip strong,\n.phase-strip p {\n  margin: 0;\n}\n\n.phase-strip p,\n.loop-card li {\n  color: var(--gf-muted);\n  line-height: 1.55;\n}\n\n.section-heading h2 {\n  margin: var(--gf-space-1) 0 0;\n  font-family: var(--gf-font-display);\n  font-size: clamp(1.8rem, 3vw, 2.8rem);\n}\n\n.card-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));\n  gap: var(--gf-space-4);\n  margin-top: var(--gf-space-5);\n}\n\n.role-card {\n  position: relative;\n  display: grid;\n  gap: var(--gf-space-3);\n  min-height: 270px;\n  overflow: hidden;\n  border: 1px solid var(--gf-line);\n  border-radius: var(--gf-radius-md);\n  padding: var(--gf-space-5);\n  background:\n    radial-gradient(circle at top right, rgba(151, 215, 164, 0.14), transparent 8rem),\n    linear-gradient(180deg, rgba(255, 239, 203, 0.09), rgba(0, 0, 0, 0.34));\n}\n\n.role-card::before {\n  position: absolute;\n  inset: var(--gf-space-2);\n  border: 1px solid rgba(243, 185, 95, 0.2);\n  border-radius: 12px;\n  content: "";\n  pointer-events: none;\n}\n\n.card-topline {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--gf-space-3);\n}\n\n.role-seal {\n  display: grid;\n  place-items: center;\n  width: 2.7rem;\n  aspect-ratio: 1;\n  border-radius: 50%;\n  color: #160f05;\n  background: var(--gf-gold);\n  font-family: var(--gf-font-display);\n  font-size: 1.45rem;\n  font-weight: 900;\n}\n\n.role-card h3 {\n  margin: 0;\n  font-family: var(--gf-font-display);\n  font-size: 1.45rem;\n}\n\n.role-card p,\n.role-card small,\n.role-card em {\n  color: var(--gf-muted);\n  line-height: 1.5;\n}\n\n.role-card small,\n.role-card em {\n  display: block;\n}\n\n.role-card em {\n  align-self: end;\n  color: var(--gf-green);\n  font-size: 0.82rem;\n  font-style: normal;\n}\n\n.visual-asset-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: var(--gf-space-3);\n  margin-top: var(--gf-space-5);\n}\n\n.visual-asset-grid article {\n  border: 1px solid var(--gf-line);\n  border-radius: var(--gf-radius-md);\n  padding: var(--gf-space-4);\n  background: var(--gf-night);\n}\n\n.visual-asset-grid h3 {\n  margin: var(--gf-space-2) 0;\n  font-family: var(--gf-font-display);\n}\n\n.visual-asset-grid p {\n  color: var(--gf-muted);\n  line-height: 1.55;\n}\n\n@media (max-width: 820px) {\n  .hero-panel,\n  .support-layout {\n    grid-template-columns: 1fr;\n  }\n}\n`;
}

function buildCodexPrompt(result: ForgeResult) {
  return `You are Codex generating a static game project from a validated GameForge package.\n\nRules:\n- Only use the files listed in generated-project-manifest.json.\n- Do not read or write .env files.\n- Do not add dependencies beyond package.json without review.\n- Do not create server routes.\n- Do not execute generated code.\n- Preserve the validated GameSpec and artifact data.\n\nGoal:\nTurn the generated files into a polished client-only playable preview for ${result.gameSpec.title}.\n`;
}

function buildProjectManifest(files: GeneratedProjectFile[]) {
  return {
    version: 1,
    generator: "gameforge",
    files: files.map((file) => ({
      path: file.path,
      kind: file.kind,
      purpose: file.purpose
    }))
  };
}

export function buildGeneratedProject(result: ForgeResult): GeneratedProject {
  const projectId = safeId(result.gameSpec.gameId);
  const files: GeneratedProjectFile[] = [
    mdFile("README.md", "Human-readable generated game overview.", buildReadme(result)),
    jsonFile("package.json", "Client-only preview package metadata.", buildPackageJson(projectId)),
    jsonFile("tsconfig.json", "TypeScript configuration for the generated preview.", buildTsConfig()),
    tsxFile("app/layout.tsx", "Generated Next.js root layout for the preview.", buildAppLayout(result.gameSpec)),
    tsxFile("app/page.tsx", "Generated Next.js page that renders the game preview.", buildAppPage()),
    cssFile("app/globals.css", "Generated global CSS reset for the preview app.", buildGlobalStyles()),
    jsonFile("gameforge-result.json", "Original validated ForgeResult.", result),
    jsonFile("data/game-spec.json", "Validated GameSpec.", result.gameSpec),
    jsonFile("data/cards.json", "Generated card data.", result.package.cards),
    jsonFile("data/personas.json", "Generated AI persona data.", result.package.personas),
    jsonFile("data/asset-prompts.json", "Generated visual/audio prompt manifest.", result.package.assetPrompts),
    jsonFile("data/visual-assets.json", "Visual runtime asset manifest compatible with GameForge visual adapters.", buildVisualAssets(result)),
    jsonFile("data/voice-manifest.json", "Gradium voice manifest mapping personas to safe fictional speech profiles.", buildVoiceManifest(result)),
    tsFile("src/game/types.ts", "Generated TypeScript game domain types.", buildTypes(result.gameSpec)),
    tsFile("src/game/config.ts", "Generated game config consumed by UI components.", buildConfig(result)),
    tsFile("src/game/rules.ts", "Generated deterministic helper functions.", buildRules(result.gameSpec)),
    tsxFile("src/ui/CardGallery.tsx", "Generated role/card gallery component.", buildCardGallery()),
    tsxFile("src/ui/GamePreview.tsx", "Generated static game preview component.", buildGamePreview()),
    cssFile("src/ui/game-preview.css", "Generated game preview styles.", buildStyles()),
    mdFile("codex-generation-guide.md", "Optional Codex prompt for later sandboxed enhancement.", buildCodexPrompt(result))
  ];
  const manifestPath = "generated-project-manifest.json";
  const manifestPurpose = "Allowlisted generated file manifest for review and Codex.";
  const manifestEntry: GeneratedProjectFile = {
    path: manifestPath,
    kind: "json",
    purpose: manifestPurpose,
    content: "Generated below."
  };
  files.push(jsonFile(manifestPath, manifestPurpose, buildProjectManifest([...files, manifestEntry])));

  return GeneratedProjectSchema.parse({
    projectId,
    title: `${result.gameSpec.title} — generated project`,
    summary: `Generated static project package for ${result.gameSpec.title}.`,
    sourceGameId: result.gameSpec.gameId,
    files,
    codexReadyPrompt: buildCodexPrompt(result),
    safetyNotes: [
      "No files were written to disk by the server.",
      "Generated file paths are safe relative paths with an allowlisted extension.",
      "The package contains client-side/static code only; no secrets or server routes.",
      "Visual assets are data-only prompts ready for later FAL integration.",
      "Voice manifests are data-only Gradium directions; API keys remain on the parent GameForge server.",
      "Package metadata is generated for local review; the GameForge server never installs or executes it."
    ],
    acceptanceChecks: [
      "All file paths are relative and validated.",
      "Generated project includes README, package metadata, app entry, data JSON, visual assets, voice manifest, TypeScript domain files, UI components, manifest, and Codex guide.",
      "ForgeResult remains the source of truth."
    ]
  });
}
