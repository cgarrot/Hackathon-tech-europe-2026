from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, Dict, List, Optional

from gameforge_visuals.contracts import (
    ImageSize,
    VisualAssetResult,
    VisualAssetSpec,
    VisualAssetType,
    VisualRuntimeConfig,
)
from gameforge_visuals.providers.base import VisualProvider
from gameforge_visuals.providers.mock import MockVisualProvider


VisualEventHandler = Callable[[Dict[str, Any]], None]


class VisualRuntime:
    """Small integration surface for GameForge visual asset generation."""

    def __init__(
        self,
        config: Optional[VisualRuntimeConfig] = None,
        provider: Optional[VisualProvider] = None,
    ) -> None:
        self.config = config or VisualRuntimeConfig()
        self.provider = provider or self._build_provider(self.config.provider)
        self._event_handlers: List[VisualEventHandler] = []

    @classmethod
    def from_game_schema(
        cls,
        schema: Mapping[str, Any],
        provider: str = "fal",
        output_dir: Path | str = Path("artifacts/fal/generated"),
    ) -> "VisualRuntime":
        return cls(
            config=VisualRuntimeConfig(
                provider=provider,  # type: ignore[arg-type]
                output_dir=Path(output_dir),
            )
        )

    async def start(self) -> None:
        await self.provider.start()
        self._emit({"type": "visual_started", "provider": self.config.provider})

    async def generate_asset(self, spec: VisualAssetSpec) -> VisualAssetResult:
        asset_dir = self.config.output_dir / spec.asset_type / spec.asset_id
        self._emit(
            {
                "type": "asset_generation_started",
                "asset_id": spec.asset_id,
                "asset_type": spec.asset_type,
                "prompt": spec.prompt,
            }
        )
        result = await self.provider.generate_asset(spec, self.config, asset_dir)
        self._emit(
            {
                "type": "asset_generation_completed",
                "asset_id": spec.asset_id,
                "asset_type": spec.asset_type,
                "assets": [
                    {
                        "url": asset.url,
                        "local_path": str(asset.local_path) if asset.local_path else None,
                    }
                    for asset in result.generation.assets
                ],
            }
        )
        return result

    async def generate_assets(self, specs: Sequence[VisualAssetSpec]) -> list[VisualAssetResult]:
        results = []
        for spec in specs:
            results.append(await self.generate_asset(spec))

        manifest_path = self.write_manifest(results)
        self._emit({"type": "manifest_written", "path": str(manifest_path)})
        return results

    async def generate_from_game_schema(self, schema: Mapping[str, Any]) -> list[VisualAssetResult]:
        specs = specs_from_game_schema(schema)
        return await self.generate_assets(specs)

    async def stop(self) -> None:
        await self.provider.stop()
        self._emit({"type": "visual_stopped", "provider": self.config.provider})

    def write_manifest(self, results: Sequence[VisualAssetResult]) -> Path:
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = self.config.output_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(_manifest(results), indent=2, ensure_ascii=True),
            encoding="utf-8",
        )
        return manifest_path

    def on_event(self, handler: VisualEventHandler) -> None:
        self._event_handlers.append(handler)

    def _emit(self, event: Dict[str, Any]) -> None:
        for handler in self._event_handlers:
            handler(event)

    @staticmethod
    def _build_provider(provider: str) -> VisualProvider:
        if provider == "mock":
            return MockVisualProvider()
        if provider == "fal":
            from gameforge_fal.provider import FalVisualProvider

            return FalVisualProvider()
        raise ValueError(f"Unknown visual provider `{provider}`.")


def specs_from_game_schema(schema: Mapping[str, Any]) -> list[VisualAssetSpec]:
    visuals = _as_mapping(schema.get("visuals") or schema.get("visual"))
    assets = visuals.get("assets")
    if isinstance(assets, Sequence) and not isinstance(assets, (str, bytes)):
        return [_spec_from_mapping(_as_mapping(item)) for item in assets]

    specs: list[VisualAssetSpec] = []
    specs.extend(_location_specs(schema, visuals))
    specs.extend(_character_specs(schema, visuals))
    specs.extend(_role_specs(schema, visuals))
    return specs


def _spec_from_mapping(data: Mapping[str, Any]) -> VisualAssetSpec:
    asset_id = str(data.get("asset_id") or data.get("id") or "").strip()
    if not asset_id:
        raise ValueError("visual asset is missing `asset_id` or `id`.")
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        raise ValueError(f"visual asset `{asset_id}` is missing `prompt`.")

    return VisualAssetSpec(
        asset_id=asset_id,
        asset_type=_asset_type(data.get("asset_type") or data.get("type") or "ambience"),
        prompt=prompt,
        image_size=_image_size(data.get("image_size") or "landscape_16_9"),
        num_images=int(data.get("num_images", 1)),
        output_format=str(data.get("output_format", "jpeg")),  # type: ignore[arg-type]
        seed=data.get("seed"),
        metadata=dict(_as_mapping(data.get("metadata"))),
    )


def _location_specs(schema: Mapping[str, Any], visuals: Mapping[str, Any]) -> list[VisualAssetSpec]:
    locations = schema.get("locations") or visuals.get("locations") or []
    specs = []
    if isinstance(locations, Sequence) and not isinstance(locations, (str, bytes)):
        for item in locations:
            location = _as_mapping(item)
            name = str(location.get("name") or location.get("id") or "location")
            asset_id = _slug(str(location.get("id") or name))
            description = str(location.get("description") or name)
            specs.append(
                VisualAssetSpec(
                    asset_id=asset_id,
                    asset_type="location",
                    prompt=f"{description}, atmospheric game background, cinematic concept art, no text",
                    image_size="landscape_16_9",
                    metadata={"name": name},
                )
            )
    return specs


def _character_specs(schema: Mapping[str, Any], visuals: Mapping[str, Any]) -> list[VisualAssetSpec]:
    characters = schema.get("characters") or visuals.get("characters") or []
    specs = []
    if isinstance(characters, Sequence) and not isinstance(characters, (str, bytes)):
        for item in characters:
            character = _as_mapping(item)
            name = str(character.get("name") or character.get("id") or "character")
            asset_id = _slug(str(character.get("id") or name))
            description = str(character.get("visual_description") or character.get("description") or name)
            specs.append(
                VisualAssetSpec(
                    asset_id=asset_id,
                    asset_type="character",
                    prompt=f"{description}, character portrait, detailed game art, no text",
                    image_size="portrait_4_3",
                    metadata={"name": name},
                )
            )
    return specs


def _role_specs(schema: Mapping[str, Any], visuals: Mapping[str, Any]) -> list[VisualAssetSpec]:
    roles = schema.get("roles") or visuals.get("roles") or []
    specs = []
    if isinstance(roles, Sequence) and not isinstance(roles, (str, bytes)):
        for item in roles:
            role = _as_mapping(item)
            name = str(role.get("name") or role.get("id") or "role")
            asset_id = _slug(str(role.get("id") or name))
            description = str(role.get("visual_description") or role.get("description") or name)
            specs.append(
                VisualAssetSpec(
                    asset_id=asset_id,
                    asset_type="role_card",
                    prompt=(
                        f"role card illustration for a board game, {description}, "
                        "ornate card frame, premium game art, no text"
                    ),
                    image_size="portrait_4_3",
                    metadata={"name": name},
                )
            )
    return specs


def _manifest(results: Sequence[VisualAssetResult]) -> Dict[str, Any]:
    return {
        "assets": [
            {
                "asset_id": result.spec.asset_id,
                "asset_type": result.spec.asset_type,
                "prompt": result.spec.prompt,
                "metadata": result.spec.metadata,
                "generated": [
                    {
                        "url": asset.url,
                        "local_path": str(asset.local_path) if asset.local_path else None,
                        "content_type": asset.content_type,
                        "width": asset.width,
                        "height": asset.height,
                    }
                    for asset in result.generation.assets
                ],
                "provider": result.generation.provider,
                "model": result.generation.model,
                "seed": result.generation.seed,
            }
            for result in results
        ]
    }


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _asset_type(value: Any) -> VisualAssetType:
    normalized = str(value).strip().lower()
    known = {"location", "character", "role_card", "ambience", "item", "ui"}
    if normalized not in known:
        raise ValueError(f"Unknown visual asset type `{value}`.")
    return normalized  # type: ignore[return-value]


def _image_size(value: Any) -> ImageSize:
    normalized = str(value).strip().lower()
    known = {
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
    }
    if normalized not in known:
        raise ValueError(f"Unknown image size `{value}`.")
    return normalized  # type: ignore[return-value]


def _slug(value: str) -> str:
    lowered = value.strip().lower()
    chars = [char if char.isalnum() else "_" for char in lowered]
    slug = "_".join(part for part in "".join(chars).split("_") if part)
    return slug or "asset"
