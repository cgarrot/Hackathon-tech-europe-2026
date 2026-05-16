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
