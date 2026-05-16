from __future__ import annotations

import asyncio
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from gameforge_fal.config import require_fal_key
from gameforge_visuals.contracts import ImageGenerationRequest, VisualAsset, VisualGenerationResult


FLUX_SCHNELL_MODEL = "fal-ai/flux/schnell"


QueueLogHandler = Callable[[str], None]


class FalVisualGateway:
    """Small fal adapter for GameForge image generation experiments."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or require_fal_key()

    async def generate_image(
        self,
        request: ImageGenerationRequest,
        output_dir: Optional[Path] = None,
        on_log: Optional[QueueLogHandler] = None,
    ) -> VisualGenerationResult:
        if not request.prompt.strip():
            raise ValueError("Image generation prompt cannot be empty.")
        if not 1 <= request.num_images <= 4:
            raise ValueError("num_images must be between 1 and 4.")
        if not 1 <= request.num_inference_steps <= 12:
            raise ValueError("num_inference_steps must be between 1 and 12.")

        fal_client = _fal_client()
        arguments = _build_flux_arguments(request)

        def queue_update(status: Any) -> None:
            if on_log is None:
                return
            logs = getattr(status, "logs", None) or []
            for item in logs:
                message = getattr(item, "message", None) or str(item)
                on_log(message)

        try:
            result = await asyncio.to_thread(
                fal_client.subscribe,
                FLUX_SCHNELL_MODEL,
                arguments=arguments,
                with_logs=on_log is not None,
                on_queue_update=queue_update if on_log is not None else None,
                client_timeout=180,
            )
        except Exception as exc:
            raise RuntimeError(_format_fal_error(exc)) from exc

        assets = _assets_from_result(result)
        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            downloaded = []
            for index, asset in enumerate(assets, start=1):
                path = output_dir / _filename_for_asset(asset, index, request.output_format)
                await asyncio.to_thread(_download_file, asset.url, path)
                downloaded.append(
                    VisualAsset(
                        url=asset.url,
                        content_type=asset.content_type,
                        file_name=asset.file_name,
                        file_size=asset.file_size,
                        width=asset.width,
                        height=asset.height,
                        local_path=path,
                    )
                )
            assets = downloaded

        return VisualGenerationResult(
            assets=assets,
            seed=result.get("seed"),
            prompt=result.get("prompt") or request.prompt,
            provider="fal",
            model=FLUX_SCHNELL_MODEL,
            raw=result,
        )


def _build_flux_arguments(request: ImageGenerationRequest) -> Dict[str, Any]:
    arguments: Dict[str, Any] = {
        "prompt": request.prompt,
        "image_size": request.image_size,
        "num_images": request.num_images,
        "num_inference_steps": request.num_inference_steps,
        "output_format": request.output_format,
        "enable_safety_checker": request.enable_safety_checker,
    }
    if request.seed is not None:
        arguments["seed"] = request.seed
    return arguments


def _fal_client() -> Any:
    try:
        import fal_client
    except ModuleNotFoundError as exc:
        raise RuntimeError("The fal client is not installed. Run `uv pip install .` first.") from exc
    return fal_client


def _format_fal_error(exc: Exception) -> str:
    message = str(exc)
    if "Unprocessable Entity" in message or getattr(exc, "status_code", None) == 422:
        return f"fal rejected the image generation payload: {message}"
    return f"fal image generation failed: {message}"


def _assets_from_result(result: Dict[str, Any]) -> list[VisualAsset]:
    images = result.get("images")
    if not isinstance(images, list) or not images:
        raise RuntimeError(f"fal result did not contain image URLs: {json.dumps(result)[:500]}")

    assets = []
    for image in images:
        if not isinstance(image, dict) or not image.get("url"):
            continue
        assets.append(
            VisualAsset(
                url=str(image["url"]),
                content_type=image.get("content_type"),
                file_name=image.get("file_name"),
                file_size=image.get("file_size"),
                width=image.get("width"),
                height=image.get("height"),
            )
        )

    if not assets:
        raise RuntimeError(f"fal result did not contain usable image URLs: {json.dumps(result)[:500]}")
    return assets


def _filename_for_asset(asset: VisualAsset, index: int, output_format: str) -> str:
    if asset.file_name:
        return asset.file_name

    parsed = urllib.parse.urlparse(asset.url)
    candidate = Path(parsed.path).name
    if candidate and "." in candidate:
        return candidate

    extension = "jpg" if output_format == "jpeg" else output_format
    return f"image_{index}.{extension}"


def _download_file(url: str, output_path: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as response:
        output_path.write_bytes(response.read())
