from __future__ import annotations

from typing import Dict

from gameforge_gradium.gateway import DEFAULT_EN_VOICE_ID, DEFAULT_FR_VOICE_ID


VOICE_PRESETS: Dict[str, str] = {
    "fr_feminine_warm": DEFAULT_FR_VOICE_ID,
    "fr_masculine_warm": "axlOaUiFyOZhy4nv",
    "en_feminine_warm": DEFAULT_EN_VOICE_ID,
    "en_masculine_warm": "LFZvm12tW_z0xfGo",
}


DEFAULT_PRESET_BY_LANGUAGE = {
    "fr": "fr_feminine_warm",
    "en": "en_feminine_warm",
}


def voice_id_for_preset(preset: str) -> str:
    try:
        return VOICE_PRESETS[preset]
    except KeyError as exc:
        known = ", ".join(sorted(VOICE_PRESETS))
        raise ValueError(f"Unknown voice preset `{preset}`. Known presets: {known}.") from exc
