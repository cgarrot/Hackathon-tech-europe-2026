## GameForge FT v1 — ArtifactPackage generation

This dataset is aligned to the current project schemas in:

- `src/compiler/schemas.ts`
- `src/compiler/game-packs.ts`

### Goal

Fine-tune a generative model to produce a valid `ArtifactPackage` from a validated `GameSpec` + pack context.

This is the most product-aligned target for:

- scenario flavor
- narrator / NPC lines
- TTS-friendly text
- emotion-tagged spoken lines
- voice prompt generation

### Why `ArtifactPackage` instead of full `ForgeResult`

The current project already separates:

- structured game design in `gameSpec`
- generated playable text in `package`

The fields that matter most for speech and scenario generation already exist in the schema:

- `package.personas[].speechStyle`
- `package.personas[].behaviorRules`
- `package.personas[].sampleLines`
- `package.assetPrompts[]` with `kind: "voice"`
- `package.rulesMarkdown`

### Dataset format

Pioneer/Qwen-style chat fine-tune JSONL:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "{...ArtifactPackage JSON...}" }
  ]
}
```

### Emotion tag policy

Allowed inline tags for spoken lines:

- `[calm]`
- `[warm]`
- `[tense]`
- `[surprise]`
- `[whisper]`
- `[urgent]`
- `[skeptical]`
- `[angry]`

These tags are intentionally embedded in string fields because the current Zod schemas are strict and do not yet define a dedicated `emotion` field.

### Files

- `train_artifact_package_messages.jsonl`
- `eval_artifact_package_messages.jsonl`
- `allowed_emotion_tags.json`

### Recommended usage

Use this dataset to fine-tune a decoder model for the **artifact generation stage**.

Input:

- pack metadata
- validated `GameSpec`
- generation goal / tone constraints

Output:

- valid `ArtifactPackage` JSON only

### Next product step

If you later want explicit scenario graphs or explicit emotion fields, extend the compiler schema first. Until then, this dataset stays 100% compatible with the current project.


### Extended v2 files

- `train_artifact_package_messages_v2.jsonl`
- `eval_artifact_package_messages_v2.jsonl`

### v2 coverage

The v2 dataset extends the starter set with additional DeepSeek-authored shards covering:

- werewolf accusation and dawn variants
- debate pacing and moderator patterns
- mystery interrogation eval cases

Note: one cross-pack shard was excluded from consolidation because it was malformed JSONL.


### Extended v3 files

- `train_artifact_package_messages_v3.jsonl`
- `eval_artifact_package_messages_v3.jsonl`

### v3 counts

- train: `44`
- eval: `13`

### v3 consolidation notes

The v3 dataset includes the valid shards from:

- mystery
- werewolf
- debate
- survival
- generic/custom
- mixed eval

The malformed `deepseek_crosspack_train.jsonl` shard is still intentionally excluded.
