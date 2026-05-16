from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Literal, Optional


ImageSize = Literal[
    "square_hd",
    "square",
    "portrait_4_3",
    "portrait_16_9",
    "landscape_4_3",
    "landscape_16_9",
]
ImageFormat = Literal["jpeg", "png"]
VisualAssetType = Literal["location", "character", "role_card", "ambience", "item", "ui"]
VisualProviderName = Literal["fal", "mock"]


@dataclass(frozen=True)
class ImageGenerationRequest:
    prompt: str
    image_size: ImageSize = "landscape_16_9"
    num_images: int = 1
    num_inference_steps: int = 4
    output_format: ImageFormat = "jpeg"
    seed: Optional[int] = None
    enable_safety_checker: bool = True


@dataclass(frozen=True)
class VisualAssetSpec:
    asset_id: str
    asset_type: VisualAssetType
    prompt: str
    image_size: ImageSize = "landscape_16_9"
    num_images: int = 1
    output_format: ImageFormat = "jpeg"
    seed: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VisualAsset:
    url: str
    content_type: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    local_path: Optional[Path] = None


@dataclass(frozen=True)
class VisualGenerationResult:
    assets: list[VisualAsset]
    seed: Optional[int] = None
    prompt: Optional[str] = None
    request_id: Optional[str] = None
    provider: str = "fal"
    model: str = "fal-ai/flux/schnell"
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def asset(self) -> VisualAsset:
        if not self.assets:
            raise RuntimeError("VisualGenerationResult contains no assets.")
        return self.assets[0]


@dataclass(frozen=True)
class VisualAssetResult:
    spec: VisualAssetSpec
    generation: VisualGenerationResult


@dataclass(frozen=True)
class VisualRuntimeConfig:
    provider: VisualProviderName = "fal"
    output_dir: Path = Path("artifacts/fal/generated")
    num_inference_steps: int = 4
    enable_safety_checker: bool = True
