# GameForge Voice Runtime

Le reste de GameForge doit utiliser `gameforge_voice`, pas le SDK Gradium directement.

## Contrat minimal

```python
from gameforge_voice import VoiceRuntime

voice = VoiceRuntime.from_game_schema(game_schema)

await voice.start()
try:
    player = await voice.listen_player_turn(player_id="human_1")
    await voice.speak_ai("seer", "J'ai vu une ombre pres du puits.", speech_style="mysterious")
finally:
    await voice.stop()
```

Le runtime reste en push-to-talk: l'humain declenche son tour, parle, puis valide.

Par defaut, la CLI utilise Entree comme signal de fin de tour. Une interface de jeu peut fournir son propre signal:

```python
async def wait_for_button_release():
    await ui.wait_until_released("push_to_talk")

player = await voice.listen_player_turn(
    player_id="human_1",
    wait_for_stop=wait_for_button_release,
)
```

## Schema attendu

OpenAI peut ajouter une section `voice` au `game_schema`:

```json
{
  "language": "fr",
  "voice": {
    "characters": {
      "seer": {
        "display_name": "Mirelda",
        "language": "fr",
        "voice_preset": "fr_feminine_warm",
        "speech_style": "mysterious"
      },
      "werewolf": {
        "display_name": "Ysarn",
        "language": "fr",
        "voice_preset": "fr_masculine_warm",
        "speech_style": "suspicious"
      }
    }
  }
}
```

Les autres briques manipulent des IDs stables comme `seer` ou `werewolf`. Les IDs Gradium restent caches derriere les presets.

## Intonation et style

Gradium ne documente pas de parametre emotionnel natif du type `emotion="angry"`. La doc expose en revanche des controles TTS via `json_config`: `temp`, `cfg_coef`, `padding_bonus`, `rewrite_rules`, `pronunciation_id`, ainsi que les balises de pause `<break time="..." />`.

GameForge expose donc une abstraction `speech_style` que Pioneer peut produire avec son texte:

```python
await voice.speak_ai(
    "werewolf",
    "Accuser sans preuve arrange toujours quelqu'un.",
    speech_style="suspicious",
)
```

Ou sous forme structuree:

```python
await voice.speak_ai(
    "seer",
    "Les cartes tremblent.",
    speech_style={
        "emotion": "mysterious",
        "intensity": 0.8,
        "pause_before_s": 0.4
    },
)
```

Styles disponibles:

- `neutral`
- `calm`
- `mysterious`
- `suspicious`
- `tense`
- `urgent`
- `excited`
- `sad`
- `angry`
- `whisper`

Le provider Gradium traduit ces styles en vitesse, temperature, similarite voix et pauses. Les autres providers peuvent ignorer ou afficher le style.

Pour comparer rapidement les styles:

```bash
gameforge-voice play \
  --language fr \
  --speech-style mysterious \
  --text "Je vois une ombre pres du puits."

gameforge-voice tts \
  --language fr \
  --speech-style urgent \
  --text "Votez maintenant, avant qu'il ne soit trop tard." \
  --output artifacts/urgent.wav
```

## Providers

`gradium`: vrai STT realtime + TTS streaming.

```python
voice = VoiceRuntime.from_game_schema(game_schema, provider="gradium")
```

`mock`: mode texte pour OpenAI, Pioneer, fal ou les tests sans micro.

```python
voice = VoiceRuntime.from_game_schema(game_schema, provider="mock")
```

Le provider mock ne depend ni de Gradium ni du micro et sert de contrat commun pendant que les autres equipes branchent OpenAI, Pioneer ou fal.

## Events

fal ou l'UI peuvent ecouter les evenements pour afficher sous-titres, animer un portrait, ou synchroniser l'etat vocal:

```python
voice.on_event(lambda event: print(event))
```

Evenements actuels:

- `voice_started`
- `listen_started`
- `listen_completed`
- `speech_started`
- `speech_completed`
- `voice_stopped`

## Objets partages

```python
from gameforge_voice import PlayerUtterance, AiUtterance, VoiceProfile
```

- `PlayerUtterance`: sortie STT pour le Game Runtime.
- `AiUtterance`: texte IA envoye en TTS.
- `VoiceProfile`: voix assignee a un personnage.
