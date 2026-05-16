"""Integration-friendly visual runtime contracts for GameForge."""

from gameforge_visuals.contracts import (
    ImageGenerationRequest,
    VisualAsset,
    VisualAssetResult,
    VisualAssetSpec,
    VisualGenerationResult,
    VisualRuntimeConfig,
)
from gameforge_visuals.runtime import VisualRuntime
from gameforge_visuals.werewolf import WerewolfCardSpec

__all__ = [
    "ImageGenerationRequest",
    "VisualAsset",
    "VisualAssetResult",
    "VisualAssetSpec",
    "VisualGenerationResult",
    "VisualRuntime",
    "VisualRuntimeConfig",
    "WerewolfCardSpec",
]
