from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import List, Optional

from gameforge_fal.gateway import FalVisualGateway
from gameforge_visuals.contracts import ImageGenerationRequest
from gameforge_visuals.runtime import VisualRuntime
from gameforge_visuals.werewolf import DEFAULT_WEREWOLF_ROLES, get_werewolf_card_specs


IMAGE_SIZES = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"]


def main(argv: Optional[List[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        asyncio.run(args.handler(args))
    except KeyboardInterrupt:
        parser.exit(130, "\nInterrupted.\n")
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        parser.exit(1, f"Error: {exc}\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gameforge-visuals",
        description="fal image generation tools for the GameForge prototype.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    image = subparsers.add_parser("image", help="Generate one or more images from a prompt.")
    image.add_argument("--prompt", required=True)
    image.add_argument("--image-size", default="landscape_16_9", choices=IMAGE_SIZES)
    image.add_argument("--num-images", type=int, default=1)
    image.add_argument("--steps", type=int, default=4, help="Flux inference steps, 1 to 12.")
    image.add_argument("--format", default="jpeg", choices=["jpeg", "png"])
    image.add_argument("--seed", type=int, default=None)
    image.add_argument("--disable-safety-checker", action="store_true")
    image.add_argument("--output-dir", default=None, help="Optional directory to download generated images.")
    image.add_argument("--json", action="store_true", help="Print result metadata as JSON.")
    image.set_defaults(handler=handle_image)

    cards = subparsers.add_parser("werewolf-cards", help="Generate Werewolf role card images.")
    cards.add_argument(
        "--roles",
        nargs="+",
        default=DEFAULT_WEREWOLF_ROLES,
        help="Role IDs or French role names. Defaults: werewolf villager seer witch.",
    )
    cards.add_argument("--output-dir", default="artifacts/fal/werewolf-cards")
    cards.add_argument("--image-size", default="portrait_4_3", choices=IMAGE_SIZES)
    cards.add_argument("--steps", type=int, default=4)
    cards.add_argument("--format", default="jpeg", choices=["jpeg", "png"])
    cards.add_argument("--seed", type=int, default=None)
    cards.add_argument(
        "--style",
        default=(
            "consistent card deck style, vertical composition, high detail, "
            "dark medieval village atmosphere, premium board game art"
        ),
    )
    cards.add_argument("--disable-safety-checker", action="store_true")
    cards.add_argument("--json", action="store_true")
    cards.set_defaults(handler=handle_werewolf_cards)

    schema = subparsers.add_parser("from-schema", help="Generate visual assets from a GameForge schema JSON.")
    schema.add_argument("--schema", required=True, help="Path to a game schema JSON file.")
    schema.add_argument("--provider", default="fal", choices=["fal", "mock"])
    schema.add_argument("--output-dir", default="artifacts/fal/schema-assets")
    schema.add_argument("--json", action="store_true")
    schema.set_defaults(handler=handle_from_schema)

    return parser


async def handle_image(args: argparse.Namespace) -> None:
    request = ImageGenerationRequest(
        prompt=args.prompt,
        image_size=args.image_size,
        num_images=args.num_images,
        num_inference_steps=args.steps,
        output_format=args.format,
        seed=args.seed,
        enable_safety_checker=not args.disable_safety_checker,
    )
    result = await FalVisualGateway().generate_image(
        request,
        output_dir=Path(args.output_dir) if args.output_dir else None,
        on_log=print,
    )

    if args.json:
        print(
            json.dumps(
                {
                    "assets": [
                        {
                            "url": asset.url,
                            "local_path": str(asset.local_path) if asset.local_path else None,
                            "content_type": asset.content_type,
                            "width": asset.width,
                            "height": asset.height,
                        }
                        for asset in result.assets
                    ],
                    "seed": result.seed,
                    "prompt": result.prompt,
                    "provider": result.provider,
                    "model": result.model,
                },
                indent=2,
                ensure_ascii=True,
            )
        )
        return

    for index, asset in enumerate(result.assets, start=1):
        print(f"Image {index} URL: {asset.url}")
        if asset.local_path:
            print(f"Image {index} wrote: {asset.local_path}")
    if result.seed is not None:
        print(f"Seed: {result.seed}")


async def handle_werewolf_cards(args: argparse.Namespace) -> None:
    specs = get_werewolf_card_specs(args.roles)
    gateway = FalVisualGateway()
    output_dir = Path(args.output_dir)
    manifest = []

    for index, spec in enumerate(specs):
        seed = args.seed + index if args.seed is not None else None
        role_dir = output_dir / spec.role_id
        prompt = f"{spec.prompt}, {args.style}"
        result = await gateway.generate_image(
            ImageGenerationRequest(
                prompt=prompt,
                image_size=args.image_size,
                num_images=1,
                num_inference_steps=args.steps,
                output_format=args.format,
                seed=seed,
                enable_safety_checker=not args.disable_safety_checker,
            ),
            output_dir=role_dir,
            on_log=print,
        )
        asset = result.asset
        manifest.append(
            {
                "role_id": spec.role_id,
                "display_name_fr": spec.display_name_fr,
                "display_name_en": spec.display_name_en,
                "prompt": prompt,
                "seed": result.seed,
                "url": asset.url,
                "local_path": str(asset.local_path) if asset.local_path else None,
                "content_type": asset.content_type,
            }
        )
        print(f"{spec.role_id}: {asset.local_path or asset.url}")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8")

    if args.json:
        print(json.dumps({"cards": manifest, "manifest_path": str(manifest_path)}, indent=2, ensure_ascii=True))
    else:
        print(f"Wrote {manifest_path}")


async def handle_from_schema(args: argparse.Namespace) -> None:
    schema_path = Path(args.schema)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    runtime = VisualRuntime.from_game_schema(
        schema,
        provider=args.provider,
        output_dir=Path(args.output_dir),
    )
    runtime.on_event(lambda event: print(f"[visual:{event['type']}]"))
    await runtime.start()
    try:
        results = await runtime.generate_from_game_schema(schema)
    finally:
        await runtime.stop()

    manifest_path = Path(args.output_dir) / "manifest.json"
    if args.json:
        print(
            json.dumps(
                {
                    "manifest_path": str(manifest_path),
                    "assets": [
                        {
                            "asset_id": result.spec.asset_id,
                            "asset_type": result.spec.asset_type,
                            "local_paths": [
                                str(asset.local_path)
                                for asset in result.generation.assets
                                if asset.local_path
                            ],
                            "urls": [asset.url for asset in result.generation.assets],
                        }
                        for result in results
                    ],
                },
                indent=2,
                ensure_ascii=True,
            )
        )
    else:
        print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
