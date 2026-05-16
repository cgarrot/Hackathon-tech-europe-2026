from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from gameforge_gradium.gateway import normalize_language
from gameforge_voice.contracts import VoiceProfile, VoiceRuntimeConfig
from gameforge_voice.runtime import VoiceRuntime
from gameforge_voice.styles import SpeechStyleInput


@dataclass(frozen=True)
class Persona:
    character_id: str
    name: str
    role: str


PERSONAS_BY_LANGUAGE = {
    "fr": [
        Persona(character_id="seer", name="Mirelda", role="voyante"),
        Persona(character_id="villager", name="Garrick", role="villageois soupconneux"),
        Persona(character_id="werewolf", name="Ysarn", role="loup-garou discret"),
    ],
    "en": [
        Persona(character_id="seer", name="Mirelda", role="seer"),
        Persona(character_id="villager", name="Garrick", role="suspicious villager"),
        Persona(character_id="werewolf", name="Ysarn", role="quiet werewolf"),
    ],
}


class ScriptedGameSession:
    def __init__(self, personas: Sequence[Persona], language: str) -> None:
        self.personas = list(personas)
        self.language = normalize_language(language)
        self.turn = 0

    def replies_for(self, player_text: str) -> List[Tuple[Persona, str, str]]:
        self.turn += 1
        lower = player_text.lower()
        voices = self.personas
        if self.language == "en":
            return self._english_replies(lower, voices)

        return self._french_replies(lower, voices)

    def _french_replies(self, lower: str, voices: Sequence[Persona]) -> List[Tuple[Persona, str, str]]:
        if any(word in lower for word in ["loup", "garou", "suspect", "ment"]):
            return [
                (
                    voices[0],
                    "Je vois une ombre [scared] autour de cette accusation. Elle est peut-etre juste, mais elle arrive trop vite.",
                    "mysterious",
                ),
                (
                    voices[2],
                    "Accuser sans preuve arrange toujours quelqu'un. Moi, je veux entendre qui etait pres du puits.",
                    "suspicious",
                ),
            ]

        if any(word in lower for word in ["vote", "eliminer", "tuer"]):
            return [
                (
                    voices[1],
                    "Un vote maintenant serait brutal, mais rester immobiles nous condamne aussi.",
                    "tense",
                ),
                (
                    voices[0],
                    "Avant de lever la main, demandez qui profite du silence.",
                    "calm",
                ),
            ]

        if any(word in lower for word in ["voyante", "vision", "carte"]):
            return [
                (
                    voices[0],
                    "Mes visions parlent en fragments. J'ai vu de la laine, du sang, et une porte entrouverte.",
                    "mysterious",
                ),
                (
                    voices[2],
                    "C'est poetique, mais pas tres utile. Les morts ne seront pas sauves par des enigmes.",
                    "suspicious",
                ),
            ]

        return [
            (
                voices[self.turn % len(voices)],
                "Je t'ai entendu. Continue, mais choisis bien tes mots: ici chaque hesitation devient une preuve.",
                "tense",
            )
        ]

    def _english_replies(self, lower: str, voices: Sequence[Persona]) -> List[Tuple[Persona, str, str]]:
        if any(word in lower for word in ["wolf", "werewolf", "suspect", "lie", "lying"]):
            return [
                (
                    voices[0],
                    "I see a shadow around that accusation. It may be true, but it arrived too quickly.",
                    "mysterious",
                ),
                (
                    voices[2],
                    "Accusing without proof always helps someone. I want to know who was near the well.",
                    "suspicious",
                ),
            ]

        if any(word in lower for word in ["vote", "eliminate", "kill"]):
            return [
                (
                    voices[1],
                    "A vote right now would be harsh, but standing still may condemn us too.",
                    "tense",
                ),
                (
                    voices[0],
                    "Before you raise your hand, ask who benefits from the silence.",
                    "calm",
                ),
            ]

        if any(word in lower for word in ["seer", "vision", "card"]):
            return [
                (
                    voices[0],
                    "My visions speak in fragments. I saw wool, blood, and a half-open door.",
                    "mysterious",
                ),
                (
                    voices[2],
                    "Poetic, but not very useful. The dead will not be saved by riddles.",
                    "suspicious",
                ),
            ]

        return [
            (
                voices[self.turn % len(voices)],
                "I heard you. Keep going, but choose your words carefully: here every hesitation becomes evidence.",
                "tense",
            )
        ]


async def run_live_chat(
    voice_id: str,
    language: Optional[str],
    turns: int,
    max_record_seconds: float,
    provider: str = "gradium",
) -> None:
    normalized_language = normalize_language(language)
    personas = PERSONAS_BY_LANGUAGE[normalized_language]
    profiles = {
        persona.character_id: VoiceProfile(
            character_id=persona.character_id,
            display_name=persona.name,
            language=normalized_language,  # type: ignore[arg-type]
            voice_id=voice_id,
        )
        for persona in personas
    }
    runtime = VoiceRuntime(
        config=VoiceRuntimeConfig(
            language=normalized_language,  # type: ignore[arg-type]
            provider=provider,  # type: ignore[arg-type]
            max_record_seconds=max_record_seconds,
        ),
        profiles=profiles,
    )
    runtime.on_event(lambda event: print(f"[voice:{event['type']}]"))
    session = ScriptedGameSession(personas, language=normalized_language)

    if normalized_language == "en":
        print("Live GameForge session. Press Enter to start a turn.")
        print("During recording, speak, then press Enter again to send.")
        print("Ctrl+C to quit.")
    else:
        print("Session live GameForge. Appuie sur Entree pour commencer un tour.")
        print("Pendant l'enregistrement, parle puis appuie sur Entree pour envoyer.")
        print("Ctrl+C pour quitter.")

    await runtime.start()
    try:
        for turn in range(1, turns + 1):
            prompt = (
                f"\nTurn {turn}/{turns} - Enter to speak..."
                if normalized_language == "en"
                else f"\nTour {turn}/{turns} - Entree pour parler..."
            )
            input(prompt)
            player = await runtime.listen(player_id="human_1")
            if not player.text:
                if normalized_language == "en":
                    print("No transcript received. Skipping to the next turn.")
                else:
                    print("Aucune transcription recue. On passe au tour suivant.")
                continue

            print(f"{'Player' if normalized_language == 'en' else 'Joueur'}: {player.text}")
            for persona, reply, speech_style in session.replies_for(player.text):
                print(f"{persona.name}, {persona.role} [{speech_style}]: {reply}")
                await runtime.say(persona.character_id, reply, speech_style=speech_style)
    finally:
        await runtime.stop()


async def play_streamed_tts(
    text: str,
    voice_id: str,
    model: str = "default",
    language: str = "fr",
    speech_style: SpeechStyleInput = None,
) -> None:
    normalized_language = normalize_language(language)
    runtime = VoiceRuntime(
        config=VoiceRuntimeConfig(
            language=normalized_language,  # type: ignore[arg-type]
            tts_model=model,
        ),
        profiles={
            "speaker": VoiceProfile(
                character_id="speaker",
                display_name="Speaker",
                language=normalized_language,  # type: ignore[arg-type]
                voice_id=voice_id,
            )
        },
    )
    await runtime.start()
    try:
        await runtime.say("speaker", text, speech_style=speech_style)
    finally:
        await runtime.stop()
