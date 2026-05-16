from __future__ import annotations

from typing import Any

import pytest

from gameforge_fal.gateway import FalVisualGateway
from gameforge_visuals.contracts import ImageGenerationRequest
from gameforge_visuals.werewolf import get_werewolf_card_specs


class FakeFalClient:
    def __init__(self) -> None:
        self.last_arguments: dict[str, Any] | None = None

    def subscribe(
        self,
        application: str,
        arguments: dict[str, Any],
        **kwargs: Any,
    ) -> dict[str, Any]:
        self.last_arguments = arguments
        assert application == "fal-ai/flux/schnell"
        return {
            "images": [
                {
                    "url": "https://fal.example/image.jpg",
                    "content_type": "image/jpeg",
                    "file_name": "image.jpg",
                    "width": 1280,
                    "height": 720,
                }
            ],
            "seed": 123,
            "prompt": arguments["prompt"],
        }


@pytest.mark.asyncio
async def test_generate_image_calls_flux_schnell(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeFalClient()
    monkeypatch.setattr("gameforge_fal.gateway._fal_client", lambda: fake)

    result = await FalVisualGateway(api_key="test").generate_image(
        ImageGenerationRequest(
            prompt="A medieval village square at night.",
            image_size="landscape_16_9",
            num_images=1,
            num_inference_steps=4,
            output_format="jpeg",
            seed=123,
        )
    )

    assert fake.last_arguments == {
        "prompt": "A medieval village square at night.",
        "image_size": "landscape_16_9",
        "num_images": 1,
        "num_inference_steps": 4,
        "output_format": "jpeg",
        "enable_safety_checker": True,
        "seed": 123,
    }
    assert result.asset.url == "https://fal.example/image.jpg"
    assert result.asset.width == 1280
    assert result.seed == 123


@pytest.mark.asyncio
async def test_generate_image_validates_prompt() -> None:
    with pytest.raises(ValueError, match="prompt cannot be empty"):
        await FalVisualGateway(api_key="test").generate_image(
            ImageGenerationRequest(prompt=" ")
        )


@pytest.mark.asyncio
async def test_generate_image_validates_num_images() -> None:
    with pytest.raises(ValueError, match="num_images"):
        await FalVisualGateway(api_key="test").generate_image(
            ImageGenerationRequest(prompt="Scene", num_images=5)
        )


def test_werewolf_specs_support_french_aliases() -> None:
    specs = get_werewolf_card_specs(["loup-garou", "villageois", "voyante", "sorciere"])

    assert [spec.role_id for spec in specs] == ["werewolf", "villager", "seer", "witch"]
