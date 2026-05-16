from __future__ import annotations

from pathlib import Path

from gameforge_fal.gateway import FalVisualGateway
from gameforge_visuals.contracts import (
    ImageGenerationRequest,
    VisualAssetResult,
    VisualAssetSpec,
    VisualRuntimeConfig,
)


class FalVisualProvider:
    """fal-backed provider for the generic GameForge visual runtime."""

    def __init__(self, gateway: FalVisualGateway | None = None) -> None:
        self.gateway = gateway or FalVisualGateway()

    async def start(self) -> None:
        return None

    async def generate_asset(
        self,
        spec: VisualAssetSpec,
        config: VisualRuntimeConfig,
        output_dir: Path,
    ) -> VisualAssetResult:
        result = await self.gateway.generate_image(
            ImageGenerationRequest(
                prompt=spec.prompt,
                image_size=spec.image_size,
                num_images=spec.num_images,
                num_inference_steps=config.num_inference_steps,
                output_format=spec.output_format,
                seed=spec.seed,
                enable_safety_checker=config.enable_safety_checker,
            ),
            output_dir=output_dir,
        )
        return VisualAssetResult(spec=spec, generation=result)

    async def stop(self) -> None:
        return None
