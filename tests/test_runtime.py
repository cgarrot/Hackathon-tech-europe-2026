from __future__ import annotations

from typing import Optional

import pytest

from gameforge_voice import VoiceRuntime
from gameforge_voice.contracts import (
    AiUtterance,
    PlayerUtterance,
    StopSignal,
    VoiceProfile,
    VoiceRuntimeConfig,
)


class FakeProvider:
    def __init__(self) -> None:
        self.started = False
        self.stopped = False
        self.spoken: list[tuple[AiUtterance, VoiceProfile]] = []
        self.wait_for_stop_called = False

    async def start(self) -> None:
        self.started = True

    async def listen_player_turn(
        self,
        player_id: str,
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        if wait_for_stop is not None:
            await wait_for_stop()
            self.wait_for_stop_called = True
        return PlayerUtterance(player_id=player_id, text="Bonjour", language="fr")

    async def speak_ai(self, utterance: AiUtterance, profile: VoiceProfile) -> None:
        self.spoken.append((utterance, profile))

    async def stop(self) -> None:
        self.stopped = True


def test_runtime_builds_profiles_from_game_schema() -> None:
    runtime = VoiceRuntime.from_game_schema(
        {
            "language": "fr",
            "voice": {
                "characters": {
                    "seer": {
                        "display_name": "Mirelda",
                        "voice_preset": "fr_feminine_warm",
                        "speech_style": "mysterious",
                    }
                }
            },
        },
        provider="mock",
    )

    assert runtime.config.language == "fr"
    assert runtime.profiles["seer"].display_name == "Mirelda"
    assert runtime.profiles["seer"].speaking_style == "mysterious"


@pytest.mark.asyncio
async def test_runtime_emits_events_and_passes_speech_style() -> None:
    provider = FakeProvider()
    runtime = VoiceRuntime(
        config=VoiceRuntimeConfig(provider="mock"),
        profiles={
            "seer": VoiceProfile(
                character_id="seer",
                display_name="Mirelda",
                language="fr",
                voice_id="voice-1",
                speaking_style="mysterious",
            )
        },
        provider=provider,
    )
    events = []
    runtime.on_event(events.append)

    await runtime.start()
    player = await runtime.listen_player_turn("human_1")
    spoken = await runtime.speak_ai("seer", "Les cartes tremblent.")
    await runtime.stop()

    assert provider.started
    assert provider.stopped
    assert player.text == "Bonjour"
    assert spoken.speech_style is not None
    assert spoken.speech_style.emotion == "mysterious"
    assert [event["type"] for event in events] == [
        "voice_started",
        "listen_started",
        "listen_completed",
        "speech_started",
        "speech_completed",
        "voice_stopped",
    ]


@pytest.mark.asyncio
async def test_runtime_passes_custom_push_to_talk_stop_signal() -> None:
    provider = FakeProvider()
    runtime = VoiceRuntime(config=VoiceRuntimeConfig(provider="mock"), provider=provider)

    async def stop_signal() -> None:
        return None

    await runtime.listen_player_turn("human_1", wait_for_stop=stop_signal)

    assert provider.wait_for_stop_called
