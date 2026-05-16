# GameForge

GameForge is a generative game compiler. A player describes the game they want in natural language, and the app turns that request into a playable game package with rules, roles, phases, AI personas, visual prompts, voice hooks, generated images, and a voice-driven runtime.

The project is intentionally modular. OpenAI or Ollama compiles the game structure, fal generates static visuals, Gradium handles speech-to-text and text-to-speech, and the Next.js web app orchestrates the demo.

## Demo Flow

1. The user clicks **Speak** and describes a game idea.
2. Gradium STT transcribes the spoken prompt.
3. `/api/forge` compiles the request into a validated `ForgeResult`.
4. `/api/visuals/generate` sends visual prompts to fal and displays generated backgrounds/cards in the center stage.
5. `/api/generate-project` creates a reviewable client-only project manifest.
6. `/api/game-session/start` launches a deterministic voice game session.
7. Gradium TTS speaks narrator/AI lines, then Gradium STT captures the human player's push-to-talk input.

## Tech Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript.
- **Validation:** Zod schemas for every compiler, project, session, voice, and visual API boundary.
- **LLM providers:** OpenAI API or Ollama Cloud through OpenAI-compatible chat completions.
- **Visual generation:** fal via `@fal-ai/client`, currently using `fal-ai/flux/schnell` for static images.
- **Voice:** Gradium REST APIs for STT and TTS.
- **Testing:** Vitest, TypeScript `tsc --noEmit`, ESLint.
- **Runtime safety:** server-side credentials only, request validation, rate limits, concurrency guards, deterministic session state.

Pioneer is not used in the web compiler runtime. The app accepts only `openai`, `ollama`, or `auto` as compiler providers.

## External APIs, Frameworks, and Tools

| Area | Technology | How it is used |
| --- | --- | --- |
| Web app | Next.js App Router | React UI, server routes, production build, API orchestration |
| UI | React | Single-page interactive GameForge experience |
| Language | TypeScript | Shared types, server/client contracts, compile-time safety |
| Schema validation | Zod | Runtime validation for LLM outputs, requests, sessions, and generated manifests |
| LLM compiler | OpenAI API | Structured JSON generation for game intake, routing, specs, and packages |
| LLM compiler alternative | Ollama Cloud | OpenAI-compatible fallback provider for game compilation |
| Visual generation | fal `@fal-ai/client` | Server-side image generation from game asset prompts |
| Visual model | `fal-ai/flux/schnell` | Static backgrounds, scenes, role cards, and UI visuals |
| Voice STT/TTS | Gradium REST API | Speech-to-text for humans and text-to-speech for AI/narrator lines |
| Tests | Vitest | Unit and route-level tests |
| Linting | ESLint + typescript-eslint | Static code quality checks |
| Build tooling | Next.js/Turbopack | Development server and production build |

External documentation:

- Next.js: `https://nextjs.org/docs`
- React: `https://react.dev`
- OpenAI API: `https://platform.openai.com/docs`
- Ollama: `https://ollama.com`
- fal documentation: `https://fal.ai/docs/documentation`
- fal FLUX Schnell model: `https://fal.ai/models/fal-ai/flux/schnell/api`
- Gradium documentation index: `https://docs.gradium.ai/llms.txt`
- Zod: `https://zod.dev`
- Vitest: `https://vitest.dev`

## Repository Structure

```text
app/
  api/
    forge/                     # Game compiler endpoint
    generate-project/          # Deterministic generated project manifest
    visuals/generate/          # fal visual generation endpoint
    voice/stt/                 # Gradium speech-to-text
    voice/tts/                 # Gradium text-to-speech
    game-session/              # Voice game session runtime
  globals.css                  # Main UI styling
src/
  compiler/                    # LLM compiler, schemas, game packs, validators
  game-session/                # Deterministic voice game engine
  generator/                   # Client-only generated project manifest builder
  server/                      # Gradium, fal, and request guard adapters
  ui/                          # Main GameForge React client
```

## Installation

Requirements:

- Node.js `>=20.9.0`
- npm
- At least one configured LLM provider: OpenAI or Ollama Cloud
- Optional but recommended for full demo: Gradium API key and fal API key

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
cp .env.example .env.local
```

Then configure one compiler provider.

OpenAI:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4.1-mini
```

Ollama Cloud:

```bash
LLM_PROVIDER=ollama
OLLAMA_API_KEY=your-ollama-key
OLLAMA_BASE_URL=https://ollama.com/v1/
OLLAMA_MODEL=deepseek-v4-flash
```

Configure fal visuals:

```bash
FAL_KEY=your-fal-key
```

Configure Gradium voice:

```bash
GRADIUM_API_KEY=your-gradium-key
GRADIUM_LANGUAGE=fr
GRADIUM_FR_VOICE_ID=
GRADIUM_EN_VOICE_ID=
GRADIUM_DEFAULT_VOICE_ID=YTpq7expH9539ERJ
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification Commands

Use these before submitting or demoing:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected current status:

- Vitest suite passes.
- TypeScript compiles with no emit.
- ESLint passes with zero warnings.
- Next.js production build includes all API routes.

## npm Scripts

- `npm run dev`: start the local Next.js development server.
- `npm run build`: create a production Next.js build.
- `npm run start`: run the production server after a build.
- `npm test`: run the Vitest suite.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run lint`: run ESLint over `app` and `src`.

## Environment Variables

Core compiler:

- `LLM_PROVIDER`: `openai`, `ollama`, or unset for auto-detection.
- `LLM_TIMEOUT_MS`: timeout for LLM stages, default `180000`.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`.
- `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

fal visuals:

- `FAL_KEY`: server-side fal API key.

Gradium voice:

- `GRADIUM_API_KEY`: server-side Gradium API key.
- `GRADIUM_BASE_URL`: default `https://api.gradium.ai/api`.
- `GRADIUM_LANGUAGE`: default language hint.
- `GRADIUM_FR_VOICE_ID`, `GRADIUM_EN_VOICE_ID`, `GRADIUM_DEFAULT_VOICE_ID`.
- `GRADIUM_TIMEOUT_MS`.

Server guards:

- `GAMEFORGE_RATE_LIMIT_WINDOW_MS`
- `GAMEFORGE_RATE_LIMIT_MAX_REQUESTS`
- `GAMEFORGE_MAX_CONCURRENT_REQUESTS`
- `GAMEFORGE_VOICE_RATE_LIMIT_WINDOW_MS`
- `GAMEFORGE_VOICE_RATE_LIMIT_MAX_REQUESTS`
- `GAMEFORGE_MAX_CONCURRENT_VOICE_REQUESTS`
- `GAMEFORGE_SESSION_RATE_LIMIT_WINDOW_MS`
- `GAMEFORGE_SESSION_RATE_LIMIT_MAX_REQUESTS`
- `GAMEFORGE_MAX_CONCURRENT_SESSION_REQUESTS`

API keys are never sent to the browser.

## API Documentation

### `POST /api/forge`

Compiles a natural-language game prompt into a validated `ForgeResult`.

Request:

```json
{
  "prompt": "Create a werewolf game in a medieval village for 8 players, including 2 AI players.",
  "provider": "auto"
}
```

`provider` may be `auto`, `openai`, or `ollama`.

Streaming mode:

```text
POST /api/forge?stream=1
```

The streaming route returns newline-delimited JSON events:

```json
{ "type": "progress", "progress": { "stage": "game_spec", "status": "running" } }
{ "type": "result", "ok": true, "mode": "openai", "warnings": [], "result": {} }
```

Compiler stages:

- `intake`
- `family_router`
- `game_spec`
- `artifact_package`
- `validation`

### `POST /api/visuals/generate`

Generates static images with fal from the compiled game package.

Request:

```json
{
  "forgeResult": {},
  "maxAssets": 4
}
```

Behavior:

- Validates the full `ForgeResult`.
- Reads `package.assetPrompts`.
- Ignores `kind=voice`.
- Converts `hero` and `scene` prompts to landscape background specs.
- Converts `card` prompts to portrait role-card specs.
- Converts `icon` prompts to square UI specs.
- Calls `fal-ai/flux/schnell` through `@fal-ai/client`.

Response:

```json
{
  "ok": true,
  "visualSet": {
    "provider": "fal",
    "model": "fal-ai/flux/schnell",
    "sourceGameId": "game-id",
    "title": "Game title",
    "assets": [
      {
        "assetId": "hero_visual",
        "assetType": "location",
        "sourceKind": "hero",
        "title": "hero preview",
        "prompt": "final fal prompt",
        "usage": "hero preview",
        "imageSize": "landscape_16_9",
        "images": [{ "url": "https://..." }]
      }
    ]
  }
}
```

### `POST /api/voice/stt`

Transcribes human speech with Gradium STT.

Request:

- `multipart/form-data`
- field `audio`
- supports browser recordings converted to Gradium-compatible formats by the client when necessary

Streaming mode:

```text
POST /api/voice/stt?stream=1
```

The client uses this for prompt dictation and in-game push-to-talk windows.

### `POST /api/voice/tts`

Synthesizes speech with Gradium TTS.

Request:

```json
{
  "text": "[tense] I do not trust that vote.",
  "personaId": "ai_villager",
  "speechStyle": "careful, suspicious, low voice",
  "language": "en",
  "outputFormat": "wav"
}
```

Emotion tags supported in generated lines:

- `[calm]`
- `[warm]`
- `[tense]`
- `[surprise]`
- `[whisper]`
- `[urgent]`
- `[skeptical]`
- `[angry]`

The server strips these tags before synthesis while preserving them as metadata headers.

### `POST /api/game-session/start`

Starts a deterministic voice game session from a compiled `ForgeResult`.

Request:

```json
{
  "forgeResult": {}
}
```

Response includes a public session:

- current phase
- public events
- participants
- the human player's own role view
- pending voice input window when relevant

Private role fields such as `roleId` are not exposed directly.

### `POST /api/game-session/[sessionId]/advance`

Advances the active voice game session.

Request without human input:

```json
{}
```

Request with human speech transcript:

```json
{
  "participantId": "human_1",
  "transcript": "I vote for Mireille because her story changed."
}
```

The session engine accepts transcripts only during an open input window.

### `POST /api/generate-project`

Builds a deterministic, reviewable client-only project manifest from the `ForgeResult`.

Request:

```json
{
  "forgeResult": {}
}
```

The generated manifest contains files such as:

- `README.md`
- `package.json`
- `app/page.tsx`
- `app/globals.css`
- `gameforge-result.json`
- `data/game-spec.json`
- `data/cards.json`
- `data/personas.json`
- `data/asset-prompts.json`
- `data/visual-assets.json`
- `data/voice-manifest.json`
- `src/game/config.ts`
- `src/game/rules.ts`
- `src/ui/VoiceSessionPreview.tsx`

The server returns the manifest only. It does not execute generated code, install dependencies, or write generated projects to disk.

## Main Internal Contracts

The compiler produces a `ForgeResult` with:

- `intake`: normalized request interpretation
- `routing`: selected game pack and family
- `gameSpec`: roles, phases, mechanics, win conditions
- `package`: rules, cards, personas, visual prompts, voice prompts, code stubs
- `pipeline`: completed compiler stages

Relevant schema files:

- `src/compiler/schemas.ts`
- `src/generator/schemas.ts`
- `src/game-session/voice-game-engine.ts`
- `src/server/fal-visuals.ts`

## Architecture Notes for Jury Evaluation

GameForge is built as a compiler-plus-runtime rather than a hardcoded single game.

The compiler path:

```text
Natural language prompt
  -> IntakeBrief
  -> PackSelection
  -> GameSpec
  -> ArtifactPackage
  -> Validated ForgeResult
```

The asset path:

```text
ForgeResult.package.assetPrompts
  -> fal visual specs
  -> fal static image generation
  -> central visual stage
```

The voice runtime path:

```text
ForgeResult
  -> server-side voice session
  -> Gradium TTS for narrator and AI personas
  -> timed push-to-talk STT windows for human player input
  -> deterministic session advancement
```

The UI binds the loading overlay to real compiler progress events, not a fake timer. During gameplay, it shows:

- who is currently speaking
- when the human player should speak
- a **Finish speaking** button to end the input window before the 30-second maximum
- the human player's own role
- fal-generated visuals in the center stage

## Safety and Reliability Decisions

- All external API keys stay server-side.
- All request bodies are validated with Zod.
- The app has no mock LLM fallback in production runtime.
- LLM outputs are parsed and validated before use.
- Generated project files are returned as data and are not executed by the server.
- Voice game sessions cap phases, actions, events, rounds, and input duration.
- fal generation is limited to static images, up to four assets per request.
- Pioneer code paths were removed from the web runtime to avoid unreliable provider errors during demos.

## Known Demo Constraints

- The current fal integration generates static images, not videos.
- The voice runtime is deterministic and demo-oriented; it is not a full game AI planner.
- The generated project manifest is reviewable scaffolding, not automatically deployed code.
- At least one LLM provider must be configured for real game compilation.
- Gradium and fal features require their own API keys.