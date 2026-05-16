from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import List, Optional

from gameforge_gradium.gateway import GradiumVoiceGateway, VoiceConfig, normalize_language
from gameforge_gradium.live import play_streamed_tts, run_live_chat
from gameforge_voice.styles import apply_gradium_text_controls, gradium_json_config, resolve_speech_style


DEMO_LINES = {
    "fr": [
        {
            "role": "narrateur",
            "text": "La nuit tombe sur le village. Les joueurs ferment les yeux.",
        },
        {
            "role": "loup_garou",
            "text": "Je souris dans l'ombre. Personne ne soupconnera le boulanger.",
        },
        {
            "role": "voyante",
            "text": "Les cartes tremblent. Une verite se cache derriere ce silence.",
        },
        {
            "role": "villageois",
            "text": "Je ne sais pas qui ment, mais quelqu'un ici evite mon regard.",
        },
    ],
    "en": [
        {
            "role": "narrator",
            "text": "Night falls over the village. The players close their eyes.",
        },
        {
            "role": "werewolf",
            "text": "I smile in the dark. No one will suspect the baker.",
        },
        {
            "role": "seer",
            "text": "The cards are trembling. A truth is hiding behind this silence.",
        },
        {
            "role": "villager",
            "text": "I do not know who is lying, but someone here is avoiding my eyes.",
        },
    ],
}


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
        prog="gameforge-voice",
        description="Gradium voice tools for the GameForge prototype.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    tts = subparsers.add_parser("tts", help="Generate speech from text.")
    tts.add_argument("--text", required=True)
    tts.add_argument("--output", default="artifacts/tts.wav")
    tts.add_argument("--voice-id", default=None)
    tts.add_argument("--language", default="fr", choices=["fr", "en"])
    tts.add_argument("--speech-style", default=None)
    tts.add_argument("--format", default="wav", choices=["wav", "pcm", "opus"])
    tts.add_argument("--model", default="default")
    tts.set_defaults(handler=handle_tts)

    stt = subparsers.add_parser("stt", help="Transcribe an audio file.")
    stt.add_argument("--input", required=True)
    stt.add_argument(
        "--format",
        default="wav",
        help="Gradium input format: wav, pcm, pcm_16000, pcm_24000, opus, etc.",
    )
    stt.add_argument("--model", default="default")
    stt.add_argument("--language", default=None, help="Optional language code, e.g. fr or en.")
    stt.add_argument("--json", action="store_true", help="Print segments as JSON.")
    stt.set_defaults(handler=handle_stt)

    demo = subparsers.add_parser("demo", help="Generate a small GameForge scene.")
    demo.add_argument("--output-dir", default="artifacts/demo")
    demo.add_argument("--voice-id", default=None)
    demo.add_argument("--language", default="fr", choices=["fr", "en"])
    demo.add_argument("--model", default="default")
    demo.set_defaults(handler=handle_demo)

    play = subparsers.add_parser("play", help="Stream TTS directly to speakers.")
    play.add_argument("--text", required=True)
    play.add_argument("--voice-id", default=None)
    play.add_argument("--language", default="fr", choices=["fr", "en"])
    play.add_argument("--speech-style", default=None)
    play.add_argument("--model", default="default")
    play.set_defaults(handler=handle_play)

    live = subparsers.add_parser("live-chat", help="Push-to-talk voice chat with scripted AI players.")
    live.add_argument("--voice-id", default=None)
    live.add_argument("--language", default="fr", choices=["fr", "en"])
    live.add_argument("--provider", default="gradium", choices=["gradium", "mock"])
    live.add_argument("--turns", type=int, default=3)
    live.add_argument("--max-record-seconds", type=float, default=25.0)
    live.set_defaults(handler=handle_live_chat)

    return parser


async def handle_tts(args: argparse.Namespace) -> None:
    language = normalize_language(args.language)
    speech_style = resolve_speech_style(args.speech_style)
    voice = VoiceConfig(
        voice_id=args.voice_id or GradiumVoiceGateway.default_voice_id(language),
        model_name=args.model,
        output_format=args.format,
        json_config=gradium_json_config(speech_style),
    )
    result = await GradiumVoiceGateway().synthesize_to_file(
        text=apply_gradium_text_controls(args.text, speech_style),
        output_path=Path(args.output),
        voice=voice,
    )
    print(f"Wrote {result.output_path}")
    if result.sample_rate:
        print(f"Sample rate: {result.sample_rate}")
    if result.request_id:
        print(f"Request ID: {result.request_id}")


async def handle_stt(args: argparse.Namespace) -> None:
    result = await GradiumVoiceGateway().transcribe_file(
        input_path=Path(args.input),
        input_format=args.format,
        model_name=args.model,
        language=args.language,
    )
    if args.json:
        print(
            json.dumps(
                {
                    "text": result.text,
                    "segments": [
                        {
                            "text": segment.text,
                            "start_s": segment.start_s,
                            "stop_s": segment.stop_s,
                        }
                        for segment in result.segments
                    ],
                },
                indent=2,
                ensure_ascii=True,
            )
        )
    else:
        print(result.text)


async def handle_demo(args: argparse.Namespace) -> None:
    language = normalize_language(args.language)
    gateway = GradiumVoiceGateway()
    output_dir = Path(args.output_dir)
    voice = VoiceConfig(
        voice_id=args.voice_id or GradiumVoiceGateway.default_voice_id(language),
        model_name=args.model,
        output_format="wav",
    )

    manifest = []
    for line in DEMO_LINES[language]:
        output_path = output_dir / f"{line['role']}.wav"
        result = await gateway.synthesize_to_file(
            text=line["text"],
            output_path=output_path,
            voice=voice,
        )
        manifest.append(
            {
                "role": line["role"],
                "language": language,
                "voice_id": voice.voice_id,
                "text": line["text"],
                "audio_path": str(result.output_path),
                "request_id": result.request_id,
            }
        )
        print(f"Wrote {result.output_path}")

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {manifest_path}")


async def handle_play(args: argparse.Namespace) -> None:
    language = normalize_language(args.language)
    await play_streamed_tts(
        text=args.text,
        voice_id=args.voice_id or GradiumVoiceGateway.default_voice_id(language),
        model=args.model,
        language=language,
        speech_style=args.speech_style,
    )


async def handle_live_chat(args: argparse.Namespace) -> None:
    language = normalize_language(args.language)
    await run_live_chat(
        voice_id=args.voice_id or GradiumVoiceGateway.default_voice_id(language),
        language=language,
        turns=args.turns,
        max_record_seconds=args.max_record_seconds,
        provider=args.provider,
    )


if __name__ == "__main__":
    main()
