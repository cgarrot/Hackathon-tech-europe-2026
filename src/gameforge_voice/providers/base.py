from __future__ import annotations

from typing import Protocol

from typing import Optional

from gameforge_voice.contracts import AiUtterance, PlayerUtterance, StopSignal, VoiceProfile


class VoiceProvider(Protocol):
    async def start(self) -> None:
        ...

    async def listen_player_turn(
        self,
        player_id: str,
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        ...

    async def speak_ai(self, utterance: AiUtterance, profile: VoiceProfile) -> None:
        ...

    async def stop(self) -> None:
        ...
