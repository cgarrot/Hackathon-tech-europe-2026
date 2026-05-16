# GameForge v0 Dataset Consolidation Report

**Date:** 2026-05-16  
**Reviewer:** automated review (Sisyphus-Junior)  
**Files reviewed:**
- `raw/kimi_create_modify.jsonl` — 80 records (source: Kimi)
- `raw/deepseek_actions_tools.jsonl` — 80 records (source: DeepSeek)
- `raw/glm_guardrails_misc.jsonl` — 70 records (source: GLM)

**Total:** 230 records (matches target)

---

## 1. Schema Consistency

All 230 records conform to the same implicit schema:

```
{
  "raw_utterance": string,
  "target": {
    "intent": string,
    "route": string,
    "allowed": boolean,
    "entities": {
      "genre": string[],
      "setting": string[],
      "player_count": int | null,
      "ai_count": int | null,
      "roles": string[],
      "mechanics": string[],
      "action_type": string | null,
      "actor": string | null,
      "target": string | null,
      "tool": string | null,
      "asset_type": string | null,
      "safety_flag": string | null
    }
  }
}
```

**Verdict:** PASS. All 12 entity keys present in every record. No missing or extra keys detected.

---

## 2. Intent / Route Consistency

| Intent               | Route           | Count | Source(s) |
|----------------------|-----------------|-------|-----------|
| `create_game`        | `game_compiler` | 50    | kimi      |
| `modify_game`        | `game_compiler` | 30    | kimi      |
| `player_action`      | `runtime_engine`| 50    | deepseek  |
| `tool_request`       | `fal_visuals`   | 10    | deepseek  |
| `tool_request`       | `gradium_voice` | 10    | deepseek  |
| `tool_request`       | `openai_rules`  | 10    | deepseek  |
| `guardrail`          | `safety_filter` | 35    | glm       |
| `clarification_needed`| `clarification` | 20   | glm       |
| `off_topic`          | `clarification` | 15    | glm       |

**Verdict:** PASS. All intent→route mappings are logically coherent and deterministic. No cross-contamination between sources.

**Distribution note:** `create_game` (50) and `player_action` (50) dominate. `off_topic` (15) is the smallest class. This imbalance is acceptable for v0 but should be monitored.

---

## 3. Enum Normalization Issues

### 3.1 CRITICAL: Language split in entity values

This is the **#1 blocking issue** for merge.

| Source    | Entity value language | Accented-French count |
|-----------|-----------------------|-----------------------|
| kimi      | English               | 0                     |
| deepseek  | French                | 63                    |
| glm       | n/a (empty arrays)    | 0                     |

**Concrete collisions (same concept, two languages):**

| English (kimi)     | French (deepseek)   |
|---------------------|---------------------|
| `horror`            | `horreur`           |
| `strategy`          | `stratégie`         |
| `survival`          | `survie`            |
| `combat`            | `combat` (shared)   |
| `adventure`         | `aventure`          |
| `fantasy`           | `fantasy` (shared)  |
| `exploration`       | `exploration` (shared) |
| `science-fiction`   | `science-fiction` (shared) |

The `action_type` field is split identically: kimi uses English (`add_mode`, `update_rules`), deepseek uses French (`accuser`, `voter`, `déplacer`, `attaquer`, `parler`, `inspecter`, `échanger`, `utiliser_ressource`, `utiliser_pouvoir`).

**Recommendation:** Choose ONE language for all entity values before fine-tuning. English is recommended for GLiNER2 compatibility with standard NER benchmarks. DeepSeek file requires full French→English normalization pass.

### 3.2 MEDIUM: `tool` vs `route` naming inconsistency

| route             | tool value       |
|-------------------|------------------|
| `fal_visuals`     | `fal`            |
| `gradium_voice`   | `gradium_tts`    |
| `openai_rules`    | `openai_rules`   |

The `tool` field partially duplicates the `route` but with different naming. For GLiNER2, the model should learn consistent labels. Pick either `route` or `tool` as the canonical routing signal; if both are kept, align the names (e.g., `tool: "fal_visuals"` to match `route: "fal_visuals"`).

### 3.3 LOW: `asset_type` uses French in deepseek

Values: `image_personnage`, `image_lieu`, `image_objet`, `voix_narrateur`, `voix_personnage`, `mécanique`, `règle`.

If English is chosen as the canonical language, these should be normalized to e.g., `character_image`, `location_image`, `object_image`, `narrator_voice`, `character_voice`, `mechanic`, `rule`.

### 3.4 LOW: `genre` vocabulary explosion

98 unique genre values across 230 records. Many are highly specific or single-use (e.g., `cooking`, `farming`, `treasure_hunt`, `deck_building`, `escape_room`). This is expected for open-ended game creation but may cause sparse label issues for NER. Consider defining a closed genre taxonomy (~25-30 values) and mapping at merge time.

---

## 4. Duplicate Analysis

- **Exact duplicates:** 0 (none found)
- **Near-duplicates (normalized):** 0 (none found)
- **Semantic overlap:** kimi line 22 (`create_game` battle royale FPS) and line 51 (`modify_game` add battle royale mode) share the concept but differ in intent, which is correct behavior.

**Verdict:** PASS. No duplicate removal needed.

---

## 5. Suspect Labels

### 5.1 SHOULD FIX: French token in otherwise English file

- **kimi line 52** — `roles: ["mage", "voleur"]`. "voleur" is French for "thief". All other kimi entity values use English. Should be `["mage", "thief"]`.

### 5.2 SHOULD FIX: `target: null` where extractable

DeepSeek `player_action` records with `target: null` that arguably have an extractable target:

| Line | Utterance (excerpt)                                   | Expected target |
|------|-------------------------------------------------------|-----------------|
| 37   | "Je mets la bague magique au doigt..."                | `bague` or `doigt` |
| 45   | "Je change mon déguisement en garde..."               | `déguisement` or `garde` |
| 47   | "Je lance une grenade fumigène pour couvrir notre retraite" | `fumigène` or `retraite` |

Line 11 ("Je vote blanc") with `target: null` is arguably correct (blank vote has no target).

### 5.3 ACCEPTABLE: `player_count` range rounding

7 kimi records use ranges in utterances (e.g., "2-4 joueurs") but store the **upper bound** as `player_count`. This is a valid design choice but should be documented. Example: line 7 says "2-4 joueurs", entity stores `4`.

### 5.4 ACCEPTABLE: `actor` field trivial

DeepSeek `player_action` records use `actor: "je"` universally. This field is deterministic (always first-person) and provides no learning signal. Not harmful, but could be omitted in a future schema revision.

---

## 6. Allowed / Safety Consistency

- `allowed: false` appears exactly 35 times, all with `intent: "guardrail"` and `route: "safety_filter"`. PASS.
- `safety_flag` is set only on `allowed: false` records. No false positives. PASS.
- Safety flag distribution is balanced: `graphic_violence`(5), `hate_discrimination`(5), `kids_safety`(5), `sexual_content`(4), `self_harm`(4), `terrorism`(4), `illegal_behavior`(4), `copyright_violation`(4).

---

## 7. Reject / Fix Items

### Must fix before merge (BLOCKERS):

| # | File              | Lines   | Issue                                      | Action                              |
|---|-------------------|---------|--------------------------------------------|-------------------------------------|
| B1| deepseek          | all 80  | French entity values (63 accented tokens)  | Normalize to English equivalents    |
| B2| kimi              | 52      | `roles: ["voleur"]` — French in EN file    | Change to `"thief"`                 |

### Should fix (recommended):

| # | File              | Lines      | Issue                                      | Action                              |
|---|-------------------|------------|--------------------------------------------|-------------------------------------|
| S1| deepseek          | 37, 45, 47 | `target: null` with extractable targets    | Fill in appropriate target values   |
| S2| deepseek          | all        | `tool` field naming vs `route` mismatch    | Align `tool` with `route` or drop   |
| S3| deepseek          | all        | `asset_type` in French                     | Normalize to English                |
| S4| all               | all        | No closed genre/setting/mechanics taxonomy | Define ~25-30 canonical values     |

### No action needed:

| Item                                    | Reason                              |
|-----------------------------------------|--------------------------------------|
| `player_count` upper-bound rounding     | Valid design choice, documented above |
| `actor: "je"` triviality                | Not harmful, low priority           |
| `allowed` / `safety_flag` consistency   | Already correct                     |
| No duplicates found                     | Clean                               |

---

## 8. Train / Eval Split Recommendation (v0)

**Strategy:** Stratified by intent, 85/15 split, ensuring every intent+route combo appears in eval.

| Intent               | Total | Train | Eval |
|----------------------|-------|-------|------|
| `create_game`        | 50    | 42    | 8    |
| `modify_game`        | 30    | 25    | 5    |
| `player_action`      | 50    | 42    | 8    |
| `tool_request`       | 30    | 25    | 5    |
| `guardrail`          | 35    | 30    | 5    |
| `clarification_needed`| 20   | 17    | 3    |
| `off_topic`          | 15    | 13    | 2    |
| **Total**            | **230** | **194** | **36** |

**Eval constraints:**
- Every `safety_flag` category must appear at least once in eval (8 categories × 1 = 8 eval guardrails minimum; we allocate 5 which covers all categories with one gap — adjust to 8 eval guardrails to guarantee full coverage, moving 3 from train).
- Every `tool_request` sub-route (`fal_visuals`, `gradium_voice`, `openai_rules`) must appear in eval.
- `off_topic` is the smallest class (15); 2 eval is the minimum viable.

**Revised split with safety coverage:**

| Intent               | Train | Eval |
|----------------------|-------|------|
| `create_game`        | 42    | 8    |
| `modify_game`        | 26    | 4    |
| `player_action`      | 42    | 8    |
| `tool_request`       | 25    | 5    |
| `guardrail`          | 27    | 8    |
| `clarification_needed`| 18   | 2    |
| `off_topic`          | 13    | 2    |
| **Total**            | **193** | **37** |

Ratio: 84/16. Close enough to 85/15 with guaranteed eval coverage.

**Seed recommendation:** Use `seed=42` for reproducibility. Shuffle with stratification by intent before splitting.

---

## 9. Summary

The dataset is **structurally clean** (schema-consistent, no duplicates, correct allowed/safety labeling) but has a **critical language normalization blocker**: the DeepSeek file uses French entity values while the Kimi file uses English. This must be resolved before fine-tuning GLiNER2, or the model will learn inconsistent label-to-text mappings.

After fixing B1 + B2 and ideally S1–S4, the dataset is ready for stratified split and v0 fine-tuning.
