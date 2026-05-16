# Pioneer run summary

- User-requested model: `Qwen/Qwen3.6-27B`
- Live catalog confirmed the model exists, but Pioneer training returned **no provider support** for both `lora` and `full`.
- Confirmed decoder upload contract:
  1. `POST /felix/datasets/upload/url` with `dataset_type: decoder`, `type: training`, `filename`
  2. direct S3 `PUT` to `presigned_url`
  3. `POST /felix/datasets/upload/process` with `dataset_id`
- Confirmed decoder validation format: JSONL rows with a top-level `messages` list.
- Uploaded ready decoder datasets:
  - `gameforge-qwen-train-v1` (193 examples) — ready
  - `gameforge-qwen-eval-v1` (37 examples) — ready
  - `gameforge-qwen-train-v2` (193 examples) — ready
- Training attempts:
  - `Qwen/Qwen3.6-27B` + `lora` → rejected (no provider support)
  - `Qwen/Qwen3.6-27B` + `full` → rejected (no provider support)
  - `Qwen/Qwen3-32B` + `lora` + `gameforge-qwen-train-v1` → provider dataset upload error
  - `Qwen/Qwen3-32B` + `lora` + `gameforge-qwen-train-v2` → launched successfully

## Active job
- model name: `gameforge-qwen3-32b-v2`
- base model: `Qwen/Qwen3-32B`
- job id: `e1ba463a-dd6e-4797-96c0-d460a0d6c24c`
- provider: `fireworks`

## Local files
- `data/gameforge_v0/pioneer_qwen_train.jsonl`
- `data/gameforge_v0/pioneer_qwen_eval.jsonl`
- `data/gameforge_v0/train.jsonl`
- `data/gameforge_v0/eval.jsonl`
- `data/gameforge_v0/manifest.json`
- `data/gameforge_v0/normalization_map.json`

## Useful checks
- `GET /felix/datasets/gameforge-qwen-train-v2`
- `GET /felix/datasets/gameforge-qwen-eval-v1`
- `GET /felix/training-jobs/e1ba463a-dd6e-4797-96c0-d460a0d6c24c`
