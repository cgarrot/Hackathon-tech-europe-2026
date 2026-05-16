## ArtifactPackage model integration notes

### Recommended insertion point

The best current integration point is the `artifact_package` stage in:

- `src/compiler/openai-compiler.ts`

Today that stage uses `runStructuredStage(... ArtifactPackageSchema ...)`.

### Target behavior

Replace or augment the generic LLM call for ArtifactPackage generation with a fine-tuned decoder model specialized on:

- `package.personas[].speechStyle`
- `package.personas[].behaviorRules`
- `package.personas[].sampleLines`
- `package.assetPrompts[]` with `kind: "voice"`
- `package.rulesMarkdown`

### Important constraint

The compiler schemas are strict. Do **not** generate additional fields such as:

- `emotion`
- `narrationBlocks`
- `sceneTree`
- `ttsMetadata`

Inline emotion tags must stay embedded in string fields until the schema is extended.

### Current recommended prompt contract

System prompt:

- `SYSTEM_PROMPT_ARTIFACT_PACKAGE.txt`

User payload should include:

- original prompt
- intake
- routing
- selectedPack
- validated `gameSpec`

### Inference acceptance checklist

For each generated ArtifactPackage:

1. Parse JSON successfully.
2. Validate against `ArtifactPackageSchema`.
3. Reject any emotion tags outside the approved set.
4. Ensure `voice` prompts exist when the pack naturally needs spoken output.
5. Ensure `sampleLines` are short enough for TTS.
6. Keep code stub paths relative.

### Files prepared here

- `train_artifact_package_messages_v3.jsonl`
- `eval_artifact_package_messages_v3.jsonl`
- `pioneer_decoder_train_v3.jsonl`
- `pioneer_decoder_eval_v3.jsonl`
- `SYSTEM_PROMPT_ARTIFACT_PACKAGE.txt`
- `smoke_tests_artifact_package_v1.json`

### Next operational step

Use the v3 train/eval files directly as decoder chat-format data for a fine-tuned model, then run the smoke tests in `smoke_tests_artifact_package_v1.json` before wiring the model into `/api/forge`.


### Pioneer runtime note

As of the last automated check in this session, training job `c76e5371-64c9-428d-92b5-806c7919ee06` remains in `running` on provider `fireworks` with no terminal status yet. Evaluation can only start after the job reaches `complete`.


### External blocker status

The decoder fine-tune job `c76e5371-64c9-428d-92b5-806c7919ee06` remains accepted by Pioneer/Fireworks but stuck in `running` with `progress_percent: 0` and `current_epoch: 0`. No new logs appeared beyond training start, so evaluation cannot be launched from the project side until the provider advances the job to `complete`.


### Evaluation blocker note

The decoder training job reached `complete`, but `POST /felix/evaluations` currently returns `409` because Pioneer reports `Current deployment status: warming`. This means training artifacts exist, but evaluation is still blocked by provider deployment readiness.


### Pioneer decoder serving diagnosis

Observed decoder fine-tunes:

- `c76e5371-64c9-428d-92b5-806c7919ee06` — `Qwen/Qwen3-8B`, LoRA, training complete, Fireworks deployment stuck in `warming` with `AddonNotServedByDeploymentError` / `model_not_found`.
- `fb57ac07-9602-4ee4-95ed-b6024176729a` — `meta-llama/Llama-3.1-8B-Instruct`, LoRA, training complete, same Fireworks `addon` serving failure.
- `c7d7e203-16c3-467a-8cf8-bd0c9d01f637` — `meta-llama/Llama-3.2-1B-Instruct`, LoRA, trained inside isolated project `gameforge-artifactpackage-redeploy-test`, training complete, but Fireworks deployment timed out before READY: `TimeoutError: Fireworks deployment did not reach READY state within 600s`.

This points to a Pioneer/Fireworks LoRA-addon serving issue, not a dataset issue. Fireworks documents two LoRA serving modes: live-merge and multi-LoRA addon. Addon serving requires an addon-compatible base deployment; quantized FP8/FP4 shapes do not support addons. Pioneer currently creates these decoder jobs as Fireworks `deployment_mode: addon`, and the deployment never reaches serving.

Do not spend more hackathon time retraining `Qwen/Qwen3-8B` with the same Pioneer LoRA path. `Qwen/Qwen3.6-27B` and `Qwen/Qwen3.5-9B` appeared in the live catalog as trainable, but `POST /felix/training-jobs` rejected both with `No provider supports training ... with type 'lora'`; `full` was also rejected for `Qwen/Qwen3.6-27B` and `meta-llama/Llama-3.1-8B-Instruct`.

A new Pioneer project was tested to rule out Default-project state corruption:

- Project: `gameforge-artifactpackage-redeploy-test`
- Project id: `e6a59545-f6ff-4019-a216-acb533f6ea2e`
- Training in that project succeeded and produced adapter path `accounts/henrijs-yuyajyvwmd9b/models/pioneer-lora-c7d7e203-16c3-467a-8cf8-bd0c9d01f637`.
- Manual project deployment succeeded at metadata level and set `active_model_id` to the job id.
- The documented project inference endpoint returned `404`, and direct chat inference timed out.

Conclusion: using a fresh Pioneer project is not sufficient. It changes the project metadata path, but the blocker remains provider-side Fireworks serving/readiness for LoRA decoder models.


### Working demo fallback

For the demo, use a served chat model with the strict ArtifactPackage prompt above, then validate against `ArtifactPackageSchema`. A smoke test against Pioneer serverless `gpt-4.1-mini` produced parseable JSON with:

- all required top-level keys
- no extra top-level keys
- correct nested shapes for cards, personas, asset prompts, code stubs, and validation report
- only allowed inline emotion tags

Recommended demo path:

1. Keep deployed GLiNER job `3c28ef82-788f-499d-b90b-612ff16e711d` for extraction/routing evidence.
2. Use a stable served LLM for `ArtifactPackage` scenario/TTS generation.
3. Validate every output with `ArtifactPackageSchema` and reject/repair invalid generations.
4. Treat Pioneer decoder fine-tunes as blocked until Pioneer/Fireworks can redeploy the adapters through live-merge or a working addon-compatible deployment.


### GitHub/community API check

Public GitHub examples mostly use Pioneer for GLiNER/NER. No solid public example was found for a production decoder fine-tune deployment, but community docs and examples confirm an important payload distinction:

- Encoder/GLiNER native inference uses `POST /inference` with `task: "extract_entities"`, `text`, and `schema`.
- Decoder native inference uses `POST /inference` with top-level `task: "generate"` and `messages`.
- The earlier nested payload shape `decoder: { task: "generate" }` is wrong for Pioneer native inference.

Correct decoder call shape:

```json
{
  "model_id": "TRAINING_JOB_ID",
  "task": "generate",
  "messages": [
    { "role": "user", "content": "..." }
  ]
}
```

After switching to the correct payload, fine-tuned job `fb57ac07-9602-4ee4-95ed-b6024176729a` returned HTTP 200 from `POST /inference`. The OpenAI-compatible path `POST /v1/chat/completions` also returned HTTP 200 for that job.

However, the model output is not yet reliable enough for strict `ArtifactPackageSchema` without validation/repair:

- native `/inference` generated malformed/truncated JSON on a full ArtifactPackage prompt;
- compact prompts still drifted into invalid schema fields such as object-valued `acceptanceTests`, `kind: "image"`, or missing allowed emotion tags;
- `/v1/chat/completions` with `response_format: { "type": "json_object" }` produced parseable JSON, but with wrong nested fields such as `description`, `tags`, object-valued checks/warnings, and `validationReport.status: "valid"`.

Updated conclusion: Pioneer decoder fine-tune `fb57...` is callable when using the correct decoder payload, but it should be treated as a demo/side proof unless wrapped with schema validation plus a repair step. For reliable demo output, keep the strict served-model fallback and Zod validation.


### Kimi provider integration

Pioneer serverless exposes `moonshotai/Kimi-K2.6` as an inference-only decoder model. It should be used through the OpenAI-compatible endpoint:

```bash
LLM_PROVIDER=pioneer
PIONEER_API_KEY=...
PIONEER_BASE_URL=https://api.pioneer.ai/v1
PIONEER_MODEL=moonshotai/Kimi-K2.6
PIONEER_MAX_TOKENS=7000
```

Kimi is not used as a Pioneer fine-tune target here. It is the reliable served model path for GameForge scenario/TTS text generation, while GLiNER/fine-tune jobs remain evidence/workbench assets.

Smoke testing showed that the original unconstrained ArtifactPackage prompt caused Kimi to generate very long JSON that could be truncated. The runtime prompt now includes compact output limits: bounded cards/personas/assets, short sample lines, one code stub, and a required closed JSON object.


### Upstream GLiNER evidence

The compiler can optionally call a deployed Pioneer/GLiNER encoder before Kimi/OpenAI/Ollama stages. Configure it with:

```bash
PIONEER_GLINER_MODEL_ID=...
PIONEER_GLINER_ENDPOINT=https://api.pioneer.ai/inference
PIONEER_GLINER_LABELS=game_type,setting,player_count,ai_count,role,mechanic
PIONEER_GLINER_THRESHOLD=0.45
PIONEER_GLINER_TIMEOUT_MS=8000
```

Implementation notes:

- Request shape: `POST /inference` with `model_id`, `text`, `schema: { entities: [...] }`, and `threshold`.
- No decoder `task: "generate"` field is used for GLiNER.
- The client is fail-open: missing config, non-2xx responses, malformed JSON, timeouts, and network errors simply omit `extractionEvidence`.
- Successful evidence is injected into `IntakeBrief`, `PackSelection`, `GameSpec`, and `ArtifactPackage` prompts.
- The local keyword router remains authoritative as a deterministic correction/fallback layer.
- A successful extraction adds a pipeline stage: `pioneer_gliner_extraction` with status `entities:<count>`.
