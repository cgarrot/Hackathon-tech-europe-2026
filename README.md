# Hackathon-tech-europe-2026

GameForge is a generative game compiler: it turns a natural-language game idea into a structured game package containing rules, roles, cards, personas, asset prompts, and code stubs.

## MVP scope

- Universal Game Compiler
- Game Family Router
- Game Packs: Werewolf, Mystery, Quiz, Debate, Survival, Generic
- `/api/forge` route with OpenAI, Ollama Cloud, and Pioneer/Kimi provider support
- `/api/generate-project` route that turns a validated `ForgeResult` into a safe client-only project manifest
- `/api/voice/stt` and `/api/voice/tts` routes with Gradium server-side speech-to-text/text-to-speech
- `/api/game-session/start` and `/api/game-session/[sessionId]/advance` routes for deterministic voice-game sessions
- Web UI to compile and inspect game packages

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and choose a real LLM provider:

```bash
# Pioneer/Kimi path for the hackathon demo
LLM_PROVIDER=pioneer
PIONEER_API_KEY=...
PIONEER_BASE_URL=https://api.pioneer.ai/v1
PIONEER_MODEL=moonshotai/Kimi-K2.6
PIONEER_MAX_TOKENS=7000

# Optional complement mode: Pioneer/Kimi refines only image prompts + TTS sample lines.
PIONEER_ARTIFACT_ENHANCEMENT=true
PIONEER_ARTIFACT_API_KEY=... # optional; falls back to PIONEER_API_KEY
PIONEER_ARTIFACT_BASE_URL=https://api.pioneer.ai/v1
PIONEER_ARTIFACT_MODEL=moonshotai/Kimi-K2.6
PIONEER_ARTIFACT_MAX_TOKENS=2000
PIONEER_ARTIFACT_TIMEOUT_MS=45000
PIONEER_ARTIFACT_FINE_TUNE_MODEL_ID=... # optional training job id for the artifact fine-tune
PIONEER_ARTIFACT_FINE_TUNE_ENDPOINT=https://api.pioneer.ai/inference
PIONEER_ARTIFACT_FINE_TUNE_TIMEOUT_MS=45000

# Optional: add upstream Pioneer/GLiNER extraction evidence before Kimi.
# Use the deployed GLiNER training job id if available.
PIONEER_GLINER_MODEL_ID=...
PIONEER_GLINER_ENDPOINT=https://api.pioneer.ai/inference
PIONEER_GLINER_LABELS=game_type,setting,player_count,ai_count,role,mechanic
PIONEER_GLINER_THRESHOLD=0.45
PIONEER_GLINER_TIMEOUT_MS=8000
```

or:

```bash
# Cheaper test path once Ollama Cloud is configured
LLM_PROVIDER=ollama
OLLAMA_API_KEY=...
OLLAMA_BASE_URL=https://ollama.com/v1/
OLLAMA_MODEL=gpt-oss:20b
```

or:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

The app runtime intentionally has no mock provider and no silent mock fallback. If a real provider is missing or fails, `/api/forge` returns a clear error instead of generating fake output.

When `PIONEER_GLINER_MODEL_ID` is configured, GameForge performs a short fail-open Pioneer/GLiNER extraction before the LLM stages. The extracted entities are used only as upstream evidence for intake, routing, and game-spec prompts; if the extraction API is missing, slow, rate-limited, or returns an unexpected shape, compilation continues without it.

If `PIONEER_ARTIFACT_ENHANCEMENT=true`, GameForge uses Pioneer as a fail-open complement after the main package is generated. When `PIONEER_ARTIFACT_FINE_TUNE_MODEL_ID` is set, the app tries that fine-tuned artifact model first through `POST https://api.pioneer.ai/inference` with `task: "generate"`; if the fine-tune is not configured, not served, slow, or returns invalid JSON, it falls back to Pioneer/Kimi serverless. This step is intentionally narrow: it can rewrite existing non-voice image prompts (`kind=hero|scene|card|icon`) and persona `sampleLines` for Gradium TTS text, but it cannot add new schema fields, create new assets, change rules, or replace the main compiler result. If every Pioneer path fails, the original validated package is kept.

The UI can force the provider per compilation with the `Provider LLM` selector (`Auto`, `Pioneer / Kimi`, `Ollama Cloud`, or `OpenAI`). `Auto` keeps using `LLM_PROVIDER`; explicit choices still use only server-side credentials from `.env.local` and never send API keys to the browser.

`/api/forge` also includes basic server-side cost guards for real LLM calls: per-client rate limiting and a global concurrent compilation cap. Tune them with `GAMEFORGE_RATE_LIMIT_WINDOW_MS`, `GAMEFORGE_RATE_LIMIT_MAX_REQUESTS`, and `GAMEFORGE_MAX_CONCURRENT_REQUESTS` before a public demo.

Voice routes use the same server-only pattern. Set `GRADIUM_API_KEY` plus a voice id such as `GRADIUM_FR_VOICE_ID` or `GRADIUM_DEFAULT_VOICE_ID`; `.env.example` uses Gradium's documented quickstart voice id (`YTpq7expH9539ERJ`) as a non-secret default. The browser never sees the key. Gradium REST uses `POST https://api.gradium.ai/api/post/speech/asr` for raw audio transcription and `POST https://api.gradium.ai/api/post/speech/tts` for streamed synthesis with `only_audio: true`. Tune voice guards with `GAMEFORGE_VOICE_RATE_LIMIT_WINDOW_MS`, `GAMEFORGE_VOICE_RATE_LIMIT_MAX_REQUESTS`, and `GAMEFORGE_MAX_CONCURRENT_VOICE_REQUESTS`.

Generated games can also be launched directly in the UI without downloading the manifest. The browser calls the server-side voice session engine, shows one **Commencer la partie** button, plays public utterances through Gradium TTS, records only during timed input windows, transcribes with Gradium STT, and advances the deterministic session through `/api/game-session/[sessionId]/advance`. Hidden role assignments stay server-side and are filtered from the public session payload.

Voice game sessions are protected with lightweight server-side guards as well. Tune them with `GAMEFORGE_SESSION_RATE_LIMIT_WINDOW_MS`, `GAMEFORGE_SESSION_RATE_LIMIT_MAX_REQUESTS`, and `GAMEFORGE_MAX_CONCURRENT_SESSION_REQUESTS`. The session engine also caps generated phase/action intake and event/round growth so cyclic phase graphs cannot grow memory without bound.

Ollama Cloud is wired through the OpenAI-compatible `/v1` endpoint so the same server route can switch providers. Because Ollama Cloud structured outputs are not guaranteed like OpenAI strict schemas, the compiler asks Ollama for JSON and validates each stage locally with Zod plus one repair retry.

For Ollama, GameForge keeps a guided prompt sequence but uses a lighter version than OpenAI: Prompt 1 creates `IntakeBrief`, Prompt 2 creates a pack-guided `GameSpec`, then server-side guide code derives cards, personas, assets, rules, and code stubs from that validated spec. DeepSeek V4 Flash can be slow on cold starts, so the default `LLM_TIMEOUT_MS` is 180000 and the UI displays elapsed time while the pipeline runs.

## Generated project lane

After `/api/forge` returns a validated `ForgeResult`, the UI can call `/api/generate-project` to create a deterministic client-only project package. The server does **not** execute generated code, install dependencies, or write files to disk; it returns a file manifest that can be downloaded and reviewed.

The generated package includes:

- `README.md`
- `package.json`
- `tsconfig.json`
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `gameforge-result.json`
- `data/game-spec.json`
- `data/cards.json`
- `data/personas.json`
- `data/asset-prompts.json`
- `data/visual-assets.json`
- `data/voice-manifest.json`
- `src/game/types.ts`
- `src/game/config.ts`
- `src/game/rules.ts`
- `src/ui/VoiceSessionPreview.tsx`
- `src/ui/game-preview.css`
- `generated-project-manifest.json`
- `codex-generation-guide.md`

The generated interface intentionally stays simple: one Start button, one voice scene, a storyboard, and a short log. It does not generate a grid engine, keyboard controls, or a complex standalone gameplay runtime.

Codex CLI should be used only later as a sandboxed/dev-time enhancer that consumes this validated package, never as synchronous request-time code execution.

## GitHub remote

Target repository: `git@github.com:cgarrot/Hackathon-tech-europe-2026.git`
