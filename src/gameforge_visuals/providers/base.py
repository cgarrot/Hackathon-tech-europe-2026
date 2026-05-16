from __future__ import annotations

from pathlib import Path
from typing import Protocol

from gameforge_visuals.contracts import VisualAssetResult, VisualAssetSpec, VisualRuntimeConfig


class VisualProvider(Protocol):
    async def start(self) -> None:
        ...

    async def generate_asset(
        self,
        spec: VisualAssetSpec,
        config: VisualRuntimeConfig,
        output_dir: Path,
    ) -> VisualAssetResult:
        ...

    async def stop(self) -> None:
        ...
