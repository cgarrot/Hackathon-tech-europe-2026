# Launch plan

## Decoder fine-tune target
- Use ArtifactPackage generation as the fine-tune target.
- Datasets: `gameforge-artifactpackage-train-v3`, `gameforge-artifactpackage-eval-v3`
- Preferred first-pass model: `Qwen/Qwen3-8B`

## Why this model
- smaller and cheaper than 32B/27B options
- documented in Pioneer training models
- more likely to avoid provider launch issues
- good enough for structured scenario/narration generation first pass

## After job completion
1. Run eval on the uploaded eval dataset
2. Run smoke tests from `smoke_tests_artifact_package_v1.json`
3. Wire the trained model into the `artifact_package` stage in `src/compiler/openai-compiler.ts`
