from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Literal, Optional


Language = Literal["fr", "en"]
StopSignal = Callable[[], Awaitable[None]]
SpeechEmotion = Literal[
    "neutral",
    "calm",
    "mysterious",
    "suspicious",
    "tense",
    "urgent",
    "excited",
    "sad",
    "angry",
    "whisper",
]


@dataclass(frozen=True)
class SpeechStyle:
    emotion: SpeechEmotion = "neutral"
    intensity: float = 0.5
    padding_bonus: Optional[float] = None
    temperature: Optional[float] = None
    voice_similarity: Optional[float] = None
    pause_before_s: Optional[float] = None
    pause_after_s: Optional[float] = None
    rewrite_rules: Optional[str] = None
    pronunciation_id: Optional[str] = None


@dataclass(frozen=True)
class VoiceProfile:
    character_id: str
    display_name: str
    language: Language
    voice_id: str
    speaking_style: Optional[str] = None


@dataclass(frozen=True)
class PlayerUtterance:
    player_id: str
    text: str
    language: Language
    confidence: Optional[float] = None
    raw: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class AiUtterance:
    character_id: str
    text: str
    language: Language
    speech_style: Optional[SpeechStyle] = None
    raw: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class VoiceRuntimeConfig:
    language: Language = "fr"
    mode: Literal["push_to_talk"] = "push_to_talk"
    provider: Literal["gradium", "mock"] = "gradium"
    stt_model: str = "default"
    tts_model: str = "default"
    max_record_seconds: float = 25.0
    terminal_prompts: bool = True
