from __future__ import annotations

from dataclasses import replace
from typing import Any, Dict, Mapping, Optional, Union

from gameforge_voice.contracts import SpeechStyle


SpeechStyleInput = Union[SpeechStyle, str, Mapping[str, Any], None]


STYLE_PRESETS = {
    "neutral": SpeechStyle(emotion="neutral", intensity=0.5, temperature=0.7),
    "calm": SpeechStyle(emotion="calm", intensity=0.45, padding_bonus=1.0, temperature=0.45),
    "mysterious": SpeechStyle(
        emotion="mysterious",
        intensity=0.65,
        padding_bonus=1.4,
        temperature=0.8,
        pause_before_s=0.3,
    ),
    "suspicious": SpeechStyle(emotion="suspicious", intensity=0.65, padding_bonus=0.6, temperature=0.9),
    "tense": SpeechStyle(emotion="tense", intensity=0.75, padding_bonus=-0.5, temperature=0.9),
    "urgent": SpeechStyle(emotion="urgent", intensity=0.85, padding_bonus=-1.6, temperature=1.0),
    "excited": SpeechStyle(emotion="excited", intensity=0.8, padding_bonus=-1.1, temperature=1.05),
    "sad": SpeechStyle(emotion="sad", intensity=0.65, padding_bonus=1.8, temperature=0.45),
    "angry": SpeechStyle(emotion="angry", intensity=0.8, padding_bonus=-0.8, temperature=1.1),
    "whisper": SpeechStyle(
        emotion="whisper",
        intensity=0.45,
        padding_bonus=1.5,
        temperature=0.55,
        voice_similarity=2.6,
        pause_before_s=0.2,
    ),
}


def resolve_speech_style(style: SpeechStyleInput, fallback: SpeechStyleInput = None) -> Optional[SpeechStyle]:
    if style is None:
        style = fallback
    if style is None:
        return None

    if isinstance(style, SpeechStyle):
        return _normalize(style)

    if isinstance(style, str):
        try:
            return STYLE_PRESETS[style]
        except KeyError as exc:
            known = ", ".join(sorted(STYLE_PRESETS))
            raise ValueError(f"Unknown speech style `{style}`. Known styles: {known}.") from exc

    if isinstance(style, Mapping):
        base = resolve_speech_style(str(style.get("emotion", "neutral")))
        assert base is not None
        intensity = float(style.get("intensity", base.intensity))
        scaled = _scale_intensity(base, intensity)
        return _normalize(
            replace(
                scaled,
                intensity=intensity,
                padding_bonus=_maybe_float(style.get("padding_bonus", scaled.padding_bonus)),
                temperature=_maybe_float(style.get("temperature", scaled.temperature)),
                voice_similarity=_maybe_float(style.get("voice_similarity", scaled.voice_similarity)),
                pause_before_s=_maybe_float(style.get("pause_before_s", scaled.pause_before_s)),
                pause_after_s=_maybe_float(style.get("pause_after_s", scaled.pause_after_s)),
                rewrite_rules=style.get("rewrite_rules", scaled.rewrite_rules),
                pronunciation_id=style.get("pronunciation_id", scaled.pronunciation_id),
            )
        )

    raise TypeError(f"Unsupported speech style type: {type(style).__name__}.")


def gradium_json_config(style: Optional[SpeechStyle]) -> Dict[str, Any]:
    if style is None:
        return {}

    config: Dict[str, Any] = {}
    if style.temperature is not None:
        config["temp"] = _clamp(style.temperature, 0.0, 1.4)
    if style.voice_similarity is not None:
        config["cfg_coef"] = _clamp(style.voice_similarity, 1.0, 4.0)
    if style.padding_bonus is not None:
        config["padding_bonus"] = _clamp(style.padding_bonus, -4.0, 4.0)
    if style.rewrite_rules:
        config["rewrite_rules"] = style.rewrite_rules
    if style.pronunciation_id:
        config["pronunciation_id"] = style.pronunciation_id
    return config


def apply_gradium_text_controls(text: str, style: Optional[SpeechStyle]) -> str:
    if style is None:
        return text

    parts = []
    if style.pause_before_s:
        parts.append(_break_tag(style.pause_before_s))
    parts.append(text)
    if style.pause_after_s:
        parts.append(_break_tag(style.pause_after_s))
    return " ".join(parts)


def _normalize(style: SpeechStyle) -> SpeechStyle:
    return replace(
        style,
        intensity=_clamp(style.intensity, 0.0, 1.0),
        padding_bonus=_maybe_clamp(style.padding_bonus, -4.0, 4.0),
        temperature=_maybe_clamp(style.temperature, 0.0, 1.4),
        voice_similarity=_maybe_clamp(style.voice_similarity, 1.0, 4.0),
        pause_before_s=_maybe_clamp(style.pause_before_s, 0.1, 2.0),
        pause_after_s=_maybe_clamp(style.pause_after_s, 0.1, 2.0),
    )


def _scale_intensity(style: SpeechStyle, intensity: float) -> SpeechStyle:
    base_intensity = style.intensity if style.intensity > 0 else 0.5
    scale = _clamp(intensity, 0.0, 1.0) / base_intensity
    return replace(
        style,
        intensity=intensity,
        padding_bonus=_scale_from_neutral(style.padding_bonus, neutral=0.0, scale=scale),
        temperature=_scale_from_neutral(style.temperature, neutral=0.7, scale=scale),
        voice_similarity=_scale_from_neutral(style.voice_similarity, neutral=2.0, scale=scale),
        pause_before_s=_scale_from_neutral(style.pause_before_s, neutral=0.0, scale=scale),
        pause_after_s=_scale_from_neutral(style.pause_after_s, neutral=0.0, scale=scale),
    )


def _scale_from_neutral(value: Optional[float], neutral: float, scale: float) -> Optional[float]:
    if value is None:
        return None
    return neutral + ((value - neutral) * scale)


def _break_tag(seconds: float) -> str:
    return f'<break time="{_clamp(seconds, 0.1, 2.0):.1f}s" />'


def _maybe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _maybe_clamp(value: Optional[float], low: float, high: float) -> Optional[float]:
    if value is None:
        return None
    return _clamp(value, low, high)


def _clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)
