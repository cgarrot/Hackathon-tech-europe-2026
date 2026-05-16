import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_ai_player_lines_dataset_is_valid():
    rows = load_jsonl(ROOT / "data/context/ai_player_lines.jsonl")
    required = {
        "id",
        "game_family",
        "game_context",
        "language",
        "role_archetype",
        "phase",
        "intent",
        "emotion",
        "delivery",
        "text",
        "tags",
    }

    assert 8 <= len(rows) <= 12
    assert len({row["id"] for row in rows}) == len(rows)
    assert {"fr", "en"} <= {row["language"] for row in rows}

    for row in rows:
        assert required <= row.keys()
        assert row["language"] in {"fr", "en"}
        assert row["text"].strip()
        assert isinstance(row["tags"], list)
        assert row["tags"]


def test_visual_asset_prompts_dataset_is_valid():
    rows = load_jsonl(ROOT / "data/context/visual_asset_prompts.jsonl")
    required = {
        "id",
        "game_family",
        "asset_type",
        "title",
        "prompt_language",
        "prompt",
        "negative_prompt",
        "aspect_ratio",
        "mood",
        "tags",
    }

    assert 8 <= len(rows) <= 12
    assert len({row["id"] for row in rows}) == len(rows)
    assert {"fr", "en"} <= {row["prompt_language"] for row in rows}

    for row in rows:
        assert required <= row.keys()
        assert row["prompt_language"] in {"fr", "en"}
        assert row["prompt"].strip()
        prompt = row["prompt"].lower()
        assert any(
            guard in prompt
            for guard in [
                "no text",
                "no readable",
                "no embedded text",
                "no embedded words",
                "no letters",
                "no written",
                "sans texte",
                "sans mots",
                "aucun texte",
            ]
        )
        assert isinstance(row["tags"], list)
        assert row["tags"]
