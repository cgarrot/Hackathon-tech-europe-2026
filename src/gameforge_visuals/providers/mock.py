from __future__ import annotations

import json
from pathlib import Path

from gameforge_visuals.contracts import (
    VisualAsset,
    VisualAssetResult,
    VisualAssetSpec,
    VisualGenerationResult,
    VisualRuntimeConfig,
)


class MockVisualProvider:
    """File-only provider for devs working without fal credits or API keys."""

    async def start(self) -> None:
        return None

    async def generate_asset(
        self,
        spec: VisualAssetSpec,
        config: VisualRuntimeConfig,
        output_dir: Path,
    ) -> VisualAssetResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        metadata_path = output_dir / f"{spec.asset_id}.json"
        metadata_path.write_text(
            json.dumps(
                {
                    "asset_id": spec.asset_id,
                    "asset_type": spec.asset_type,
                    "prompt": spec.prompt,
                    "image_size": spec.image_size,
                    "num_images": spec.num_images,
                    "output_format": spec.output_format,
                    "seed": spec.seed,
                    "metadata": spec.metadata,
                },
                indent=2,
                ensure_ascii=True,
            ),
            encoding="utf-8",
        )
        asset = VisualAsset(
            url=f"mock://{spec.asset_id}",
            content_type="application/json",
            file_name=metadata_path.name,
            local_path=metadata_path,
        )
        generation = VisualGenerationResult(
            assets=[asset],
            seed=spec.seed,
            prompt=spec.prompt,
            provider="mock",
            model="mock-image-generator",
            raw={"mock": True},
        )
        return VisualAssetResult(spec=spec, generation=generation)

    async def stop(self) -> None:
        return None
