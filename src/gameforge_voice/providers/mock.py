from __future__ import annotations

import asyncio
from typing import Optional

from gameforge_voice.contracts import AiUtterance, PlayerUtterance, StopSignal, VoiceProfile, VoiceRuntimeConfig


class MockVoiceProvider:
    """Text-only provider for devs working without Gradium, mic, or speakers."""

    def __init__(self, config: VoiceRuntimeConfig) -> None:
        self.config = config

    async def start(self) -> None:
        return None

    async def listen_player_turn(
        self,
        player_id: str,
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        prompt = "Player input > " if self.config.language == "en" else "Texte joueur > "
        text = await asyncio.to_thread(input, prompt)
        return PlayerUtterance(
            player_id=player_id,
            text=text.strip(),
            language=self.config.language,
        )

    async def speak_ai(self, utterance: AiUtterance, profile: VoiceProfile) -> None:
        style = f" [{utterance.speech_style.emotion}]" if utterance.speech_style else ""
        print(f"{profile.display_name}{style}: {utterance.text}")

    async def stop(self) -> None:
        return None
