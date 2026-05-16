from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any, Dict, List, Optional

from gameforge_gradium.gateway import GradiumVoiceGateway, normalize_language
from gameforge_voice.contracts import AiUtterance, Language, PlayerUtterance, StopSignal, VoiceProfile, VoiceRuntimeConfig
from gameforge_voice.presets import DEFAULT_PRESET_BY_LANGUAGE, voice_id_for_preset
from gameforge_voice.providers.base import VoiceProvider
from gameforge_voice.providers.gradium import GradiumVoiceProvider
from gameforge_voice.providers.mock import MockVoiceProvider
from gameforge_voice.styles import SpeechStyleInput, resolve_speech_style


VoiceEventHandler = Callable[[Dict[str, Any]], None]


class VoiceRuntime:
    """Small integration surface for GameForge voice input and output."""

    def __init__(
        self,
        config: Optional[VoiceRuntimeConfig] = None,
        profiles: Optional[Mapping[str, VoiceProfile]] = None,
        provider: Optional[VoiceProvider] = None,
    ) -> None:
        self.config = config or VoiceRuntimeConfig()
        self.profiles: Dict[str, VoiceProfile] = dict(profiles or {})
        self.provider = provider or self._build_provider(self.config)
        self._event_handlers: List[VoiceEventHandler] = []

    @classmethod
    def from_game_schema(
        cls,
        schema: Mapping[str, Any],
        provider: str = "gradium",
        max_record_seconds: float = 25.0,
    ) -> "VoiceRuntime":
        voice_schema = _as_mapping(schema.get("voice"))
        language = _language(
            voice_schema.get("language")
            or schema.get("language")
            or schema.get("default_language")
            or "fr"
        )
        config = VoiceRuntimeConfig(
            language=language,
            provider=provider,  # type: ignore[arg-type]
            max_record_seconds=max_record_seconds,
        )
        profiles = _profiles_from_schema(voice_schema, language)
        return cls(config=config, profiles=profiles)

    async def start(self) -> None:
        await self.provider.start()
        self._emit({"type": "voice_started", "provider": self.config.provider})

    async def listen(
        self,
        player_id: str = "human_1",
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        self._emit({"type": "listen_started", "player_id": player_id})
        utterance = await self.provider.listen_player_turn(player_id, wait_for_stop=wait_for_stop)
        self._emit(
            {
                "type": "listen_completed",
                "player_id": utterance.player_id,
                "text": utterance.text,
                "language": utterance.language,
            }
        )
        return utterance

    async def listen_player_turn(
        self,
        player_id: str = "human_1",
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        return await self.listen(player_id=player_id, wait_for_stop=wait_for_stop)

    async def say(
        self,
        character_id: str,
        text: str,
        language: Optional[str] = None,
        speech_style: SpeechStyleInput = None,
    ) -> AiUtterance:
        profile = self.profile_for(character_id, language=language)
        resolved_style = resolve_speech_style(speech_style, fallback=profile.speaking_style)
        utterance = AiUtterance(
            character_id=character_id,
            text=text,
            language=profile.language,
            speech_style=resolved_style,
        )
        self._emit(
            {
                "type": "speech_started",
                "character_id": character_id,
                "display_name": profile.display_name,
                "text": text,
                "language": profile.language,
                "speech_style": resolved_style.emotion if resolved_style else None,
            }
        )
        await self.provider.speak_ai(utterance, profile)
        self._emit(
            {
                "type": "speech_completed",
                "character_id": character_id,
                "display_name": profile.display_name,
                "text": text,
                "language": profile.language,
                "speech_style": resolved_style.emotion if resolved_style else None,
            }
        )
        return utterance

    async def speak_ai(
        self,
        character_id: str,
        text: str,
        language: Optional[str] = None,
        speech_style: SpeechStyleInput = None,
    ) -> AiUtterance:
        return await self.say(
            character_id=character_id,
            text=text,
            language=language,
            speech_style=speech_style,
        )

    async def stop(self) -> None:
        await self.provider.stop()
        self._emit({"type": "voice_stopped", "provider": self.config.provider})

    def assign_voice(self, profile: VoiceProfile) -> None:
        self.profiles[profile.character_id] = profile

    def profile_for(self, character_id: str, language: Optional[str] = None) -> VoiceProfile:
        if character_id in self.profiles:
            return self.profiles[character_id]

        normalized_language = _language(language or self.config.language)
        voice_id = GradiumVoiceGateway.default_voice_id(normalized_language)
        profile = VoiceProfile(
            character_id=character_id,
            display_name=character_id,
            language=normalized_language,
            voice_id=voice_id,
        )
        self.assign_voice(profile)
        return profile

    def on_event(self, handler: VoiceEventHandler) -> None:
        self._event_handlers.append(handler)

    def _emit(self, event: Dict[str, Any]) -> None:
        for handler in self._event_handlers:
            handler(event)

    @staticmethod
    def _build_provider(config: VoiceRuntimeConfig) -> VoiceProvider:
        if config.provider == "mock":
            return MockVoiceProvider(config)
        if config.provider == "gradium":
            return GradiumVoiceProvider(config)
        raise ValueError(f"Unknown voice provider `{config.provider}`.")


def _profiles_from_schema(
    voice_schema: Mapping[str, Any],
    default_language: Language,
) -> Dict[str, VoiceProfile]:
    characters = _as_mapping(voice_schema.get("characters"))
    profiles: Dict[str, VoiceProfile] = {}
    for character_id, raw_spec in characters.items():
        spec = _as_mapping(raw_spec)
        language = _language(spec.get("language") or default_language)
        voice_id = spec.get("voice_id")
        if not voice_id:
            preset = spec.get("voice_preset") or DEFAULT_PRESET_BY_LANGUAGE[language]
            voice_id = voice_id_for_preset(str(preset))

        profiles[str(character_id)] = VoiceProfile(
            character_id=str(character_id),
            display_name=str(spec.get("display_name") or character_id),
            language=language,
            voice_id=str(voice_id),
            speaking_style=spec.get("speaking_style") or spec.get("speech_style"),
        )
    return profiles


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _language(value: Any) -> Language:
    return normalize_language(str(value))  # type: ignore[return-value]
