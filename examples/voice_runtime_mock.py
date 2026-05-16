from __future__ import annotations

import asyncio

from gameforge_voice import VoiceRuntime


GAME_SCHEMA = {
    "language": "fr",
    "voice": {
        "characters": {
            "seer": {
                "display_name": "Mirelda",
                "language": "fr",
                "voice_preset": "fr_feminine_warm",
            },
            "werewolf": {
                "display_name": "Ysarn",
                "language": "fr",
                "voice_preset": "fr_masculine_warm",
            },
        }
    },
}


async def main() -> None:
    voice = VoiceRuntime.from_game_schema(GAME_SCHEMA, provider="mock")
    await voice.start()
    try:
        player = await voice.listen_player_turn("human_1")
        print(f"Runtime received: {player.text}")
        await voice.speak_ai(
            "seer",
            "J'ai entendu ta theorie. Elle merite un vote.",
            speech_style="mysterious",
        )
    finally:
        await voice.stop()


if __name__ == "__main__":
    asyncio.run(main())
