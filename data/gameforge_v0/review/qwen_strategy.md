# Qwen3.6 27B dataset strategy for GameForge v0

- **Training objective:** map French spoken/STT-style user utterances to a canonical structured JSON object.
- **Output language:** English canonical labels in `target.entities` and control fields.
- **Input language:** French raw utterances remain untouched to preserve STT realism.
- **Split:** 193 train / 37 eval with deterministic seed 42.
- **Eval guarantees:** all 8 safety flags appear in eval; all 3 tool-request routes appear in eval.
- **Recommended next step:** convert this canonical source dataset into the exact Pioneer/Qwen fine-tune format required by the training UI/API once selected.
