from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional


DEFAULT_EN_VOICE_ID = "YTpq7expH9539ERJ"
DEFAULT_FR_VOICE_ID = "b35yykvVppLXyw_l"
DEFAULT_VOICE_ID = DEFAULT_FR_VOICE_ID
SUPPORTED_LANGUAGES = {"en", "fr"}
PCM_80MS_CHUNK_BYTES = 1920 * 2
DEFAULT_FILE_CHUNK_BYTES = 64 * 1024


@dataclass(frozen=True)
class VoiceConfig:
    voice_id: str = DEFAULT_VOICE_ID
    model_name: str = "default"
    output_format: str = "wav"
    json_config: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SynthesisSegment:
    text: str
    start_s: float
    stop_s: float


@dataclass(frozen=True)
class SynthesisResult:
    output_path: Path
    request_id: Optional[str] = None
    sample_rate: Optional[int] = None
    segments: List[SynthesisSegment] = field(default_factory=list)


@dataclass(frozen=True)
class TranscriptSegment:
    text: str
    start_s: Optional[float] = None
    stop_s: Optional[float] = None


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    segments: List[TranscriptSegment]


class GradiumVoiceGateway:
    """Small adapter around the Gradium SDK for GameForge voice experiments."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        _load_dotenv()
        self.api_key = api_key or os.getenv("GRADIUM_API_KEY")
        if not self.api_key:
            raise RuntimeError(
                "Missing GRADIUM_API_KEY. Export it or pass api_key to GradiumVoiceGateway."
            )

    @staticmethod
    def default_voice_id(language: Optional[str] = None) -> str:
        _load_dotenv()
        normalized = normalize_language(language or os.getenv("GRADIUM_LANGUAGE", "fr"))
        if normalized == "en":
            return os.getenv("GRADIUM_EN_VOICE_ID", DEFAULT_EN_VOICE_ID)
        return os.getenv("GRADIUM_FR_VOICE_ID", DEFAULT_FR_VOICE_ID)

    def _client(self) -> Any:
        try:
            import gradium
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "The Gradium SDK is not installed. Run `uv pip install -e .` first."
            ) from exc

        return gradium.client.GradiumClient(api_key=self.api_key)

    async def synthesize_to_file(
        self,
        text: str,
        output_path: Path,
        voice: Optional[VoiceConfig] = None,
    ) -> SynthesisResult:
        if not text.strip():
            raise ValueError("TTS text cannot be empty.")

        voice = voice or VoiceConfig(voice_id=self.default_voice_id())
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        client = self._client()
        setup = {
                "model_name": voice.model_name,
                "voice_id": voice.voice_id,
                "output_format": voice.output_format,
        }
        if voice.json_config:
            setup["json_config"] = voice.json_config

        result = await client.tts(
            setup=setup,
            text=text,
        )

        output_path.write_bytes(result.raw_data)

        segments = []
        for item in getattr(result, "text_with_timestamps", []) or []:
            segments.append(
                SynthesisSegment(
                    text=getattr(item, "text", ""),
                    start_s=float(getattr(item, "start_s", 0.0)),
                    stop_s=float(getattr(item, "stop_s", 0.0)),
                )
            )

        return SynthesisResult(
            output_path=output_path,
            request_id=getattr(result, "request_id", None),
            sample_rate=getattr(result, "sample_rate", None),
            segments=segments,
        )

    async def transcribe_file(
        self,
        input_path: Path,
        input_format: str = "wav",
        model_name: str = "default",
        language: Optional[str] = None,
    ) -> TranscriptResult:
        input_path = Path(input_path)
        if not input_path.exists():
            raise FileNotFoundError(input_path)

        audio_data = input_path.read_bytes()
        setup: Dict[str, Any] = {
            "model_name": model_name,
            "input_format": input_format,
        }
        if language:
            setup["json_config"] = {"language": language}

        chunk_bytes = PCM_80MS_CHUNK_BYTES if input_format == "pcm" else DEFAULT_FILE_CHUNK_BYTES
        stream = await self._client().stt_stream(setup, _chunks(audio_data, chunk_bytes))

        segments: List[TranscriptSegment] = []
        async for segment in stream.iter_text():
            text = getattr(segment, "text", "")
            if text:
                segments.append(
                    TranscriptSegment(
                        text=text,
                        start_s=getattr(segment, "start_s", None),
                        stop_s=getattr(segment, "stop_s", None),
                    )
                )

        return TranscriptResult(
            text=" ".join(segment.text.strip() for segment in segments if segment.text.strip()),
            segments=segments,
        )


async def _chunks(data: bytes, chunk_size: int) -> AsyncIterator[bytes]:
    for offset in range(0, len(data), chunk_size):
        yield data[offset : offset + chunk_size]


def _load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def normalize_language(language: Optional[str]) -> str:
    normalized = (language or "fr").lower().split("-", 1)[0]
    if normalized not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language `{language}`. Use `fr` or `en`.")
    return normalized
