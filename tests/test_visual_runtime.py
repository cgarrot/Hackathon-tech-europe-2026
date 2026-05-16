from __future__ import annotations

import json
from pathlib import Path

import pytest

from gameforge_visuals import VisualRuntime
from gameforge_visuals.runtime import specs_from_game_schema


def test_specs_from_explicit_visual_assets() -> None:
    specs = specs_from_game_schema(
        {
            "visuals": {
                "assets": [
                    {
                        "asset_id": "village_square",
                        "asset_type": "location",
                        "prompt": "A medieval village square.",
                        "image_size": "landscape_16_9",
                        "metadata": {"phase": "day"},
                    }
                ]
            }
        }
    )

    assert len(specs) == 1
    assert specs[0].asset_id == "village_square"
    assert specs[0].asset_type == "location"
    assert specs[0].metadata == {"phase": "day"}


def test_specs_from_roles_fallback() -> None:
    specs = specs_from_game_schema(
        {
            "roles": [
                {
                    "id": "seer",
                    "name": "Voyante",
                    "description": "a mysterious fortune teller",
                }
            ]
        }
    )

    assert len(specs) == 1
    assert specs[0].asset_id == "seer"
    assert specs[0].asset_type == "role_card"
    assert "fortune teller" in specs[0].prompt


@pytest.mark.asyncio
async def test_visual_runtime_mock_writes_manifest(tmp_path: Path) -> None:
    schema = {
        "visuals": {
            "assets": [
                {
                    "asset_id": "seer_card",
                    "asset_type": "role_card",
                    "prompt": "A seer role card.",
                    "image_size": "portrait_4_3",
                }
            ]
        }
    }
    runtime = VisualRuntime.from_game_schema(schema, provider="mock", output_dir=tmp_path)
    events = []
    runtime.on_event(events.append)

    await runtime.start()
    results = await runtime.generate_from_game_schema(schema)
    await runtime.stop()

    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert results[0].spec.asset_id == "seer_card"
    assert (tmp_path / "role_card" / "seer_card" / "seer_card.json").exists()
    assert manifest["assets"][0]["asset_id"] == "seer_card"
    assert [event["type"] for event in events] == [
        "visual_started",
        "asset_generation_started",
        "asset_generation_completed",
        "manifest_written",
        "visual_stopped",
    ]
