# Pioneer GLiNER run summary

## Decision
- Switched away from decoder/Qwen workflow for simplicity and reliability.
- Because the source utterances are French, the correct GLiNER family is **multilingual**.
- Selected model: `fastino/gliner2-multi-v1`

## Why not `gliner2-base-v1` / `gliner2-large-v1`
- Pioneer docs state `base` and `large` are the English-first variants.
- For non-English text, docs recommend `fastino/gliner2-multi-v1` or `fastino/gliner2-multi-large-v1`.

## Dataset path taken
- Manual NER upload format remained ambiguous and failed validation.
- Simplified to the officially documented synthetic route via `POST /generate`.

## Generated datasets
- Train dataset: `gameforge-gliner-train-v1`
  - task type: `ner`
  - labels: `game_type`, `setting`, `player_count`, `ai_count`, `role`, `mechanic`
  - sample size: `120`
- Eval dataset: `gameforge-gliner-eval-v1`
  - task type: `ner`
  - sample size: `40`

## Active training job
- model name: `gameforge-gliner-multi-v1`
- base model: `fastino/gliner2-multi-v1`
- training type: `lora`
- epochs: `5`
- learning rate: `5e-5`
- job id: `3c28ef82-788f-499d-b90b-612ff16e711d`
- provider: `modal`

## Next API steps
- Poll training: `GET /felix/training-jobs/3c28ef82-788f-499d-b90b-612ff16e711d`
- Run eval after completion: `POST /felix/evaluations` with `base_model` = job id and `dataset_name` = `gameforge-gliner-eval-v1`
- Run inference after completion using `model_id` = job id and schema entities `["game_type","setting","player_count","ai_count","role","mechanic"]`
